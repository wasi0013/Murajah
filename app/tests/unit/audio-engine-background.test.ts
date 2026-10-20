import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  useAudioEngine,
  __resetAudioEngine,
  NETWORK_RETRY_DELAYS_MS,
  STALL_TIMEOUT_MS,
} from '@/composables/useAudioEngine'
import { useAudioStore } from '@/stores/audio'
import type { PlaylistItem } from '@/core/audio/playlist'

/*
 * Bug: "after playing 4-5 pages with the phone locked, playback just stops" — in
 * every mode (Listen surah, loop, reader autoplay-next). Root cause: each item
 * boundary needed a fresh network request that only started once the previous
 * item had ended, i.e. at the one moment the page was silent — when mobile OSes
 * (Android Doze / Chrome dropping its media service, iOS suspending a silent web
 * view) cut a backgrounded page's network or freeze it. On top of that the engine
 * told the OS "paused" at every boundary, one dropped connection skipped (or, in
 * page mode, ended) playback, and a stalled load was never noticed.
 *
 * These tests drive a fake <audio> that follows real browser event order — a
 * natural end sets `paused` + `ended` and fires `pause` *then* `ended`; `pause()`
 * on an already-paused element is a no-op — because the old fake (which fired
 * `ended` alone) let exactly this class of bug pass unnoticed.
 */

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = []
  src = ''
  currentTime = 0
  duration = NaN
  playbackRate = 1
  preload = ''
  paused = true
  ended = false
  error: { code: number } | null = null
  /** When false, `play()` resolves but never reaches `playing` (a stuck load). */
  reachesPlaying = true
  play = vi.fn(async () => {
    this.paused = false
    this.ended = false
    if (this.reachesPlaying) this.dispatchEvent(new Event('playing'))
  })
  pause = vi.fn(() => {
    if (this.paused) return
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  })
  load = vi.fn(() => {
    this.error = null
    this.ended = false
    this.currentTime = 0
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
    this.fire('loadedmetadata')
  }
  fireTime(t: number) {
    this.currentTime = t
    this.fire('timeupdate')
  }
  /** A natural end, in real-browser order. */
  finish() {
    this.paused = true
    this.ended = true
    this.fire('pause')
    this.fire('ended')
  }
  fail(code: number) {
    this.error = { code }
    this.fire('error')
  }
}

const MEDIA_ERR_NETWORK = 2
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4

function page(url: string): PlaylistItem {
  return { kind: 'page-part', urls: { primary: url, fallback: url }, label: url, page: { page: 1, part: 0 } }
}
function verse(primary: string, fallback: string): PlaylistItem {
  return { kind: 'verse', urls: { primary, fallback }, label: primary, verse: { surah: 1, ayah: 1, page: 1 } }
}

const el = () => FakeAudio.instances.at(-1)!

/** Controllable prefetch downloads, keyed by URL. */
interface PendingFetch {
  url: string
  aborted: boolean
  resolve: () => void
  fail: () => void
}
let fetches: PendingFetch[]
const fetchFor = (url: string) => fetches.filter((f) => f.url === url).at(-1)
let blobSeq = 0
let revoked: string[]

async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

beforeEach(() => {
  setActivePinia(createPinia())
  FakeAudio.instances = []
  fetches = []
  revoked = []
  blobSeq = 0
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: { signal: AbortSignal }) => {
      return new Promise((resolve, reject) => {
        const entry: PendingFetch = {
          url,
          aborted: false,
          resolve: () => resolve({ ok: true, status: 200, blob: async () => new Blob(['mp3-bytes']) }),
          fail: () => reject(new TypeError('Failed to fetch')),
        }
        init.signal.addEventListener('abort', () => {
          entry.aborted = true
          reject(new DOMException('Aborted', 'AbortError'))
        })
        fetches.push(entry)
      })
    }),
  )
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${++blobSeq}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u: string) => {
    revoked.push(u)
  })
})

