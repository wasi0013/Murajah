import { describe, it, expect } from 'vitest'
import {
  pageCell,
  buildJuzGroups,
  memorizationStats,
  juzProgress,
} from '@/core/memorization/progressView'

describe('pageCell', () => {
  it('carries the raw strength and the effective (decay-capped) level', () => {
    const c = pageCell(12, true, 45, 2, 0)
    expect(c).toEqual({ page: 12, memorized: true, strength: 45, level: 2, mistakes: 2 })
  })

  it('caps the level for a long-neglected page without touching raw strength', () => {
    const c = pageCell(12, true, 100, 0, 100000)
    expect(c.strength).toBe(100)
    expect(c.level).toBe(2) // floored at Da'if
  })
})

describe('buildJuzGroups', () => {
  const juzToPage: Record<string, number> = {}
  for (let j = 1; j <= 30; j++) juzToPage[String(j)] = (j - 1) * 20 + 1 // 1,21,41,…,581

  it('produces 30 juz spanning the whole range with no gaps/overlaps', () => {
    const groups = buildJuzGroups(juzToPage, 604)
    expect(groups).toHaveLength(30)
    expect(groups[0]).toMatchObject({ juz: 1, startPage: 1, endPage: 20 })
    expect(groups[29]).toMatchObject({ juz: 30, startPage: 581, endPage: 604 })
    const all = groups.flatMap((g) => g.pages)
    expect(all).toHaveLength(604)
    expect(new Set(all).size).toBe(604) // no duplicates
  })

  it('uses real (uneven) juz boundaries when given', () => {
    const real = { ...juzToPage, '2': 22, '3': 42 } // juz 1 → pages 1–21
    const g = buildJuzGroups(real, 604)
    expect(g[0].endPage).toBe(21)
    expect(g[1]).toMatchObject({ startPage: 22, endPage: 41 })
  })
})

describe('memorizationStats', () => {
  it('computes counts, %, remaining, average strength', () => {
    const s = memorizationStats({
      memorized: new Set([1, 2, 3, 4]),
      strength: new Map([[1, 6], [2, 2]]),
      mistakes: new Map([[3, new Set([1, 2])]]),
      hasanah: 123456,
      totalPages: 604,
    })
    expect(s.memorizedCount).toBe(4)
    expect(s.percent).toBe(1) // 4/604 ≈ 0.66% → 1
    expect(s.remaining).toBe(600)
    expect(s.totalHasanah).toBe(123456)
    expect(s.mistakePages).toBe(1)
    expect(s.averageStrength).toBe(2) // (6+2)/4
  })

  it('handles empty progress', () => {
    const s = memorizationStats({
      memorized: new Set(),
      strength: new Map(),
      mistakes: new Map(),
      hasanah: 0,
      totalPages: 604,
    })
    expect(s).toMatchObject({ memorizedCount: 0, percent: 0, remaining: 604, averageStrength: 0 })
  })
})

describe('juzProgress', () => {
  it('counts memorized pages in a juz', () => {
    const groups = buildJuzGroups({ '1': 1, '2': 22 }, 604)
    const p = juzProgress(groups[0], new Set([1, 2, 3]))
    expect(p).toEqual({ memorized: 3, total: 21 })
  })
})
