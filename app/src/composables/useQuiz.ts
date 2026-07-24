import { computed, reactive, ref } from 'vue'
import { getDataClient, type DataClient } from '@/core/data'
import { getFontLoader, type FontLoader } from '@/core/fonts'
import type { Layout } from '@/core/data/types'
import { useProgressStore } from '@/stores/progress'
import { usePlanStore } from '@/stores/plan'
import { useMistakesStore } from '@/stores/mistakes'
import { useQuizStore } from '@/stores/quiz'
import { calculateAllWeaknesses, WEAK_THRESHOLD } from '@/core/memorization/weaknessScorer'
import { createQuizSource, type QuizSource } from '@/core/quiz/source'
import { buildCandidatePool, wordBankFrom } from '@/core/quiz/pool'
import { resolveScopePages, type QuizScope } from '@/core/quiz/scope'
import { pickTarget } from '@/core/quiz/target'
import { shuffle, sampleWithout } from '@/core/quiz/select'
import {
  buildTranslation,
  buildContinuation,
  buildCompletion,
  scoreChoice,
  scoreCompletion,
  splitWords,
} from '@/core/quiz/questions'
import type { Question, QuizMode, Rng, Target, Verse } from '@/core/quiz/types'

export type QuizModeChoice = QuizMode | 'mixed'
export type QuizPhase = 'setup' | 'playing' | 'empty'

const ALL_MODES: QuizMode[] = ['translation', 'continuation', 'completion']
const OPTION_DISTRACTORS = 3 // → 4-option questions, degrading gracefully
const TARGET_RETRIES = 16 // bounded — a target with no viable mode is skipped, never recursed (B1)
const DEFAULT_AUTO_NEXT_MS = 1600

const verseKey = (v: { surah: number; ayah: number }) => `${v.surah}:${v.ayah}`

export interface UseQuizOptions {
  layout?: Layout
  data?: DataClient
  fonts?: FontLoader
  rng?: Rng
  autoNextMs?: number
}

/**
 * Drives a quiz session (Phase 6.6): resolve scope → build a weakness-tagged pool →
 * serve questions one at a time, weighting weak pages but interleaving ~25% strong
 * ones. Every answer records per-page accuracy (feeding weakness scoring) and never
 * touches the SM-2 schedule.
 *
 * Rendering keeps **one page font per question**: continuation distractors and the
 * completion word bank are drawn from the target verse's own page, so a question
 * needs a single font (ensured before it's shown). Question building is bounded and
 * non-recursive — an unlucky target is skipped, an unservable scope becomes an
 * empty-state, never a stack overflow (B1).
 */
