import { describe, it, expect } from 'vitest'
import { generateDailyTasks, MAX_STALE_DAYS_BEFORE_PAUSE } from '@/core/memorization/dailyTasks'
import { handleMissedDays } from '@/core/memorization/reviewScheduler'
import type { RevisionCursor } from '@/core/memorization/revisionCycle'
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

describe('generateDailyTasks — revision queue (the murajah rotation)', () => {
  it('starts a fresh cycle at the first scoped page, capped at the daily budget', () => {
    const scopePages = range(1, 10)
    const tasks = generateDailyTasks({
      scopePages,
      memorized: new Set(scopePages),
      pace: pace({ revisionPagesPerDay: 2, weakPagesPerDay: 0 }),
      today: TODAY,
    })
    expect(tasks.revision).toEqual([1, 2])
  })

  it('continues from the cursor the next day, in mushaf order', () => {
    const scopePages = range(1, 10)
    const revisionCursor: RevisionCursor = { lastPage: 2, lastAdvanceDate: '2026-07-14' }
    const tasks = generateDailyTasks({
      scopePages,
      memorized: new Set(scopePages),
      revisionCursor,
      pace: pace({ revisionPagesPerDay: 2, weakPagesPerDay: 0 }),
      today: TODAY,
    })
    expect(tasks.revision).toEqual([3, 4])
  })

  it('is completely blind to SM-2 due dates and weakness — that is reinforcement’s job', () => {
    const scopePages = range(1, 10)
    // Page 1 isn't "due" until next month and page 2 has never been reviewed —
    // under the old due-date model neither would qualify. The rotation doesn't care.
    const reviewData = new Map<number, ReviewSchedule>([[1, sched('2026-08-20')]])
    const tasks = generateDailyTasks({
      scopePages,
      memorized: new Set(scopePages),
      reviewData,
      pace: pace({ revisionPagesPerDay: 2, weakPagesPerDay: 0 }),
      today: TODAY,
    })
    expect(tasks.revision).toEqual([1, 2])
  })

  it('excludes pages outside the scope and pages that are not memorized', () => {
    const tasks = generateDailyTasks({
      scopePages: [1, 2, 50],
      memorized: new Set([1]),
      pace: pace({ weakPagesPerDay: 0 }),
      today: TODAY,
    })
    expect(tasks.revision).toEqual([1])
  })

  it('10 pages at 2/day walks straight through in contiguous daily chunks', () => {
    const scopePages = range(1, 10)
    let revisionCursor: RevisionCursor = { lastPage: null, lastAdvanceDate: null }
    const days: number[][] = []
    for (let d = 0; d < 5; d++) {
      const today = new Date(`2026-07-${15 + d}T09:00:00`)
      const tasks = generateDailyTasks({
        scopePages,
        memorized: new Set(scopePages),
        revisionCursor,
        pace: pace({ revisionPagesPerDay: 2, weakPagesPerDay: 0 }),
        today,
      })
      days.push(tasks.revision)
      revisionCursor = { lastPage: tasks.revision.at(-1)!, lastAdvanceDate: tasks.metadata.date }
    }
    expect(days).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
      [9, 10],
    ])
  })

  it('13 pages at 2/day: the cycle wraps mid-chunk into the next cycle, no gap', () => {
    const scopePages = range(1, 13)
    let revisionCursor: RevisionCursor = { lastPage: null, lastAdvanceDate: null }
    const days: number[][] = []
    for (let d = 0; d < 7; d++) {
      const today = new Date(`2026-07-${15 + d}T09:00:00`)
      const tasks = generateDailyTasks({
        scopePages,
        memorized: new Set(scopePages),
        revisionCursor,
        pace: pace({ revisionPagesPerDay: 2, weakPagesPerDay: 0 }),
        today,
      })
      days.push(tasks.revision)
      revisionCursor = { lastPage: tasks.revision.at(-1)!, lastAdvanceDate: tasks.metadata.date }
    }
    expect(days).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
      [9, 10],
      [11, 12],
      [13, 1], // last page of cycle one, immediately followed by cycle two's first page
    ])
  })

  it('is graceful with an empty scope', () => {
    const tasks = generateDailyTasks({ scopePages: [], memorized: new Set(), pace: pace(), today: TODAY })
    expect(tasks).toMatchObject({ newMemorization: [], revision: [], weakReinforcement: [] })
    expect(tasks.metadata).toMatchObject({ date: TODAY_STR, staleDays: 0, totalPages: 0 })
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
      newFront: { layout: 'qpc', nextPage: 100 },
      pace: pace({ offDays: [3] }), // Wednesday — today
      today: TODAY,
    })
    expect(tasks.metadata.isOffDay).toBe(true)
    expect(tasks.metadata.pausedNewMemorization).toBe(true)
    expect(tasks.newMemorization).toEqual([])
    expect(tasks.revision).toContain(1)
  })

  it('pauses new memorization once the revision rotation has stalled too many days', () => {
    const scopePages = range(1, 20)
    // The cursor hasn't advanced in well over MAX_STALE_DAYS_BEFORE_PAUSE — the
    // user has been opening the app but not finishing their daily chunk.
    const revisionCursor: RevisionCursor = { lastPage: 5, lastAdvanceDate: '2026-07-05' }
    const tasks = generateDailyTasks({
      scopePages,
      memorized: new Set(scopePages),
      revisionCursor,
      newFront: { layout: 'qpc', nextPage: 100 },
      pace: pace(),
      today: TODAY,
    })
    expect(tasks.metadata.staleDays).toBeGreaterThan(MAX_STALE_DAYS_BEFORE_PAUSE)
    expect(tasks.metadata.pausedNewMemorization).toBe(true)
    expect(tasks.newMemorization).toEqual([])
  })

  it('does not pause new memorization while the rotation is on track', () => {
    const scopePages = range(1, 20)
    const revisionCursor: RevisionCursor = { lastPage: 5, lastAdvanceDate: '2026-07-14' } // yesterday
    const tasks = generateDailyTasks({
      scopePages,
      memorized: new Set(scopePages),
      revisionCursor,
      newFront: { layout: 'qpc', nextPage: 100 },
      pace: pace(),
      today: TODAY,
    })
    expect(tasks.metadata.pausedNewMemorization).toBe(false)
    expect(tasks.newMemorization).not.toEqual([])
  })

  it('a zero revision budget never blocks new memorization, however stale the cursor', () => {
    const scopePages = range(1, 20)
    const revisionCursor: RevisionCursor = { lastPage: 5, lastAdvanceDate: '2026-06-01' } // ancient
    const tasks = generateDailyTasks({
      scopePages,
      memorized: new Set(scopePages),
      revisionCursor,
      newFront: { layout: 'qpc', nextPage: 100 },
      pace: pace({ revisionPagesPerDay: 0 }),
      today: TODAY,
    })
    expect(tasks.metadata.pausedNewMemorization).toBe(false)
    expect(tasks.newMemorization).not.toEqual([])
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
