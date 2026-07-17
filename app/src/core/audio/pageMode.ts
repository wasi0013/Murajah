/**
 * Page-mode layout gating (7.0.4, decision 6).
 *
 * Page-by-page audio files are indexed by the **QPC 604-page** scheme. Indopak has
 * a different page numbering (610 pages), so those files don't line up. This phase
 * ships page mode **disabled for Indopak** with an inline hint; verse mode (keyed
 * `surah:ayah`) works in every layout.
 *
 * The verse-range → QPC-page mapping that would let page mode work in Indopak is
 * deliberately deferred (see the plan's deferred list); when it lands it goes here,
 * behind this same gate, without touching the engine.
 */
import type { Layout } from '@/core/data/types'

/** Whether page-by-page audio is available in the given layout. */
export function pageAudioAvailable(layout: Layout): boolean {
  return layout === 'qpc'
}

/** The hint shown when page mode is unavailable in the current layout. */
export const PAGE_MODE_UNAVAILABLE_HINT =
  'Page audio follows the standard mushaf; switch layout to use it.'
