import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isSupported,
  setMetadata,
  setPlaybackState,
  setPositionState,
  setActionHandlers,
} from '@/core/audio/mediaSession'

/** A fake `navigator.mediaSession` — happy-dom doesn't implement this API at all. */
class FakeMediaSession {
  metadata: unknown = null
  playbackState = 'none'
  positionState: unknown
  handlers = new Map<string, (details: unknown) => void>()
  setActionHandler = vi.fn((action: string, handler: ((details: unknown) => void) | null) => {
    if (handler) this.handlers.set(action, handler)
    else this.handlers.delete(action)
  })
  setPositionState = vi.fn((state?: unknown) => {
    this.positionState = state
  })
}

class FakeMediaMetadata {
  title: string
  artist?: string
  artwork?: unknown
  constructor(init: { title: string; artist?: string; artwork?: unknown }) {
    this.title = init.title
    this.artist = init.artist
    this.artwork = init.artwork
  }
}

describe('core/audio/mediaSession — no navigator.mediaSession at all (default test env)', () => {
  it('isSupported is false and every setter is a safe no-op', () => {
    expect(isSupported()).toBe(false)
    expect(() => setMetadata({ title: 'x' })).not.toThrow()
    expect(() => setPlaybackState('playing')).not.toThrow()
    expect(() =>
      setActionHandlers({
        play: () => {},
        pause: () => {},
        previoustrack: () => {},
        nexttrack: () => {},
        seekto: () => {},
      }),
    ).not.toThrow()
  })
})

describe('core/audio/mediaSession — with navigator.mediaSession stubbed', () => {
  let fake: FakeMediaSession

  beforeEach(() => {
    fake = new FakeMediaSession()
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    Object.defineProperty(navigator, 'mediaSession', {
      value: fake,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    // @ts-expect-error test cleanup of a property defined only for this describe block
    delete navigator.mediaSession
  })

  it('isSupported is true', () => {
    expect(isSupported()).toBe(true)
  })

  it('setMetadata builds a MediaMetadata with title/artist/artwork', () => {
    setMetadata({ title: 'Ayah 2:255', artist: 'Sheikh Shuraim', artwork: [{ src: '/x.png', sizes: '192x192', type: 'image/png' }] })
    const meta = fake.metadata as FakeMediaMetadata
    expect(meta.title).toBe('Ayah 2:255')
    expect(meta.artist).toBe('Sheikh Shuraim')
    expect(meta.artwork).toEqual([{ src: '/x.png', sizes: '192x192', type: 'image/png' }])
  })

  it('setPlaybackState mirrors the given state directly', () => {
    setPlaybackState('playing')
    expect(fake.playbackState).toBe('playing')
    setPlaybackState('paused')
    expect(fake.playbackState).toBe('paused')
    setPlaybackState('none')
    expect(fake.playbackState).toBe('none')
  })

  it('setPositionState forwards duration/position/playbackRate', () => {
    setPositionState({ duration: 30, position: 12, playbackRate: 1.5 })
    expect(fake.positionState).toEqual({ duration: 30, position: 12, playbackRate: 1.5 })
  })

  it('setPositionState(null) clears it (passes undefined through)', () => {
    setPositionState({ duration: 30, position: 12, playbackRate: 1 })
    setPositionState(null)
    expect(fake.positionState).toBeUndefined()
  })

  it('setPositionState swallows an out-of-range value rather than throwing', () => {
    fake.setPositionState.mockImplementation(() => {
      throw new TypeError('position must be less than or equal to duration')
    })
    expect(() => setPositionState({ duration: 5, position: 12, playbackRate: 1 })).not.toThrow()
  })

  it('setPositionState no-ops when the platform lacks setPositionState', () => {
    // e.g. iOS Safari, which supports mediaSession but not this method.
    // @ts-expect-error deliberately simulating a platform without this method
    delete fake.setPositionState
    expect(() => setPositionState({ duration: 30, position: 0, playbackRate: 1 })).not.toThrow()
  })

  it('setActionHandlers registers play/pause/previoustrack/nexttrack, delegating to the given callbacks', () => {
    const play = vi.fn()
    const pause = vi.fn()
    const previoustrack = vi.fn()
    const nexttrack = vi.fn()
    const seekto = vi.fn()
    setActionHandlers({ play, pause, previoustrack, nexttrack, seekto })

    fake.handlers.get('play')?.(undefined)
    fake.handlers.get('pause')?.(undefined)
    fake.handlers.get('previoustrack')?.(undefined)
    fake.handlers.get('nexttrack')?.(undefined)
    expect(play).toHaveBeenCalledOnce()
    expect(pause).toHaveBeenCalledOnce()
    expect(previoustrack).toHaveBeenCalledOnce()
    expect(nexttrack).toHaveBeenCalledOnce()
  })

  it('setActionHandlers maps seekto details.seekTime to the callback', () => {
    const seekto = vi.fn()
    setActionHandlers({ play: () => {}, pause: () => {}, previoustrack: () => {}, nexttrack: () => {}, seekto })
    fake.handlers.get('seekto')?.({ seekTime: 42.5 })
    expect(seekto).toHaveBeenCalledWith(42.5)
  })

  it('setActionHandlers ignores a seekto call with no seekTime', () => {
    const seekto = vi.fn()
    setActionHandlers({ play: () => {}, pause: () => {}, previoustrack: () => {}, nexttrack: () => {}, seekto })
    fake.handlers.get('seekto')?.({})
    expect(seekto).not.toHaveBeenCalled()
  })

  it('one action throwing on registration does not stop the others from registering', () => {
    fake.setActionHandler.mockImplementation((action: string) => {
      if (action === 'seekto') throw new TypeError('unsupported action')
    })
    expect(() =>
      setActionHandlers({
        play: () => {},
        pause: () => {},
        previoustrack: () => {},
        nexttrack: () => {},
        seekto: () => {},
      }),
    ).not.toThrow()
    expect(fake.setActionHandler).toHaveBeenCalledWith('play', expect.any(Function))
    expect(fake.setActionHandler).toHaveBeenCalledWith('nexttrack', expect.any(Function))
  })
})
