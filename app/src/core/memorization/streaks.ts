/**
 * Streaks & standing habits (Phase 5).
 *
 * The completion-streak math from the legacy `dailyGoalsManager.js`, retargeted to
 * the unified {@link DayLog}: each day already stores whether it was `completed`, so
 * the streak reads that flag directly instead of re-deriving it from a per-day task
 * map. The legacy rotation/task-init/merge glue is dropped (superseded by the smart
 * Today queue); the standing-habit definitions survive as a small typed catalog.
 */
import type { DayLog, DayRecord } from '@/core/storage/userData'

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
 * The current streak counts consecutive completed days back from **today** if today
 * is complete, else from **yesterday** — so a streak stays alive through a day whose
 * work hasn't been done *yet*, and only breaks once that day is missed outright.
 *
 * This corrects the legacy rule, which anchored on yesterday alone and so reported 0
 * whenever a streak *started* today: finishing your first day showed "0 day streak"
 * until a second day carried it. Today's completion now counts the moment it lands.
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

  // Today anchors the streak when it's done; otherwise yesterday still can — the day
  // only breaks it once it's over. Neither → the run has already lapsed.
  let anchor = completedDates.has(todayStr)
    ? todayStr
    : completedDates.has(yesterdayStr)
      ? yesterdayStr
      : null
  if (!anchor) return { currentStreak: 0, longestStreak, lastCompletedDate }

  let currentStreak = 0
  while (completedDates.has(anchor)) {
    currentStreak += 1
    anchor = addDays(anchor, -1)
  }
  return { currentStreak, longestStreak, lastCompletedDate }
}

/** How a past day reads on the history calendar. */
export type DayState = 'completed' | 'partial' | 'none'

export interface HistoryDay {
  date: string
  state: DayState
  isToday: boolean
}

/** Did anything at all get recorded that day? */
function hasWork(r: DayRecord): boolean {
  return (
    r.newMemorization.length + r.revision.length + r.weak.length + r.habits.length > 0
  )
}

/**
 * The last `days` calendar days ending today, oldest first — every day present, so
 * the caller can render a gapless grid without reasoning about the log's holes.
 *
 * Three states rather than completed/missed: a day the user worked but didn't finish
 * is not the same as a day they never opened, and the log can tell them apart (a
 * record only exists once something is recorded). Both break a streak; only one is
 * the user's fault, and saying "missed" to someone who did four of five pages is a
 * lie the data doesn't support.
 */
export function buildHistory(log: DayLog, days = 90, today: Date = new Date()): HistoryDay[] {
  const todayStr = fmt(today)
  const out: HistoryDay[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(todayStr, -i)
    const rec = log.get(date)
    const state: DayState = rec?.completed ? 'completed' : rec && hasWork(rec) ? 'partial' : 'none'
    out.push({ date, state, isToday: date === todayStr })
  }
  return out
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
