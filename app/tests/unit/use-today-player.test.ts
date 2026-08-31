import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { NavIndex } from '@/core/data/types'
import type { PlaylistItem } from '@/core/audio/playlist'

// Same shape as use-listen-player.test.ts's fixture.
const nav: NavIndex = {
  ayahToPage: { '1:1': 1, '1:2': 1, '1:3': 1 },
  surahToPage: {},
  juzToPage: {},
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

import { useTodayPlayer } from '@/composables/useTodayPlayer'
import { useAudioStore } from '@/stores/audio'
import { useToasts } from '@/composables/useToast'

const lastPlaylist = () => setPlaylistAndPlay.mock.calls.at(-1)![0]

beforeEach(() => {
  setActivePinia(createPinia())
  setPlaylistAndPlay.mockClear()
  init.mockClear()
  getNavIndex.mockClear()
})

describe('useTodayPlayer', () => {
  it('a pages source builds a plain page playlist (no repeat concept)', async () => {
    const player = useTodayPlayer()
    await player.play({ kind: 'pages', pages: [3, 1] })
    expect(getNavIndex).not.toHaveBeenCalled() // pages never touch the nav index
    expect(lastPlaylist().every((i) => i.kind === 'page-part')).toBe(true)
  })

  it('BUG regression: a verses source (habit builder) honors repeatCount', async () => {
    // Previously: buildVersePlaylist was called with no options at all, so the
    // repeat-count stepper visibly changed state and rebuilt the playlist but
    // had no audible effect on Today's "verses of day" tab.
    const store = useAudioStore()
    store.repeatCount = 3
    const player = useTodayPlayer()
    await player.play({ kind: 'verses', verses: [{ surah: 1, ayah: 1 }] })
    expect(lastPlaylist()).toHaveLength(3)
    expect(lastPlaylist().map((i) => i.label)).toEqual(['1:1', '1:1', '1:1'])
  })

  it('BUG regression: a verses source honors the spaced-repetition drill', async () => {
    const store = useAudioStore()
    store.spaced = true
    const player = useTodayPlayer()
    await player.play({
      kind: 'verses',
      verses: [
        { surah: 1, ayah: 1 },
        { surah: 1, ayah: 2 },
      ],
    })
    // spacedGroups(2) = [[0],[0],[1],[0,1]] -> 1+1+1+2 = 5 items
    expect(lastPlaylist()).toHaveLength(5)
  })

  it('restart rebuilds the last source, still honoring repeatCount', async () => {
    const store = useAudioStore()
    store.repeatCount = 2
    const player = useTodayPlayer()
    await player.play({ kind: 'verses', verses: [{ surah: 1, ayah: 3 }] })
    setPlaylistAndPlay.mockClear()
    await player.restart()
    expect(lastPlaylist()).toHaveLength(2)
  })

  // Bug: tapping Play while offline did nothing — a rejected data.init()
  // (verses source only; pages never touch it) became a silent unhandled
  // rejection, since TodayAudioPlayer calls this with `void player.play(...)`.
  it('a network failure surfaces a toast and resolves cleanly instead of rejecting', async () => {
    useToasts().splice(0)
    getNavIndex.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const player = useTodayPlayer()
    const store = useAudioStore()

    await expect(player.play({ kind: 'verses', verses: [{ surah: 1, ayah: 1 }] })).resolves.toBeUndefined()

    expect(store.loading).toBe(false) // never left stuck mid-spinner
    const last = useToasts().at(-1)
    expect(last?.variant).toBe('error')
    expect(last?.message).toMatch(/internet|wi-?fi/i)
  })
})
