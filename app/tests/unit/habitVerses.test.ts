import { describe, it, expect } from 'vitest'
import {
  TOTAL_VERSES,
  VERSES_PER_DAY,
  INITIAL_HABIT_VERSE_CURSOR,
  verseAtIndex,
  versesOfDay,
  advanceCursor,
  rollbackCursor,
} from '@/core/quran/habitVerses'

describe('verseAtIndex', () => {
  it('maps index 0 to 1:1 (the very first verse)', () => {
    expect(verseAtIndex(0)).toEqual({ surah: 1, ayah: 1 })
  })

  it('maps the last index of a surah to its last ayah, and the next index to the next surah', () => {
    // Al-Fatiha has 7 ayahs: indices 0..6 are 1:1..1:7, index 7 is 2:1.
    expect(verseAtIndex(6)).toEqual({ surah: 1, ayah: 7 })
    expect(verseAtIndex(7)).toEqual({ surah: 2, ayah: 1 })
  })

  it('wraps past the end of the Quran back to 1:1', () => {
    expect(verseAtIndex(TOTAL_VERSES)).toEqual({ surah: 1, ayah: 1 })
    expect(verseAtIndex(TOTAL_VERSES + 6)).toEqual({ surah: 1, ayah: 7 })
  })

  it('maps the final index to the last verse of surah 114', () => {
    expect(verseAtIndex(TOTAL_VERSES - 1)).toEqual({ surah: 114, ayah: 6 })
  })
})

describe('versesOfDay', () => {
  it('starts the day at the cursor when it has not advanced today', () => {
    const cursor = { completedThrough: 7, lastAdvanceDate: '2026-07-20' }
    const verses = versesOfDay(cursor, '2026-07-21')
    expect(verses).toHaveLength(VERSES_PER_DAY)
    expect(verses[0]).toEqual({ surah: 2, ayah: 1 })
  })

  it('shows the window that was just completed today, not the next one', () => {
    // Cursor already advanced today from 0 -> 10; today's list should still be
    // verses 0..9 (1:1..2:3), not the next 10 the cursor now points at.
    const cursor = { completedThrough: 10, lastAdvanceDate: '2026-07-21' }
    const verses = versesOfDay(cursor, '2026-07-21')
    expect(verses[0]).toEqual({ surah: 1, ayah: 1 })
    expect(verses).toHaveLength(VERSES_PER_DAY)
  })

  it('starts fresh from the never-advanced initial cursor', () => {
    expect(versesOfDay(INITIAL_HABIT_VERSE_CURSOR, '2026-07-21')[0]).toEqual({ surah: 1, ayah: 1 })
  })
})

describe('advanceCursor / rollbackCursor', () => {
  it('advances by 10 and records the date', () => {
    const next = advanceCursor(INITIAL_HABIT_VERSE_CURSOR, '2026-07-21')
    expect(next).toEqual({ completedThrough: 10, lastAdvanceDate: '2026-07-21' })
  })

  it('a missed day leaves the cursor exactly where it was — no date-based catch-up', () => {
    // Advance once on day 1, then simply never touch it again; a later read for
    // day 3 (day 2 missed) must still start from the same un-advanced position.
    const afterDay1 = advanceCursor(INITIAL_HABIT_VERSE_CURSOR, '2026-07-20')
    const day3Verses = versesOfDay(afterDay1, '2026-07-22')
    expect(day3Verses[0]).toEqual(verseAtIndex(10))
  })

  it('rolling back the same day undoes the advance exactly', () => {
    const advanced = advanceCursor(INITIAL_HABIT_VERSE_CURSOR, '2026-07-21')
    expect(rollbackCursor(advanced, '2026-07-21')).toEqual(INITIAL_HABIT_VERSE_CURSOR)
  })

  it('rolling back a stale date (not today) is a no-op', () => {
    const advanced = advanceCursor(INITIAL_HABIT_VERSE_CURSOR, '2026-07-20')
    expect(rollbackCursor(advanced, '2026-07-21')).toEqual(advanced)
  })

  it('advancing past the end of the cycle wraps back to the start', () => {
    // completedThrough sits 4 verses from the end (TOTAL_VERSES - 4); advancing
    // by 10 must land 6 verses into the next cycle, not overflow past it.
    const nearEnd = { completedThrough: TOTAL_VERSES - 4, lastAdvanceDate: null }
    const next = advanceCursor(nearEnd, '2026-07-21')
    expect(next.completedThrough).toBe(6)
  })
})
