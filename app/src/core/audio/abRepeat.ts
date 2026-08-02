/**
 * AB-repeat state machine (decision 7), pure half.
 *
 * The reducer owns the marker/loop *state*; the engine (7.1.2) owns the timeline
 * effects (seeking). Simplified interaction model, all confirmed:
 *   a) set A then B (either order) → looping starts immediately, region [min, max].
 *   b) set B alone (no A yet) → loops from the very beginning (0) to B immediately —
 *      no separate "tap Loop" step needed, since "loop the start of this" is the
 *      common case and A is awkward to place exactly at 0.
 *   c) set A alone, then tap Loop → loops from A to the end immediately (no need to
 *      wait for the item to finish playing first).
 *   d) tap Loop with no markers at all → loops the whole item, [0, duration].
 *   e) the loop can be toggled off while the A/B markers stay put, and back on.
 *   f) clear removes the markers and stops the loop.
 *
 * Markers may be set in either order; the *region* is always `[min, max]`. Whenever
 * `loop` is true, both `a` and `b` are guaranteed non-null (every transition that
 * sets `loop: true` fills both markers in the same step) — callers can rely on this
 * instead of re-checking.
 */

export interface AbState {
  /** Point A, seconds, or null if unset. */
  a: number | null
  /** Point B, seconds, or null if unset. */
  b: number | null
  /** Whether looping is active (markers are preserved when this is off). */
  loop: boolean
}

export const AB_NONE: AbState = { a: null, b: null, loop: false }

/**
 * Whether `[a, b]` (order-independent) spans a real, non-empty duration. A region
 * needs positive width to be loopable — `a === b` (e.g. B tapped at `currentTime
 * === 0` with no A set yet, defaulting A to 0 too) has nothing to play between the
 * two points, so arming a "loop" there would just pin playback at a single instant
 * forever rather than looping anything. Guarded here, at the one place regions are
 * constructed, rather than in every caller.
 */
function isLoopableRegion(a: number, b: number): boolean {
  return a !== b
}

/**
 * Set/replace point A. Marking A alone never starts a loop on its own (the user
 * must explicitly tap Loop, or place B, per the module doc) — unless B is already
 * set, in which case both markers are now in place and looping starts (behaviour a)
 * — unless that would make a zero-width region, in which case the marker still
 * moves but looping doesn't arm on a region with nothing to loop.
 */
export function setA(s: AbState, time: number): AbState {
  const a = Math.max(0, time)
  const loop = s.b !== null ? isLoopableRegion(a, s.b) : s.loop
  return { a, b: s.b, loop }
}

/**
 * Set/replace point B. Starts looping immediately (if A isn't set yet, the region
 * defaults to [0, B] — behaviour b; if A is already set, [A, B] — behaviour a) —
 * unless that would make a zero-width region (see `isLoopableRegion`), in which
 * case the marker still moves but looping doesn't arm.
 */
export function setB(s: AbState, time: number): AbState {
  const a = s.a ?? 0
  const b = Math.max(0, time)
  return { a, b, loop: isLoopableRegion(a, b) }
}

/**
 * Toggle looping. Turning off just flips the flag, preserving markers (behaviour e).
 * Turning on fills in whichever marker is missing so a region always exists right
 * away: no markers → [0, duration] (d); A only → [A, duration] (c); B only → [0, B]
 * (mirrors b, reachable if a caller flips loop off and back on with only B set).
 * `duration` may be 0/NaN before metadata has loaded, or the resulting region may
 * be zero-width (e.g. A already sitting exactly at `duration`) — in either case
 * there's nothing sensible to loop against yet, so this is a no-op.
 */
export function toggleLoop(s: AbState, duration: number): AbState {
  if (s.loop) return { ...s, loop: false }
  if (!(duration > 0)) return s
  const a = s.a ?? 0
  const b = s.b ?? duration
  if (!isLoopableRegion(a, b)) return s
  return { a, b, loop: true }
}

/** Clear both markers and stop looping (behaviour f). */
export function clearAb(): AbState {
  return { ...AB_NONE }
}

/**
 * The normalised loop region `[start, end]`, or null when not both markers are set
 * or they'd produce a zero-width region (see `isLoopableRegion`) — the single
 * choke point every region-dependent function (`abSeekTarget`, `abOnEnded`, the
 * progress-bar overlay in `stores/audio.ts`) reads through, so a degenerate region
 * can't sneak past one guarded caller and pin playback in another.
 */
export function abRegion(s: AbState): { start: number; end: number } | null {
  if (s.a === null || s.b === null || !isLoopableRegion(s.a, s.b)) return null
  return { start: Math.min(s.a, s.b), end: Math.max(s.a, s.b) }
}

/**
 * During playback (`timeupdate`): the time to seek back to, or null to keep playing.
 * Loops back to the region start once playback reaches the region end.
 */
export function abSeekTarget(s: AbState, currentTime: number): number | null {
  if (!s.loop) return null
  const region = abRegion(s)
  if (!region) return null
  return currentTime >= region.end ? region.start : null
}

/**
 * When the current item ends: how AB-repeat wants to handle it.
 * - Looping, with a region → wrap to the region start (in case `ended` fired
 *   before `timeupdate` caught the crossing).
 * - Otherwise → let the engine advance normally. (A lone A-marker, not yet turned
 *   into a loop via `toggleLoop`, is just a bookmark at this point — it does not
 *   force looping on reaching the end; see the module doc.)
 */
export function abOnEnded(s: AbState): { state: AbState; seekTo: number | null } {
  const region = abRegion(s)
  if (region && s.loop) {
    return { state: s, seekTo: region.start }
  }
  return { state: s, seekTo: null }
}
