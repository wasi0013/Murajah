import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { useProgressStore } from '@/stores/progress'
import {
  serializeProgress,
  deserializeProgress,
  loadProgress,
  saveProgress,
  normalizeSchedule,
  _resetUserDataDb,
  type Progress,
} from '@/core/storage/userData'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  setActivePinia(createPinia())
})

describe('progress store', () => {
  it('toggles memorized pages within the 604 range', () => {
    const p = useProgressStore()
    expect(p.toggleMemorized(10)).toBe(true)
    expect(p.isMemorized(10)).toBe(true)
    expect(p.memorizedCount).toBe(1)
    expect(p.toggleMemorized(10)).toBe(false)
    expect(p.isMemorized(10)).toBe(false)
    // out of range ignored
    p.setMemorized(0, true)
    p.setMemorized(605, true)
    expect(p.memorizedCount).toBe(0)
  })

  it('bumps strength with a floor at 0', () => {
    const p = useProgressStore()
    expect(p.bumpStrength(5, +1)).toBe(1)
    expect(p.bumpStrength(5, +1)).toBe(2)
    expect(p.bumpStrength(5, -1)).toBe(1)
    expect(p.bumpStrength(5, -5)).toBe(0) // floored
    expect(p.strengthOf(5)).toBe(0)
    expect(p.strength.has(5)).toBe(false) // dropped at 0
  })

  it('hasanah only ever increases', () => {
    const p = useProgressStore()
    p.awardHasanah(1390)
    p.awardHasanah(1600)
    expect(p.hasanah).toBe(2990)
    p.awardHasanah(-500) // ignored
    expect(p.hasanah).toBe(2990)
  })

  it('recordPerfectRevision raises strength + awards that page hasanah', () => {
    const p = useProgressStore()
    expect(p.recordPerfectRevision(1)).toBe(1) // page 1 weight = 1390
    expect(p.hasanah).toBe(1390)
    expect(p.recordPerfectRevision(1)).toBe(2)
    expect(p.hasanah).toBe(2780)
    expect(p.strengthOf(1)).toBe(2)
  })

  it('recordReview advances the SM-2 schedule and (on a pass) rewards in one write', () => {
    const p = useProgressStore()
    // Clean review: schedule advances, strength +1, hasanah += page weight.
    expect(p.recordReview(1, 'perfect')).toBe(1) // page 1 weight = 1390
    expect(p.hasanah).toBe(1390)
    const first = p.reviewData.get(1)!
    expect(first.reviewCount).toBe(1)
    expect(first.consecutiveCorrect).toBe(1)
    expect(first.nextReviewDate > first.lastReviewDate).toBe(true) // due date pushed out

    // A second clean review pushes the due date further and streak climbs.
    expect(p.recordReview(1, 'perfect')).toBe(2)
    expect(p.hasanah).toBe(2780)
    const second = p.reviewData.get(1)!
    expect(second.reviewCount).toBe(2)
    expect(second.consecutiveCorrect).toBe(2)
    expect(second.nextReviewDate > first.nextReviewDate).toBe(true)
  })

  it('a needs_work review resets the interval + streak without touching reward', () => {
    const p = useProgressStore()
    p.recordReview(5, 'perfect') // strength 1, hasanah 1390, streak 1
    p.recordReview(5, 'perfect') // strength 2, streak 2, interval grown
    const hasanahBefore = p.hasanah
    const strengthBefore = p.strengthOf(5)

    // needs_work → schedule resets, but hasanah/strength are left to penalizeMistake.
    expect(p.recordReview(5, 'needs_work')).toBe(strengthBefore)
    expect(p.hasanah).toBe(hasanahBefore)
    const after = p.reviewData.get(5)!
    expect(after.interval).toBe(1)
    expect(after.consecutiveCorrect).toBe(0)
    expect(after.reviewCount).toBe(3) // still counts as a review
  })

  it('recordPerfectRevision is recordReview(page, "perfect")', () => {
    const p = useProgressStore()
    expect(p.recordPerfectRevision(1)).toBe(1)
    expect(p.reviewData.get(1)?.consecutiveCorrect).toBe(1)
    expect(p.hasanah).toBe(1390)
    // out of range ignored
    expect(p.recordReview(0)).toBe(0)
    expect(p.recordReview(605)).toBe(0)
  })

  it('penalizeMistake lowers strength (floor 0) but never hasanah', () => {
    const p = useProgressStore()
    p.recordPerfectRevision(1) // strength 1, hasanah 1390
    p.recordPerfectRevision(1) // strength 2, hasanah 2780
    expect(p.penalizeMistake(1)).toBe(1)
    expect(p.hasanah).toBe(2780) // unchanged
    p.penalizeMistake(1)
    p.penalizeMistake(1) // already 0 → stays 0
    expect(p.strengthOf(1)).toBe(0)
    expect(p.hasanah).toBe(2780)
  })

  it('bulkMarkMemorized credits default strength + proportional hasanah for freshly-marked pages', () => {
    const p = useProgressStore()
    p.bulkMarkMemorized([1, 2], true)
    expect(p.isMemorized(1)).toBe(true)
    expect(p.isMemorized(2)).toBe(true)
    expect(p.strengthOf(1)).toBe(40)
    expect(p.strengthOf(2)).toBe(40)
    expect(p.hasanah).toBe((1390 + 1600) * 40) // page 1 + page 2 weights × 40

    // A page with real review history is never clobbered by a bulk mark.
    p.bumpStrength(1, -30) // simulate mistakes: strength now 10
    const hasanahBefore = p.hasanah
    p.bulkMarkMemorized([1], true)
    expect(p.strengthOf(1)).toBe(10) // untouched
    expect(p.hasanah).toBe(hasanahBefore) // no re-award

    // Unmarking never touches strength/hasanah.
    p.bulkMarkMemorized([2], false)
    expect(p.isMemorized(2)).toBe(false)
    expect(p.strengthOf(2)).toBe(40)
    expect(p.hasanah).toBe(hasanahBefore)

    // A page previously left at 0 by the old bug is backfilled on the next bulk mark.
    p.setMemorized(3, true) // simulates the pre-fix bug: memorized, strength 0
    expect(p.strengthOf(3)).toBe(0)
    p.bulkMarkMemorized([3], true)
    expect(p.strengthOf(3)).toBe(40)
  })

  it('markReviewed records a dated, counted review (and a clean revision marks one)', () => {
    const p = useProgressStore()
    p.markReviewed(10, '2026-07-10')
    p.markReviewed(10, '2026-07-15')
    // Recency bumps; SM-2 fields stay at defaults (reading never advances the schedule).
    expect(p.reviewData.get(10)).toEqual({
      lastReviewDate: '2026-07-15',
      reviewCount: 2,
      interval: 1,
      easeFactor: 2.5,
      consecutiveCorrect: 0,
      nextReviewDate: '2026-07-10',
    })

    // recordPerfectRevision also bumps review data for that page.
    p.recordPerfectRevision(20)
    expect(p.reviewData.get(20)?.reviewCount).toBe(1)

    // out of range ignored
    p.markReviewed(0, '2026-07-15')
    p.markReviewed(605, '2026-07-15')
    expect(p.reviewData.has(0)).toBe(false)
    expect(p.reviewData.has(605)).toBe(false)
  })
})

