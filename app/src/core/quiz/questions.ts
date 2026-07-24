/**
 * Pure question builders + scoring (Phase 6.1.2).
 *
 * Every builder takes **already-sourced** data (a target verse, its neighbours /
 * translations / distractor words — all fetched by `source.ts`) plus an RNG, and
 * returns a plain `Question`. No async, no data client, and crucially **no retry
 * recursion**: eligibility is the caller's job (it hands in a valid candidate), which
 * removes the legacy stack-overflow-on-empty-scope bug (B1). Word completion is
 * scored slot-by-slot (B2) — see `scoreCompletion`.
 */
import { sampleWithout, shuffle } from './select'
import type {
  BankWord,
  Choice,
  CompletionQuestion,
  CompletionToken,
  ContinuationQuestion,
  Rng,
  TranslationQuestion,
  Verse,
} from './types'

/** Integer in [lo, hi] inclusive. */
function between(lo: number, hi: number, rng: Rng): number {
  return lo + Math.floor(rng() * (hi - lo + 1))
}

/** Split a verse's Arabic into words, dropping empty tokens. */
export function splitWords(arabic: string): string[] {
  return arabic.trim().split(/\s+/).filter((w) => w.length > 0)
}

// —— Translation match ————————————————————————————————

/**
 * Show the verse's Arabic; choose its translation from `1 + distractors.length`
 * options. `distractorTranslations` are translation strings from other verses; the
 * caller sizes the pool (a small scope simply yields fewer options).
 */
export function buildTranslation(
  target: Verse,
  correctTranslation: string,
  distractorTranslations: readonly string[],
  rng: Rng = Math.random,
): TranslationQuestion {
  const choices: Choice[] = [
    { text: correctTranslation, isCorrect: true },
    ...distractorTranslations.map((text) => ({ text, isCorrect: false })),
  ]
  return {
    mode: 'translation',
    ref: { surah: target.surah, ayah: target.ayah, page: target.page },
    arabic: target.arabic,
    choices: shuffle(choices, rng),
  }
}

// —— Continuation ————————————————————————————————

/**
 * Show the verse; choose the verse that comes `direction` of it within the surah.
 * `adjacent` is the real answer (from `source.adjacentVerse`); `distractors` are
 * other verses to mislead with (same-surah where possible — the caller decides).
 */
export function buildContinuation(
  target: Verse,
  adjacent: Verse,
  direction: 'next' | 'previous',
  distractors: readonly Verse[],
  rng: Rng = Math.random,
): ContinuationQuestion {
  const choices: Choice[] = [
    { text: adjacent.arabic, isCorrect: true },
    ...distractors.map((v) => ({ text: v.arabic, isCorrect: false })),
  ]
  return {
    mode: 'continuation',
    ref: { surah: target.surah, ayah: target.ayah, page: target.page },
    arabic: target.arabic,
    direction,
    choices: shuffle(choices, rng),
  }
}

// —— Word completion ————————————————————————————————

export interface CompletionOptions {
  /** Fewest words to blank (clamped to what the verse allows). Default 2. */
  minBlanks?: number
  /** Most words to blank. Default 5. */
  maxBlanks?: number
  rng?: Rng
}

/**
 * Blank a random subset of the verse's words; fill them from a bank of the correct
 * words plus `distractorWords`.
 *
 * Slots carry a stable `slotId` and the answer map is keyed by it, so scoring never
 * depends on the *sequence* of chosen texts — the fix for the legacy bug (B2) where a
 * verse with a repeated word (و، في، من) accepted a swapped answer. A duplicated
 * blanked word deliberately produces **two** bank entries (distinct ids, same text),
 * so both slots are fillable and either assignment of the identical words is correct.
 *
 * Requires ≥ 2 words; the caller filters 1-word verses out of the completion pool.
 */
export function buildCompletion(
  target: Verse,
  distractorWords: readonly string[],
  { minBlanks = 2, maxBlanks = 5, rng = Math.random }: CompletionOptions = {},
): CompletionQuestion {
  const words = splitWords(target.arabic)

  // Leave at least one word visible; never ask for more blanks than words allow.
  const hardMax = Math.min(maxBlanks, words.length - 1)
  const lo = Math.min(minBlanks, hardMax)
  const blankCount = Math.max(1, between(lo, Math.max(lo, hardMax), rng))

  // Choose which positions to blank, then assign slot ids in reading order so the
  // answer map and the visible tokens agree regardless of RTL rendering.
  const positions = shuffle(
    words.map((_, i) => i),
    rng,
  )
    .slice(0, blankCount)
    .sort((a, b) => a - b)

  const answers: Record<number, string> = {}
  const tokens: CompletionToken[] = words.map((text, position) => {
    const slotIndex = positions.indexOf(position)
    if (slotIndex === -1) return { text, position, blank: false }
    answers[slotIndex] = text
    return { text, position, blank: true, slotId: slotIndex }
  })

  // One bank entry per blank (duplicates included), plus distractors that can't
  // secretly be a correct word (excluded by text).
  const correctTexts = positions.map((p) => words[p])
  const exclude = new Set(correctTexts)
  const wrong = sampleWithout(distractorWords, exclude, blankCount * 2, (w) => w, rng)

  let nextId = 0
  const bank: BankWord[] = shuffle(
    [...correctTexts, ...wrong].map((text) => ({ id: nextId++, text })),
    rng,
  )

  return {
    mode: 'completion',
    ref: { surah: target.surah, ayah: target.ayah, page: target.page },
    tokens,
    answers,
    bank,
  }
}

// —— Scoring ————————————————————————————————

/** Whether the chosen option in a multiple-choice question is the correct one. */
export function scoreChoice(choices: readonly Choice[], index: number): boolean {
  return choices[index]?.isCorrect ?? false
}

/**
 * Score a completion answer **per slot**: every blank must be filled, and each slot's
 * assigned bank word must match *that slot's* answer text. Sequence and RTL order are
 * irrelevant — this is the B2 fix.
 *
 * `assignment` maps each `slotId` to the `BankWord.id` placed in it.
 */
export function scoreCompletion(
  question: CompletionQuestion,
  assignment: Record<number, number>,
): boolean {
  const bankById = new Map(question.bank.map((w) => [w.id, w.text]))
  const slotIds = Object.keys(question.answers).map(Number)

  return slotIds.every((slotId) => {
    const bankId = assignment[slotId]
    if (bankId === undefined) return false
    return bankById.get(bankId) === question.answers[slotId]
  })
}