afterEach(() => {
  __resetAudioEngine()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('track boundaries keep the session alive', () => {
  class FakeMediaSession {
    metadata: unknown = null
    history: string[] = []
    #state = 'none'
    get playbackState() {
      return this.#state
    }
    set playbackState(v: string) {
      this.#state = v
      this.history.push(v)
    }
    setActionHandler = vi.fn()
    setPositionState = vi.fn()
  }
  let session: FakeMediaSession

  beforeEach(() => {
    session = new FakeMediaSession()
    vi.stubGlobal('MediaMetadata', class {})
    Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true })
  })
  afterEach(() => {
    // @ts-expect-error test cleanup of a property only defined for this block
    delete navigator.mediaSession
  })

  it('a natural end is never reported to the OS as "paused" when the queue continues', () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3'), page('c.mp3')])
    session.history = []
    el().finish()
    el().finish()
    expect(session.history).not.toContain('paused')
    expect(session.playbackState).toBe('playing')
  })

  it('store.isPlaying stays true across an autoplay-advance boundary (no play/pause flicker)', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    const seen: boolean[] = []
    el().addEventListener('pause', () => seen.push(store.isPlaying))
    el().finish()
    expect(seen).toEqual([true])
    expect(store.isPlaying).toBe(true)
    expect(store.index).toBe(1)
  })

  it('the real end of the queue (autoplay-next off) does report "paused"', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    store.autoNext = false
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    el().finish()
    expect(session.playbackState).toBe('paused')
    expect(store.isPlaying).toBe(false)
  })

  it('an autoplay-advance does not call pause() on an element that already ended', () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    el().pause.mockClear()
    el().finish()
    expect(el().pause).not.toHaveBeenCalled()
  })

  it('a stale queued `pause` from a manual skip does not flip the session to paused', () => {
    // Real browsers queue the `pause` event; by the time it's dispatched the new
    // item's play() has already set `paused = false` again.
    class QueuedPauseAudio extends FakeAudio {
      queued: Event[] = []
      constructor() {
        super()
        this.pause = vi.fn(() => {
          if (this.paused) return
          this.paused = true
          this.queued.push(new Event('pause'))
        })
      }
      drain() {
        for (const e of this.queued.splice(0)) this.dispatchEvent(e)
      }
    }
    vi.stubGlobal('Audio', QueuedPauseAudio)
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    engine.next()
    ;(el() as QueuedPauseAudio).drain()
    expect(store.isPlaying).toBe(true)
    expect(session.playbackState).toBe('playing')
  })
})

describe('next-item prefetch (no network at a silent boundary)', () => {
  it('starts downloading the next item only once the current one is audibly playing', () => {
    class SlowStart extends FakeAudio {
      reachesPlaying = false
    }
    vi.stubGlobal('Audio', SlowStart)
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    expect(fetches).toHaveLength(0) // a.mp3 is still loading — don't compete with it
    el().fire('playing')
    expect(fetches.map((f) => f.url)).toEqual(['b.mp3'])
  })

  it('crosses the boundary on the in-memory copy, synchronously inside `ended`', async () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    fetchFor('b.mp3')!.resolve()
    await flush()
    el().play.mockClear()
    el().finish()
    expect(store.index).toBe(1)
    expect(el().src).toBe('blob:1')
    expect(el().play).toHaveBeenCalledTimes(1)
  })

  it('streams from the network when the prefetch has not finished yet', () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    el().finish() // b.mp3 download still in flight
    expect(el().src).toBe('b.mp3')
  })

  it('releases the previous item’s in-memory copy after moving past it', async () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3'), page('c.mp3')])
    fetchFor('b.mp3')!.resolve()
    await flush()
    el().finish() // → b (blob:1), prefetch c
    fetchFor('c.mp3')!.resolve()
    await flush()
    el().finish() // → c (blob:2)
    expect(el().src).toBe('blob:2')
    expect(revoked).toContain('blob:1')
    expect(revoked).not.toContain('blob:2')
  })

  it('repeat mode (the same verse queued N times) replays from memory', async () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    const v = verse('v.mp3', 'v-fb.mp3')
    engine.setPlaylistAndPlay([v, v, v])
    fetchFor('v.mp3')!.resolve()
    await flush()
    el().finish()
    expect(store.index).toBe(1)
    expect(el().src).toBe('blob:1')
  })

  it('loop-playlist: prefetches the first item while the last one plays', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    store.loopPlaylist = true
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    el().finish() // now on b, the last item
    expect(fetchFor('a.mp3')).toBeTruthy()
  })

  it('picks up a loop toggle made mid-item (next timeupdate)', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    store.autoNext = false
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    expect(fetches).toHaveLength(0) // autoplay-next off: nothing follows
    store.autoNext = true
    el().fireTime(1)
    expect(fetchFor('b.mp3')).toBeTruthy()
  })

  it('does not prefetch while an AB loop keeps repeating the current item', () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    fetchFor('b.mp3')!.fail()
    el().fireMeta(10)
    engine.toggleAbLoop() // whole-item loop
    fetches = []
    el().fire('playing')
    expect(fetches).toHaveLength(0)
  })

  it('a corrupt in-memory copy is dropped and the same item is streamed instead', async () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3'), page('c.mp3')])
    fetchFor('b.mp3')!.resolve()
    await flush()
    el().finish()
    expect(el().src).toBe('blob:1')
    el().fail(MEDIA_ERR_SRC_NOT_SUPPORTED)
    expect(store.index).toBe(1) // not skipped
    expect(el().src).toBe('b.mp3')
    expect(revoked).toContain('blob:1')
  })

  it('aborts an in-flight download when the queue is replaced, and releases everything on stop', async () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    const pending = fetchFor('b.mp3')!
    engine.setPlaylistAndPlay([page('x.mp3'), page('y.mp3')])
    expect(pending.aborted).toBe(true)
    fetchFor('y.mp3')!.resolve()
    await flush()
    engine.stop()
    expect(revoked).toContain('blob:1')
  })

  it('a download that finishes after being dropped does not leak an object URL', async () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    const late = fetchFor('b.mp3')!
    engine.stop()
    late.resolve() // already aborted → rejected; must not create a URL
    await flush()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})

