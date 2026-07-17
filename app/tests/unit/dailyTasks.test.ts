import { describe, it, expect } from 'vitest'
import { generateDailyTasks, MAX_BACKLOG_BEFORE_PAUSE } from '@/core/memorization/dailyTasks'
import { handleMissedDays } from '@/core/memorization/reviewScheduler'
import type { ReviewSchedule, PlanPace } from '@/core/storage/userData'

// 2026-07-15 is a Wednesday (getDay() === 3).
const TODAY = new Date('2026-07-15T09:00:00')
const TODAY_STR = '2026-07-15'

const pace = (over: Partial<PlanPace> = {}): PlanPace => ({
  newPagesPerDay: 1,
  revisionPagesPerDay: 5,
  weakPagesPerDay: 2,
  daysPerWeek: 7,
  offDays: [],
  ...over,
})

/** A schedule due on `nextReviewDate`. */
const sched = (nextReviewDate: string, over: Partial<ReviewSchedule> = {}): ReviewSchedule => ({
  lastReviewDate: '2026-07-01',
  reviewCount: 3,
  interval: 3,
  easeFactor: 2.5,
  consecutiveCorrect: 2,
  nextReviewDate,
  ...over,
})

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

describe('generateDailyTasks — revision queue', () => {
  it('selects due pages within scope, most overdue first, capped at the budget', () => {
    const scopePages = range(1, 10)
    const reviewData = new Map<number, ReviewSchedule>([
      [1, sched('2026-07-14')], // due (1 day over)
      [2, sched('2026-07-10')], // due (most overdue)
      [3, sched(TODAY_STR)], // due today
      [4, sched('2026-07-20')], // not due
    ])
    const tasks = generateDailyTasks({
      scopePages,
      memorized: new Set(scopePages),
      reviewData,
      pace: pace({ revisionPagesPerDay: 2, weakPagesPerDay: 0 }),
      today: TODAY,
    })
    expect(tasks.revision).toEqual([2, 1]) // most overdue first, budget respected
    expect(tasks.metadata.backlogSize).toBe(3)
    expect(tasks.revision).not.toContain(4)
  })

  it('excludes pages outside the scope and pages that are not memorized', () => {
    const reviewData = new Map<number, ReviewSchedule>([
      [1, sched('2026-07-10')],
      [50, sched('2026-07-10')], // due but out of scope
      [2, sched('2026-07-10')], // due but not memorized
    ])
    const tasks = generateDailyTasks({
      scopePages: [1, 2],
      memorized: new Set([1]),
      reviewData,
      pace: pace({ weakPagesPerDay: 0 }),
      today: TODAY,
    })
    expect(tasks.revision).toEqual([1])
  })

  it('fills spare budget with never-reviewed pages', () => {
    const scopePages = range(1, 10)
    const reviewData = new Map<number, ReviewSchedule>([[1, sched('2026-07-10')]])
    const tasks = generateDailyTasks({
      scopePages,
      memorized: new Set(scopePages),
      reviewData,
      pace: pace({ revisionPagesPerDay: 4, weakPagesPerDay: 0 }),
      today: TODAY,
    })
    // the one due page, then never-reviewed pages in mushaf order
    expect(tasks.revision).toEqual([1, 2, 3, 4])
  })

  it('ranks equally-overdue pages by weakness', () => {
    const scopePages = [1, 2]
    const reviewData = new Map<number, ReviewSchedule>([
      [1, sched('2026-07-10', { reviewCount: 10 })],
      [2, sched('2026-07-10', { reviewCount: 0 })], // fewer reviews → weaker
    ])
    const tasks = generateDailyTasks({
      scopePages,
      memorized: new Set(scopePages),
      reviewData,
      strength: new Map([[1, 10]]), // page 1 has revision quality behind it
      pace: pace({ revisionPagesPerDay: 2, weakPagesPerDay: 0 }),
      today: TODAY,
    })
    expect(tasks.revision).toEqual([2, 1])
  })

  it('is graceful with an empty scope', () => {
    const tasks = generateDailyTasks({ scopePages: [], memorized: new Set(), pace: pace(), today: TODAY })
    expect(tasks).toMatchObject({ newMemorization: [], revision: [], weakReinforcement: [] })
    expect(tasks.metadata).toMatchObject({ date: TODAY_STR, backlogSize: 0, totalPages: 0 })
  })
})

