/**
 * Today player orchestration — the seam between `TodayAudioPlayer` and the
 * engine. Sibling to `useQariPlayer`/`useListenPlayer`, same singleton engine
 * and store, but fed one of Today's own lists: a page set (new / revision /
 * weak-reinforcement — always page grain, per the daily task queue) or a verse
 * set (the habit builder's verses of the day — always verse grain, since it's
 * inherently verse-scoped and may cross page/surah boundaries).
 */
import { getDataClient } from '@/core/data'
import type { NavIndex } from '@/core/data/types'
import type { AbsoluteVerseRef } from '@/core/quran/habitVerses'
import { buildPagePlaylist, buildVersePlaylist } from '@/core/audio/playlist'
import { pageReciter, verseReciter } from '@/core/audio/reciters'
import { useAudioEngine } from '@/composables/useAudioEngine'
import { useAudioStore } from '@/stores/audio'

export type TodaySource =
  | { kind: 'pages'; pages: number[] }
  | { kind: 'verses'; verses: AbsoluteVerseRef[] }

export function useTodayPlayer() {
  const store = useAudioStore()
  const engine = useAudioEngine()
  const data = getDataClient()
  let qpcNav: NavIndex | null = null
  let lastSource: TodaySource | null = null

  async function play(source: TodaySource): Promise<void> {
    lastSource = source
    store.open = true
    store.loading = true
    try {
      if (source.kind === 'pages') {
        engine.setPlaylistAndPlay(buildPagePlaylist(source.pages, pageReciter(store.pageReciterId)))
        return
      }
      await data.init()
      qpcNav ??= await data.getNavIndex('qpc')
      const nav = qpcNav
      const verses = source.verses.map((v) => ({
        surah: v.surah,
        ayah: v.ayah,
        page: nav.ayahToPage[`${v.surah}:${v.ayah}`] ?? 0,
        arabic: '',
      }))
      engine.setPlaylistAndPlay(buildVersePlaylist(verses, verseReciter(store.verseReciterId)))
    } finally {
      store.loading = false
    }
  }

  /** Rebuild playback for the last source (after a reciter change). */
  async function restart(): Promise<void> {
    if (lastSource) await play(lastSource)
  }

  return { play, restart }
}
