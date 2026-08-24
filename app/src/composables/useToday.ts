import { computed, type Ref } from 'vue'
import { useLocalDay } from './useLocalDay'
import { useProgressStore } from '@/stores/progress'
import { usePlanStore } from '@/stores/plan'
import { useMistakesStore } from '@/stores/mistakes'
import { useQuizStore } from '@/stores/quiz'
import { useDayLogStore, type DaySection } from '@/stores/dayLog'
import { useHabitVersesStore } from '@/stores/habitVerses'
import { usePartialProgressStore } from '@/stores/partialProgress'
import { useJournalStore } from '@/stores/journal'
import { generateDailyTasks } from '@/core/memorization/dailyTasks'
import { advanceMemorizationPage } from '@/core/memorization/planBuilder'
import { getHabit, getTodayDate, type HabitDef } from '@/core/memorization/streaks'
import { isFullyMarked, describeDelta } from '@/core/memorization/partialProgress'
import type { ReviewRating } from '@/core/memorization/reviewScheduler'
import { advanceRevisionCursor } from '@/core/memorization/revisionCycle'
import type { Word } from '@/core/data/types'
import type { JournalEvent } from '@/core/storage/journalStorage'

/** The one habit whose checkbox also drives the habit-builder verse cursor. */
const RECITE_AYAHS_HABIT = 'recite-ayahs'

export interface UseTodayOptions {
  /** The clock. Defaults to the shared local-day clock; inject a ref in tests. */
  today?: Ref<Date>
}

/**
 * Today's practice loop — the reactive view-model behind TodayView.
 *
 * Derives the day's task set from `plan` + `progress` + `mistakes` via
 * {@link generateDailyTasks}, overlays what's already finished from the day log, and
 * exposes one completion path: {@link complete} routes through the progress store's
 * `recordReview` / `penalizeMistake`, so hasanah, memorization strength, the SM-2
 * schedule, weakness scoring and the streak all advance from a single action.
 */
