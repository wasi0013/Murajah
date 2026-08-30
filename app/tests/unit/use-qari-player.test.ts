import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { PlaylistItem } from '@/core/audio/playlist'

const setPlaylistAndPlay = vi.fn<(items: PlaylistItem[]) => void>()
const init = vi.fn(async () => {})

vi.mock('@/composables/useAudioEngine', () => ({
  useAudioEngine: () => ({ setPlaylistAndPlay }),
}))
vi.mock('@/core/data', () => ({
  getDataClient: () => ({ init }),
}))

import { useQariPlayer } from '@/composables/useQariPlayer'
import { useAudioStore } from '@/stores/audio'
import { useToasts } from '@/composables/useToast'

beforeEach(() => {
  setActivePinia(createPinia())
  setPlaylistAndPlay.mockClear()
  init.mockClear()
  useToasts().splice(0)
})

describe('useQariPlayer — start() builds a playlist for the current grain/layout', () => {
  it('page grain builds a page playlist without touching verse lookups', async () => {
    const store = useAudioStore()
    store.grain = 'page'
    const player = useQariPlayer()
    await player.start({ view: 'text', layout: 'qpc', pages: [5] })
    expect(store.open).toBe(true)
    expect(setPlaylistAndPlay).toHaveBeenCalledTimes(1)
  })

  // Bug (reported): tapping the Reader/Mushaf headphone icon's Play button
  // while offline did nothing visible — a rejected data.init() became a
  // silent unhandled rejection, since AudioHost calls this with
  // `void player.start(ctx())`. Feels like the app crashed; it's offline.
  it('a network failure surfaces a toast and resolves cleanly instead of rejecting', async () => {
    init.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const player = useQariPlayer()
    const store = useAudioStore()

    await expect(player.start({ view: 'text', layout: 'qpc', pages: [5] })).resolves.toBeUndefined()

    expect(store.loading).toBe(false) // never left stuck mid-spinner
    expect(setPlaylistAndPlay).not.toHaveBeenCalled()
    const last = useToasts().at(-1)
    expect(last?.variant).toBe('error')
    expect(last?.message).toMatch(/internet|wi-?fi/i)
  })

  it('a non-network failure still surfaces a toast (generic message) rather than failing silently', async () => {
    init.mockRejectedValueOnce(new TypeError('boom'))
    const player = useQariPlayer()

    await expect(player.start({ view: 'text', layout: 'qpc', pages: [5] })).resolves.toBeUndefined()

    const last = useToasts().at(-1)
    expect(last?.variant).toBe('error')
    expect(last?.message).not.toMatch(/internet|wi-?fi/i)
  })
})
