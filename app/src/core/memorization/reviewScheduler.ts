/**
 * Review scheduler — the per-page SM-2 step (Phase 5).
 *
 * The heart of the unified spaced-repetition model: given a page's current
 * {@link ReviewSchedule} and how the recall went (a 0–5 performance), produce the
 * page's next schedule (interval grows when clean, resets on a miss; ease factor
 * drifts per SM-2). This is the pure math only — the day's *task selection*
 * (`generateDailyTasks`, Phase 5.1.1) and the reward/streak coupling (the progress
 * store's `recordReview`, Phase 5.0.2) both build on this step.
 *
 * Ported from the legacy `planScheduler.js` SM-2 core, retargeted to the single
 * `ReviewSchedule` record and collapsing the beginner/hafiz interval-cap split into
 * one configurable `maxInterval` (the unified model has no per-page user type).
 */
import type { ReviewSchedule } from '@/core/storage/userData'

/** SM-2 ease factor never drops below this — keeps intervals from collapsing. */
export const MIN_EASE_FACTOR = 1.3
/** Ease factor a fresh page starts at. */
export const DEFAULT_EASE_FACTOR = 2.5
/** Minimum performance (0–5) that counts as a pass (no interval reset). */
export const PASSING_THRESHOLD = 3
/** Cap on the SM-2 interval in days (unified model — was the legacy hafiz cap). */
export const MAX_INTERVAL = 21

/** SM-2 performance scale (0–5). */
export const PERFORMANCE = {
  TOTAL_FAILURE: 0,
  MAJOR_MISTAKES: 1,
  MINOR_MISTAKES: 2,
  HESITATION: 3,
  CORRECT: 4,
  PERFECT: 5,
} as const

/** How the user self-reported a revision — the completion-loop vocabulary. */
export type ReviewRating = 'perfect' | 'good' | 'needs_work'

/** Map a self-reported rating to a representative SM-2 performance (0–5). */
const RATING_PERFORMANCE: Record<ReviewRating, number> = {
  perfect: PERFORMANCE.PERFECT, // 5 → interval grows, ease up
  good: PERFORMANCE.CORRECT, // 4 → passes, ease roughly flat
  needs_work: PERFORMANCE.MINOR_MISTAKES, // 2 → fails, interval resets to 1
}

export function ratingToPerformance(rating: ReviewRating): number {
  return RATING_PERFORMANCE[rating]
}

/** Local calendar date as `YYYY-MM-DD` (schedules are compared as strings). */
function formatISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** The SM-2 fields advanced by a single review — merged back into the record. */
export type ReviewStep = Pick<
  ReviewSchedule,
  'interval' | 'easeFactor' | 'nextReviewDate' | 'consecutiveCorrect' | 'lastReviewDate'
>

export interface NextReviewOptions {
  /** Interval cap in days (default {@link MAX_INTERVAL}). */
  maxInterval?: number
  /** Override "now" for deterministic tests. */
  today?: Date
}

/**
 * Advance one page's schedule by a single recall. Reads only the SM-2 fields, so a
 * partial record (or `undefined`) is fine — missing fields fall back to defaults.
 *
 * - **Fail** (`performance < PASSING_THRESHOLD`): interval → 1, streak → 0.
 * - **Pass**: interval → 1 (1st), 3 (2nd), then `interval × easeFactor` (rounded),
 *   capped at `maxInterval`; streak++.
 * - Ease factor drifts per the SM-2 formula, floored at {@link MIN_EASE_FACTOR}.
 */
export function calculateNextReview(
  schedule:
    | Partial<Pick<ReviewSchedule, 'interval' | 'easeFactor' | 'consecutiveCorrect'>>
    | null
    | undefined,
  performance: number,
  { maxInterval = MAX_INTERVAL, today = new Date() }: NextReviewOptions = {},
): ReviewStep {
  let interval = schedule?.interval ?? 1
  let easeFactor = schedule?.easeFactor ?? DEFAULT_EASE_FACTOR
  let consecutiveCorrect = schedule?.consecutiveCorrect ?? 0

  const perf = Math.max(0, Math.min(5, Math.round(performance)))

  if (perf < PASSING_THRESHOLD) {
    interval = 1
    consecutiveCorrect = 0
  } else {
    if (consecutiveCorrect === 0) interval = 1
    else if (consecutiveCorrect === 1) interval = 3
    else interval = Math.round(interval * easeFactor)
    consecutiveCorrect += 1
  }

  // SM-2 ease update, floored so intervals never collapse to nothing.
  easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor + (0.1 - (5 - perf) * (0.08 + (5 - perf) * 0.02)))
  interval = Math.min(interval, maxInterval)

  const next = new Date(today)
  next.setDate(next.getDate() + interval)

  return {
    interval,
    easeFactor: Math.round(easeFactor * 100) / 100,
    nextReviewDate: formatISODate(next),
    consecutiveCorrect,
    lastReviewDate: formatISODate(today),
  }
}

export interface PerformanceInputs {
  perfectRevisionCount?: number
  mistakeCount?: number
  /** 0–1 quiz accuracy, or null/undefined when there's no quiz data. */
  quizAccuracy?: number | null
  /** Optional self-report that overrides the derived score. */
  userRating?: ReviewRating | null
}

/**
 * Derive an SM-2 performance (0–5) from existing app signals — used when the
 * scheduler needs a score but the user didn't explicitly rate (e.g. seeding from
 * revision/mistake history). A `userRating` clamps the result toward that report.
 */
