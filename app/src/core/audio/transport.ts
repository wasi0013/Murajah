/**
 * Pure playlist-cursor decisions (7.1.2), extracted from the engine so the "what
 * plays next" logic is testable without mocking an `<audio>` element.
 */

/**
 * Move to `index`, stop outright, or `'exhausted'` — the playlist has nothing more
 * to offer but autoplay-next wants to keep going, so the caller (the view that
 * built this playlist, e.g. "the page(s) in view") should supply a new one — see
 * `AudioHost.vue`'s `need-next-page` emit.
 */
export type Advance = { index: number } | 'stop' | 'exhausted'

/**
 * What to do when the current item ends naturally.
 * - Not the last item → advance if autoplay-next is on, else stop (pause at the end).
 * - The last item, loop-playlist on → wrap to the start, regardless of autoplay-next
 *   (the user asked the whole list to repeat).
 * - The last item, loop-playlist off → 'exhausted' if autoplay-next wants to keep
 *   going (the caller should supply the next page's playlist), else stop.
 */
export function nextOnEnd(index: number, length: number, autoNext: boolean, loop: boolean): Advance {
  if (length === 0) return 'stop'
  if (index < length - 1) return autoNext ? { index: index + 1 } : 'stop'
  if (loop) return { index: 0 }
  return autoNext ? 'exhausted' : 'stop'
}

/**
 * What to do when the current item fails to load (both primary and fallback).
 * Skip forward regardless of autoplay-next — the item is unplayable — and stop at
 * the end of the list.
 */
export function nextOnFailure(index: number, length: number): Advance {
  return index < length - 1 ? { index: index + 1 } : 'stop'
}
