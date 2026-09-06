import { describe, it, expect } from 'vitest'
import {
  pageCell,
  buildJuzGroups,
  memorizationStats,
  juzProgress,
  juzBandSegments,
  recentlyMemorizedPages,
} from '@/core/memorization/progressView'
import type { ReviewSchedule } from '@/core/storage/userData'

function schedule(lastReviewDate: string): ReviewSchedule {
  return { lastReviewDate, reviewCount: 1, interval: 1, easeFactor: 2.5, nextReviewDate: lastReviewDate, consecutiveCorrect: 1 }
}

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

describe('juzBandSegments', () => {
  const groups = buildJuzGroups({ '1': 1, '2': 21 }, 604) // juz 1 = pages 1..20
  const today = new Date('2026-08-29T00:00:00Z')

  it('splits a juz into band segments sorted strongest → weakest, matching the cell legend order', () => {
    // 5 Rasikh (Solid), 6 Qawiy (Strong), 4 Da'if (Weak), 5 untouched — the
    // exact "25% solid, 30% strong, 20% weak, rest not memorized" shape.
    const memorized = new Set<number>()
    const strength = new Map<number, number>()
    const reviewData = new Map<number, ReviewSchedule>()
    const band = (pages: number[], value: number) => {
      for (const p of pages) {
        memorized.add(p)
        strength.set(p, value)
        reviewData.set(p, schedule('2026-08-29')) // reviewed today — no decay cap
      }
    }
    band([1, 2, 3, 4, 5], 90) // Rasikh (Solid), min 90
    band([6, 7, 8, 9, 10, 11], 75) // Qawiy (Strong), min 75
    band([12, 13, 14, 15], 40) // Da'if (Weak), min 40
    // Pages 16-20 stay out of `memorized` entirely — Not Memorized.

    const segments = juzBandSegments(groups[0], memorized, strength, reviewData, today)

    expect(segments).toEqual([
      { rank: 5, percent: 25 }, // Rasikh
      { rank: 4, percent: 30 }, // Qawiy
      { rank: 2, percent: 20 }, // Da'if
    ])
    // Not Memorized (rank 0) is never a segment — the 25% remainder (5/20
    // pages) is left for the bar's own empty track, not an explicit entry.
    expect(segments.some((s) => (s.rank as number) === 0)).toBe(false)
    const total = segments.reduce((sum, s) => sum + s.percent, 0)
    expect(total).toBe(75)
  })

  it('an empty juz (defensive) returns no segments rather than dividing by zero', () => {
    const empty = { juz: 1, startPage: 1, endPage: 0, pages: [] }
    expect(juzBandSegments(empty, new Set(), new Map(), new Map(), today)).toEqual([])
  })

  it('a fully unmemorized juz has no segments at all — an all-empty bar', () => {
    expect(juzBandSegments(groups[0], new Set(), new Map(), new Map(), today)).toEqual([])
  })

  it('a fully memorized-but-never-revised juz floors every page at Da\'if, one segment', () => {
    // No strength, no reviewData at all — exactly the legacy-import /
    // freshly-marked shape `effectiveRank` floors at Da'if (Weak).
    const memorized = new Set(groups[0].pages)
    const segments = juzBandSegments(groups[0], memorized, new Map(), new Map(), today)
    expect(segments).toEqual([{ rank: 2, percent: 100 }])
  })
})

describe('recentlyMemorizedPages', () => {
  it('orders memorized pages newest-first by memorizedAt', () => {
    const memorized = new Set([1, 2, 3])
    const memorizedAt = new Map([
      [1, '2026-08-01T00:00:00.000Z'],
      [2, '2026-08-03T00:00:00.000Z'],
      [3, '2026-08-02T00:00:00.000Z'],
    ])
    expect(recentlyMemorizedPages(memorized, memorizedAt)).toEqual([2, 3, 1])
  })

  it('caps the result at `limit`', () => {
    const memorized = new Set([1, 2, 3, 4])
    const memorizedAt = new Map([
      [1, '2026-08-01T00:00:00.000Z'],
      [2, '2026-08-02T00:00:00.000Z'],
      [3, '2026-08-03T00:00:00.000Z'],
      [4, '2026-08-04T00:00:00.000Z'],
    ])
    expect(recentlyMemorizedPages(memorized, memorizedAt, 2)).toEqual([4, 3])
  })

  it('fewer than `limit` memorized pages: returns just what is memorized', () => {
    const memorized = new Set([5, 6])
    const memorizedAt = new Map([
      [5, '2026-08-01T00:00:00.000Z'],
      [6, '2026-08-02T00:00:00.000Z'],
    ])
    expect(recentlyMemorizedPages(memorized, memorizedAt, 10)).toEqual([6, 5])
  })

  it('pages with no memorizedAt entry (legacy data) are excluded entirely, not guessed at', () => {
    const memorized = new Set([10, 1, 2])
    const memorizedAt = new Map([[10, '2026-08-01T00:00:00.000Z']]) // 1, 2 never tracked
    expect(recentlyMemorizedPages(memorized, memorizedAt)).toEqual([10])
  })

  it('an entirely untimestamped set (pre-migration) returns empty, not an arbitrary order', () => {
    const memorized = new Set([30, 10, 20])
    expect(recentlyMemorizedPages(memorized, new Map())).toEqual([])
  })

  it('same-instant ties (one bulkMarkMemorized loop) break toward the highest page number — stamped last', () => {
    const memorized = new Set([5, 6, 7])
    const sameInstant = '2026-08-05T12:00:00.000Z'
    const memorizedAt = new Map([
      [5, sameInstant],
      [6, sameInstant],
      [7, sameInstant],
    ])
    expect(recentlyMemorizedPages(memorized, memorizedAt)).toEqual([7, 6, 5])
  })

  it('nothing memorized yet returns an empty list', () => {
    expect(recentlyMemorizedPages(new Set(), new Map())).toEqual([])
  })
})
