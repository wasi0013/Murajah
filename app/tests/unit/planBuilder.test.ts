import { describe, it, expect } from 'vitest'
import {
  getPagesForJuz,
  getJuzForPages,
  juzPageRanges,
  totalPagesForLayout,
  generateSmartPlan,
  advanceMemorizationPage,
  syncExternalMemorization,
} from '@/core/memorization/planBuilder'

// Derived QPC juz starts (nav index), not the legacy off-by-one tables.
const QPC_JUZ_TO_PAGE: Record<string, number> = {
  '1': 1, '2': 22, '3': 42, '4': 62, '5': 82, '6': 102, '7': 121, '8': 142,
  '9': 162, '10': 182, '11': 201, '12': 222, '13': 242, '14': 262, '15': 282,
  '16': 302, '17': 322, '18': 342, '19': 362, '20': 382, '21': 402, '22': 422,
  '23': 442, '24': 462, '25': 482, '26': 502, '27': 522, '28': 542, '29': 562,
  '30': 582,
}
const QPC_TOTAL = 604
const TODAY = new Date('2026-07-15T09:00:00')

describe('planBuilder — juz ⇄ page scope', () => {
  it('derives per-juz page ranges from the nav index', () => {
    const ranges = juzPageRanges(QPC_JUZ_TO_PAGE, QPC_TOTAL)
    expect(ranges).toHaveLength(30)
    expect(ranges[0]).toEqual([1, 21])
    expect(ranges[6]).toEqual([121, 141]) // juz 7 starts at 121 (derived), not legacy 122
    expect(ranges[29]).toEqual([582, 604]) // last juz ends at the layout page count
  })

  it('getPagesForJuz expands juz to their exact page sets', () => {
    const juz1 = getPagesForJuz([1], QPC_JUZ_TO_PAGE, QPC_TOTAL)
    expect(juz1[0]).toBe(1)
    expect(juz1.at(-1)).toBe(21)
    expect(juz1).toHaveLength(21)

    const juz30 = getPagesForJuz([30], QPC_JUZ_TO_PAGE, QPC_TOTAL)
    expect(juz30[0]).toBe(582)
    expect(juz30.at(-1)).toBe(604)

    // de-dupes + sorts across multiple juz, ignores out-of-range
    expect(getPagesForJuz([2, 1, 99], QPC_JUZ_TO_PAGE, QPC_TOTAL)[0]).toBe(1)
  })

  it('getJuzForPages maps pages back to juz via the nav index', () => {
    expect(getJuzForPages([1, 22, 604], QPC_JUZ_TO_PAGE)).toEqual([1, 2, 30])
    expect(getJuzForPages([121], QPC_JUZ_TO_PAGE)).toEqual([7]) // derived boundary
  })

  it('knows per-layout page counts', () => {
    expect(totalPagesForLayout('qpc')).toBe(604)
    expect(totalPagesForLayout('indopak')).toBe(610)
  })
})

describe('planBuilder — generateSmartPlan', () => {
  it('beginner (nothing memorized) → juz 30 scope + active front', () => {
    const { config, analysis } = generateSmartPlan({
      memorized: new Set(),
      juzToPage: QPC_JUZ_TO_PAGE,
      layout: 'qpc',
      today: TODAY,
    })
    expect(analysis.detectedType).toBe('beginner')
    expect(config.scope).toEqual({ kind: 'juz', juz: [30] })
    expect(config.newFront).toEqual({ layout: 'qpc', nextPage: 582 })
    expect(config.pace.newPagesPerDay).toBe(1)
    expect(config.pace.revisionPagesPerDay).toBe(3)
    expect(config.startDate).toBe('2026-07-15')
  })

  it('hafiz (≥85% memorized) → maintain-all scope, no new front', () => {
    const memorized = new Set<number>()
    for (let p = 1; p <= 520; p++) memorized.add(p) // 520/604 ≈ 0.86
    const { config, analysis } = generateSmartPlan({
      memorized,
      juzToPage: QPC_JUZ_TO_PAGE,
      today: TODAY,
    })
    expect(analysis.detectedType).toBe('hafiz')
    expect(config.scope).toEqual({ kind: 'all-memorized' })
    expect(config.newFront).toBeNull()
    expect(config.pace.newPagesPerDay).toBe(0)
    expect(config.pace.revisionPagesPerDay).toBe(18) // ceil(520/30)
  })

  it('partial memorizer → maintain-all scope + front at the next gap', () => {
    const memorized = new Set<number>()
    for (let p = 1; p <= 10; p++) memorized.add(p)
    const { config, analysis } = generateSmartPlan({
      memorized,
      juzToPage: QPC_JUZ_TO_PAGE,
      today: TODAY,
    })
    expect(analysis.detectedType).toBe('mixed')
    expect(config.scope).toEqual({ kind: 'all-memorized' })
    expect(config.newFront).toEqual({ layout: 'qpc', nextPage: 11 })
    expect(config.pace.newPagesPerDay).toBe(1)
  })

  it('many weak pages → boosts revision and pauses new memorization', () => {
    const memorized = new Set<number>()
    for (let p = 1; p <= 20; p++) memorized.add(p) // all never-reviewed → weak
    const { config, analysis } = generateSmartPlan({
      memorized,
      juzToPage: QPC_JUZ_TO_PAGE,
      today: TODAY,
    })
    expect(analysis.weakPageCount).toBeGreaterThan(10)
    expect(config.newFront).toBeNull()
    expect(config.pace.newPagesPerDay).toBe(0)
    expect(config.pace.revisionPagesPerDay).toBe(15) // min(15, weakCount)
  })
})

describe('planBuilder — memorization front', () => {
  it('advanceMemorizationPage skips already-memorized pages', () => {
    expect(
      advanceMemorizationPage({ layout: 'qpc', nextPage: 22 }, new Set([23]), { maxPage: 604 }),
    ).toEqual({ layout: 'qpc', nextPage: 24 })
  })

  it('advanceMemorizationPage returns null when nothing remains', () => {
    expect(advanceMemorizationPage({ layout: 'qpc', nextPage: 604 }, new Set(), { maxPage: 604 })).toBeNull()
    expect(advanceMemorizationPage(null, new Set())).toBeNull()
  })

  it('syncExternalMemorization keeps an unmemorized front and advances a stale one', () => {
    const front = { layout: 'qpc' as const, nextPage: 22 }
    // front still points at an unmemorized page → unchanged
    expect(syncExternalMemorization(front, new Set(), { maxPage: 604 })).toBe(front)
    // page 22 + 23 memorized elsewhere → advance to 24
    expect(syncExternalMemorization(front, new Set([22, 23]), { maxPage: 604 })).toEqual({
      layout: 'qpc',
      nextPage: 24,
    })
  })
})
