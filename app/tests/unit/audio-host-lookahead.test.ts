import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useAudioStore } from '@/stores/audio'
import type { PlaylistItem } from '@/core/audio/playlist'

// Bug: in the reader/mushaf with autoplay-next, crossing a page was
// last item ends → (silence) → parent turns the page → Vue tick → load the next
// page's verse data → build → fetch its first mp3. With the screen locked, that
// silent async gap is where mobile OSes suspend the page, so long sessions died at
// a page boundary. Now AudioHost builds the next page's items near the end of the
// current page and *appends* them, and the page turn follows the audio instead of
// gating it. These drive real Vue reactivity (the risk is scheduler timing).

const verseItem = (page: number, ayah: number): PlaylistItem => ({
  kind: 'verse',
  urls: { primary: `${page}-${ayah}.mp3`, fallback: `${page}-${ayah}-fb.mp3` },
  label: `${page}:${ayah}`,
  verse: { surah: 2, ayah, page },
})
const pageItems = (page: number, n = 4) => Array.from({ length: n }, (_, i) => verseItem(page, i + 1))

const start = vi.fn(async (ctx: { pages: number[] }) => {
  const store = useAudioStore()
  store.setPlaylist(pageItems(ctx.pages[0]))
  store.isPlaying = true
})
const build = vi.fn(async (ctx: { pages: number[] }) => pageItems(ctx.pages[0]))
const appendToPlaylist = vi.fn((items: PlaylistItem[]) => useAudioStore().appendPlaylist(items))
const trimPlaylist = vi.fn((n: number) => useAudioStore().trimPlaylist(n))
const dropBefore = vi.fn((n: number) => useAudioStore().dropBefore(n))

vi.mock('@/composables/useQariPlayer', () => ({
  useQariPlayer: () => ({ start, build }),
}))
vi.mock('@/composables/useAudioEngine', () => ({
  useAudioEngine: () => ({ setOnExhausted: vi.fn(), stop: vi.fn(), appendToPlaylist, trimPlaylist, dropBefore }),
}))

import AudioHost from '@/features/audio/AudioHost.vue'

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.clearAllMocks()
})

async function settle() {
  for (let i = 0; i < 5; i++) await nextTick()
}

/** A reader-like parent: `pages` is the page in view, `nextPages` the one after. */
function harness(initial: number) {
  const current = ref(initial)
  const turned = vi.fn(() => {
    current.value += 1
  })
  const Harness = defineComponent({
    setup() {
      return () =>
        h(AudioHost, {
          view: 'text',
          layout: 'qpc',
          pages: [current.value],
          nextPages: current.value < 604 ? [current.value + 1] : [],
          onNeedNextPage: turned,
        })
    },
  })
  wrapper = mount(Harness)
  return { current, turned }
}

/** Start playback of the page in view through the host, like tapping play. */
async function startPlaying() {
  const { AudioMiniPlayer } = await import('@/features/audio/AudioMiniPlayer.vue').then((m) => ({
    AudioMiniPlayer: m.default,
  }))
  useAudioStore().open = true
  await settle()
  wrapper!.findComponent(AudioMiniPlayer).vm.$emit('start')
  await settle()
}

