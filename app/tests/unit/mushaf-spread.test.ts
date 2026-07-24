import { describe, it, expect } from 'vitest'
import { spreadFor, visiblePages, pageStep, prefetchPages } from '@/core/mushaf/spread'

const COUNT = 604

describe('mushaf spread pairing (RTL: odd=right, even=left)', () => {
  it('pairs (odd, odd+1) with the lower page on the right', () => {
    expect(spreadFor(1, COUNT)).toEqual({ right: 1, left: 2 })
    expect(spreadFor(2, COUNT)).toEqual({ right: 1, left: 2 })
    expect(spreadFor(101, COUNT)).toEqual({ right: 101, left: 102 })
    expect(spreadFor(102, COUNT)).toEqual({ right: 101, left: 102 })
    expect(spreadFor(603, COUNT)).toEqual({ right: 603, left: 604 })
    expect(spreadFor(604, COUNT)).toEqual({ right: 603, left: 604 })
  })

  it('drops the left page when it would exceed range', () => {
    expect(spreadFor(3, 3)).toEqual({ right: 3 }) // no page 4
  })
})

describe('visiblePages', () => {
  it('shows one page on mobile', () => {
    expect(visiblePages(50, COUNT, false)).toEqual([50])
  })
  it('shows the pair on desktop, right (lower) first', () => {
    expect(visiblePages(50, COUNT, true)).toEqual([49, 50])
    expect(visiblePages(51, COUNT, true)).toEqual([51, 52])
  })
  it('clamps a single page to range', () => {
    expect(visiblePages(999, COUNT, false)).toEqual([604])
  })
})

describe('pageStep', () => {
  it('single mode steps by one, clamped', () => {
    expect(pageStep(50, 1, COUNT, false)).toBe(51)
    expect(pageStep(50, -1, COUNT, false)).toBe(49)
    expect(pageStep(1, -1, COUNT, false)).toBe(1)
    expect(pageStep(604, 1, COUNT, false)).toBe(604)
  })

  it('spread mode advances a whole spread and never splits a pair', () => {
    // in spread (49,50), next → right of (51,52) = 51, prev → (47,48) = 47
    expect(pageStep(50, 1, COUNT, true)).toBe(51)
    expect(pageStep(49, 1, COUNT, true)).toBe(51)
    expect(pageStep(50, -1, COUNT, true)).toBe(47)
    expect(pageStep(1, -1, COUNT, true)).toBe(1)
    expect(pageStep(603, 1, COUNT, true)).toBe(604) // clamped to last
  })
})

describe('prefetchPages', () => {
  it('warms ±1 in single mode, excluding the visible page', () => {
    expect(prefetchPages(50, COUNT, false)).toEqual([49, 51])
    expect(prefetchPages(1, COUNT, false)).toEqual([2]) // no page 0
    expect(prefetchPages(604, COUNT, false)).toEqual([603])
  })

  it('warms adjacent spreads in 2-up mode, excluding the visible pair', () => {
    // visible (49,50); prev spread (47,48); next spread (51,52)
    expect(prefetchPages(50, COUNT, true)).toEqual([47, 48, 51, 52])
  })

  it('clamps prefetch at the edges', () => {
    expect(prefetchPages(1, COUNT, true)).toEqual([3, 4]) // visible (1,2); no prev
    expect(prefetchPages(604, COUNT, true)).toEqual([601, 602]) // visible (603,604); no next
  })
})
