import { describe, it, expect } from 'vitest'
import {
  STRENGTH_BANDS,
  bandForStrength,
  bandByRank,
  daysSince,
  capForDays,
  effectiveRank,
} from '@/core/memorization/strengthBands'

describe('STRENGTH_BANDS', () => {
  it('has 7 ranks 0..6 in ascending order with the documented lower bounds', () => {
    expect(STRENGTH_BANDS).toHaveLength(7)
    expect(STRENGTH_BANDS.map((b) => b.rank)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(STRENGTH_BANDS.map((b) => b.minStrength)).toEqual([0, 1, 40, 60, 75, 90, 98])
  })
})

describe('bandForStrength', () => {
  it('picks the highest band whose minStrength <= strength', () => {
    expect(bandForStrength(0).rank).toBe(0)
    expect(bandForStrength(-5).rank).toBe(0) // negative clamps to Not Memorized
    expect(bandForStrength(1).rank).toBe(1)
    expect(bandForStrength(39).rank).toBe(1)
    expect(bandForStrength(40).rank).toBe(2)
    expect(bandForStrength(59).rank).toBe(2)
    expect(bandForStrength(60).rank).toBe(3)
    expect(bandForStrength(74).rank).toBe(3)
    expect(bandForStrength(75).rank).toBe(4)
    expect(bandForStrength(89).rank).toBe(4)
    expect(bandForStrength(90).rank).toBe(5)
    expect(bandForStrength(97).rank).toBe(5)
    expect(bandForStrength(98).rank).toBe(6)
    expect(bandForStrength(1000).rank).toBe(6)
  })
})

describe('bandByRank', () => {
  it('round-trips with bandForStrength at each lower bound', () => {
    for (const b of STRENGTH_BANDS) {
      expect(bandByRank(b.rank)).toEqual(b)
      expect(bandForStrength(b.minStrength).rank).toBe(b.rank)
    }
  })
})

describe('daysSince', () => {
  it('returns Infinity when the date is missing/unparseable', () => {
    expect(daysSince(undefined)).toBe(Infinity)
    expect(daysSince('')).toBe(Infinity)
    expect(daysSince('not-a-date')).toBe(Infinity)
  })

  it('returns 0 for the same day', () => {
    expect(daysSince('2026-08-23', new Date('2026-08-23T15:00:00Z'))).toBe(0)
  })

  it('returns the exact day count for a known past date, UTC-anchored (no DST drift)', () => {
    // Spans a US DST transition (2026-03-08) — must still be exactly 10 days.
    expect(daysSince('2026-03-01', new Date('2026-03-11T00:00:00Z'))).toBe(10)
    expect(daysSince('2025-08-23', new Date('2026-08-23T00:00:00Z'))).toBe(365)
  })
})

describe('capForDays', () => {
  it('applies no cap below 730 days', () => {
    expect(capForDays(0)).toBe(6)
    expect(capForDays(729)).toBe(6)
  })

  it('steps down at each cumulative threshold', () => {
    expect(capForDays(730)).toBe(5)
    expect(capForDays(1094)).toBe(5)
    expect(capForDays(1095)).toBe(4)
    expect(capForDays(1274)).toBe(4)
    expect(capForDays(1275)).toBe(3)
    expect(capForDays(1364)).toBe(3)
    expect(capForDays(1365)).toBe(2)
  })

  it('never caps below Da\'if (rank 2), however long the neglect', () => {
    expect(capForDays(100000)).toBe(2)
    expect(capForDays(Infinity)).toBe(2)
  })
})

describe('effectiveRank', () => {
  it('is a cumulative cap, not a per-band dwell-time step-down: a Mutqan page at exactly 1095 days jumps straight to Qawiy, skipping Rasikh', () => {
    expect(effectiveRank(true, 100, 1095)).toBe(4)
  })

  it('never caps below Da\'if even for a very high raw strength neglected forever', () => {
    expect(effectiveRank(true, 100, 100000)).toBe(2)
  })

  it('does not raise a low-but-nonzero raw band above its own rank (the cap floor only bites once raw is already >= it)', () => {
    expect(effectiveRank(true, 20, 100000)).toBe(1) // raw Jadid stays Jadid — min(1, 2) = 1
  })

  it('shows the raw band unchanged when recently revised', () => {
    expect(effectiveRank(true, 100, 0)).toBe(6)
    expect(effectiveRank(true, 45, 10)).toBe(2)
  })

  it('a non-memorized page always shows its honest raw/cap value, never floored', () => {
    expect(effectiveRank(false, 0, 0)).toBe(0)
    expect(effectiveRank(false, 0, 100000)).toBe(0)
  })

  // Regression coverage for the reported bug: memorized pages with zero
  // recorded strength (legacy imports predating `perfectRevisions`, or a
  // freshly single-page-marked page) were rendering as "Not Memorized"
  // instead of the documented floor.
  describe('a memorized page with zero raw strength (legacy import / fresh mark)', () => {
    it('floors at Da\'if (Weak) right after import/marking, not "Not Memorized"', () => {
      expect(effectiveRank(true, 0, 0)).toBe(2)
    })

    it('stays floored at Weak short of the 3-year never-revised timeout', () => {
      expect(effectiveRank(true, 0, 1094)).toBe(2)
    })

    it('finally shows Not Memorized once truly unrevised for 3+ years', () => {
      expect(effectiveRank(true, 0, 1095)).toBe(0)
      expect(effectiveRank(true, 0, 100000)).toBe(0)
    })

    it('an un-anchored page (Infinity — no lastReviewDate at all yet) floors at Weak, never jumps straight to Not Memorized', () => {
      // Infinity >= NEVER_REVISED_TIMEOUT_DAYS numerically, but there's no real
      // elapsed time to judge yet — e.g. the instant between `setMemorized` and
      // the next load's backfill stamping a `lastReviewDate`. Must not trip the
      // 3-year escape hatch.
      expect(effectiveRank(true, 0, Infinity)).toBe(2)
    })
  })
})
