import { describe, it, expect } from 'vitest'
import { pickTarget, STRONG_RATIO } from '@/core/quiz/target'
import type { Target } from '@/core/quiz/types'

function target(page: number, weak: boolean): Target {
  return { surah: 1, ayah: page, page, arabic: `v${page}`, weak }
}

/** A counter-based RNG that sweeps [0,1) evenly over `n` calls — good for ratios. */
function sweepRng(n: number) {
  let i = 0
  return () => (i++ % n) / n
}

describe('pickTarget', () => {
  it('returns undefined for an empty pool', () => {
    expect(pickTarget([])).toBeUndefined()
  })

  it('draws roughly STRONG_RATIO from strong pages over many draws', () => {
    const pool = [
      ...Array.from({ length: 5 }, (_, i) => target(i + 1, true)),
      ...Array.from({ length: 5 }, (_, i) => target(i + 100, false)),
    ]
    const N = 4000
    const rng = sweepRng(1000)
    let strong = 0
    for (let i = 0; i < N; i++) {
      if (!pickTarget(pool, { rng })!.weak) strong++
    }
    expect(strong / N).toBeCloseTo(STRONG_RATIO, 1) // within ~0.05
  })

  it('never yields a strong target when every page is weak', () => {
    const pool = Array.from({ length: 4 }, (_, i) => target(i + 1, true))
    const rng = sweepRng(17)
    for (let i = 0; i < 100; i++) expect(pickTarget(pool, { rng })!.weak).toBe(true)
  })

  it('never yields a weak target when every page is strong', () => {
    const pool = Array.from({ length: 4 }, (_, i) => target(i + 1, false))
    const rng = sweepRng(17)
    for (let i = 0; i < 100; i++) expect(pickTarget(pool, { rng })!.weak).toBe(false)
  })

  it('reaches both classes in a mixed pool given enough draws', () => {
    const pool = [target(1, true), target(2, false)]
    const rng = sweepRng(7)
    const seen = new Set<boolean>()
    for (let i = 0; i < 100; i++) seen.add(pickTarget(pool, { rng })!.weak)
    expect(seen).toEqual(new Set([true, false]))
  })

  it('honours a custom strongRatio of 0 (weak only when weak pages exist)', () => {
    const pool = [target(1, true), target(2, false)]
    const rng = sweepRng(7)
    for (let i = 0; i < 50; i++) {
      expect(pickTarget(pool, { strongRatio: 0, rng })!.weak).toBe(true)
    }
  })
})
