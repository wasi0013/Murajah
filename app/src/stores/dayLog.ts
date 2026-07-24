import { defineStore } from 'pinia'
import { reactive } from 'vue'
import type { DayLog, DayRecord } from '@/core/storage/userData'

/** The task sections a day's completion is recorded under. */
export type DaySection = 'newMemorization' | 'revision' | 'weak'

function emptyRecord(date: string): DayRecord {
  return { date, completed: false, newMemorization: [], revision: [], weak: [], habits: [] }
}

/**
 * The day log (Phase 5): date → what was actually finished that day. Feeds the
 * streak (`calculateStreak`), the history calendar (5.6), and Today's checked state
 * across reloads. Written by `useToday` as tasks are completed; persisted to the
 * `dayLog` key by `useDayLogPersistence`.
 */
export const useDayLogStore = defineStore('dayLog', () => {
  const byDate = reactive(new Map<string, DayRecord>())

  const get = (date: string): DayRecord | undefined => byDate.get(date)

  /** The record for a date, creating an empty one on demand. */
  function ensure(date: string): DayRecord {
    if (!byDate.has(date)) byDate.set(date, emptyRecord(date))
    return byDate.get(date)! // the reactive proxy, so mutations are tracked
  }

  const isPageDone = (date: string, section: DaySection, page: number): boolean =>
    byDate.get(date)?.[section].includes(page) ?? false

  const isHabitDone = (date: string, habitId: string): boolean =>
    byDate.get(date)?.habits.includes(habitId) ?? false

  /** Record (or clear) a page as finished in a section. Returns whether it changed. */
  function setPageDone(date: string, section: DaySection, page: number, done: boolean): boolean {
    const list = ensure(date)[section]
    const i = list.indexOf(page)
    if (done === (i !== -1)) return false
    if (done) list.push(page)
    else list.splice(i, 1)
    return true
  }

  /** Record (or clear) a standing habit as finished. Returns whether it changed. */
  function setHabitDone(date: string, habitId: string, done: boolean): boolean {
    const list = ensure(date).habits
    const i = list.indexOf(habitId)
    if (done === (i !== -1)) return false
    if (done) list.push(habitId)
    else list.splice(i, 1)
    return true
  }

  /** Flag whether every planned task for the day was finished (drives the streak). */
  function setCompleted(date: string, completed: boolean): void {
    ensure(date).completed = completed
  }

  /** Replace the whole log (hydrate / migration). */
  function setAll(log: DayLog): void {
    byDate.clear()
    for (const [date, r] of log) byDate.set(date, { ...r, date })
  }

  /** A plain (proxy-free) deep copy for persistence. */
  function snapshot(): DayLog {
    const copy = new Map<string, DayRecord>()
    for (const [date, r] of byDate) {
      copy.set(date, {
        date: r.date,
        completed: r.completed,
        newMemorization: [...r.newMemorization],
        revision: [...r.revision],
        weak: [...r.weak],
        habits: [...r.habits],
      })
    }
    return copy
  }

  return {
    byDate,
    get,
    ensure,
    isPageDone,
    isHabitDone,
    setPageDone,
    setHabitDone,
    setCompleted,
    setAll,
    snapshot,
  }
})
