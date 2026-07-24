import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { NavIndex } from '@/core/data/types'
import type { PlaylistItem } from '@/core/audio/playlist'

// Same boundary fixture as audio-scope: interior pages come from the real page-range
// table, so only shared-page verse lookups + juz starts need entries here.
const nav: NavIndex = {
  ayahToPage: { '25:1': 359, '25:2': 359, '108:1': 602, '108:2': 602, '108:3': 602 },
  surahToPage: {},
  juzToPage: { '1': 1, '2': 22, '30': 582 },
}

const setPlaylistAndPlay = vi.fn<(items: PlaylistItem[]) => void>()
const init = vi.fn(async () => {})
const getNavIndex = vi.fn(async () => nav)

vi.mock('@/composables/useAudioEngine', () => ({
  useAudioEngine: () => ({ setPlaylistAndPlay }),
}))
vi.mock('@/core/data', () => ({
  getDataClient: () => ({ init, getNavIndex }),
}))

import { useListenPlayer } from '@/composables/useListenPlayer'
import { useAudioStore } from '@/stores/audio'

const lastPlaylist = () => setPlaylistAndPlay.mock.calls.at(-1)![0]

beforeEach(() => {
  setActivePinia(createPinia())
  setPlaylistAndPlay.mockClear()
  init.mockClear()
  getNavIndex.mockClear()
})

describe('useListenPlayer', () => {
  it('opens the player and resolves through the QPC nav index', async () => {
    const store = useAudioStore()
    const listen = useListenPlayer()
    await listen.play({ kind: 'surah', surah: 25 })
    expect(store.open).toBe(true)
    expect(getNavIndex).toHaveBeenCalledWith('qpc')
    expect(setPlaylistAndPlay).toHaveBeenCalledTimes(1)
  })

  it('plays a surah from Alafasy surah-parts by default (no verse audio)', async () => {
    const listen = useListenPlayer() // default page reciter is Alafasy
    await listen.play({ kind: 'surah', surah: 25 })
    const items = lastPlaylist()
    expect(items).toHaveLength(8) // pages 359..366
    expect(items.every((i) => i.kind === 'page-part')).toBe(true)
  })

  it('a curated single-file reciter uses boundary verse audio + page files', async () => {
    const store = useAudioStore()
    store.pageReciterId = 'shuraim'
    const listen = useListenPlayer()
    await listen.play({ kind: 'surah', surah: 25 })
    const items = lastPlaylist()
    expect(items.slice(0, 2).map((i) => i.kind)).toEqual(['verse', 'verse'])
    expect(items.slice(2).every((i) => i.kind === 'page-part')).toBe(true)
  })

  it('a stored non-curated reciter plays via Alafasy without mutating the preference', async () => {
    const store = useAudioStore()
    store.pageReciterId = 'husary' // page-only, not in the Listen set
    const listen = useListenPlayer()
    await listen.play({ kind: 'surah', surah: 25 })
    const items = lastPlaylist()
    expect(items.every((i) => i.kind === 'page-part')).toBe(true) // Alafasy, no verse fallback
    expect(store.pageReciterId).toBe('husary') // preference untouched
  })

  it('a juz is a bounded run of page items; the whole Quran is 604 for a single-file voice', async () => {
    const store = useAudioStore()
    store.pageReciterId = 'shuraim' // one file per page → exactly one item per page
    const listen = useListenPlayer()
    await listen.play({ kind: 'juz', juz: 1 })
    expect(lastPlaylist()).toHaveLength(21)
    await listen.play({ kind: 'quran' })
    expect(lastPlaylist()).toHaveLength(604)
  })

  it('restart rebuilds the last scope', async () => {
    const listen = useListenPlayer()
    await listen.play({ kind: 'juz', juz: 1 })
    setPlaylistAndPlay.mockClear()
    await listen.restart()
    expect(lastPlaylist()).toHaveLength(21)
  })
})