export function useToday(opts: UseTodayOptions = {}) {
  const progress = useProgressStore()
  const plan = usePlanStore()
  const mistakes = useMistakesStore()
  const quiz = useQuizStore()
  const dayLog = useDayLogStore()
  const habitVerses = useHabitVersesStore()
  const partialProgress = usePartialProgressStore()
  const journal = useJournalStore()

  // Rolls at local midnight, shared with `useStreak` — so a session left open
  // overnight regenerates the queue for the new day instead of stalling on
  // yesterday's, and the streak header can't disagree about which day it is.
  const today = opts.today ?? useLocalDay()
  const date = computed(() => getTodayDate(today.value))

  /** What's already finished today — keeps the day's list stable as it's worked. */
  const record = computed(() => dayLog.byDate.get(date.value))

  const tasks = computed(() =>
    plan.config
      ? generateDailyTasks({
          scopePages: plan.scopePages,
          memorized: progress.memorized,
          reviewData: progress.reviewData,
          mistakes: mistakes.byPage,
          strength: progress.strength,
          quizScores: quiz.accuracyByPage,
          newFront: plan.newFront,
          revisionCursor: plan.config.revisionCursor,
          pace: plan.config.pace,
          completedToday: {
            newMemorization: record.value?.newMemorization ?? [],
            weak: record.value?.weak ?? [],
          },
          today: today.value,
        })
      : null,
  )

  const hasPlan = computed(() => plan.hasPlan)
  const isOffDay = computed(() => tasks.value?.metadata.isOffDay ?? false)
  const newMemorization = computed(() => tasks.value?.newMemorization ?? [])
  const revision = computed(() => tasks.value?.revision ?? [])
  const weakReinforcement = computed(() => tasks.value?.weakReinforcement ?? [])
  const habits = computed<HabitDef[]>(() =>
    (plan.config?.habits ?? []).map(getHabit).filter((h): h is HabitDef => !!h),
  )
  /** The habit builder's 10 verses for today — stable for the day, see `versesOfDay`. */
  const versesOfDay = computed(() => habitVerses.versesForDate(date.value))

  const isDone = (section: DaySection, page: number) => dayLog.isPageDone(date.value, section, page)
  const isHabitDone = (habitId: string) => dayLog.isHabitDone(date.value, habitId)

  const totalTasks = computed(
    () =>
      newMemorization.value.length +
      revision.value.length +
      weakReinforcement.value.length +
      habits.value.length,
  )

  /**
   * A newMemorization page is satisfied either the normal way (`isDone` — the
   * page is fully finished) or by a partial mark today (`dayLog.isTouched`) —
   * "any forward progress completes the day" (see plans/partial-page-tracking.md).
   * `isTouched` is a structurally separate flag from `isDone`/`setPageDone`,
   * so this never risks satisfying `complete()`'s own idempotency guard.
   */
  const isNewMemorizationSatisfied = (page: number): boolean =>
    isDone('newMemorization', page) || dayLog.isTouched(date.value, page)

  /** Only *planned* work counts — pages finished before a pace cut don't inflate it. */
  const completedTasks = computed(
    () =>
      newMemorization.value.filter(isNewMemorizationSatisfied).length +
      revision.value.filter((p) => isDone('revision', p)).length +
      weakReinforcement.value.filter((p) => isDone('weak', p)).length +
      habits.value.filter((h) => isHabitDone(h.id)).length,
  )

  const completionPercentage = computed(() =>
    totalTasks.value === 0 ? 0 : Math.round((completedTasks.value / totalTasks.value) * 100),
  )

  /** Every planned task is finished. A day with nothing planned is not "done". */
  const allDone = computed(() => totalTasks.value > 0 && completedTasks.value === totalTasks.value)

  /** Pages already paid out this session — belt-and-braces against a double payout. */
  const rewarded = new Set<string>()
  const key = (section: DaySection, page: number) => `${date.value}:${section}:${page}`

  /** Recompute the day's `completed` flag — this is what the streak reads. */
  function syncCompleted(): void {
    dayLog.setCompleted(date.value, allDone.value)
  }

  /**
   * Finish a task. A clean recall (`perfect`/`good`) advances the schedule and pays
   * the reward; `needs_work` also docks strength and resets the interval, so the page
   * comes back tomorrow. New memorization additionally marks the page memorized and
   * walks the plan's front forward. Idempotent — completing twice never double-pays.
   */
  function complete(section: DaySection, page: number, rating: ReviewRating = 'perfect'): boolean {
    if (isDone(section, page)) return false

    if (!rewarded.has(key(section, page))) {
      if (rating === 'needs_work') progress.penalizeMistake(page)
      if (section === 'newMemorization') progress.setMemorized(page, true)
      progress.recordReview(page, rating, today.value)
      rewarded.add(key(section, page))

      if (section === 'newMemorization') {
        plan.update({ newFront: advanceMemorizationPage(plan.newFront, progress.memorized) })
      }
    }

    dayLog.setPageDone(date.value, section, page, true)

    // The rotation only advances once the whole day's chunk is done — a partial
    // day just leaves the cursor where it was, so tomorrow resumes the same chunk
    // instead of skipping ahead. Guarded by `lastAdvanceDate` so this only fires
    // once per day even as `complete` keeps getting called for other sections.
    if (
      section === 'revision' &&
      revision.value.length > 0 &&
      revision.value.every((p) => isDone('revision', p)) &&
      plan.config?.revisionCursor?.lastAdvanceDate !== date.value
    ) {
      plan.update({ revisionCursor: advanceRevisionCursor(revision.value, date.value) })
    }

    syncCompleted()
    return true
  }

  /** Shorthand for the reader's "Mark mistake" action on a revision task. */
  const markMistake = (section: DaySection, page: number) => complete(section, page, 'needs_work')

  /**
   * Toggle a whole ayah's mark on `page` (must be the plan's current front
   * page — the caller is responsible for that restriction; this function
   * doesn't re-check it). `words` is that page's full word list, needed to
   * decide whether the page is now fully marked.
   *
   * Deliberately does **not** set `dayLog.setPageDone` — that flag is what
   * `complete()`'s idempotency guard (`if (isDone(section, page)) return
   * false`) checks, and a partial mark must never satisfy it: doing so would
   * make `complete()` silently skip the reward, strength bump, and front
   * advance once the page actually finishes later the same day. Partial
   * credit for the streak instead goes through the structurally separate
   * `newMemorizationTouched` flag (`dayLog.setTouched`), read by
   * `completedTasks` above, not by `complete()`.
   *
   * Once every word on the page is marked, hands off to the existing
   * `complete('newMemorization', page, 'perfect')` unmodified — same reward/
   * strength/schedule/front-advance path a whole-page completion already
   * uses — then clears the `partialProgress` store for that page.
   */
  function markPartialProgress(page: number, surah: number, ayah: number, words: Word[]): void {
    // A plain copy — `partialProgress.marks` is the same reactive array
    // `toggleAyah` mutates next, so this must be taken before that call.
    const before = partialProgress.marks.map((m) => ({ ...m }))
    partialProgress.toggleAyah(page, surah, ayah)

    // Read before any clear() — `partialProgress.marks` is a reactive array
    // that clear() splices in place, so this must be decided first.
    const after = partialProgress.marks.map((m) => ({ ...m }))
    const pageComplete = isFullyMarked(after, words)
    const touched = after.length > 0

    // Deliberately one-way: once a mark has made the day's front page
    // "touched", un-marking every ayah again (`after.length === 0`) never
    // calls `setTouched(..., false)` here. This matches the rest of the app's
    // no-un-check philosophy (see TaskRow.vue's own doc comment) and the
    // design doc's "any forward progress... completes that day's streak" —
    // a corrective un-tap shouldn't retroactively cost the day's streak
    // credit. See today.test.ts's "un-marking the day's only mark still
    // leaves it touched" for the locked-in behavior.
    if (touched) {
      const changed = dayLog.setTouched(date.value, page, true)
      if (changed) syncCompleted()
    }

    // Only a *newly covered* range narrates in the journal — toggling an
    // ayah back off covers nothing new, so describeDelta returns null and no
    // event fires (the earlier mark's event, if any, is left untouched).
    const delta = describeDelta(before, after, words)
    if (delta) {
      const createdAt = new Date().toISOString()
      const event: JournalEvent = {
        id: `verses-memorized:${page}:${date.value}`,
        type: 'verses-memorized',
        page,
        fromAyah: delta.fromAyah,
        toAyah: delta.toAyah,
        createdAt,
      }
      journal.addEvent(date.value, event)
    }

    if (pageComplete) {
      partialProgress.clear()
      complete('newMemorization', page, 'perfect')
    }
  }

  /**
   * Habits toggle freely — unlike a page task they carry no reward or schedule, so
   * un-checking one costs nothing. (Page tasks have no un-check: a recall is a real
   * event. The reward is paid, the SM-2 schedule has moved, and hasanah is monotonic
   * by design — so "undo" can't be honoured, only faked.)
   *
   * `recite-ayahs` is the one exception with a side effect: checking it advances
   * the habit-builder's verse cursor by today's 10 (so tomorrow picks up where
   * today left off); un-checking it the same day rolls that advance back — see
   * `core/quran/habitVerses`.
   */
  function toggleHabit(habitId: string, done = !isHabitDone(habitId)): boolean {
    const changed = dayLog.setHabitDone(date.value, habitId, done)
    if (changed && habitId === RECITE_AYAHS_HABIT) {
      if (done) habitVerses.advance(date.value)
      else habitVerses.rollback(date.value)
    }
    syncCompleted()
    return changed
  }

  return {
    date,
    tasks,
    hasPlan,
    isOffDay,
    newMemorization,
    revision,
    weakReinforcement,
    habits,
    versesOfDay,
    isDone,
    isHabitDone,
    totalTasks,
    completedTasks,
    completionPercentage,
    allDone,
    complete,
    markMistake,
    markPartialProgress,
    toggleHabit,
  }
}