export function mapToPerformance({
  perfectRevisionCount = 0,
  mistakeCount = 0,
  quizAccuracy = null,
  userRating = null,
}: PerformanceInputs = {}): number {
  let base: number
  if (perfectRevisionCount >= 3) base = 5
  else if (perfectRevisionCount === 2) base = 4
  else if (perfectRevisionCount === 1) base = 3
  else base = 2

  if (mistakeCount >= 3) base -= 2
  else if (mistakeCount >= 1) base -= 1

  if (quizAccuracy !== null && quizAccuracy !== undefined) {
    if (quizAccuracy > 0.9) base += 1
    else if (quizAccuracy < 0.5) base -= 1
  }

  if (userRating === 'perfect') base = Math.max(base, 4)
  else if (userRating === 'good') base = Math.max(base, 3)
  else if (userRating === 'needs_work') base = Math.min(base, 2)

  return Math.max(0, Math.min(5, base))
}

/** Shift a `YYYY-MM-DD` by `delta` days (local midnight anchored). */
function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return formatISODate(d)
}

/** What an absence costs: how the backlog is reshaped and what the caller should ease off. */
export type MissedAction =
  | 'none'
  | 'light_reschedule'
  | 'medium_reschedule'
  | 'heavy_reschedule'
  | 'plan_reset_needed'

export interface MissedDaysChanges {
  /** Days to scale new memorization down over (medium). */
  reduceNewMemorizationDays?: number
  /** Factor to scale the new-memorization budget by (medium). */
  newMemorizationMultiplier?: number
  /** Days to pause new memorization entirely (heavy). */
  pauseNewMemorizationDays?: number
  /** The absence was long enough that the plan should be rebuilt. */
  needsRestart?: boolean
}

export interface MissedDaysResult {
  action: MissedAction
  missedDays: number
  changes: MissedDaysChanges
  /** An updated **copy** of the schedules (the input map is never mutated). */
  reviewData: Map<number, ReviewSchedule>
}

/** Spread the overdue pages across the next `spreadDays` days, soonest page first. */
function redistributeOverdue(
  reviewData: Map<number, ReviewSchedule>,
  todayStr: string,
  spreadDays: number,
): void {
  const overdue = [...reviewData.entries()]
    .filter(([, s]) => s.nextReviewDate < todayStr)
    .map(([page]) => page)
    .sort((a, b) => a - b)
  if (overdue.length === 0) return

  const perDay = Math.ceil(overdue.length / spreadDays)
  overdue.forEach((page, i) => {
    const schedule = reviewData.get(page)!
    reviewData.set(page, {
      ...schedule,
      interval: 1,
      nextReviewDate: addDays(todayStr, Math.floor(i / perDay)),
    })
  })
}

/** After a long absence, bring every page back to a 1-day interval due today. */
function resetAllIntervals(reviewData: Map<number, ReviewSchedule>, todayStr: string): void {
  for (const [page, schedule] of reviewData) {
    reviewData.set(page, {
      ...schedule,
      interval: 1,
      nextReviewDate: todayStr,
      consecutiveCorrect: 0,
      // Ease factor survives — it still reflects long-term learning.
    })
  }
}

/**
 * Reshape the backlog after missed days, so returning after an absence doesn't dump
 * every overdue page into one day. Ported from the legacy `planScheduler.js` with
 * the same escalation, retargeted to the unified {@link ReviewSchedule} map:
 *
 * - **1 day** → light: spread the overdue pages over 2 days.
 * - **2–4 days** → medium: spread over 3 days, halve new memorization for 3 days.
 * - **5–13 days** → heavy: every page back to interval 1 due today, pause new
 *   memorization for `ceil(missedDays / 2)` days.
 * - **14+ days** → the plan needs rebuilding; schedules are left untouched.
 */
export function handleMissedDays(
  reviewData: Map<number, ReviewSchedule>,
  lastActiveDate: string | null | undefined,
  today: Date = new Date(),
): MissedDaysResult {
  const copy = new Map(reviewData)
  if (!lastActiveDate) return { action: 'none', missedDays: 0, changes: {}, reviewData: copy }

  const todayStr = formatISODate(today)
  const missedDays = Math.floor(
    (new Date(todayStr + 'T00:00:00').getTime() - new Date(lastActiveDate + 'T00:00:00').getTime()) /
      86400000,
  )
  if (missedDays <= 0) return { action: 'none', missedDays: 0, changes: {}, reviewData: copy }

  if (missedDays === 1) {
    redistributeOverdue(copy, todayStr, 2)
    return { action: 'light_reschedule', missedDays, changes: {}, reviewData: copy }
  }
  if (missedDays <= 4) {
    redistributeOverdue(copy, todayStr, 3)
    return {
      action: 'medium_reschedule',
      missedDays,
      changes: { reduceNewMemorizationDays: 3, newMemorizationMultiplier: 0.5 },
      reviewData: copy,
    }
  }
  if (missedDays <= 13) {
    resetAllIntervals(copy, todayStr)
    return {
      action: 'heavy_reschedule',
      missedDays,
      changes: { pauseNewMemorizationDays: Math.ceil(missedDays / 2) },
      reviewData: copy,
    }
  }
  return { action: 'plan_reset_needed', missedDays, changes: { needsRestart: true }, reviewData: copy }
}
