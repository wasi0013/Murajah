/**
 * AB-repeat state machine (decision 7), pure half.
 *
 * The reducer owns the marker/loop *state*; the engine (7.1.2) owns the timeline
 * effects (seeking). Behaviours, all confirmed:
 *   a) set A then B → looping starts immediately.
 *   b) set A but never B → when the item reaches its end, B is auto-placed at the
 *      end and looping begins (so "A to the end, on repeat" needs one tap).
 *   c) the loop can be toggled off while the A/B markers stay put, and back on.
 *   d) clear removes the markers and stops the loop.
 *
 * Markers may be set in either order; the *region* is always `[min, max]`.
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

/** Set/replace point A. If B is already set, looping starts (behaviour a). */
export function setA(s: AbState, time: number): AbState {
  return { a: Math.max(0, time), b: s.b, loop: s.b !== null ? true : s.loop }
}

/** Set/replace point B. If A is already set, looping starts (behaviour a). */
export function setB(s: AbState, time: number): AbState {
  return { a: s.a, b: Math.max(0, time), loop: s.a !== null ? true : s.loop }
}

/** Toggle looping on/off, preserving the markers (behaviour c). */
export function toggleLoop(s: AbState): AbState {
  return { ...s, loop: !s.loop }
}

/** Clear both markers and stop looping (behaviour d). */
export function clearAb(): AbState {
  return { ...AB_NONE }
}

/** The normalised loop region `[start, end]`, or null when not both markers are set. */
export function abRegion(s: AbState): { start: number; end: number } | null {
  if (s.a === null || s.b === null) return null
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
 * - Only A set → auto-place B at the end, turn looping on, seek back to A (behaviour b).
 * - Both set and looping → wrap to the region start (in case `ended` fired past B).
 * - Otherwise → let the engine advance normally.
 */
export function abOnEnded(
  s: AbState,
  duration: number,
): { state: AbState; seekTo: number | null } {
  if (s.a !== null && s.b === null) {
    return { state: { a: s.a, b: Math.max(0, duration), loop: true }, seekTo: Math.min(s.a, duration) }
  }
  const region = abRegion(s)
  if (region && s.loop) {
    return { state: s, seekTo: region.start }
  }
  return { state: s, seekTo: null }
}
