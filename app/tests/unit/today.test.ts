import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useToday } from '@/composables/useToday'
import { useProgressStore } from '@/stores/progress'
import { usePlanStore } from '@/stores/plan'
import { useDayLogStore } from '@/stores/dayLog'
import type { PlanConfig, PlanPace } from '@/core/storage/userData'

// 2026-07-15 is a Wednesday (getDay() === 3).
const TODAY = new Date('2026-07-15T09:00:00')
const TODAY_STR = '2026-07-15'

beforeEach(() => setActivePinia(createPinia()))

const pace = (over: Partial<PlanPace> = {}): PlanPace => ({
  newPagesPerDay: 1,
  revisionPagesPerDay: 5,
  weakPagesPerDay: 0,
  daysPerWeek: 7,
  offDays: [],
  ...over,
})

const planConfig = (over: Partial<PlanConfig> = {}): PlanConfig => ({
  scope: { kind: 'all-memorized' },
  newFront: null,
  pace: pace(),
  habits: [],
  startDate: TODAY_STR,
  createdAt: '2026-07-15T00:00:00.000Z',
  ...over,
})

/** Seed a plan + memorized pages, and return the Today view-model. */
function setup(memorized: number[] = [1, 2], config: Partial<PlanConfig> = {}) {
  const progress = useProgressStore()
  for (const p of memorized) progress.setMemorized(p, true)
  const plan = usePlanStore()
  plan.create(planConfig(config))
  return { today: useToday({ today: ref(TODAY) }), progress, plan, dayLog: useDayLogStore() }
}

describe('useToday — task derivation', () => {
  it('queues never-reviewed memorized pages for revision', () => {
    const { today } = setup([1, 2, 3])
    expect(today.hasPlan.value).toBe(true)
    expect(today.revision.value).toEqual([1, 2, 3])
    expect(today.date.value).toBe(TODAY_STR)
    expect(today.totalTasks.value).toBe(3)
    expect(today.completionPercentage.value).toBe(0)
    expect(today.allDone.value).toBe(false)
  })

  it('no plan → an empty, graceful state', () => {
    const today = useToday({ today: ref(TODAY) })
    expect(today.hasPlan.value).toBe(false)
    expect(today.tasks.value).toBeNull()
    expect(today.revision.value).toEqual([])
    expect(today.newMemorization.value).toEqual([])
    expect(today.totalTasks.value).toBe(0)
    expect(today.allDone.value).toBe(false)
    expect(today.completionPercentage.value).toBe(0)
  })

  it('empty scope → nothing to do, but not "done"', () => {
    const { today } = setup([])
    expect(today.revision.value).toEqual([])
    expect(today.totalTasks.value).toBe(0)
    expect(today.allDone.value).toBe(false)
  })

  it('off day rests new memorization but keeps revision', () => {
    const { today } = setup([1, 2], {
      newFront: { layout: 'qpc', nextPage: 50 },
      pace: pace({ offDays: [3] }), // Wednesday — today
    })
    expect(today.isOffDay.value).toBe(true)
    expect(today.newMemorization.value).toEqual([])
    expect(today.revision.value).toEqual([1, 2])
  })

  it('surfaces the plan’s standing habits as tasks', () => {
    const { today } = setup([1], { habits: ['recite-ayahs', 'nope'] })
    expect(today.habits.value.map((h) => h.id)).toEqual(['recite-ayahs']) // unknown ids dropped
    expect(today.totalTasks.value).toBe(2) // 1 revision + 1 habit
  })
})

