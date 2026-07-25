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
  load = vi.fn()
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

  it('switching the playlist swaps the source and calls load() (webview switch bug)', () => {
    // Regression: setting .src alone left webviews playing the old buffered clip, so
    // a grain/reciter switch appeared to do nothing. The engine must pause + load().
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([item('alafasy-page17.mp3')])
    const a = el()
    a.load.mockClear()
    engine.setPlaylistAndPlay([item('shuraim-2-255.mp3', 'fallback.mp3', { surah: 2, ayah: 255, page: 42 })])
    expect(a.src).toBe('shuraim-2-255.mp3')
    expect(a.load).toHaveBeenCalled()
    expect(a.pause).toHaveBeenCalled() // old clip stopped before the new one loads
  })

  it('an empty rebuild stops whatever was playing', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3')])
    engine.setPlaylistAndPlay([]) // e.g. scope yielded no verses
    expect(store.isPlaying).toBe(false)
    expect(el().pause).toHaveBeenCalled()
  })

  it('advances through the playlist on `ended` when autoplay-next is on', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3'), item('b.mp3')])
    el().fire('ended')
    expect(store.index).toBe(1)
    expect(el().src).toBe('b.mp3')
    el().fire('ended') // last item, no loop → exhausted (pauses; see the dedicated tests below)
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

  it('markA/markB read the element directly, not the throttled store.currentTime', () => {
    // Regression: timeupdate (and so store.currentTime) only updates on the
    // browser's own cadence (commonly ~250ms) — a marker set right after a seek
    // could otherwise land on a stale value, contributing to "hard to set AB
    // repeat precisely."
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3')])
    el().fireMeta(30)
    el().fireTime(5) // store.currentTime is now 5...
    el().currentTime = 7 // ...but the element has since moved on, no timeupdate yet
    engine.markA()
    expect(store.ab.a).toBe(7)
  })

  it('only-A, no explicit Loop tap: reaching the end advances normally, does not force a loop', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3'), item('b.mp3')])
    el().fireMeta(20)
    el().fireTime(4)
    engine.markA() // A = 4, no B yet, loop still off
    el().fire('ended')
    expect(store.ab).toEqual({ a: 4, b: null, loop: false })
    expect(store.index).toBe(1) // advanced normally (autoplay-next is on by default)
  })

  it('tapping Loop with only A set loops from A to the end immediately (no need to wait for it to end once)', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3')])
    el().fireMeta(20)
    el().fireTime(4)
    engine.markA() // A = 4
    engine.toggleAbLoop()
    expect(store.ab).toEqual({ a: 4, b: 20, loop: true })
    el().fireTime(20) // cross the end
    expect(el().currentTime).toBe(4) // looped back to A without ever needing `ended`
  })

  it('tapping Loop with no markers loops the whole item', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3')])
    el().fireMeta(15)
    engine.toggleAbLoop()
    expect(store.ab).toEqual({ a: 0, b: 15, loop: true })
  })

  it('placing B alone loops from the beginning immediately', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3')])
    el().fireMeta(20)
    el().fireTime(6)
    engine.markB()
    expect(store.ab).toEqual({ a: 0, b: 6, loop: true })
  })

  it('playback rate is reasserted on loadedmetadata/durationchange, surviving a WebView reset on load()', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    store.speed = 0.75
    engine.setPlaylistAndPlay([item('a.mp3')])
    expect(el().playbackRate).toBe(0.75)
    // Simulate a WebView silently resetting playbackRate as part of the load
    // algorithm — the bug: the UI still shows 0.75 (store.speed unchanged) while
    // the element itself would play at 1x without this reassertion.
    el().playbackRate = 1
    el().fireMeta(30)
    expect(el().playbackRate).toBe(0.75)
  })

  it('playback rate is also reasserted right as playback starts/resumes (in case a WebView resets it there instead of at load())', () => {
    // Exactly *when* a WebView resets playbackRate isn't something we can observe
    // from here, so both plausible moments (load() and actual playback-start) are
    // covered independently. This one isolates the "resumed after a manual pause,
    // well after loadedmetadata already fired" case — onMeta alone can't catch a
    // reset that happens later, at resume.
    const engine = useAudioEngine()
    const store = useAudioStore()
    store.speed = 0.75
    engine.setPlaylistAndPlay([item('a.mp3')])
    el().fireMeta(20)
    engine.pause()
    el().playbackRate = 1 // webview quirk, on resume rather than load
    engine.play()
    expect(el().playbackRate).toBe(0.75)
  })

  it('advancing to a new track reasserts the current speed even if a prior reset happened', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    store.speed = 1.25
    engine.setPlaylistAndPlay([item('a.mp3'), item('b.mp3')])
    el().playbackRate = 1 // webview quirk
    el().fireMeta(10)
    expect(el().playbackRate).toBe(1.25)
    el().fire('ended')
    expect(el().src).toBe('b.mp3')
    el().playbackRate = 1 // webview quirk again, on the new track
    el().fireMeta(12)
    expect(el().playbackRate).toBe(1.25)
  })

  it('calls the exhausted callback when autoplay-next runs off the end of the list with no loop', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    const onExhausted = vi.fn()
    engine.setOnExhausted(onExhausted)
    engine.setPlaylistAndPlay([item('a.mp3')])
    el().fire('ended') // single-item list, autoplay-next on, loop off
    expect(onExhausted).toHaveBeenCalledOnce()
    expect(store.isPlaying).toBe(false)
  })

  it('does not call the exhausted callback when loop-playlist is on (wraps instead)', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    const onExhausted = vi.fn()
    engine.setOnExhausted(onExhausted)
    store.loopPlaylist = true
    engine.setPlaylistAndPlay([item('a.mp3')])
    el().fire('ended')
    expect(onExhausted).not.toHaveBeenCalled()
    expect(store.index).toBe(0) // wrapped back to itself
  })

  it('does not call the exhausted callback when autoplay-next is off (plain stop)', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    const onExhausted = vi.fn()
    engine.setOnExhausted(onExhausted)
    store.autoNext = false
    engine.setPlaylistAndPlay([item('a.mp3')])
    el().fire('ended')
    expect(onExhausted).not.toHaveBeenCalled()
  })

  it('exposes the active verse for the reader highlight (verse grain)', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3', 'a.mp3', { surah: 2, ayah: 255, page: 42 })])
    expect(store.activeVerse).toEqual({ surah: 2, ayah: 255, page: 42 })
  })
})