describe('progress persistence', () => {
  it('serialize/deserialize round-trips (with legacy keys)', () => {
    const p: Progress = {
      memorized: new Set([3, 1, 2]),
      strength: new Map([
        [3, 4],
        [9, 0], // zero dropped on serialize
      ]),
      hasanah: 12345,
      reviewData: new Map([[3, normalizeSchedule({ lastReviewDate: '2026-07-15', reviewCount: 2 })]]),
    }
    const schedule3 = {
      lastReviewDate: '2026-07-15',
      reviewCount: 2,
      interval: 1,
      easeFactor: 2.5,
      consecutiveCorrect: 0,
      nextReviewDate: '2026-07-15',
    }
    const stored = serializeProgress(p)
    expect(stored).toEqual({
      memorized: [1, 2, 3],
      perfectRevisions: { '3': 4 },
      hasanah: 12345,
      readingSeconds: 0,
      listeningSeconds: 0,
      reviewData: { '3': schedule3 },
    })
    const back = deserializeProgress(stored)
    expect(back.memorized).toEqual(new Set([1, 2, 3]))
    expect(back.strength).toEqual(new Map([[3, 4]]))
    expect(back.hasanah).toBe(12345)
    expect(back.reviewData).toEqual(new Map([[3, schedule3]]))
  })

  it('hydrates legacy (Phase-4) review records — recency only — with SM-2 defaults', () => {
    // A pre-Phase-5 backup stored only { lastReviewDate, reviewCount }.
    const back = deserializeProgress({
      memorized: [7],
      perfectRevisions: {},
      hasanah: 0,
      reviewData: { '7': { lastReviewDate: '2026-07-01', reviewCount: 5 } } as never,
    })
    expect(back.reviewData.get(7)).toEqual({
      lastReviewDate: '2026-07-01',
      reviewCount: 5,
      interval: 1,
      easeFactor: 2.5,
      consecutiveCorrect: 0,
      nextReviewDate: '2026-07-01',
    })
  })

  it('persists to IndexedDB and reloads', async () => {
    const p = useProgressStore()
    p.setMemorized(50, true)
    p.bumpStrength(50, +3)
    p.awardHasanah(9000)
    p.markReviewed(50, '2026-07-14')
    await saveProgress(p.snapshot())

    setActivePinia(createPinia())
    const p2 = useProgressStore()
    p2.setAll(await loadProgress())
    expect(p2.isMemorized(50)).toBe(true)
    expect(p2.strengthOf(50)).toBe(3)
    expect(p2.hasanah).toBe(9000)
    expect(p2.reviewData.get(50)).toEqual({
      lastReviewDate: '2026-07-14',
      reviewCount: 1,
      interval: 1,
      easeFactor: 2.5,
      consecutiveCorrect: 0,
      nextReviewDate: '2026-07-14',
    })
  })

  it('defaults hasanah to 0 and review data to empty when the record is absent', async () => {
    const loaded = await loadProgress()
    expect(loaded.hasanah).toBe(0)
    expect(loaded.reviewData.size).toBe(0)
  })
})

