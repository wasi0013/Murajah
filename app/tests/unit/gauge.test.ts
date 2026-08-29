import { describe, it, expect } from 'vitest'
import { semicircleLength, semicircleGaugeDash } from '@/core/memorization/gauge'

describe('semicircleLength', () => {
  it('is π × radius (a semicircle is half a circle\'s circumference)', () => {
    expect(semicircleLength(52)).toBeCloseTo(163.3628, 3)
    expect(semicircleLength(0)).toBe(0)
  })
})

describe('semicircleGaugeDash', () => {
  it('0% hides the whole arc (dashoffset === dasharray)', () => {
    const d = semicircleGaugeDash(0, 52)
    expect(d.dashoffset).toBeCloseTo(d.dasharray, 5)
  })

  it('100% reveals the whole arc (dashoffset 0)', () => {
    const d = semicircleGaugeDash(100, 52)
    expect(d.dashoffset).toBeCloseTo(0, 5)
  })

  it('50% reveals exactly half the arc length', () => {
    const d = semicircleGaugeDash(50, 52)
    expect(d.dashoffset).toBeCloseTo(d.dasharray / 2, 5)
  })

  it('dasharray is always the full length regardless of percent (one dash, never a repeating pattern)', () => {
    expect(semicircleGaugeDash(0, 52).dasharray).toBe(semicircleGaugeDash(100, 52).dasharray)
    expect(semicircleGaugeDash(50, 52).dasharray).toBe(semicircleLength(52))
  })

  it('clamps out-of-range percent (average strength is an unbounded raw counter — see strengthBands.ts)', () => {
    expect(semicircleGaugeDash(142, 52)).toEqual(semicircleGaugeDash(100, 52))
    expect(semicircleGaugeDash(-5, 52)).toEqual(semicircleGaugeDash(0, 52))
  })
})
