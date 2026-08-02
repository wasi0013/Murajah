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

  describe('play() rejection recovery (BUG regression: used to leave `loading` stuck true forever)', () => {
    function reject(a: FakeAudio, name = 'NotAllowedError') {
      a.play.mockImplementation(async () => {
        throw new DOMException(name, name)
      })
    }

    it('a rejected play() on the initial load leaves a clean, non-stuck state', async () => {
      // `Audio` is stubbed to FakeAudio; the engine constructs its element lazily
      // on first `ensureEl()`, called from inside `setPlaylistAndPlay` — so make
      // every FakeAudio instance reject by default for this one test via the
      // constructor-level `play` field override instead of reaching for `el()`
      // before the engine has created anything.
      const engine = useAudioEngine()
      const store = useAudioStore()
      const RejectingAudio = class extends FakeAudio {
        constructor() {
          super()
          this.play = vi.fn(async () => {
            throw new DOMException('NotAllowedError', 'NotAllowedError')
          })
        }
      }
      vi.stubGlobal('Audio', RejectingAudio)
      engine.setPlaylistAndPlay([item('a.mp3')])
      await Promise.resolve()
      await Promise.resolve()
      expect(store.loading).toBe(false)
      expect(store.isPlaying).toBe(false)
      expect(store.lastPlayError).toBe('NotAllowedError')
    })

    it('a rejected play() on autoplay-advance (loadCurrent) does not leave `loading` stuck', async () => {
      const engine = useAudioEngine()
      const store = useAudioStore()
      engine.setPlaylistAndPlay([item('a.mp3'), item('b.mp3')])
      reject(el())
      el().fire('ended') // advances to item 1, loadCurrent(true) -> attemptPlay -> rejects
      await Promise.resolve()
      await Promise.resolve()
      expect(store.index).toBe(1)
      expect(store.loading).toBe(false) // not stuck spinning
      expect(store.isPlaying).toBe(false)
      expect(store.lastPlayError).toBe('NotAllowedError')
    })

    it('a rejected play() on the AB seek-to-A resume does not leave the engine stuck', async () => {
      const engine = useAudioEngine()
      const store = useAudioStore()
      engine.setPlaylistAndPlay([item('a.mp3')])
      el().fireMeta(10)
      el().fireTime(2)
      engine.markA()
      el().fireTime(8)
      engine.markB() // region [2,8], loop on
      reject(el())
      el().fire('ended') // seeks to A, attemptPlay -> rejects
      await Promise.resolve()
      await Promise.resolve()
      expect(store.isPlaying).toBe(false)
      expect(store.lastPlayError).toBe('NotAllowedError')
    })

    it('a rejected play() on the fallback-URL retry does not leave the engine stuck', async () => {
      const engine = useAudioEngine()
      const store = useAudioStore()
      engine.setPlaylistAndPlay([item('a.mp3', 'a-fallback.mp3'), item('b.mp3')])
      reject(el())
      el().fire('error') // swaps to fallback, attemptPlay -> rejects
      await Promise.resolve()
      await Promise.resolve()
      expect(el().src).toBe('a-fallback.mp3')
      expect(store.index).toBe(0)
      expect(store.isPlaying).toBe(false)
      expect(store.lastPlayError).toBe('NotAllowedError')
    })

    it('a rejected play() on a manual resume (toggle/play) does not leave the engine stuck', async () => {
      const engine = useAudioEngine()
      const store = useAudioStore()
      engine.setPlaylistAndPlay([item('a.mp3')])
      engine.pause()
      reject(el())
      engine.play()
      await Promise.resolve()
      await Promise.resolve()
      expect(store.isPlaying).toBe(false)
      expect(store.lastPlayError).toBe('NotAllowedError')
    })

    it('a successful play() after a prior rejection clears the recorded error', async () => {
      const engine = useAudioEngine()
      const store = useAudioStore()
      engine.setPlaylistAndPlay([item('a.mp3')])
      engine.pause()
      reject(el())
      engine.play()
      await Promise.resolve()
      await Promise.resolve()
      expect(store.lastPlayError).toBe('NotAllowedError')

      el().play.mockImplementation(async () => {
        el().paused = false
        el().dispatchEvent(new Event('playing'))
      })
      engine.play()
      await Promise.resolve()
      expect(store.lastPlayError).toBeNull()
      expect(store.isPlaying).toBe(true)
    })
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
    // Advancing to a new item clears the bookmark (it was scoped to item 0) rather
    // than forcing a loop on it — see the dedicated leak-regression tests below.
    expect(store.ab).toEqual({ a: null, b: null, loop: false })
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

  it('BUG regression: an AB loop set on one item does not survive a manual next()', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3'), item('b.mp3')])
    el().fireMeta(30)
    el().fireTime(5)
    engine.markA()
    el().fireTime(10)
    engine.markB() // region [5,10], loop on, on item 0
    engine.next()
    expect(store.ab).toEqual({ a: null, b: null, loop: false }) // cleared, not carried over
  })

  it('BUG regression: an AB loop set on one item does not survive a manual prev()', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3'), item('b.mp3')])
    engine.next()
    el().fireMeta(30)
    el().fireTime(5)
    engine.markA()
    el().fireTime(10)
    engine.markB() // region [5,10], loop on, on item 1
    engine.prev()
    expect(store.ab).toEqual({ a: null, b: null, loop: false })
  })

  it('BUG regression: a stale AB region no longer traps playback on a shorter next track', () => {
    // Previously: markers leaked across next(), so a track shorter than the old
    // region's end never crossed it via timeupdate, hit its own natural `ended`,
    // and abOnEnded kept seeking back into the stale region forever.
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('long.mp3'), item('short.mp3')])
    el().fireMeta(30)
    el().fireTime(5)
    engine.markA()
    el().fireTime(10)
    engine.markB() // region [5,10] on item 0

    engine.next() // -> item 1, ab is now cleared (see the test above)
    el().fireMeta(6) // item 1 is only 6s long
    el().fire('ended') // plays through to its own natural end

    expect(store.index).toBe(1) // stayed exhausted at the last item, not stuck mid-loop
    expect(store.isPlaying).toBe(false)
    expect(el().currentTime).not.toBe(5) // never got seeked back into the old region
  })

  it('an AB loop set on the current item still survives its own natural region-wrap (not cleared by ended)', () => {
    // Contrast with the regression above: looping the SAME item via `ended` never
    // goes through `applyAdvance` at all (see `abOnEnded`'s early return in
    // `onEnded`), so this must keep looping, not get cleared.
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3')])
    el().fireMeta(10)
    el().fireTime(2)
    engine.markA()
    el().fireTime(8)
    engine.markB() // region [2,8], loop on
    el().fire('ended') // reaches the end before timeupdate caught the crossing
    expect(store.ab).toEqual({ a: 2, b: 8, loop: true }) // still armed
    expect(el().currentTime).toBe(2) // wrapped to region start, same item
    expect(store.index).toBe(0)
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

/** A fake `navigator.mediaSession` — mirrors the one in audio-mediasession.test.ts. */
class FakeMediaSession {
  metadata: { title: string; artist?: string } | null = null
  playbackState = 'none'
  positionState: { duration: number; position: number; playbackRate: number } | undefined = undefined
  handlers = new Map<string, (details: unknown) => void>()
  setActionHandler = vi.fn((action: string, handler: ((details: unknown) => void) | null) => {
    if (handler) this.handlers.set(action, handler)
    else this.handlers.delete(action)
  })
  setPositionState = vi.fn((state?: { duration: number; position: number; playbackRate: number }) => {
    this.positionState = state
  })
}

describe('useAudioEngine — Media Session integration', () => {
  let fakeSession: FakeMediaSession

  beforeEach(() => {
    fakeSession = new FakeMediaSession()
    vi.stubGlobal(
      'MediaMetadata',
      class {
        title: string
        artist?: string
        constructor(init: { title: string; artist?: string }) {
          this.title = init.title
          this.artist = init.artist
        }
      },
    )
    Object.defineProperty(navigator, 'mediaSession', { value: fakeSession, configurable: true })
  })

  afterEach(() => {
    // @ts-expect-error test cleanup of a property only defined for this block
    delete navigator.mediaSession
  })

  it('sets metadata (title + reciter as artist) whenever the current item loads', () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([item('a.mp3', 'a.mp3', { surah: 2, ayah: 255, page: 42 })])
    expect(fakeSession.metadata?.title).toBe('Ayah 2:255')
    expect(fakeSession.metadata?.artist).toBeTruthy() // the current verse reciter's name
  })

  it('metadata title falls back to the item label for page-grain items (no verse)', () => {
    const engine = useAudioEngine()
    const pageItem: PlaylistItem = { kind: 'page-part', urls: { primary: 'p.mp3', fallback: 'p.mp3' }, label: 'Page 42' }
    engine.setPlaylistAndPlay([pageItem])
    expect(fakeSession.metadata?.title).toBe('Page 42')
  })

  it('playbackState mirrors isPlaying: "playing" when playing, "paused" on pause', () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([item('a.mp3')])
    expect(fakeSession.playbackState).toBe('playing')
    engine.pause()
    expect(fakeSession.playbackState).toBe('paused')
  })

  it('playbackState becomes "none" on an explicit stop (close player)', () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([item('a.mp3')])
    engine.stop()
    expect(fakeSession.playbackState).toBe('none')
  })

  it('BUG regression: "none" from an explicit stop is not clobbered by pause firing afterward', () => {
    // A real HTMLMediaElement queues its 'pause' event as a task rather than
    // firing it synchronously the way this harness's default mock does — so a
    // stop must survive a 'pause' event arriving *after* it completes, not just
    // one that (as in most other tests here) happens to fire inline.
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([item('a.mp3')])
    engine.stop()
    expect(fakeSession.playbackState).toBe('none')
    el().fire('pause') // simulates the real, delayed queued-task pause event
    expect(fakeSession.playbackState).toBe('none') // must not be clobbered back to 'paused'
  })

  it('a stop is followed by a fresh play resuming normal pause/playing mirroring', () => {
    // The stop-suppression flag must not leak past the next real play attempt.
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3')])
    engine.stop()
    engine.play()
    expect(fakeSession.playbackState).toBe('playing')
    engine.pause()
    expect(fakeSession.playbackState).toBe('paused')
    expect(store.isPlaying).toBe(false)
  })

  it('publishes position state (duration/position/rate) once duration is known', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    store.speed = 1.5
    engine.setPlaylistAndPlay([item('a.mp3')])
    expect(fakeSession.positionState).toBeUndefined() // no duration yet
    el().fireMeta(30)
    expect(fakeSession.positionState).toEqual({ duration: 30, position: 0, playbackRate: 1.5 })
    el().fireTime(12)
    expect(fakeSession.positionState).toEqual({ duration: 30, position: 12, playbackRate: 1.5 })
  })

  it('clears position state on an explicit stop', () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([item('a.mp3')])
    el().fireMeta(30)
    engine.stop()
    expect(fakeSession.setPositionState).toHaveBeenLastCalledWith(undefined)
  })

  it('re-syncs position state when the speed changes, so the lock-screen clock stays honest', () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([item('a.mp3')])
    el().fireMeta(30)
    engine.setSpeed(2)
    expect(fakeSession.positionState?.playbackRate).toBe(2)
  })

  it('the nexttrack/previoustrack/play/pause action handlers delegate to the engine transport', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([item('a.mp3'), item('b.mp3')])

    fakeSession.handlers.get('nexttrack')?.(undefined)
    expect(store.index).toBe(1)

    fakeSession.handlers.get('previoustrack')?.(undefined)
    expect(store.index).toBe(0)

    fakeSession.handlers.get('pause')?.(undefined)
    expect(el().pause).toHaveBeenCalled()

    fakeSession.handlers.get('play')?.(undefined)
    expect(el().play).toHaveBeenCalled()
  })

  it('the seekto action handler seeks the element within [0, duration]', () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([item('a.mp3')])
    el().fireMeta(30)
    fakeSession.handlers.get('seekto')?.({ seekTime: 12.5 })
    expect(el().currentTime).toBe(12.5)
    fakeSession.handlers.get('seekto')?.({ seekTime: 999 }) // clamped to duration
    expect(el().currentTime).toBe(30)
  })

  it('action handlers are registered exactly once, not re-registered on every item load', () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([item('a.mp3'), item('b.mp3')])
    const callsAfterFirstLoad = fakeSession.setActionHandler.mock.calls.length
    engine.next()
    expect(fakeSession.setActionHandler.mock.calls.length).toBe(callsAfterFirstLoad)
  })
})
