import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { useProgressStore } from '@/stores/progress'
import { useSettingsStore } from '@/stores/settings'
import { effectiveRank } from '@/core/memorization/strengthBands'
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

  describe('memorizedAt', () => {
    it('stamps a timestamp when a page becomes memorized, and clears it on unmark', () => {
      const p = useProgressStore()
      expect(p.memorizedAt.has(10)).toBe(false)
      p.setMemorized(10, true)
      expect(p.memorizedAt.get(10)).toBeTruthy()
      expect(() => new Date(p.memorizedAt.get(10)!).toISOString()).not.toThrow()
      p.setMemorized(10, false)
      expect(p.memorizedAt.has(10)).toBe(false)
    })

    it('toggleMemorized and bulkMarkMemorized both stamp it too (both funnel through setMemorized)', () => {
      const p = useProgressStore()
      p.toggleMemorized(10)
      expect(p.memorizedAt.has(10)).toBe(true)
      p.bulkMarkMemorized([20, 21], true)
      expect(p.memorizedAt.has(20)).toBe(true)
      expect(p.memorizedAt.has(21)).toBe(true)
      p.bulkMarkMemorized([20], false)
      expect(p.memorizedAt.has(20)).toBe(false)
      expect(p.memorizedAt.has(21)).toBe(true) // unaffected
    })

    it('out-of-range pages are never stamped', () => {
      const p = useProgressStore()
      p.setMemorized(0, true)
      p.setMemorized(605, true)
      expect(p.memorizedAt.size).toBe(0)
    })
  })

  // Regression: the reported bug (memorized pages rendering "Not Memorized")
  // plus the fix for it must not trade one contradiction for another — a
  // freshly-marked page's *displayed* level must never regress the moment a
  // real revision or mistake lands.
  describe('toggleMemorized credits the Weak floor, in storage — not just at display time', () => {
    it('a freshly single-page-marked page is never "Not Memorized" (the reported bug)', () => {
      const p = useProgressStore()
      p.toggleMemorized(10)
      expect(p.strengthOf(10)).toBe(40) // credited in storage, like bulkMarkMemorized
      expect(p.reviewData.get(10)?.lastReviewDate).toBeTruthy() // decay clock anchored immediately
      expect(effectiveRank(true, p.strengthOf(10), 0)).toBe(2) // Da'if (Weak)
    })

    it('unlike bulkMarkMemorized, awards no hasanah — a mis-tapped page toggled back off would keep it forever', () => {
      const p = useProgressStore()
      p.toggleMemorized(10) // on: credits strength, no reward
      expect(p.hasanah).toBe(0)
      p.toggleMemorized(10) // off: never refunds anyway, but there's nothing to refund
      expect(p.hasanah).toBe(0)
    })

    it('a real revision right after a fresh (no-evidence) mark never lowers the displayed level', () => {
      const p = useProgressStore()
      p.toggleMemorized(10) // no prior review history — credited to 40
      const before = effectiveRank(true, p.strengthOf(10), 0)
      p.recordPerfectRevision(10)
      const after = effectiveRank(true, p.strengthOf(10), 0)
      expect(after).toBeGreaterThanOrEqual(before) // strictly additive, never a visible downgrade
    })

    // Known, accepted trade-off (not a bug): a page with real review history
    // is deliberately left uncredited (see the test above this describe
    // block) so it can't distort weaknessScorer's ratio — but that means
    // *this* page still passes through raw strength 0 → 1 on its first real
    // pass, so the *displayed* band can legitimately dip from the Da'if
    // floor down to Jadid (bandForStrength(1).rank) for one revision, same
    // as `recordBandChange` narrating "Not Memorized → New" in the Journal.
    // The alternative (crediting these too) reintroduces the scheduler bug
    // the review-history guard exists to prevent — see
    // `creditFreshMemorization`'s doc comment. Pinned here so this reads as
    // documented behavior, not a regression, if it's ever hit in review.
    it('a page with real review history can still dip Weak → New on its first pass (accepted, see comment)', () => {
      const p = useProgressStore()
      p.recordReview(10, 'needs_work') // reviewCount 1, strength 0 — never credited
      const before = effectiveRank(true, p.strengthOf(10), 0)
      p.toggleMemorized(10)
      expect(effectiveRank(true, p.strengthOf(10), 0)).toBe(before) // toggling alone doesn't move it
      p.recordPerfectRevision(10) // strength 0 → 1
      const after = effectiveRank(true, p.strengthOf(10), 0)
      expect(before).toBe(2) // Da'if (Weak), via the floor
      expect(after).toBe(1) // Jadid (New) — a real, visible dip
    })

    it('a mistake right after marking never raises the displayed level', () => {
      const p = useProgressStore()
      p.toggleMemorized(10)
      const before = effectiveRank(true, p.strengthOf(10), 0)
      p.penalizeMistake(10)
      const after = effectiveRank(true, p.strengthOf(10), 0)
      expect(after).toBeLessThanOrEqual(before)
    })

    it('re-toggling off then on never re-credits a page with real strength', () => {
      const p = useProgressStore()
      p.toggleMemorized(10) // credits 40
      p.bumpStrength(10, -30) // simulate mistakes down to 10
      p.toggleMemorized(10) // off
      p.toggleMemorized(10) // on again
      expect(p.strengthOf(10)).toBe(10) // real history, never clobbered back to 40
    })

    // Regression: crediting the floor onto a page with zero strength but
    // real review history (reviewed repeatedly, never once passed) would
    // read as "40 clean revisions" to weaknessScorer's
    // perfectRevisionCount/totalReviewCount ratio — inflating a genuinely
    // struggling page into looking flawless. Never credit over evidence.
    it('never credits a page that has real review history but zero strength (evidence of struggling, not absence of data)', () => {
      const p = useProgressStore()
      p.recordReview(10, 'needs_work') // reviewCount 1, strength stays 0 — genuine evidence
      expect(p.strengthOf(10)).toBe(0)
      p.toggleMemorized(10)
      expect(p.strengthOf(10)).toBe(0) // not floored to 40 over real evidence
      expect(p.isMemorized(10)).toBe(true) // the memorized flag itself still applies
    })
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

    // A page with zero strength but real review history (reviewed, never
    // passed) is evidence of struggling, not absence of data — never
    // credited over it (see creditFreshMemorization's doc comment on why
    // this would otherwise distort weaknessScorer's ratio).
    p.recordReview(4, 'needs_work')
    expect(p.strengthOf(4)).toBe(0)
    p.bulkMarkMemorized([4], true)
    expect(p.strengthOf(4)).toBe(0)
    expect(p.isMemorized(4)).toBe(true)
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

// Settings-store gating (Phase: progress-tracking toggles). Each of the three
// mutators below is the single choke point every real caller of that metric
// funnels through (see stores/progress.ts's doc comments) — testing the
// mutators directly here is equivalent to testing every caller.
describe('progress-tracking toggles gate accrual', () => {
  it('awardHasanah no-ops while trackHasanah is off, independently of the other two', () => {
    const settings = useSettingsStore()
    settings.setTrackHasanah(false)
    const p = useProgressStore()
    p.awardHasanah(1000)
    expect(p.hasanah).toBe(0)
    // The other two toggles are untouched — still on, still work.
    p.addReadingSeconds(5)
    p.addListeningSeconds(5)
    expect(p.readingSeconds).toBe(5)
    expect(p.listeningSeconds).toBe(5)
  })

  it('addReadingSeconds no-ops while trackReadingTime is off, independently of the other two', () => {
    const settings = useSettingsStore()
    settings.setTrackReadingTime(false)
    const p = useProgressStore()
    p.addReadingSeconds(5)
    expect(p.readingSeconds).toBe(0)
    p.awardHasanah(1000)
    p.addListeningSeconds(5)
    expect(p.hasanah).toBe(1000)
    expect(p.listeningSeconds).toBe(5)
  })

  it('addListeningSeconds no-ops while trackListeningTime is off, independently of the other two', () => {
    const settings = useSettingsStore()
    settings.setTrackListeningTime(false)
    const p = useProgressStore()
    p.addListeningSeconds(5)
    expect(p.listeningSeconds).toBe(0)
    p.awardHasanah(1000)
    p.addReadingSeconds(5)
    expect(p.hasanah).toBe(1000)
    expect(p.readingSeconds).toBe(5)
  })

  it('turning hasanah tracking off does not affect memorization/strength — the gate is precise, not blanket', () => {
    const settings = useSettingsStore()
    settings.setTrackHasanah(false)
    const p = useProgressStore()

    // Single-page toggle already awards no hasanah by design (reward: false) —
    // strength/memorized state still update normally.
    expect(p.toggleMemorized(10)).toBe(true)
    expect(p.strengthOf(10)).toBe(40)
    expect(p.hasanah).toBe(0)

    // Bulk-mark normally awards hasanah too — strength/memorized state still
    // update, only the hasanah write is suppressed.
    p.bulkMarkMemorized([20, 21], true)
    expect(p.isMemorized(20)).toBe(true)
    expect(p.isMemorized(21)).toBe(true)
    expect(p.strengthOf(20)).toBe(40)
    expect(p.hasanah).toBe(0)

    // A passing scheduled revision still raises strength — only its hasanah
    // award is suppressed.
    expect(p.recordPerfectRevision(30)).toBe(1)
    expect(p.hasanah).toBe(0)
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
      memorizedAt: new Map([[3, '2026-07-15T09:00:00.000Z']]),
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
      memorizedAt: { '3': '2026-07-15T09:00:00.000Z' },
    })
    const back = deserializeProgress(stored)
    expect(back.memorized).toEqual(new Set([1, 2, 3]))
    expect(back.strength).toEqual(new Map([[3, 4]]))
    expect(back.hasanah).toBe(12345)
    expect(back.reviewData).toEqual(new Map([[3, schedule3]]))
    expect(back.memorizedAt).toEqual(new Map([[3, '2026-07-15T09:00:00.000Z']]))
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
  it('writes the band lower bound', () => {
    const p = useProgressStore()
    expect(p.setStrengthBand(5, 4)).toBe(75) // Qawiy
    expect(p.strengthOf(5)).toBe(75)
  })

  it('does NOT stamp lastReviewDate — the sheet UI owns the debounced stamp', () => {
    const p = useProgressStore()
    p.setStrengthBand(5, 4)
    expect(p.reviewData.has(5)).toBe(false)
  })

  it('rank 0 (Not Memorized) clears strength rather than storing 0', () => {
    const p = useProgressStore()
    p.setStrengthBand(5, 4)
    p.setStrengthBand(5, 0)
    expect(p.strength.has(5)).toBe(false)
    expect(p.strengthOf(5)).toBe(0)
  })

  it('no-ops the strength write when already in the target band', () => {
    const p = useProgressStore()
    p.bumpStrength(5, 150) // deep into Mutqan (rank 6), well above its 98 lower bound
    expect(p.setStrengthBand(5, 6)).toBe(150) // unchanged, not clobbered to 98
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

describe('touchReviewDate', () => {
  it('stamps a well-formed past/present date as given', () => {
    const p = useProgressStore()
    p.touchReviewDate(5, '2026-01-01')
    expect(p.reviewData.get(5)?.lastReviewDate).toBe('2026-01-01')
  })

  it('preserves the existing reviewCount/SM-2 fields rather than resetting them', () => {
    const p = useProgressStore()
    p.recordReview(5, 'perfect', new Date('2026-01-01T00:00:00Z'))
    const before = p.reviewData.get(5)
    p.touchReviewDate(5, '2026-02-01')
    const after = p.reviewData.get(5)
    expect(after?.lastReviewDate).toBe('2026-02-01')
    expect(after?.reviewCount).toBe(before?.reviewCount)
    expect(after?.interval).toBe(before?.interval)
  })

  it('rejects a malformed date rather than storing garbage', () => {
    const p = useProgressStore()
    p.touchReviewDate(5, 'not-a-date')
    expect(p.reviewData.has(5)).toBe(false)
  })

  it('clamps a future date to today (the calendar picker\'s max should prevent this client-side, but the store does not trust it alone)', () => {
    const p = useProgressStore()
    const farFuture = '2999-01-01'
    p.touchReviewDate(5, farFuture)
    expect(p.reviewData.get(5)?.lastReviewDate).not.toBe(farFuture)
    expect(p.reviewData.get(5)?.lastReviewDate).toBeTruthy()
  })

  it('out of range page is a no-op', () => {
    const p = useProgressStore()
    p.touchReviewDate(0, '2026-01-01')
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
