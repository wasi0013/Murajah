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
import type { AudioGrain } from './types'

/** Whether page-by-page audio is available in the given layout. */
export function pageAudioAvailable(layout: Layout): boolean {
  return layout === 'qpc'
}

/**
 * The grain that will actually play: page mode falls back to verse when the layout
 * doesn't support it (decision 6). The single source of truth for this rule — the
 * player, the orchestration, and the grain toggle all resolve through it so they
 * can never disagree about what plays vs. what's shown selected.
 */
export function effectiveGrain(grain: AudioGrain, layout: Layout): AudioGrain {
  return grain === 'page' && pageAudioAvailable(layout) ? 'page' : 'verse'
}

/** The hint shown when page mode is unavailable in the current layout. */
export const PAGE_MODE_UNAVAILABLE_HINT =
  'Page audio follows the standard mushaf; switch layout to use it.'
