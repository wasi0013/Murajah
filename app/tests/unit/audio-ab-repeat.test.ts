import { describe, it, expect } from 'vitest'
import {
  AB_NONE,
  setA,
  setB,
  toggleLoop,
  clearAb,
  abRegion,
  abSeekTarget,
  abOnEnded,
} from '@/core/audio/abRepeat'

describe('AB-repeat reducer (decision 7, simplified interaction model)', () => {
  it('(a) set A then B starts looping immediately', () => {
    const s = setB(setA(AB_NONE, 5), 10)
    expect(s).toEqual({ a: 5, b: 10, loop: true })
  })

  it('setting A alone does not start a loop', () => {
    expect(setA(AB_NONE, 5)).toEqual({ a: 5, b: null, loop: false })
  })

  it('(b) setting B alone loops from the beginning (0) to B immediately', () => {
    expect(setB(AB_NONE, 8)).toEqual({ a: 0, b: 8, loop: true })
  })

  it('markers can be set in either order; the region is [min, max]', () => {
    const s = setA(setB(AB_NONE, 3), 8) // B first at 3, then A at 8
    expect(s.loop).toBe(true)
    expect(abRegion(s)).toEqual({ start: 3, end: 8 })
  })

  it('(d) tapping Loop with no markers loops the whole item', () => {
    expect(toggleLoop(AB_NONE, 42)).toEqual({ a: 0, b: 42, loop: true })
  })

  it('(c) tapping Loop with only A set loops from A to the end', () => {
    expect(toggleLoop(setA(AB_NONE, 12), 42)).toEqual({ a: 12, b: 42, loop: true })
  })

  it('toggleLoop is a no-op if duration is not known yet', () => {
    const s = setA(AB_NONE, 12)
    expect(toggleLoop(s, 0)).toEqual(s)
    expect(toggleLoop(s, NaN)).toEqual(s)
  })

  it('(e) toggling the loop off preserves the markers, and back on', () => {
    const looping = setB(setA(AB_NONE, 5), 10)
    const paused = toggleLoop(looping, 100)
    expect(paused).toEqual({ a: 5, b: 10, loop: false })
    expect(toggleLoop(paused, 100).loop).toBe(true)
  })

  it('(f) clear removes markers and stops the loop', () => {
    expect(clearAb()).toEqual({ a: null, b: null, loop: false })
  })

  it('re-arming A while looping keeps the loop and moves the marker', () => {
    const s = setA(setB(setA(AB_NONE, 5), 10), 7)
    expect(s).toEqual({ a: 7, b: 10, loop: true })
  })
})

describe('abSeekTarget (timeupdate loop-back)', () => {
  const looping = setB(setA(AB_NONE, 5), 10)

  it('seeks back to region start once playback reaches the end', () => {
    expect(abSeekTarget(looping, 9.9)).toBeNull()
    expect(abSeekTarget(looping, 10)).toBe(5)
    expect(abSeekTarget(looping, 12)).toBe(5)
  })

  it('does nothing when looping is off, even with markers set', () => {
    expect(abSeekTarget(toggleLoop(looping, 100), 11)).toBeNull()
  })

  it('does nothing when markers are incomplete', () => {
    expect(abSeekTarget(setA(AB_NONE, 5), 100)).toBeNull()
  })
})

describe('abOnEnded (item end)', () => {
  it('looping with a region wraps to the region start', () => {
    const { state, seekTo } = abOnEnded(setB(setA(AB_NONE, 5), 10))
    expect(seekTo).toBe(5)
    expect(state.loop).toBe(true)
  })

  it('no markers: lets the engine advance normally', () => {
    expect(abOnEnded(AB_NONE).seekTo).toBeNull()
  })

  it('loop off (even with both markers set): lets the engine advance normally', () => {
    const off = toggleLoop(setB(setA(AB_NONE, 5), 10), 100)
    expect(abOnEnded(off).seekTo).toBeNull()
  })

  it('only A set, no explicit Loop tap: does NOT force a loop on reaching the end', () => {
    // Regression: this used to auto-arm B at the duration and start looping even if
    // the user had explicitly left looping off — surprising behaviour. Now a lone A
    // marker is just a bookmark until the user taps Loop or places B.
    const { state, seekTo } = abOnEnded(setA(AB_NONE, 4))
    expect(seekTo).toBeNull()
    expect(state).toEqual({ a: 4, b: null, loop: false })
  })
})
