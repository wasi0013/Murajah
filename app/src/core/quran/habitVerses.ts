/**
 * The "recite 10 verses" habit builder — a cursor that cycles through all 6236
 * verses of the Quran, 10 a day, so the habit eventually reads the whole book.
 *
 * The cursor only ever moves on an explicit completion (the habit toggle in
 * Today). A missed day simply leaves it where it was — there is no date-based
 * catch-up or skip logic, which is what keeps "stayed at verse 20 because
 * yesterday was missed" true for free. `lastAdvanceDate` exists only so today's
 * assigned window stays the same 10 verses after completion (instead of jumping
 * to the next 10) and so an un-check the same day can roll the advance back.
 */
import { AYAH_COUNTS } from './surahMeta'

export const TOTAL_VERSES = 6236
export const VERSES_PER_DAY = 10

export interface AbsoluteVerseRef {
  surah: number
  ayah: number
}

export interface HabitVerseCursor {
  /** How many verses into the cycle have been completed (0..TOTAL_VERSES-1). */
  completedThrough: number
  /** Local date the cursor last advanced, or null if never. */
  lastAdvanceDate: string | null
}

export const INITIAL_HABIT_VERSE_CURSOR: HabitVerseCursor = {
  completedThrough: 0,
  lastAdvanceDate: null,
}

/** The {surah, ayah} at an absolute 0-based index into the 6236-verse cycle (wraps). */
export function verseAtIndex(index: number): AbsoluteVerseRef {
  let remaining = ((index % TOTAL_VERSES) + TOTAL_VERSES) % TOTAL_VERSES
  for (let s = 0; s < AYAH_COUNTS.length; s++) {
    const count = AYAH_COUNTS[s]
    if (remaining < count) return { surah: s + 1, ayah: remaining + 1 }
    remaining -= count
  }
  // Unreachable — AYAH_COUNTS sums to TOTAL_VERSES — but keeps the function total.
  return { surah: 114, ayah: AYAH_COUNTS[113] }
}

/**
 * The 10 verses assigned for `date`. Frozen for the day: if the cursor already
 * advanced today, this is the window that *was* completed today, not the next
 * one — so the list on screen doesn't jump the moment the habit is checked off.
 */
export function versesOfDay(cursor: HabitVerseCursor, date: string): AbsoluteVerseRef[] {
  const start =
    cursor.lastAdvanceDate === date ? cursor.completedThrough - VERSES_PER_DAY : cursor.completedThrough
  return Array.from({ length: VERSES_PER_DAY }, (_, i) => verseAtIndex(start + i))
}

/** Advance the cursor by a day's 10 verses (wraps past the end of the Quran). */
export function advanceCursor(cursor: HabitVerseCursor, date: string): HabitVerseCursor {
  return {
    completedThrough: (cursor.completedThrough + VERSES_PER_DAY) % TOTAL_VERSES,
    lastAdvanceDate: date,
  }
}

/** Undo today's advance (a no-op if the cursor didn't advance today). */
export function rollbackCursor(cursor: HabitVerseCursor, date: string): HabitVerseCursor {
  if (cursor.lastAdvanceDate !== date) return cursor
  return {
    completedThrough: (cursor.completedThrough - VERSES_PER_DAY + TOTAL_VERSES) % TOTAL_VERSES,
    lastAdvanceDate: null,
  }
}
