/**
 * Listen player orchestration (8.2.1) — the seam between `ListenView` and the engine.
 *
 * Sibling to `useQariPlayer`, same singleton engine and store, but fed a *whole
 * scope* (a surah / juz / the entire Quran) instead of "the pages in view". Playback
 * is page-first (decision 5): it honours the user's page-reciter preference when that
 * voice is in Listen's curated set, else falls back to Alafasy — without touching the
 * stored preference. Always resolves through the QPC nav index (page audio is
 * QPC-indexed), so Listen works from either reader layout. No page-follow watcher:
 * Listen isn't bound to any visible reader page.
 */
import { getDataClient } from '@/core/data'
import type { NavIndex } from '@/core/data/types'
import { buildScopePlaylist, type PlaybackScope } from '@/core/audio/scope'
import { listenReciter, verseReciter } from '@/core/audio/reciters'
import { useAudioEngine } from '@/composables/useAudioEngine'
import { useAudioStore } from '@/stores/audio'
import { reportAudioStartError } from '@/composables/audioPlaybackError'

export function useListenPlayer() {
  const store = useAudioStore()
  const engine = useAudioEngine()
  const data = getDataClient()
  let qpcNav: NavIndex | null = null
  let lastScope: PlaybackScope | null = null

  async function play(scope: PlaybackScope): Promise<void> {
    lastScope = scope
    store.lastListenScope = scope
    store.open = true
    store.loading = true
    try {
      await data.init()
      qpcNav ??= await data.getNavIndex('qpc')
      const page = listenReciter(store.pageReciterId)
      const verse = verseReciter(page.id)
      engine.setPlaylistAndPlay(buildScopePlaylist(scope, page, verse, qpcNav))
    } catch (error) {
      // Caller (ListenView) fires this with `void player.play(...)` —
      // fire-and-forget. See `reportAudioStartError`'s doc comment for why
      // this catch exists at all (most commonly: offline, tapping Play
      // otherwise did nothing and looked like a crash).
      reportAudioStartError(error)
    } finally {
      store.loading = false
    }
  }

  /** Rebuild the last scope after a reciter change (speed applies live, no rebuild). */
  async function restart(): Promise<void> {
    if (lastScope) await play(lastScope)
  }

  return { play, restart }
}
