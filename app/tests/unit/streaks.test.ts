import { describe, it, expect } from 'vitest'
import {
  calculateStreak,
  getTodayDate,
  isNewDay,
  getHabit,
  HABIT_CATALOG,
} from '@/core/memorization/streaks'
import type { DayLog, DayRecord } from '@/core/storage/userData'

const TODAY = new Date('2026-07-15T09:00:00')

/** `YYYY-MM-DD` for N days before TODAY. */
function daysAgo(n: number): string {
  const d = new Date(TODAY)
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function rec(date: string, completed: boolean): DayRecord {
  return { date, completed, newMemorization: [], revision: [], weak: [], habits: [] }
}

/** Build a DayLog from [date, completed] pairs. */
function log(...days: [string, boolean][]): DayLog {
  return new Map(days.map(([d, c]) => [d, rec(d, c)]))
}

describe('streaks — calculateStreak', () => {
  it('returns zero for an empty log', () => {
    expect(calculateStreak(new Map(), TODAY)).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      lastCompletedDate: null,
    })
  })

  it('breaks once a day goes by unfinished', () => {
    const l = log([daysAgo(2), true], [daysAgo(1), false])
    expect(calculateStreak(l, TODAY).currentStreak).toBe(0)
  })

  it('counts a streak that starts today — day one reads as 1, not 0', () => {
    const l = log([daysAgo(0), true])
    expect(calculateStreak(l, TODAY)).toEqual({
      currentStreak: 1,
      longestStreak: 1,
      lastCompletedDate: daysAgo(0),
    })
  })

  it('a completion today revives the count after a lapse', () => {
    // Yesterday was missed, so the old run is gone — but today starts a new one.
    const l = log([daysAgo(3), true], [daysAgo(2), true], [daysAgo(1), false], [daysAgo(0), true])
    const r = calculateStreak(l, TODAY)
    expect(r.currentStreak).toBe(1)
    expect(r.longestStreak).toBe(2)
  })

  it('keeps the streak alive on a day whose work is still outstanding', () => {
    const l = log([daysAgo(2), true], [daysAgo(1), true], [daysAgo(0), false])
    expect(calculateStreak(l, TODAY).currentStreak).toBe(2) // today can still be saved
  })

  it('counts consecutive completed days ending yesterday', () => {
    const l = log([daysAgo(3), true], [daysAgo(2), true], [daysAgo(1), true])
    expect(calculateStreak(l, TODAY).currentStreak).toBe(3)
  })

  it('extends through today when today is complete', () => {
    const l = log([daysAgo(2), true], [daysAgo(1), true], [daysAgo(0), true])
    expect(calculateStreak(l, TODAY).currentStreak).toBe(3)
  })

  it('tracks the longest streak separately across a gap', () => {
    const l = log(
      [daysAgo(10), true],
      [daysAgo(9), true],
      [daysAgo(8), true],
      [daysAgo(7), true],
      // gap at day 6
      [daysAgo(4), true],
      [daysAgo(3), true],
      [daysAgo(2), true],
      [daysAgo(1), true],
    )
    const r = calculateStreak(l, TODAY)
    expect(r.currentStreak).toBe(4)
    expect(r.longestStreak).toBe(4)
    expect(r.lastCompletedDate).toBe(daysAgo(1))
  })
})

describe('streaks — date helpers', () => {
  it('formats today and detects a new day', () => {
    expect(getTodayDate(TODAY)).toBe('2026-07-15')
    expect(isNewDay(null, TODAY)).toBe(true)
    expect(isNewDay('2026-07-14', TODAY)).toBe(true)
    expect(isNewDay('2026-07-15', TODAY)).toBe(false)
  })
})

describe('streaks — habit catalog', () => {
  it('exposes standing habits with stable ids', () => {
    expect(getHabit('recite-ayahs')?.name).toBe('Recite 10 verses')
    expect(getHabit('quick-test')?.wiresTo).toBe('quiz')
    expect(getHabit('nope')).toBeUndefined()
    expect(HABIT_CATALOG.every((h) => h.id && h.name && h.description)).toBe(true)
  })
})
