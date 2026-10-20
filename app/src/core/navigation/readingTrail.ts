/**
 * Reading trail: the last few places the reader has been, so a hop across the
 * mushaf (a quick-jump to 2:255, a surah from the contents list, a deep link) can
 * always be retraced.
 *
 * The trail stores *reading spots*, not every page turned. Turning to a nearby
 * page moves the current spot along with you; landing somewhere far away starts a
 * new spot and keeps the one you left. Reading pages 10 to 15, jumping to 200,
 * reading on to 202, then jumping to 50 leaves [50, 202, 15] — the hops, in
 * order, each at the page you actually got to.
 *
 * Pure functions over plain arrays; the store owns persistence and the clock.
 */

export interface TrailEntry {
  page: number
  /** When the reader was last on this spot (epoch ms). */
  at: number
}

/** The current spot plus five to go back to. */
export const TRAIL_MAX = 6

/**
 * Pages this close count as reading on rather than jumping. Two, not one: the
 * desktop mushaf turns a whole spread (two pages) at a time.
 */
export const TRAIL_NEAR = 2

/**
 * - `same`: still on the current spot's page (a re-render, a remount).
 * - `moved`: read on to a nearby page; the current spot moved along.
 * - `hop`: landed far away; a new spot, with the one left behind kept.
 */
export type VisitKind = 'same' | 'moved' | 'hop'

const near = (a: number, b: number) => Math.abs(a - b) <= TRAIL_NEAR

/**
 * Record being on `page` at `now`. The new spot goes to the front; any older spot
 * near it is folded in (coming back to a place you'd left resumes that spot, it
 * doesn't list it twice), and the trail is capped at `TRAIL_MAX`.
 */
export function recordVisit(
  trail: readonly TrailEntry[],
  page: number,
  now: number,
): { trail: TrailEntry[]; kind: VisitKind } {
  const head = trail[0]
  if (head && head.page === page) {
    return { trail: [{ page, at: now }, ...trail.slice(1)], kind: 'same' }
  }
  const kind: VisitKind = head && near(head.page, page) ? 'moved' : 'hop'
  const rest = trail.slice(kind === 'moved' ? 1 : 0).filter((e) => !near(e.page, page))
  return { trail: [{ page, at: now }, ...rest].slice(0, TRAIL_MAX), kind }
}

/** Validate a stored trail (anything malformed is dropped, never thrown on). */
export function sanitizeTrail(value: unknown): TrailEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (e): e is TrailEntry =>
        !!e &&
        typeof e === 'object' &&
        Number.isInteger((e as TrailEntry).page) &&
        (e as TrailEntry).page > 0 &&
        Number.isFinite((e as TrailEntry).at),
    )
    .map((e) => ({ page: e.page, at: e.at }))
    .slice(0, TRAIL_MAX)
}
