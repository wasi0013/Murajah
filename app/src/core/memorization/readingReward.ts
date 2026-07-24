/**
 * Pure reading-reward accrual — no timers/DOM, so it's fake-clock testable.
 * A page's reading reward is earned by **active** time on it in a session:
 *   - at ≥ 90s  → grant `pageHasanah × 1`,
 *   - at ≥ 250s → grant another `pageHasanah × 1` (total ×2, for the extra effort).
 * Each threshold fires **once per session**; a session is one continuous visit to
 * a page (reset when the page changes). Idle/hidden time is simply not fed in, so
 * it can't be farmed. The caller multiplies the returned unit count by the page's
 * hasanah weight and awards it.
 */
export const READING_THRESHOLD_1 = 90
export const READING_THRESHOLD_2 = 250

export interface ReadingRewardState {
  /** Active seconds accrued on the current page this session. */
  activeSeconds: number
  /** Whether each threshold has already been granted this session. */
  grantedAt90: boolean
  grantedAt250: boolean
}

export function initReadingReward(): ReadingRewardState {
  return { activeSeconds: 0, grantedAt90: false, grantedAt250: false }
}

/**
 * Advance the session by `deltaSeconds` of active reading. Returns the updated
 * state and the number of **hasanah units** to award this tick (0, 1, or 2 when a
 * tick crosses both thresholds at once).
 */
export function tickReadingReward(
  state: ReadingRewardState,
  deltaSeconds: number,
): { state: ReadingRewardState; units: number } {
  const activeSeconds = state.activeSeconds + Math.max(0, deltaSeconds)
  let grantedAt90 = state.grantedAt90
  let grantedAt250 = state.grantedAt250
  let units = 0

  if (!grantedAt90 && activeSeconds >= READING_THRESHOLD_1) {
    units += 1
    grantedAt90 = true
  }
  if (!grantedAt250 && activeSeconds >= READING_THRESHOLD_2) {
    units += 1
    grantedAt250 = true
  }

  return { state: { activeSeconds, grantedAt90, grantedAt250 }, units }
}