describe('network resilience (retry in place, never burn through the queue)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('a mid-stream network error retries the same item and resumes at the same position', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    el().fireMeta(300)
    el().fireTime(120)
    el().load.mockClear()
    el().fail(MEDIA_ERR_NETWORK)
    expect(store.index).toBe(0) // not skipped
    vi.advanceTimersByTime(NETWORK_RETRY_DELAYS_MS[0])
    expect(el().load).toHaveBeenCalledTimes(1)
    expect(el().src).toBe('a.mp3')
    el().fireMeta(300)
    expect(el().currentTime).toBe(120)
    expect(store.currentTime).toBe(120)
  })

  it('page audio (no alternate host): retries with backoff, then parks on the item instead of skipping', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    // Fail before playback resumes each time, so the retry budget isn't refilled.
    el().reachesPlaying = false
    for (const delay of NETWORK_RETRY_DELAYS_MS) {
      el().fail(MEDIA_ERR_NETWORK)
      vi.advanceTimersByTime(delay)
    }
    el().fail(MEDIA_ERR_NETWORK)
    expect(store.index).toBe(0)
    expect(store.isPlaying).toBe(false)
    expect(store.loading).toBe(false)
    expect(store.lastPlayError).toBe('NetworkError')
  })

  it('verse audio: once retries are spent on the primary host, moves to the fallback host', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([verse('v.mp3', 'v-fb.mp3'), verse('w.mp3', 'w-fb.mp3')])
    el().reachesPlaying = false
    for (const delay of NETWORK_RETRY_DELAYS_MS) {
      el().fail(MEDIA_ERR_NETWORK)
      vi.advanceTimersByTime(delay)
    }
    el().fail(MEDIA_ERR_NETWORK)
    expect(store.index).toBe(0)
    expect(el().src).toBe('v-fb.mp3')
  })

  it('a successful resume refills the retry budget (a flaky connection never exhausts it)', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    for (let i = 0; i < NETWORK_RETRY_DELAYS_MS.length + 3; i++) {
      el().fail(MEDIA_ERR_NETWORK)
      vi.advanceTimersByTime(NETWORK_RETRY_DELAYS_MS[0]) // retry → `playing` again
    }
    expect(store.index).toBe(0)
    expect(store.isPlaying).toBe(true)
    expect(store.lastPlayError).toBeNull()
  })

  it('offline: waits for the `online` event without spending retries or skipping', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    el().fireMeta(300)
    el().fireTime(50)
    el().load.mockClear()
    el().fail(MEDIA_ERR_SRC_NOT_SUPPORTED) // Chrome reports some offline failures as code 4
    vi.advanceTimersByTime(60_000)
    expect(el().load).not.toHaveBeenCalled()
    expect(store.index).toBe(0)
    expect(store.isPlaying).toBe(false)
    onLine.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    expect(el().load).toHaveBeenCalledTimes(1)
    expect(el().src).toBe('a.mp3')
    expect(store.isPlaying).toBe(true)
    el().fireMeta(300)
    expect(el().currentTime).toBe(50)
  })

  it('a parked item resumes from where it stopped when the user taps play', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([page('a.mp3')])
    el().fireMeta(300)
    el().fireTime(200)
    el().reachesPlaying = false
    for (const delay of NETWORK_RETRY_DELAYS_MS) {
      el().fail(MEDIA_ERR_NETWORK)
      vi.advanceTimersByTime(delay)
    }
    el().fail(MEDIA_ERR_NETWORK) // parked
    el().reachesPlaying = true
    el().load.mockClear()
    engine.toggle()
    expect(el().load).toHaveBeenCalledTimes(1)
    el().fireMeta(300)
    expect(el().currentTime).toBe(200)
    expect(store.isPlaying).toBe(true)
  })

  it('a pause during the retry backoff cancels the retry', () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([page('a.mp3')])
    el().fail(MEDIA_ERR_NETWORK)
    engine.pause()
    el().load.mockClear()
    vi.advanceTimersByTime(60_000)
    expect(el().load).not.toHaveBeenCalled()
  })

  it('a bad file (not a network error) still falls back, then skips, as before', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([verse('v.mp3', 'v-fb.mp3'), verse('w.mp3', 'w-fb.mp3')])
    el().fail(MEDIA_ERR_SRC_NOT_SUPPORTED)
    expect(el().src).toBe('v-fb.mp3')
    el().fail(MEDIA_ERR_SRC_NOT_SUPPORTED)
    expect(store.index).toBe(1)
  })
})

