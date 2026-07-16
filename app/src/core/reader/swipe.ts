/**
 * Pure swipe→page-turn decision, isolated from the DOM so the direction logic is
 * unit-testable. The reader content is right-to-left (Arabic), so paging is
 * mirrored versus an LTR carousel: in RTL a rightward drag reveals the *next*
 * page (like turning a page in an Arabic book), a leftward drag the previous.
 */

export interface SwipeInput {
  /** Total horizontal drag distance in px (final − start). +right / −left. */
  deltaX: number
  /** Release velocity in px/ms (sign = direction). */
  velocityX: number
  /** Page/viewport width in px, for the distance threshold. */
  width: number
  /** True when reading right-to-left (both mushaf surfaces). */
  rtl: boolean
}

export interface SwipeThresholds {
  /** Fraction of width that counts as a committed drag. Default 0.25. */
  distanceRatio?: number
  /** Flick velocity (px/ms) that commits regardless of distance. Default 0.5. */
  velocity?: number
}

/**
 * Resolve a drag into a page delta: `+1` next, `-1` previous, `0` snap back.
 * Direction comes from the drag distance, falling back to velocity for a flick.
 */
export function resolveSwipe(input: SwipeInput, thresholds: SwipeThresholds = {}): -1 | 0 | 1 {
  const distanceRatio = thresholds.distanceRatio ?? 0.25
  const velocity = thresholds.velocity ?? 0.5

  const dir = Math.abs(input.deltaX) >= 1 ? Math.sign(input.deltaX) : Math.sign(input.velocityX)
  if (dir === 0) return 0

  const committed =
    Math.abs(input.deltaX) > input.width * distanceRatio || Math.abs(input.velocityX) > velocity
  if (!committed) return 0

  // Dragged left (dir < 0) reveals the right-hand column; right reveals the left.
  const revealRight = dir < 0
  const next = revealRight ? (input.rtl ? -1 : 1) : input.rtl ? 1 : -1
  return next as -1 | 1
}

/**
 * Apply rubber-band resistance when dragging toward a non-existent page (before
 * page 1 or past the last), so the edge feels bounded rather than dead.
 */
export function dampenIfAtEdge(offset: number, atEdge: boolean): number {
  return atEdge ? offset * 0.35 : offset
}
