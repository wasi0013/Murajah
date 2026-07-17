/**
 * Quiz domain types (Phase 6).
 *
 * The quiz is **page-scoped**: every question is built from a verse that lives on a
 * page in the user's plan scope (or a chosen surah/juz). These types describe the
 * data *after* sourcing (see `core/quiz/source.ts`) — the pure builders and scoring
 * in this folder never touch the data client, so everything here is plain data.
 */

/** A random source in [0, 1). Injected everywhere so tests are deterministic. */
export type Rng = () => number

/** A verse located in the mushaf, with its assembled Arabic. */
export interface Verse {
  surah: number
  ayah: number
  /** The page this verse's words fall on (canonical layout). */
  page: number
  /** The verse's Arabic, its words joined with spaces. */
  arabic: string
}

/**
 * A quiz target: a verse chosen to be questioned, tagged with whether its page is
 * currently **weak**. The tag drives the strong/weak interleave (see `target.ts`);
 * it is not shown to the user.
 */
export interface Target extends Verse {
  weak: boolean
}

export type QuizMode = 'translation' | 'continuation' | 'completion'

/** One selectable answer for the multiple-choice modes. */
export interface Choice {
  text: string
  isCorrect: boolean
}

/** Show a verse's Arabic, pick its translation. */
export interface TranslationQuestion {
  mode: 'translation'
  ref: { surah: number; ayah: number; page: number }
  arabic: string
  choices: Choice[]
}

/** Show a verse, pick the verse that comes next (or before) it in the same surah. */
export interface ContinuationQuestion {
  mode: 'continuation'
  ref: { surah: number; ayah: number; page: number }
  arabic: string
  direction: 'next' | 'previous'
  choices: Choice[]
}

/** One word position in a completion verse — either shown, or a blank to fill. */
export interface CompletionToken {
  /** Word text; for a blank this is the answer, hidden until revealed. */
  text: string
  /** Position of this word in the verse (0-based, natural order). */
  position: number
  blank: boolean
  /** Stable slot id, present only on blanks. Scoring is keyed by this, never by text. */
  slotId?: number
}

/** One draggable/tappable option in the word bank. */
export interface BankWord {
  id: number
  text: string
}

/**
 * Show a verse with some words blanked; fill each blank from the word bank.
 *
 * Scoring (see `scoreCompletion`) matches **each slot against its own answer by
 * `slotId`**, never by comparing the sequence of chosen texts — the fix for the
 * legacy bug where repeated Arabic words (و، في، من) let a swapped answer pass.
 */
export interface CompletionQuestion {
  mode: 'completion'
  ref: { surah: number; ayah: number; page: number }
  /** The verse in natural word order; render right-to-left in the view. */
  tokens: CompletionToken[]
  /** Correct answer for each blank, keyed by slot id. */
  answers: Record<number, string>
  bank: BankWord[]
}

export type Question = TranslationQuestion | ContinuationQuestion | CompletionQuestion