describe('stall watchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('a load that gets no data and never plays is reloaded at the same position', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    el().fireMeta(300)
    el().fireTime(90)
    el().reachesPlaying = false
    el().fire('waiting') // buffer ran dry mid-item
    el().load.mockClear()
    vi.advanceTimersByTime(STALL_TIMEOUT_MS)
    vi.advanceTimersByTime(NETWORK_RETRY_DELAYS_MS[0])
    expect(el().load).toHaveBeenCalledTimes(1)
    expect(store.index).toBe(0)
    el().fireMeta(300)
    expect(el().currentTime).toBe(90)
  })

  it('a slow but progressing download is not treated as a stall', () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([page('a.mp3')])
    el().reachesPlaying = false
    el().fire('waiting')
    el().load.mockClear()
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(STALL_TIMEOUT_MS - 1000)
      el().fire('progress')
    }
    expect(el().load).not.toHaveBeenCalled()
  })

  it('a stall is caught on return to the foreground even if the background timer never ran', () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([page('a.mp3')])
    el().reachesPlaying = false
    el().fire('waiting')
    el().load.mockClear()
    // Frozen in the background: wall-clock time passes, timers don't fire.
    vi.setSystemTime(Date.now() + STALL_TIMEOUT_MS + 5000)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(NETWORK_RETRY_DELAYS_MS[0])
    expect(el().load).toHaveBeenCalled()
  })

  it('a paused player is never treated as stalled', () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([page('a.mp3')])
    el().fire('waiting')
    engine.pause()
    el().load.mockClear()
    vi.advanceTimersByTime(STALL_TIMEOUT_MS * 4)
    expect(el().load).not.toHaveBeenCalled()
  })
})

describe('foreground recovery', () => {
  it('a play() refused while screen-locked is retried when the page becomes visible again', async () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    el().play.mockImplementationOnce(async () => {
      throw new DOMException('NotAllowedError', 'NotAllowedError')
    })
    el().finish() // advance in the background → play() refused
    await flush()
    expect(store.isPlaying).toBe(false)
    expect(store.index).toBe(1)
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(store.isPlaying).toBe(true)
    expect(store.index).toBe(1)
  })

  it('a deliberate pause is never auto-resumed on return', () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([page('a.mp3')])
    engine.pause()
    el().play.mockClear()
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))
    expect(el().play).not.toHaveBeenCalled()
  })

  it('a pause from outside the app (OS interruption, headset unplug) is respected too', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([page('a.mp3')])
    el().pause() // the OS pausing the element directly
    el().play.mockClear()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(el().play).not.toHaveBeenCalled()
    expect(store.isPlaying).toBe(false)
  })

  it('an explicit stop is never auto-resumed', () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([page('a.mp3')])
    engine.stop()
    el().play.mockClear()
    window.dispatchEvent(new Event('pageshow'))
    expect(el().play).not.toHaveBeenCalled()
  })

  it('a superseded play() rejection (AbortError from a newer load) does not mark the player stopped', async () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    let rejectFirst!: (e: unknown) => void
    el().play.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectFirst = reject
        }),
    )
    engine.next() // play() for b pending…
    engine.prev() // …superseded by a's load
    rejectFirst(new DOMException('interrupted by a new load request', 'AbortError'))
    await flush()
    expect(store.isPlaying).toBe(true)
    expect(store.lastPlayError).toBeNull()
  })
})