describe('setStrengthBand', () => {
  it('writes the band lower bound and stamps lastReviewDate', () => {
    const p = useProgressStore()
    expect(p.setStrengthBand(5, 4, '2026-08-23')).toBe(75) // Qawiy
    expect(p.strengthOf(5)).toBe(75)
    expect(p.reviewData.get(5)?.lastReviewDate).toBe('2026-08-23')
  })

  it('rank 0 (Not Memorized) clears strength rather than storing 0', () => {
    const p = useProgressStore()
    p.setStrengthBand(5, 4)
    p.setStrengthBand(5, 0)
    expect(p.strength.has(5)).toBe(false)
    expect(p.strengthOf(5)).toBe(0)
  })

  it('no-ops the strength write when already in the target band, but still stamps the date', () => {
    const p = useProgressStore()
    p.bumpStrength(5, 150) // deep into Mutqan (rank 6), well above its 98 lower bound
    expect(p.setStrengthBand(5, 6, '2026-08-23')).toBe(150) // unchanged, not clobbered to 98
    expect(p.reviewData.get(5)?.lastReviewDate).toBe('2026-08-23')
  })

  it('does not touch the memorized boolean', () => {
    const p = useProgressStore()
    p.setStrengthBand(5, 4)
    expect(p.isMemorized(5)).toBe(false)
    p.setStrengthBand(5, 0)
    expect(p.isMemorized(5)).toBe(false)
  })

  it('out of range page is a no-op', () => {
    const p = useProgressStore()
    expect(p.setStrengthBand(0, 4)).toBe(0)
    expect(p.reviewData.has(0)).toBe(false)
  })
})

describe('decay-clock stamping on strength-mutating actions', () => {
  it('penalizeMistake deliberately does NOT stamp lastReviewDate (a mistake is not a "revision", and would zero weaknessScorer\'s recency term)', () => {
    const p = useProgressStore()
    expect(p.reviewData.has(5)).toBe(false)
    p.penalizeMistake(5)
    expect(p.reviewData.has(5)).toBe(false)
  })

  it('bulkMarkMemorized stamps only the pages it actually bumps', () => {
    const p = useProgressStore()
    p.bumpStrength(2, 10) // page 2 already has strength — bulk-mark must not touch it
    p.bulkMarkMemorized([1, 2], true)
    expect(p.reviewData.get(1)?.lastReviewDate).toBeTruthy() // bumped -> stamped
    expect(p.reviewData.has(2)).toBe(false) // left alone -> not stamped
  })

  it('penalizeMistake immediately followed by recordReview (useToday.ts complete()) is stamped by recordReview alone', () => {
    const p = useProgressStore()
    p.penalizeMistake(5)
    p.recordReview(5, 'needs_work', new Date('2026-08-23T00:00:00Z'))
    expect(p.reviewData.get(5)?.lastReviewDate).toBe('2026-08-23')
  })
})
