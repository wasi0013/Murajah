import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useToday } from '@/composables/useToday'
import { useProgressStore } from '@/stores/progress'
import { usePlanStore } from '@/stores/plan'
import { useDayLogStore } from '@/stores/dayLog'
import { usePartialProgressStore } from '@/stores/partialProgress'
import { getPageHasanah } from '@/core/memorization/pageHasanah.js'
import type { PlanConfig, PlanPace } from '@/core/storage/userData'
import type { Word } from '@/core/data/types'

// 2026-07-15 is a Wednesday (getDay() === 3).
const TODAY = new Date('2026-07-15T09:00:00')
const TODAY_STR = '2026-07-15'

beforeEach(() => setActivePinia(createPinia()))

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

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
  revisionCursor: { lastPage: null, lastAdvanceDate: null },
  ...over,
})

/** Seed a plan + memorized pages, and return the Today view-model. */
function setup(memorized: number[] = [1, 2], config: Partial<PlanConfig> = {}) {
  const progress = useProgressStore()
  for (const p of memorized) progress.setMemorized(p, true)
  const plan = usePlanStore()
  plan.create(planConfig(config))
  return {
    today: useToday({ today: ref(TODAY) }),
    progress,
    plan,
    dayLog: useDayLogStore(),
    partialProgress: usePartialProgressStore(),
  }
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

describe('useToday — partial-page progress (Task 7)', () => {
  /** A tiny 2-ayah page fixture, matching preview-route.test.ts's style. */
  function word(ayah: number, wordIdx: number, id: number): Word {
    return {
      id,
      surah: '2',
      ayah: String(ayah),
      word: String(wordIdx),
      location: `2:${ayah}:${wordIdx}`,
      text: `w${ayah}.${wordIdx}`,
    }
  }
  const pageWords: Word[] = [word(1, 1, 1), word(1, 2, 2), word(2, 1, 3), word(2, 2, 4)]

  function setupFront() {
    return setup([], { newFront: { layout: 'qpc', nextPage: 22 }, pace: pace({ revisionPagesPerDay: 0 }) })
  }

  it('a partial mark touches the day without finishing the page', () => {
    const { today, dayLog, progress } = setupFront()
    expect(today.totalTasks.value).toBe(1) // newMemorization: [22] only

    today.markPartialProgress(22, 2, 1, pageWords) // ayah 1 only — not the whole page

    expect(today.isDone('newMemorization', 22)).toBe(false) // page not finished
    expect(dayLog.get(TODAY_STR)!.newMemorizationTouched).toEqual([22])
    expect(progress.isMemorized(22)).toBe(false)
  })

  it('a partial mark alone satisfies the day (any progress completes the streak)', () => {
    const { today } = setupFront()
    today.markPartialProgress(22, 2, 1, pageWords)
    expect(today.allDone.value).toBe(true)
    expect(today.completionPercentage.value).toBe(100)
  })

  it('marking every ayah on the page completes it exactly like a normal complete()', () => {
    const { today, progress, plan, partialProgress } = setupFront()
    today.markPartialProgress(22, 2, 1, pageWords)
    today.markPartialProgress(22, 2, 2, pageWords) // covers the rest of the page

    expect(progress.isMemorized(22)).toBe(true)
    expect(plan.newFront).toEqual({ layout: 'qpc', nextPage: 23 })
    expect(today.isDone('newMemorization', 22)).toBe(true)
    expect(partialProgress.page).toBeNull() // cleared once graduated
  })

  it('REGRESSION: a page finished mid-day via marking is rewarded exactly once — the isDone guard is never short-circuited by an earlier partial touch', () => {
    const { today, progress, plan } = setupFront()
    const hasanahBefore = progress.hasanah

    // Earlier in the day: a partial mark sets newMemorizationTouched, NOT isDone.
    today.markPartialProgress(22, 2, 1, pageWords)
    expect(today.isDone('newMemorization', 22)).toBe(false)

    // Later the same day: the rest of the page completes it.
    today.markPartialProgress(22, 2, 2, pageWords)

    // If the isDone guard had been short-circuited by the earlier partial
    // touch, complete() would have returned early and none of this would
    // have happened at all.
    expect(progress.hasanah).toBe(hasanahBefore + getPageHasanah(22)) // exactly once
    expect(progress.strengthOf(22)).toBe(1) // bumped exactly once
    expect(plan.newFront).toEqual({ layout: 'qpc', nextPage: 23 }) // advanced exactly once
    expect(progress.reviewData.get(22)).toBeDefined() // entered the review cycle
  })
})

describe('useToday — the revision rotation advances on full-chunk completion', () => {
  it('a partial chunk leaves the cursor untouched', () => {
    const { today, plan } = setup(range(1, 10), { pace: pace({ revisionPagesPerDay: 2 }) })
    expect(today.revision.value).toEqual([1, 2])

    today.complete('revision', 1)
    expect(plan.config!.revisionCursor).toEqual({ lastPage: null, lastAdvanceDate: null })
  })

  it('completing the whole chunk advances the cursor to its last page', () => {
    const { today, plan } = setup(range(1, 10), { pace: pace({ revisionPagesPerDay: 2 }) })

    today.complete('revision', 1)
    today.complete('revision', 2)

    expect(plan.config!.revisionCursor).toEqual({ lastPage: 2, lastAdvanceDate: TODAY_STR })
    // The list doesn't jump to the next chunk mid-session, once done.
    expect(today.revision.value).toEqual([1, 2])
  })

  it('a mistake still counts toward completing the chunk and advancing the cursor', () => {
    const { today, plan } = setup(range(1, 4), { pace: pace({ revisionPagesPerDay: 2 }) })

    today.markMistake('revision', 1)
    today.complete('revision', 2)

    expect(plan.config!.revisionCursor.lastPage).toBe(2)
  })

  it('tomorrow continues from the advanced cursor, wrapping at the end of the set', () => {
    const memorized = range(1, 4)
    const progress = useProgressStore()
    for (const p of memorized) progress.setMemorized(p, true)
    const plan = usePlanStore()
    plan.create(planConfig({ pace: pace({ revisionPagesPerDay: 2 }) }))
    const dayLog = useDayLogStore()

    const day1 = ref(TODAY)
    const today1 = useToday({ today: day1 })
    expect(today1.revision.value).toEqual([1, 2])
    today1.complete('revision', 1)
    today1.complete('revision', 2)

    // A new day: same stores, a fresh Today view-model (mirrors a reload).
    const day2 = ref(new Date('2026-07-16T09:00:00'))
    const today2 = useToday({ today: day2 })
    expect(today2.revision.value).toEqual([3, 4])
    today2.complete('revision', 3)
    today2.complete('revision', 4)

    // Wraps back to the start for the third day.
    const day3 = ref(new Date('2026-07-17T09:00:00'))
    const today3 = useToday({ today: day3 })
    expect(today3.revision.value).toEqual([1, 2])

    expect(dayLog).toBeTruthy() // keeps the store alive for the reload framing above
  })
})