describe('appendToPlaylist / trimPlaylist (reader lookahead)', () => {
  it('appended items play as an ordinary in-list advance, prefetched across the join', async () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([page('p5.mp3')])
    expect(fetches).toHaveLength(0) // nothing follows yet
    engine.appendToPlaylist([page('p6.mp3')])
    expect(store.index).toBe(0)
    expect(fetchFor('p6.mp3')).toBeTruthy()
    fetchFor('p6.mp3')!.resolve()
    await flush()
    el().finish()
    expect(store.index).toBe(1)
    expect(el().src).toBe('blob:1')
    expect(store.isPlaying).toBe(true)
  })

  it('trim drops the appended items and their download', () => {
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([page('p5.mp3')])
    engine.appendToPlaylist([page('p6.mp3')])
    engine.trimPlaylist(1)
    expect(store.playlist).toHaveLength(1)
    expect(fetchFor('p6.mp3')!.aborted).toBe(true)
  })
})

describe('review regressions', () => {
  it('the failed load’s own play() rejection does not undo a scheduled network retry', async () => {
    vi.useFakeTimers()
    const engine = useAudioEngine()
    const store = useAudioStore()
    let rejectPending!: (e: unknown) => void
    class PendingPlay extends FakeAudio {
      constructor() {
        super()
        this.play = vi.fn(
          () =>
            new Promise<void>((_, reject) => {
              this.paused = false
              rejectPending = reject
            }),
        )
      }
    }
    vi.stubGlobal('Audio', PendingPlay)
    engine.setPlaylistAndPlay([page('a.mp3')])
    el().fail(MEDIA_ERR_NETWORK) // retry scheduled, loading
    rejectPending(new DOMException('no supported source', 'NotSupportedError'))
    await flush()
    expect(store.loading).toBe(true)
    expect(store.lastPlayError).toBeNull()
  })

  it('a parked item gets a fresh retry budget when the network returns (one blip can’t end it)', () => {
    vi.useFakeTimers()
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([page('a.mp3')])
    el().reachesPlaying = false
    for (const delay of NETWORK_RETRY_DELAYS_MS) {
      el().fail(MEDIA_ERR_NETWORK)
      vi.advanceTimersByTime(delay)
    }
    el().fail(MEDIA_ERR_NETWORK) // parked
    window.dispatchEvent(new Event('online')) // reload…
    el().load.mockClear()
    el().fail(MEDIA_ERR_NETWORK) // …which fails once more (radio still waking up)
    expect(store.lastPlayError).toBeNull() // not parked again: backing off
    vi.advanceTimersByTime(NETWORK_RETRY_DELAYS_MS[0])
    expect(el().load).toHaveBeenCalledTimes(1)
  })

  it('resumes the position on an unbounded (Infinity-duration) reload, and never freezes the clock', () => {
    vi.useFakeTimers()
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([page('a.mp3')])
    el().fireMeta(300)
    el().fireTime(80)
    el().fail(MEDIA_ERR_NETWORK)
    vi.advanceTimersByTime(NETWORK_RETRY_DELAYS_MS[0])
    el().fireMeta(Infinity)
    expect(el().currentTime).toBe(80)
    el().fireTime(81)
    expect(store.currentTime).toBe(81)
  })

  it('a reload with no usable metadata still resumes on `playing` (backstop)', () => {
    vi.useFakeTimers()
    const engine = useAudioEngine()
    const store = useAudioStore()
    engine.setPlaylistAndPlay([page('a.mp3')])
    el().fireMeta(300)
    el().fireTime(40)
    el().reachesPlaying = false
    el().fail(MEDIA_ERR_NETWORK)
    vi.advanceTimersByTime(NETWORK_RETRY_DELAYS_MS[0])
    el().fire('playing')
    expect(el().currentTime).toBe(40)
    el().fireTime(41)
    expect(store.currentTime).toBe(41)
  })

  it('streaming an item whose prefetch is still in flight aborts the duplicate download', () => {
    const engine = useAudioEngine()
    engine.setPlaylistAndPlay([page('a.mp3'), page('b.mp3')])
    const dup = fetchFor('b.mp3')!
    el().finish() // b not downloaded yet → streamed
    expect(el().src).toBe('b.mp3')
    expect(dup.aborted).toBe(true)
  })

  it('the fallback source keeps the chosen speed', () => {
    const engine = useAudioEngine()
    engine.setSpeed(1.5)
    engine.setPlaylistAndPlay([verse('v.mp3', 'v-fb.mp3')])
    el().playbackRate = 1 // a WebView reset
    el().fail(MEDIA_ERR_SRC_NOT_SUPPORTED)
    expect(el().src).toBe('v-fb.mp3')
    expect(el().playbackRate).toBe(1.5)
  })
})

