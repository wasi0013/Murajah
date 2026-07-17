import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAudioEngine, __resetAudioEngine } from '@/composables/useAudioEngine'
import { useAudioStore } from '@/stores/audio'
import type { PlaylistItem } from '@/core/audio/playlist'

/** A fake <audio> the engine drives; records src changes and lets tests fire events. */
class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = []
  src = ''
  currentTime = 0
  duration = NaN
  playbackRate = 1
  preload = ''
  paused = true
  play = vi.fn(async () => {
    this.paused = false
    this.dispatchEvent(new Event('playing'))
  })
  pause = vi.fn(() => {
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  })
  constructor() {
    super()
    FakeAudio.instances.push(this)
  }
  fire(type: string) {
    this.dispatchEvent(new Event(type))
  }
  fireMeta(d: number) {
    this.duration = d
    this.fire('durationchange')
  }
  fireTime(t: number) {
    this.currentTime = t
    this.fire('timeupdate')
  }
}

function item(primary: string, fallback = primary, verse?: PlaylistItem['verse']): PlaylistItem {
  return { kind: verse ? 'verse' : 'page-part', urls: { primary, fallback }, label: primary, verse }
}

const el = () => FakeAudio.instances.at(-1)!

beforeEach(() => {
  setActivePinia(createPinia())
  FakeAudio.instances = []
  vi.stubGlobal('Audio', FakeAudio)
})

afterEach(() => {
  __resetAudioEngine()
  vi.unstubAllGlobals()
})

describe('useAudioEngine wiring', () => {
  it('loads the first item and plays it', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3'), item('b.mp3')])
    expect(store.index).toBe(0)
    expect(el().src).toBe('a.mp3')
    expect(el().play).toHaveBeenCalled()
  })

  it('advances through the playlist on `ended` when autoplay-next is on', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3'), item('b.mp3')])
    el().fire('ended')
    expect(store.index).toBe(1)
    expect(el().src).toBe('b.mp3')
    el().fire('ended') // last item, no loop → stop
    expect(store.isPlaying).toBe(false)
  })

  it('stops at the end of an item when autoplay-next is off', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    store.autoNext = false
    engine.setPlaylistAndPlay([item('a.mp3'), item('b.mp3')])
    el().fire('ended')
    expect(store.index).toBe(0)
    expect(store.isPlaying).toBe(false)
  })

  it('swaps to the fallback exactly once on error, then skips the item', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3', 'a-fallback.mp3'), item('b.mp3')])
    el().fire('error')
    expect(el().src).toBe('a-fallback.mp3') // swapped to fallback
    expect(store.index).toBe(0) // still on the same item
    el().fire('error')
    expect(store.index).toBe(1) // both failed → skipped forward
    expect(el().src).toBe('b.mp3')
  })

  it('skips immediately when fallback equals primary (page mode has no alternate)', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3'), item('b.mp3')]) // fallback === primary
    el().fire('error')
    expect(store.index).toBe(1)
  })

  it('AB-loop seeks back to A when playback crosses B', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3')])
    el().fireMeta(30)
    el().fireTime(5)
    engine.markA() // A = 5
    el().fireTime(10)
    engine.markB() // B = 10, loop auto-on
    el().fireTime(10.2) // cross B
    expect(el().currentTime).toBe(5) // looped back to A
  })

  it('only-A + ended auto-places B at the end, enables loop, seeks to A', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3'), item('b.mp3')])
    el().fireMeta(20)
    el().fireTime(4)
    engine.markA() // A = 4, no B yet
    el().fire('ended')
    expect(store.ab).toEqual({ a: 4, b: 20, loop: true })
    expect(el().currentTime).toBe(4)
    expect(store.index).toBe(0) // did NOT advance — it's looping the item now
  })

  it('exposes the active verse for the reader highlight (verse grain)', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3', 'a.mp3', { surah: 2, ayah: 255, page: 42 })])
    expect(store.activeVerse).toEqual({ surah: 2, ayah: 255, page: 42 })
  })
})
