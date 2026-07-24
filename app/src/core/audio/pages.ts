/**
 * Which page(s) should play, given the current view (7.0.3).
 *
 * The user's core requirement: in the mushaf 2-up spread, audio must cover **both**
 * visible pages. That falls straight out of the mushaf store's existing `visible`
 * computed (the RTL pair, already ascending) — this function just picks the right
 * source per view and normalises order. Pure: the view passes a plain context, no
 * store import, so it's trivially testable.
 */

/** Which surface the player is attached to. */
export type AudioView = 'text' | 'mushaf'

export interface AudioPagesContext {
  /** The text reader's current page. */
  readerPage: number
  /** The mushaf view's currently visible page(s) — one on mobile, the pair on desktop. */
  mushafVisible: readonly number[]
}

/**
 * The page(s) whose audio should play, in ascending (reading) order, de-duplicated.
 * Text view → the single reader page. Mushaf → every visible page (both, in a
 * desktop spread; one on mobile / at the last page).
 */
export function audioPagesFor(view: AudioView, ctx: AudioPagesContext): number[] {
  const pages = view === 'text' ? [ctx.readerPage] : ctx.mushafVisible
  return [...new Set(pages)].sort((a, b) => a - b)
}