describe('AudioHost — next-page lookahead', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('near the end of the page, builds the next page and appends it to the queue', async () => {
    harness(5)
    await startPlaying()
    const store = useAudioStore()
    expect(build).not.toHaveBeenCalled() // 4 items left: not yet
    store.index = 1 // 3 left
    await settle()
    expect(build).toHaveBeenCalledWith({ view: 'text', layout: 'qpc', pages: [6] })
    expect(appendToPlaylist).toHaveBeenCalledTimes(1)
    expect(store.playlist).toHaveLength(8)
    expect(store.index).toBe(1) // cursor untouched
  })

  it('crossing into the appended page turns the page to follow — without restarting playback', async () => {
    const { current, turned } = harness(5)
    await startPlaying()
    const store = useAudioStore()
    store.index = 3
    await settle()
    start.mockClear()
    store.index = 4 // the engine advanced into page 6's first ayah
    await settle()
    expect(turned).toHaveBeenCalledTimes(1)
    expect(current.value).toBe(6)
    expect(start).not.toHaveBeenCalled() // no double start / jump back to ayah 1
    // The finished page is dropped: same item, now index 0 of a page-6-only queue.
    expect(store.index).toBe(0)
    expect(store.current?.verse).toEqual({ surah: 2, ayah: 1, page: 6 })
    expect(store.playlist.every((i) => i.verse?.page === 6)).toBe(true)
  })

  it('after following, prev stays within the page in view (the finished page is gone)', async () => {
    harness(5)
    await startPlaying()
    const store = useAudioStore()
    store.index = 3
    await settle()
    store.index = 4
    await settle()
    expect(store.hasPrev).toBe(false)
  })

  it('keeps chaining page after page', async () => {
    const { current } = harness(5)
    await startPlaying()
    const store = useAudioStore()
    store.index = 3
    await settle()
    store.index = 4 // into page 6 (queue trimmed to page 6: index 0)
    await settle()
    store.index = 2 // near the end of page 6 → page 7 appended
    await settle()
    expect(build).toHaveBeenLastCalledWith({ view: 'text', layout: 'qpc', pages: [7] })
    store.index = 4 // into page 7
    await settle()
    expect(current.value).toBe(7)
    expect(start).toHaveBeenCalledTimes(1) // only the initial tap
  })

  it('a manual page turn while playing still restarts from the newly shown page', async () => {
    const { current } = harness(5)
    await startPlaying()
    start.mockClear()
    current.value = 9
    await settle()
    expect(start).toHaveBeenCalledWith({ view: 'text', layout: 'qpc', pages: [9] })
  })

  it('no lookahead with loop-playlist on, autoplay-next off, or at the last page', async () => {
    const store = useAudioStore()
    store.loopPlaylist = true
    harness(5)
    await startPlaying()
    store.index = 3
    await settle()
    store.loopPlaylist = false
    store.autoNext = false
    await settle()
    expect(build).not.toHaveBeenCalled()
    wrapper!.unmount()
    store.autoNext = true
    harness(604)
    await startPlaying()
    store.index = 3
    await settle()
    expect(build).not.toHaveBeenCalled()
  })

  it('turning loop on after the next page was appended takes it back off', async () => {
    harness(5)
    await startPlaying()
    const store = useAudioStore()
    store.index = 2
    await settle()
    expect(store.playlist).toHaveLength(8)
    store.loopPlaylist = true
    await settle()
    expect(trimPlaylist).toHaveBeenCalledWith(4)
    expect(store.playlist).toHaveLength(4)
  })

  it('does not extend a queue started elsewhere (Listen/Today) for other pages', async () => {
    harness(5)
    const store = useAudioStore()
    store.open = true
    store.setPlaylist([verseItem(40, 1), verseItem(41, 1)]) // e.g. a Listen surah
    await settle()
    store.index = 1
    await settle()
    expect(build).not.toHaveBeenCalled()
  })

  it('drops a lookahead whose queue was replaced while it was being built', async () => {
    harness(5)
    await startPlaying()
    const store = useAudioStore()
    let release!: (items: PlaylistItem[]) => void
    build.mockImplementationOnce(() => new Promise((r) => (release = r)))
    store.index = 2
    await settle()
    store.setPlaylist(pageItems(30)) // the user picked something else meanwhile
    release(pageItems(6))
    await settle()
    expect(appendToPlaylist).not.toHaveBeenCalled()
  })

  it('REVIEW: a lookahead build still in flight when the user turns the page is dropped', async () => {
    // Race: build(page 6) pending → user flips to page 9 while playing →
    // startHere awaits its own build; the stale build must not append page 6 to
    // the old queue (and later turn the reader mid-page).
    const { current } = harness(5)
    await startPlaying()
    const store = useAudioStore()
    let release!: (items: PlaylistItem[]) => void
    build.mockImplementationOnce(() => new Promise((r) => (release = r)))
    let finishStart!: () => void
    start.mockImplementationOnce(
      (ctx) =>
        new Promise<void>((r) => {
          finishStart = () => {
            store.setPlaylist(pageItems(ctx.pages[0]))
            r()
          }
        }),
    )
    store.index = 2 // lookahead for page 6 starts
    await settle()
    current.value = 9 // manual page turn while playing → restart begins
    await settle()
    release(pageItems(6)) // stale build lands before the restart finishes
    await settle()
    finishStart()
    await settle()
    expect(appendToPlaylist).not.toHaveBeenCalled()
    expect(store.playlist.every((i) => i.verse?.page === 9)).toBe(true)
  })

  it('REVIEW: does not extend from the page on screen when the queue ends on another page', async () => {
    const { current } = harness(5)
    await startPlaying()
    const store = useAudioStore()
    store.isPlaying = false // paused…
    current.value = 9 // …flipped to page 9 (no restart while paused)
    await settle()
    store.index = 3 // resumed near the end of page 5's queue
    await settle()
    expect(build).not.toHaveBeenCalled() // would have appended page 10 after page 5
  })
})
