import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useAudioStore } from '@/stores/audio'
import AudioMiniPlayer from '@/features/audio/AudioMiniPlayer.vue'

// Bug: "when auto play next is selected, the audio loads the next page's audio but
// the page stays on the previous one." The engine signals exhaustion (no more items,
// autoplay-next on, no loop-playlist) via a callback; AudioHost asks its parent
// (which owns page navigation) to advance, then resumes playback only if the parent
// actually could. This exercises that wiring through real Vue prop reactivity rather
// than asserting on the source, since the whole risk is scheduler timing (does the
// `nextTick` in AudioHost really see the parent's updated `pages` prop?).

const start = vi.fn(async () => {})
let onExhausted: (() => void) | null = null
const setOnExhausted = vi.fn((cb: (() => void) | null) => {
  onExhausted = cb
})
const engineStop = vi.fn()

vi.mock('@/composables/useQariPlayer', () => ({
  useQariPlayer: () => ({ start }),
}))
vi.mock('@/composables/useAudioEngine', () => ({
  useAudioEngine: () => ({ setOnExhausted, stop: engineStop }),
}))

import AudioHost from '@/features/audio/AudioHost.vue'

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.clearAllMocks()
  onExhausted = null
})

function harness(initialPages: number[], onNeedNextPage: () => void) {
  const pages = ref(initialPages)
  const Harness = defineComponent({
    setup() {
      return () =>
        h(AudioHost, {
          view: 'text',
          layout: 'qpc',
          pages: pages.value,
          onNeedNextPage,
        })
    },
  })
  return { pages, wrapper: mount(Harness) }
}

describe('AudioHost — autoplay-next page-turn wiring', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('asks the parent for the next page, then resumes playback once the page actually moved', async () => {
    const { pages, wrapper: w } = harness([5], () => {
      pages.value = [pages.value[0] + 1] // parent "turns the page" (reader.nextPage())
    })
    wrapper = w
    await nextTick()
    expect(setOnExhausted).toHaveBeenCalled()
    start.mockClear()

    onExhausted?.()
    await nextTick()
    await nextTick()

    expect(start).toHaveBeenCalledTimes(1)
    expect(start.mock.calls[0][0]).toEqual({ view: 'text', layout: 'qpc', pages: [6] })
  })

  it('does not try to resume when the parent could not advance (already at the last page)', async () => {
    const { wrapper: w } = harness([604], () => {
      // reader.nextPage() clamps to pageCount and is a no-op at the last page —
      // the `pages` prop the parent passes down never changes.
    })
    wrapper = w
    await nextTick()
    start.mockClear()

    onExhausted?.()
    await nextTick()
    await nextTick()

    expect(start).not.toHaveBeenCalled()
  })

  it('unregisters the exhausted callback on unmount so a torn-down view is never asked to advance', async () => {
    const { wrapper: w } = harness([5], () => {})
    wrapper = w
    await nextTick()
    wrapper.unmount()
    wrapper = null
    expect(setOnExhausted).toHaveBeenLastCalledWith(null)
  })
})

describe('AudioHost — rebuild after playback started elsewhere', () => {
  // Bug: playback started in a sibling view (Listen, Today — each with its own
  // player-composable instance) leaves *this* instance's context empty. Rebuild
  // must re-derive from this view's own current props, not from memory of a
  // `start()` that may never have happened here.
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('rebuilds from the current view context on a grain/reciter change, even without a prior start() here', async () => {
    const { wrapper: w } = harness([5], () => {})
    wrapper = w
    useAudioStore().open = true // as if a sibling view already opened the player
    await nextTick()
    start.mockClear()

    await wrapper.findComponent(AudioMiniPlayer).vm.$emit('rebuild')
    await nextTick()

    expect(start).toHaveBeenCalledTimes(1)
    expect(start.mock.calls[0][0]).toEqual({ view: 'text', layout: 'qpc', pages: [5] })
  })
})
