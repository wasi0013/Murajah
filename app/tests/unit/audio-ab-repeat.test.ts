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

describe('AB-repeat reducer (decision 7)', () => {
  it('(a) set A then B starts looping immediately', () => {
    const s = setB(setA(AB_NONE, 5), 10)
    expect(s).toEqual({ a: 5, b: 10, loop: true })
  })

  it('setting A alone does not start a loop', () => {
    expect(setA(AB_NONE, 5)).toEqual({ a: 5, b: null, loop: false })
  })

  it('markers can be set in either order; the region is [min, max]', () => {
    const s = setA(setB(AB_NONE, 3), 8) // B first at 3, then A at 8
    expect(s.loop).toBe(true)
    expect(abRegion(s)).toEqual({ start: 3, end: 8 })
  })

  it('(c) toggling the loop off preserves the markers, and back on', () => {
    const looping = setB(setA(AB_NONE, 5), 10)
    const paused = toggleLoop(looping)
    expect(paused).toEqual({ a: 5, b: 10, loop: false })
    expect(toggleLoop(paused).loop).toBe(true)
  })

  it('(d) clear removes markers and stops the loop', () => {
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
    expect(abSeekTarget(toggleLoop(looping), 11)).toBeNull()
  })

  it('does nothing when markers are incomplete', () => {
    expect(abSeekTarget(setA(AB_NONE, 5), 100)).toBeNull()
  })
})

describe('abOnEnded (item end)', () => {
  it('(b) only-A: auto-places B at the duration, enables loop, seeks to A', () => {
    const { state, seekTo } = abOnEnded(setA(AB_NONE, 4), 30)
    expect(state).toEqual({ a: 4, b: 30, loop: true })
    expect(seekTo).toBe(4)
  })

  it('both set + looping: wraps to the region start', () => {
    const { state, seekTo } = abOnEnded(setB(setA(AB_NONE, 5), 10), 20)
    expect(seekTo).toBe(5)
    expect(state.loop).toBe(true)
  })

  it('no markers (or loop off): lets the engine advance normally', () => {
    expect(abOnEnded(AB_NONE, 20).seekTo).toBeNull()
    const off = toggleLoop(setB(setA(AB_NONE, 5), 10))
    expect(abOnEnded(off, 20).seekTo).toBeNull()
  })
})
