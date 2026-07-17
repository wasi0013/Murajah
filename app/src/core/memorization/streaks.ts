/**
 * Streaks & standing habits (Phase 5).
 *
 * The completion-streak math from the legacy `dailyGoalsManager.js`, retargeted to
 * the unified {@link DayLog}: each day already stores whether it was `completed`, so
 * the streak reads that flag directly instead of re-deriving it from a per-day task
 * map. The legacy rotation/task-init/merge glue is dropped (superseded by the smart
 * Today queue); the standing-habit definitions survive as a small typed catalog.
 */
import type { DayLog } from '@/core/storage/userData'

/** Local calendar date as `YYYY-MM-DD`. */
function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Shift a `YYYY-MM-DD` string by `delta` days (local midnight anchored). */
function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return fmt(d)
}

/** Today's local date as `YYYY-MM-DD`. */
export function getTodayDate(today: Date = new Date()): string {
  return fmt(today)
}

/** Whether `lastDate` (a `YYYY-MM-DD`) is before today — i.e. a rollover is due. */
export function isNewDay(lastDate: string | null | undefined, today: Date = new Date()): boolean {
  if (!lastDate) return true
  return getTodayDate(today) !== lastDate
}

export interface StreakResult {
  currentStreak: number
  longestStreak: number
  lastCompletedDate: string | null
}

/** Longest run of consecutive completed calendar dates in the set. */
function computeLongestStreak(completedDates: Set<string>): number {
  if (completedDates.size === 0) return 0
  const dates = [...completedDates].sort((a, b) => a.localeCompare(b))
  let longest = 0
  let current = 0
  let prev: string | null = null
  for (const dateStr of dates) {
    if (!prev || dateStr === addDays(prev, 1)) current += 1
    else current = 1
    prev = dateStr
    longest = Math.max(longest, current)
  }
  return longest
}

/**
 * Current + longest completion streak from the day log, anchored at local midnight.
 *
 * The current streak counts consecutive completed days ending at **today** (if
 * today is complete) or **yesterday**. Preserving the legacy product rule: if
 * yesterday is not complete the current streak is 0 — a brand-new completion today
 * doesn't count until it's carried by the previous day. (Revisit for the Today UX
 * in 5.3.2 if a fresh day-1 should read as `1`.)
 */
export function calculateStreak(log: DayLog, today: Date = new Date()): StreakResult {
  const completedDates = new Set<string>()
  let lastCompletedDate: string | null = null
  for (const rec of [...log.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    if (rec.completed) {
      completedDates.add(rec.date)
      lastCompletedDate = rec.date
    }
  }
  if (completedDates.size === 0) {
    return { currentStreak: 0, longestStreak: 0, lastCompletedDate: null }
  }

  const todayStr = fmt(today)
  const yesterdayStr = addDays(todayStr, -1)
  const longestStreak = computeLongestStreak(completedDates)

  if (!completedDates.has(yesterdayStr)) {
    return { currentStreak: 0, longestStreak, lastCompletedDate }
  }

  let anchor = completedDates.has(todayStr) ? todayStr : yesterdayStr
  let currentStreak = 0
  while (completedDates.has(anchor)) {
    currentStreak += 1
    anchor = addDays(anchor, -1)
  }
  return { currentStreak, longestStreak, lastCompletedDate }
}

/**
 * A standing-habit task the user can enable alongside the adaptive plan. `wiresTo`
 * marks a habit whose full behaviour lands in a later phase (until then it's a
 * manual check): `quiz` → Phase 6, `audio` → Phase 7.
 */
export interface HabitDef {
  id: string
  name: string
  description: string
  wiresTo?: 'quiz' | 'audio'
}

/** The available standing habits (opt-in via the plan's `habits` list). */
export const HABIT_CATALOG: readonly HabitDef[] = [
  {
    id: 'recite-ayahs',
    name: 'Recite 10 verses',
    description: 'Recite 10 ayahs from the Quran.',
  },
  {
    id: 'quick-test',
    name: 'Do a quick test',
    description: 'Recite a random memorized page from memory and check for mistakes.',
    wiresTo: 'quiz',
  },
] as const

/** Look up a habit definition by id. */
export function getHabit(id: string): HabitDef | undefined {
  return HABIT_CATALOG.find((h) => h.id === id)
}
