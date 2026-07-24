import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useStreak } from '@/composables/useStreak'
import { useLocalDay, stopLocalDay } from '@/composables/useLocalDay'
import { useToday } from '@/composables/useToday'
import { useDayLogStore } from '@/stores/dayLog'
import { useProgressStore } from '@/stores/progress'
import { usePlanStore } from '@/stores/plan'
import type { PlanConfig } from '@/core/storage/userData'

const TODAY = new Date('2026-07-15T09:00:00')

function daysAgo(n: number): string {
  const d = new Date(TODAY)
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  stopLocalDay()
  vi.useRealTimers()
})

/** Mark a date complete in the log, as `useToday` would on the day's last task. */
function completeDay(date: string): void {
  useDayLogStore().setCompleted(date, true)
}

describe('useStreak', () => {
  it('reports no streak on a fresh log', () => {
    const streak = useStreak({ today: ref(TODAY) })
    expect(streak.currentStreak.value).toBe(0)
    expect(streak.longestStreak.value).toBe(0)
    expect(streak.isTodayComplete.value).toBe(false)
    expect(streak.isAtRisk.value).toBe(false) // nothing to lose yet
  })

  it('extends the moment today is completed', () => {
    completeDay(daysAgo(2))
    completeDay(daysAgo(1))
    const streak = useStreak({ today: ref(TODAY) })
    expect(streak.currentStreak.value).toBe(2)
    expect(streak.isAtRisk.value).toBe(true) // alive, but today is outstanding

    completeDay(daysAgo(0))

    expect(streak.currentStreak.value).toBe(3) // reactive — no reload needed
    expect(streak.isTodayComplete.value).toBe(true)
    expect(streak.isAtRisk.value).toBe(false)
    expect(streak.isPersonalBest.value).toBe(true)
  })

  it('retains the longest streak after a gap breaks the current one', () => {
    for (const n of [10, 9, 8, 7, 6]) completeDay(daysAgo(n))
    // day 5 missed
    for (const n of [4, 3, 2]) completeDay(daysAgo(n))
    const streak = useStreak({ today: ref(TODAY) })

    expect(streak.currentStreak.value).toBe(0) // yesterday and today both missed
    expect(streak.longestStreak.value).toBe(5) // the record survives
    expect(streak.lastCompletedDate.value).toBe(daysAgo(2))
    expect(streak.isPersonalBest.value).toBe(false)
  })

  it('breaks at reload when a day was skipped', () => {
    completeDay(daysAgo(3))
    completeDay(daysAgo(2))
    // Nothing yesterday, nothing today — the run is over.
    const streak = useStreak({ today: ref(TODAY) })
    expect(streak.currentStreak.value).toBe(0)
    expect(streak.longestStreak.value).toBe(2)
  })

  it('shares the day log with useToday: finishing the day extends the streak', () => {
    const progress = useProgressStore()
    progress.setMemorized(1, true)
    const plan = usePlanStore()
    const config: PlanConfig = {
      scope: { kind: 'all-memorized' },
      newFront: null,
      pace: {
        newPagesPerDay: 0,
        revisionPagesPerDay: 5,
        weakPagesPerDay: 0,
        daysPerWeek: 7,
        offDays: [],
      },
      habits: [],
      startDate: daysAgo(0),
      createdAt: '2026-07-15T00:00:00.000Z',
    }
    plan.create(config)
    completeDay(daysAgo(1))

    const clock = ref(TODAY)
    const today = useToday({ today: clock })
    const streak = useStreak({ today: clock })
    expect(streak.currentStreak.value).toBe(1)

    today.complete('revision', 1) // the day's only task

    expect(today.allDone.value).toBe(true)
    expect(streak.currentStreak.value).toBe(2) // one action, both surfaces move
  })
})

describe('useStreak + useToday — local-midnight rollover', () => {
  it('a new day yields a fresh, unfinished task set and carries the streak', async () => {
    const progress = useProgressStore()
    progress.setMemorized(1, true)
    usePlanStore().create({
      scope: { kind: 'all-memorized' },
      newFront: null,
      pace: {
        newPagesPerDay: 0,
        revisionPagesPerDay: 5,
        weakPagesPerDay: 0,
        daysPerWeek: 7,
        offDays: [],
      },
      habits: [],
      startDate: daysAgo(0),
      createdAt: '2026-07-15T00:00:00.000Z',
    })

    const clock = ref(TODAY)
    const today = useToday({ today: clock })
    const streak = useStreak({ today: clock })

    today.complete('revision', 1)
    expect(today.allDone.value).toBe(true)
    expect(streak.currentStreak.value).toBe(1)

    // Midnight: the clock rolls to the 16th.
    clock.value = new Date('2026-07-16T00:00:30')

    expect(today.date.value).toBe('2026-07-16')
    expect(streak.currentStreak.value).toBe(1) // yesterday still carries it
    expect(streak.isTodayComplete.value).toBe(false)
    expect(streak.isAtRisk.value).toBe(true)
    // Page 1 is due again today (interval 1), and is not checked off.
    expect(today.revision.value).toEqual([1])
    expect(today.isDone('revision', 1)).toBe(false)
    expect(today.allDone.value).toBe(false)
    expect(today.completionPercentage.value).toBe(0)

    // ...and it can be completed again on its own day, paying out again.
    const before = progress.hasanah
    expect(today.complete('revision', 1)).toBe(true)
    expect(progress.hasanah).toBeGreaterThan(before)
    expect(streak.currentStreak.value).toBe(2)
    await nextTick()
  })
})

describe('useLocalDay', () => {
  it('rolls the shared clock over at local midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T23:59:50'))

    const clock = useLocalDay()
    expect(clock.value.getDate()).toBe(15)

    vi.advanceTimersByTime(11_000) // past midnight
    expect(clock.value.getDate()).toBe(16)
  })

  it('hands every caller the same clock, so surfaces cannot disagree on the day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T23:59:50'))
    expect(useLocalDay()).toBe(useLocalDay())
  })

  it('keeps rolling on subsequent days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T23:59:50'))
    const clock = useLocalDay()

    vi.advanceTimersByTime(11_000)
    expect(clock.value.getDate()).toBe(16)
    vi.advanceTimersByTime(24 * 60 * 60 * 1000) // the timer re-arms itself
    expect(clock.value.getDate()).toBe(17)
  })

  it('catches up on a rollover missed while the app was backgrounded', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T23:59:50'))
    const clock = useLocalDay()

    // A suspended webview: real time passes but the timer never fires.
    vi.setSystemTime(new Date('2026-07-16T08:00:00'))
    expect(clock.value.getDate()).toBe(15) // still stale
    document.dispatchEvent(new Event('visibilitychange'))
    expect(clock.value.getDate()).toBe(16) // foregrounding rescues it
  })

  it('does not churn the clock when the date has not changed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T09:00:00'))
    const clock = useLocalDay()
    const first = clock.value

    vi.setSystemTime(new Date('2026-07-15T17:00:00'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(clock.value).toBe(first) // same day → same object, no recompute cascade
  })
})