export function useQuiz(opts: UseQuizOptions = {}) {
  const layout = opts.layout ?? 'qpc'
  const data = opts.data ?? getDataClient()
  const fonts = opts.fonts ?? getFontLoader()
  const rng = opts.rng ?? Math.random
  const autoNextMs = opts.autoNextMs ?? DEFAULT_AUTO_NEXT_MS

  const progress = useProgressStore()
  const plan = usePlanStore()
  const mistakes = useMistakesStore()
  const quizStore = useQuizStore()

  const phase = ref<QuizPhase>('setup')
  const scope = ref<QuizScope>({ kind: 'plan' })
  const mode = ref<QuizModeChoice>('mixed')

  const loading = ref(false)
  const current = ref<Question | null>(null)
  const fontFamily = ref<string>('')

  /** Answer feedback for the live question. */
  const answer = reactive<{
    revealed: boolean
    correct: boolean
    chosenIndex: number | null
  }>({ revealed: false, correct: false, chosenIndex: null })

  const answered = ref(0)
  const correct = ref(0)
  const streak = ref(0)
  const bestStreak = ref(0)

  const accuracyPct = computed(() =>
    answered.value === 0 ? 0 : Math.round((correct.value / answered.value) * 100),
  )

  let source: QuizSource | null = null
  let pool: Target[] = []
  let autoTimer: ReturnType<typeof setTimeout> | undefined

  function clearAuto(): void {
    clearTimeout(autoTimer)
    autoTimer = undefined
  }

  // —— Distractor helpers (all keep a question to a single page) ————————

  /** Wrong translations — plain text, so they can come from anywhere in the pool. */
  async function translationDistractors(target: Target, correctText: string): Promise<string[]> {
    const others = sampleWithout(pool, new Set([verseKey(target)]), OPTION_DISTRACTORS * 4, verseKey, rng)
    const seen = new Set([correctText])
    const out: string[] = []
    for (const o of others) {
      const text = await source!.translationForVerse(o.surah, o.ayah, 'en')
      if (text && !seen.has(text)) {
        seen.add(text)
        out.push(text)
        if (out.length >= OPTION_DISTRACTORS) break
      }
    }
    return out
  }

  /** Wrong continuation verses — from the target's own page, so one font covers all. */
  function continuationDistractors(samePage: Verse[], target: Target, adjacent: Verse): Verse[] {
    const exclude = new Set([verseKey(target), verseKey(adjacent)])
    return sampleWithout(samePage, exclude, OPTION_DISTRACTORS, verseKey, rng)
  }

  /** Distractor words from other verses on the same page (single font). */
  function samePageWordBank(samePage: Verse[], target: Target): string[] {
    return wordBankFrom(samePage.filter((v) => v.ayah !== target.ayah))
  }

  // —— Question building (bounded, non-recursive) ————————————————

  async function buildFor(target: Target, m: QuizMode): Promise<Question | null> {
    const src = source!
    if (m === 'translation') {
      const correctText = await src.translationForVerse(target.surah, target.ayah, 'en')
      if (!correctText) return null
      const distractors = await translationDistractors(target, correctText)
      if (distractors.length === 0) return null
      return buildTranslation(target, correctText, distractors, rng)
    }

    if (m === 'continuation') {
      // Prefer a direction whose neighbour shares the page (one font). Try both.
      const dirs = shuffle<'next' | 'previous'>(['next', 'previous'], rng)
      for (const dir of dirs) {
        const adjacent = await src.adjacentVerse(target.surah, target.ayah, dir)
        if (!adjacent || adjacent.page !== target.page) continue
        const samePage = await src.versesOnPage(target.page)
        const distractors = continuationDistractors(samePage, target, adjacent)
        if (distractors.length === 0) continue
        return buildContinuation(target, adjacent, dir, distractors, rng)
      }
      return null
    }

    // completion
    if (splitWords(target.arabic).length < 2) return null
    const samePage = await src.versesOnPage(target.page)
    const bank = samePageWordBank(samePage, target)
    if (bank.length === 0) return null // a lone-verse page gives no distractors
    return buildCompletion(target, bank, { rng })
  }

  /** Load the next question, or fall to the empty-state if none can be built. */
  async function next(): Promise<void> {
    clearAuto()
    loading.value = true
    try {
      for (let attempt = 0; attempt < TARGET_RETRIES; attempt++) {
        const target = pickTarget(pool, { rng })
        if (!target) break
        const modes = mode.value === 'mixed' ? shuffle(ALL_MODES, rng) : [mode.value]
        for (const m of modes) {
          const q = await buildFor(target, m)
          if (q) {
            fontFamily.value = await ensureFont(target.page)
            current.value = q
            answer.revealed = false
            answer.correct = false
            answer.chosenIndex = null
            return
          }
        }
      }
      current.value = null
      phase.value = 'empty'
    } finally {
      loading.value = false
    }
  }

  async function ensureFont(page: number): Promise<string> {
    try {
      return await fonts.ensure({ layout, page, tajweed: false })
    } catch {
      return '' // fall back to inherited font rather than blocking the question
    }
  }

  // —— Session control ————————————————————————————————

  async function start(): Promise<void> {
    loading.value = true
    answered.value = 0
    correct.value = 0
    streak.value = 0
    bestStreak.value = 0
    try {
      await Promise.all([data.init(), fonts.init()])
      const nav = await data.getNavIndex(layout)
      source = createQuizSource(layout, data)

      const pages = resolveScopePages(scope.value, {
        ayahToPage: nav.ayahToPage,
        juzToPage: plan.juzToPage,
        planPages: plan.scopePages,
        layout,
      })

      if (pages.length === 0) {
        pool = []
        phase.value = 'empty'
        return
      }

      const scores = calculateAllWeaknesses({
        pages,
        perfectRevisions: progress.strength,
        mistakesMap: mistakes.byPage,
        pageReviewData: progress.reviewData,
        quizScores: quizStore.accuracyByPage,
      })
      const weak = new Set(pages.filter((p) => (scores.get(p) ?? 0) >= WEAK_THRESHOLD))

      pool = await buildCandidatePool(pages, source, weak)
      if (pool.length === 0) {
        phase.value = 'empty'
        return
      }
      phase.value = 'playing'
      await next()
    } finally {
      loading.value = false
    }
  }

  function settle(page: number, isCorrect: boolean): void {
    quizStore.record(page, isCorrect)
    answered.value++
    if (isCorrect) {
      correct.value++
      streak.value++
      bestStreak.value = Math.max(bestStreak.value, streak.value)
    } else {
      streak.value = 0
    }
    answer.revealed = true
    answer.correct = isCorrect
    clearAuto()
    autoTimer = setTimeout(() => {
      autoTimer = undefined
      void next()
    }, autoNextMs)
  }

  function answerChoice(index: number): void {
    const q = current.value
    if (!q || q.mode === 'completion' || answer.revealed) return
    answer.chosenIndex = index
    settle(q.ref.page, scoreChoice(q.choices, index))
  }

  function answerCompletion(assignment: Record<number, number>): void {
    const q = current.value
    if (!q || q.mode !== 'completion' || answer.revealed) return
    settle(q.ref.page, scoreCompletion(q, assignment))
  }

  /** Skip the reveal delay and go straight to the next question. */
  function skip(): void {
    if (autoTimer) {
      clearAuto()
      void next()
    }
  }

  /** Back to the setup screen; keep scope/mode, drop the live question + session tally. */
  function exit(): void {
    clearAuto()
    current.value = null
    phase.value = 'setup'
    answered.value = 0
    correct.value = 0
    streak.value = 0
    bestStreak.value = 0
  }

  function dispose(): void {
    clearAuto()
  }

  return {
    phase,
    scope,
    mode,
    loading,
    current,
    fontFamily,
    answer,
    answered,
    correct,
    streak,
    bestStreak,
    accuracyPct,
    start,
    answerChoice,
    answerCompletion,
    skip,
    exit,
    dispose,
  }
}