describe('generateDailyTasks — new memorization', () => {
  it('takes the next unmemorized pages from the front', () => {
    const tasks = generateDailyTasks({
      scopePages: [],
      memorized: new Set([22, 23]),
      newFront: { layout: 'qpc', nextPage: 22 },
      pace: pace({ newPagesPerDay: 2 }),
      today: TODAY,
    })
    expect(tasks.newMemorization).toEqual([24, 25]) // 22/23 already memorized
  })

  it('off day rests new memorization only — revision still runs', () => {
    const scopePages = [1, 2]
    const tasks = generateDailyTasks({
      scopePages,
      memorized: new Set(scopePages),
      reviewData: new Map([[1, sched('2026-07-10')]]),
      newFront: { layout: 'qpc', nextPage: 100 },
      pace: pace({ offDays: [3] }), // Wednesday — today
      today: TODAY,
    })
    expect(tasks.metadata.isOffDay).toBe(true)
    expect(tasks.metadata.pausedNewMemorization).toBe(true)
    expect(tasks.newMemorization).toEqual([])
    expect(tasks.revision).toContain(1)
  })

  it('pauses new memorization when the backlog is too deep', () => {
    const scopePages = range(1, 20)
    const reviewData = new Map<number, ReviewSchedule>(
      scopePages.map((p) => [p, sched('2026-07-10')] as const),
    )
    const tasks = generateDailyTasks({
      scopePages,
      memorized: new Set(scopePages),
      reviewData,
      newFront: { layout: 'qpc', nextPage: 100 },
      pace: pace(),
      today: TODAY,
    })
    expect(tasks.metadata.backlogSize).toBeGreaterThan(MAX_BACKLOG_BEFORE_PAUSE)
    expect(tasks.metadata.pausedNewMemorization).toBe(true)
    expect(tasks.newMemorization).toEqual([])
  })

  it('no front, or a zero budget, means no new memorization (but not "paused")', () => {
    const base = { scopePages: [], memorized: new Set<number>(), today: TODAY }
    expect(generateDailyTasks({ ...base, newFront: null, pace: pace() }).newMemorization).toEqual([])
    const zero = generateDailyTasks({
      ...base,
      newFront: { layout: 'qpc', nextPage: 5 },
      pace: pace({ newPagesPerDay: 0 }),
    })
    expect(zero.newMemorization).toEqual([])
    expect(zero.metadata.pausedNewMemorization).toBe(false)
  })
})

describe('generateDailyTasks — weak reinforcement', () => {
  it('resurfaces a weak page that is not due yet, without double-scheduling', () => {
    const scopePages = range(1, 6)
    const healthy = (nextReviewDate: string, lastReviewDate: string) =>
      sched(nextReviewDate, { lastReviewDate, reviewCount: 10 })
    const reviewData = new Map<number, ReviewSchedule>([
      [1, healthy('2026-07-10', '2026-07-10')], // due
      [2, healthy('2026-07-11', '2026-07-10')], // due
      [3, healthy('2026-07-30', TODAY_STR)], // strong, not due
      [4, healthy('2026-07-30', TODAY_STR)],
      [5, healthy('2026-07-30', TODAY_STR)],
      // not due, but stale + never cleanly revised + mistake-ridden
      [6, sched('2026-07-30', { lastReviewDate: '2026-05-01', reviewCount: 0 })],
    ])
    const tasks = generateDailyTasks({
      scopePages,
      memorized: new Set(scopePages),
      reviewData,
      strength: new Map(range(1, 5).map((p) => [p, 10])),
      quizScores: new Map([...range(1, 5).map((p) => [p, 1] as const), [6, 0.2] as const]),
      mistakes: new Map([[6, new Set(range(1, 40))]]),
      pace: pace({ revisionPagesPerDay: 2, weakPagesPerDay: 2 }),
      today: TODAY,
    })
    expect(tasks.revision).toEqual([1, 2]) // the due pages
    // Page 6 isn't due, so only weak reinforcement can surface it — and the strong
    // pages are left alone even though there's budget for two.
    expect(tasks.weakReinforcement).toEqual([6])
    for (const p of tasks.weakReinforcement) expect(tasks.revision).not.toContain(p)
  })

  it('leaves strong pages alone', () => {
    const scopePages = [1]
    const tasks = generateDailyTasks({
      scopePages,
      memorized: new Set(scopePages),
      // reviewed today, plenty of clean revisions, perfect quiz → not weak
      reviewData: new Map([[1, sched('2026-07-25', { lastReviewDate: TODAY_STR, reviewCount: 10 })]]),
      strength: new Map([[1, 10]]),
      quizScores: new Map([[1, 1]]),
      pace: pace({ weakPagesPerDay: 2 }),
      today: TODAY,
    })
    expect(tasks.weakReinforcement).toEqual([])
  })
})

