/**
 * Qari player orchestration (7.2.4) — the seam between the view and the engine.
 *
 * The view supplies a plain context (which surface, layout, and page(s) are showing;
 * see `audioPagesFor`); this builds the right playlist for the current grain/reciter
 * and hands it to the engine. There's deliberately no `restart`/"last context"
 * memory here: playback can be started by a *different* view entirely (Listen,
 * Today — siblings with their own player composables), so a grain/reciter change
 * always re-derives from the caller's current, live context (`start` again) rather
 * than from whatever this instance last saw, which may be stale or nonexistent.
 */
import { getDataClient } from '@/core/data'
import type { Layout } from '@/core/data/types'
import type { AudioView } from '@/core/audio/pages'
import { effectiveGrain } from '@/core/audio/pageMode'
import { buildPagePlaylist, buildVersePlaylist } from '@/core/audio/playlist'
import { pageReciter, verseReciter } from '@/core/audio/reciters'
import { versesForPages } from '@/core/audio/verses'
import { useAudioEngine } from '@/composables/useAudioEngine'
import { useAudioStore } from '@/stores/audio'

export interface QariContext {
  view: AudioView
  layout: Layout
  /** The page(s) to play — from `audioPagesFor(view, …)`. */
  pages: number[]
}

export function useQariPlayer() {
  const store = useAudioStore()
  const engine = useAudioEngine()
  const data = getDataClient()

  async function start(ctx: QariContext): Promise<void> {
    store.open = true
    store.loading = true
    try {
      await data.init()
      if (effectiveGrain(store.grain, ctx.layout) === 'page') {
        engine.setPlaylistAndPlay(buildPagePlaylist(ctx.pages, pageReciter(store.pageReciterId)))
      } else {
        const verses = await versesForPages(ctx.layout, ctx.pages, data)
        engine.setPlaylistAndPlay(
          buildVersePlaylist(verses, verseReciter(store.verseReciterId), {
            repeatCount: store.repeatCount,
            spaced: store.spaced,
          }),
        )
      }
    } finally {
      store.loading = false
    }
  }

  return { start }
}
