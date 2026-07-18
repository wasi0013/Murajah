import { getTodayDate } from './streaks'

/**
 * Completion-estimate math (Phase 9.2), ported from the legacy analytics page.
 * "How long until every page is memorized, at the plan's new-memorization pace?"
 *
 * Pure and calendar-safe: when the pace is 0 (no active front / new memorization
 * off) there is *no* honest estimate, so `daysRemaining`/`completionDate` are
 * `null` and the UI prompts for a goal instead of inventing a date (decision 5).
 */
export interface CompletionEstimate {
  /** Pages left to memorize (0 when the muṣḥaf is complete). */
  remaining: number
  /** Pages/day the estimate assumed (0 when there's no active pace). */
  pace: number
  /** Days to finish, or `null` when there's no pace to project from. */
  daysRemaining: number | null
  /** `YYYY-MM-DD` finish date, or `null` when there's no estimate. */
  completionDate: string | null
  /** Every page is already memorized. */
  complete: boolean
}

export function estimateCompletion(
  remaining: number,
  pace: number,
  today: Date = new Date(),
): CompletionEstimate {
  if (remaining <= 0) {
    return { remaining: 0, pace, daysRemaining: 0, completionDate: getTodayDate(today), complete: true }
  }
  if (pace <= 0) {
    return { remaining, pace: 0, daysRemaining: null, completionDate: null, complete: false }
  }
  const daysRemaining = Math.ceil(remaining / pace)
  const date = new Date(today)
  date.setDate(date.getDate() + daysRemaining)
  return { remaining, pace, daysRemaining, completionDate: getTodayDate(date), complete: false }
}
