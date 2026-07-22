import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  INITIAL_HABIT_VERSE_CURSOR,
  advanceCursor,
  rollbackCursor,
  versesOfDay,
  type AbsoluteVerseRef,
  type HabitVerseCursor,
} from '@/core/quran/habitVerses'

/**
 * The "recite 10 verses" habit builder's cursor (Today's `versesOfDay`). State
 * only — the cycling/window math lives in `core/quran/habitVerses`; persistence
 * in `useHabitVersesPersistence`. `advance`/`rollback` are called from
 * `useToday.toggleHabit`, in lockstep with the day log's habit checkbox.
 */
export const useHabitVersesStore = defineStore('habitVerses', () => {
  const completedThrough = ref(INITIAL_HABIT_VERSE_CURSOR.completedThrough)
  const lastAdvanceDate = ref<string | null>(INITIAL_HABIT_VERSE_CURSOR.lastAdvanceDate)

  function cursor(): HabitVerseCursor {
    return { completedThrough: completedThrough.value, lastAdvanceDate: lastAdvanceDate.value }
  }

  function apply(next: HabitVerseCursor): void {
    completedThrough.value = next.completedThrough
    lastAdvanceDate.value = next.lastAdvanceDate
  }

  /** Replace the whole cursor (hydrate). */
  function setAll(c: HabitVerseCursor): void {
    apply(c)
  }

  /** The 10 verses assigned for `date` (stable for the day — see `versesOfDay`). */
  function versesForDate(date: string): AbsoluteVerseRef[] {
    return versesOfDay(cursor(), date)
  }

  function advance(date: string): void {
    apply(advanceCursor(cursor(), date))
  }

  function rollback(date: string): void {
    apply(rollbackCursor(cursor(), date))
  }

  /** A plain (proxy-free) copy for persistence + change detection. */
  function snapshot(): HabitVerseCursor {
    return cursor()
  }

  return {
    completedThrough,
    lastAdvanceDate,
    versesForDate,
    advance,
    rollback,
    setAll,
    snapshot,
  }
})