describe('useToday — completing a revision', () => {
  it('records the review: reward, strength and schedule advance in one write', () => {
    const { today, progress, dayLog } = setup([1, 2])
    const before = progress.hasanah

    expect(today.complete('revision', 1)).toBe(true)

    expect(today.isDone('revision', 1)).toBe(true)
    expect(progress.hasanah).toBeGreaterThan(before) // reward paid
    expect(progress.strengthOf(1)).toBe(1) // memorization strength up
    const schedule = progress.reviewData.get(1)!
    expect(schedule.lastReviewDate).toBe(TODAY_STR)
    expect(schedule.reviewCount).toBe(1)
    expect(schedule.consecutiveCorrect).toBe(1)
    expect(schedule.nextReviewDate).toBe('2026-07-16') // due again tomorrow (interval 1)
    expect(dayLog.get(TODAY_STR)!.revision).toEqual([1])
  })

  it('marking a mistake docks strength and re-queues the page sooner, without reward', () => {
    const { today, progress } = setup([1, 2])
    progress.bumpStrength(1, 3)
    const before = progress.hasanah

    today.markMistake('revision', 1)

    expect(progress.strengthOf(1)).toBe(2) // −1
    expect(progress.hasanah).toBe(before) // no reward for a shaky recall
    const schedule = progress.reviewData.get(1)!
    expect(schedule.interval).toBe(1) // reset → back tomorrow
    expect(schedule.consecutiveCorrect).toBe(0)
    expect(today.isDone('revision', 1)).toBe(true) // it was still revised today
  })

  it('completing twice never pays twice', () => {
    const { today, progress } = setup([1, 2])
    today.complete('revision', 1)
    const after = progress.hasanah
    expect(today.complete('revision', 1)).toBe(false)
    expect(progress.hasanah).toBe(after)
    expect(progress.reviewData.get(1)!.reviewCount).toBe(1)
  })

  it('a completed page stays in the day’s list instead of vanishing from it', () => {
    const { today } = setup([1, 2])
    today.complete('revision', 1)
    // Page 1 is no longer due (its schedule just moved), but it must stay on today's
    // list — checked off — rather than disappear and free budget for a replacement.
    expect(today.revision.value).toEqual([1, 2])
    expect(today.totalTasks.value).toBe(2)
    expect(today.isDone('revision', 1)).toBe(true)
  })
})

describe('useToday — new memorization', () => {
  it('marks the page memorized and walks the front forward', () => {
    const { today, progress, plan } = setup([1], {
      newFront: { layout: 'qpc', nextPage: 22 },
    })
    expect(today.newMemorization.value).toEqual([22])

    today.complete('newMemorization', 22)

    expect(progress.isMemorized(22)).toBe(true)
    expect(progress.reviewData.get(22)!.nextReviewDate).toBe('2026-07-16') // enters the cycle
    expect(plan.newFront).toEqual({ layout: 'qpc', nextPage: 23 })
  })

  it('skips pages already memorized when advancing the front', () => {
    const { today, plan } = setup([1, 23, 24], { newFront: { layout: 'qpc', nextPage: 22 } })
    today.complete('newMemorization', 22)
    expect(plan.newFront).toEqual({ layout: 'qpc', nextPage: 25 })
  })
})

describe('useToday — day completion + habits', () => {
  it('finishing every planned task marks the day complete in the log', () => {
    const { today, dayLog } = setup([1, 2])
    expect(today.totalTasks.value).toBe(2)

    today.complete('revision', 1)
    expect(today.completionPercentage.value).toBe(50)
    expect(dayLog.get(TODAY_STR)!.completed).toBe(false)

    today.complete('revision', 2)
    expect(today.allDone.value).toBe(true)
    expect(today.completionPercentage.value).toBe(100)
    expect(dayLog.get(TODAY_STR)!.completed).toBe(true) // this is what the streak reads
  })

  it('habits count toward the day and toggle independently', () => {
    const { today, dayLog } = setup([1], { habits: ['recite-ayahs'] })
    today.complete('revision', 1)
    expect(today.allDone.value).toBe(false) // habit still outstanding

    expect(today.toggleHabit('recite-ayahs')).toBe(true)
    expect(today.isHabitDone('recite-ayahs')).toBe(true)
    expect(today.allDone.value).toBe(true)
    expect(dayLog.get(TODAY_STR)!.habits).toEqual(['recite-ayahs'])

    today.toggleHabit('recite-ayahs')
    expect(today.isHabitDone('recite-ayahs')).toBe(false)
    expect(today.allDone.value).toBe(false)
  })
})