describe('handleMissedDays', () => {
  const overdue = () =>
    new Map<number, ReviewSchedule>([
      [1, sched('2026-07-10')],
      [2, sched('2026-07-11')],
      [3, sched('2026-07-12')],
      [4, sched('2026-07-13')],
    ])

  it('no last-active date, or no elapsed days, is a no-op', () => {
    expect(handleMissedDays(overdue(), null, TODAY).action).toBe('none')
    expect(handleMissedDays(overdue(), TODAY_STR, TODAY)).toMatchObject({ action: 'none', missedDays: 0 })
  })

  it('1 missed day → light reschedule across 2 days', () => {
    const r = handleMissedDays(overdue(), '2026-07-14', TODAY)
    expect(r).toMatchObject({ action: 'light_reschedule', missedDays: 1 })
    // 4 overdue pages over 2 days → 2 today, 2 tomorrow; all reset to interval 1
    expect(r.reviewData.get(1)!.nextReviewDate).toBe(TODAY_STR)
    expect(r.reviewData.get(4)!.nextReviewDate).toBe('2026-07-16')
    expect(r.reviewData.get(1)!.interval).toBe(1)
  })

  it('2–4 missed days → medium reschedule + eased new memorization', () => {
    const r = handleMissedDays(overdue(), '2026-07-12', TODAY)
    expect(r).toMatchObject({
      action: 'medium_reschedule',
      missedDays: 3,
      changes: { reduceNewMemorizationDays: 3, newMemorizationMultiplier: 0.5 },
    })
    expect(r.reviewData.get(1)!.nextReviewDate).toBe(TODAY_STR)
  })

  it('5–13 missed days → heavy reset of every interval, new memorization paused', () => {
    const r = handleMissedDays(overdue(), '2026-07-07', TODAY)
    expect(r).toMatchObject({ action: 'heavy_reschedule', missedDays: 8, changes: { pauseNewMemorizationDays: 4 } })
    for (const s of r.reviewData.values()) {
      expect(s.nextReviewDate).toBe(TODAY_STR)
      expect(s.interval).toBe(1)
      expect(s.consecutiveCorrect).toBe(0)
      expect(s.easeFactor).toBe(2.5) // ease survives — it reflects long-term learning
    }
  })

  it('14+ missed days → the plan needs a restart, schedules untouched', () => {
    const r = handleMissedDays(overdue(), '2026-06-20', TODAY)
    expect(r).toMatchObject({ action: 'plan_reset_needed', changes: { needsRestart: true } })
    expect(r.reviewData.get(1)!.nextReviewDate).toBe('2026-07-10')
  })

  it('never mutates the input map', () => {
    const input = overdue()
    handleMissedDays(input, '2026-07-07', TODAY)
    expect(input.get(1)!.nextReviewDate).toBe('2026-07-10')
  })
})
