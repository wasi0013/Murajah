/**
 * Pure playlist-cursor decisions (7.1.2), extracted from the engine so the "what
 * plays next" logic is testable without mocking an `<audio>` element.
 */

/** Move to `index`, or stop. */
export type Advance = { index: number } | 'stop'

/**
 * What to do when the current item ends naturally.
 * - Not the last item → advance if autoplay-next is on, else stop (pause at the end).
 * - The last item → wrap to the start if loop-playlist is on, else stop.
 */
export function nextOnEnd(index: number, length: number, autoNext: boolean, loop: boolean): Advance {
  if (index < length - 1) return autoNext ? { index: index + 1 } : 'stop'
  return loop && length > 0 ? { index: 0 } : 'stop'
}

/**
 * What to do when the current item fails to load (both primary and fallback).
 * Skip forward regardless of autoplay-next — the item is unplayable — and stop at
 * the end of the list.
 */
export function nextOnFailure(index: number, length: number): Advance {
  return index < length - 1 ? { index: index + 1 } : 'stop'
}
