import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createLevelEditController } from '@/core/memorization/levelEditController'
import type { StrengthRank } from '@/core/memorization/strengthBands'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

/** A tiny in-memory "store" driven exactly the way the real progress store would be. */
function makeHarness(cooldownMs = 60_000) {
  const strength = new Map<number, number>()
  const stamps: { page: number; date: string }[] = []
  const controller = createLevelEditController({
    currentStrength: (page) => strength.get(page) ?? 0,
    writeBandFloor: (page, rank) => strength.set(page, floorOf(rank)),
    restoreStrength: (page, value) => strength.set(page, value),
    stamp: (page, date) => stamps.push({ page, date }),
    today: () => '2026-08-23',
    cooldownMs,
  })
  return { strength, stamps, controller }
}

// Mirrors STRENGTH_BANDS' lower bounds (kept independent of the real table on
// purpose, so this test would catch a drift between the two).
function floorOf(rank: StrengthRank): number {
  return [0, 1, 40, 60, 75, 90, 98][rank]
}

describe('createLevelEditController', () => {
  describe('strength write', () => {
    it('writes the band floor for a genuine change', () => {
      const { strength, controller } = makeHarness()
      controller.pickLevel(5, 4) // Qawiy
      expect(strength.get(5)).toBe(75)
    })

    it('restores the EXACT prior raw strength when a pick nets back to the starting band, instead of flooring it', () => {
      const { strength, controller } = makeHarness()
      strength.set(5, 55) // real revision history within Da'if (40-59), not the floor
      controller.pickLevel(5, 4) // mistakenly pick Qawiy -> floors to 75
      expect(strength.get(5)).toBe(75)
      controller.pickLevel(5, 2) // catch the mistake, pick Da'if again
      expect(strength.get(5)).toBe(55) // restored exactly, not floored to 40
    })

    it('restores exactly across multiple intermediate picks within the same run', () => {
      const { strength, controller } = makeHarness()
      strength.set(5, 150) // deep into Mutqan, well above its 98 floor
      controller.pickLevel(5, 5) // Rasikh
      controller.pickLevel(5, 3) // Mutawassit
      controller.pickLevel(5, 6) // back to Mutqan (the run's starting band)
      expect(strength.get(5)).toBe(150) // restored, not floored to 98
    })

    it('starts a fresh baseline for a new run after cancel()', () => {
      const { strength, controller } = makeHarness()
      strength.set(5, 55)
      controller.pickLevel(5, 4) // -> 75
      controller.cancel(5) // e.g. the user recorded a revision or edited the date
      controller.pickLevel(5, 2) // NOT "back to the old run's baseline" — a fresh run starting from 75
      expect(strength.get(5)).toBe(40) // floors normally; 75 is not remembered as sacred anymore
    })
  })

  describe('decay-clock stamp', () => {
    it('stamps after the cooldown elapses on a genuine, still-standing change', () => {
      const { strength, stamps, controller } = makeHarness()
      strength.set(5, 55)
      controller.pickLevel(5, 4)
      vi.advanceTimersByTime(59_999)
      expect(stamps).toEqual([])
      vi.advanceTimersByTime(1)
      expect(stamps).toEqual([{ page: 5, date: '2026-08-23' }])
    })

    it('does NOT stamp when the pick nets back to the starting band before the cooldown fires', () => {
      const { stamps, controller } = makeHarness()
      controller.pickLevel(5, 4)
      vi.advanceTimersByTime(10_000)
      controller.pickLevel(5, 0) // page starts at rank 0 (no strength yet)
      vi.advanceTimersByTime(60_000)
      expect(stamps).toEqual([])
    })

    it('restarts the cooldown on every edit (debounce, not throttle)', () => {
      const { stamps, controller } = makeHarness()
      controller.pickLevel(5, 3)
      vi.advanceTimersByTime(50_000)
      controller.pickLevel(5, 4)
      vi.advanceTimersByTime(50_000)
      expect(stamps).toEqual([])
      vi.advanceTimersByTime(10_000)
      expect(stamps).toEqual([{ page: 5, date: '2026-08-23' }])
    })

    it('cancel() drops a pending stamp entirely', () => {
      const { stamps, controller } = makeHarness()
      controller.pickLevel(5, 4)
      controller.cancel(5)
      vi.advanceTimersByTime(60_000)
      expect(stamps).toEqual([])
    })

    it('tracks pages independently', () => {
      const { stamps, controller } = makeHarness()
      controller.pickLevel(1, 4)
      vi.advanceTimersByTime(30_000)
      controller.pickLevel(2, 5)
      vi.advanceTimersByTime(30_000) // page 1 at 60s, page 2 at 30s
      expect(stamps).toEqual([{ page: 1, date: '2026-08-23' }])
      vi.advanceTimersByTime(30_000)
      expect(stamps).toEqual([
        { page: 1, date: '2026-08-23' },
        { page: 2, date: '2026-08-23' },
      ])
    })

    it('cancelAll() clears every pending page', () => {
      const { stamps, controller } = makeHarness()
      controller.pickLevel(1, 4)
      controller.pickLevel(2, 5)
      controller.cancelAll()
      vi.advanceTimersByTime(60_000)
      expect(stamps).toEqual([])
    })
  })
})
