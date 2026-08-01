import { describe, it, expect } from 'vitest'
import fixture from '../fixtures/legacy-plans.json'
import {
  migrateLegacyPlans,
  mergeReviewData,
  planFromLegacy,
  dayLogFromLegacy,
  habitsFromLegacy,
  type LegacyPlan,
  type LegacyDailyGoals,
} from '@/core/memorization/planMigration'
import { calculateStreak } from '@/core/memorization/streaks'
import { generateDailyTasks } from '@/core/memorization/dailyTasks'

const PLANS = fixture.plans as LegacyPlan[]
const GOALS = fixture.dailyGoals as LegacyDailyGoals
const TODAY = new Date('2026-05-01T09:00:00')

describe('planMigration — review history', () => {
  it('keeps one schedule per page, most recently reviewed wins', () => {
    const data = mergeReviewData(PLANS)

    // Page 582 lives in two active plans with different history — the newer copy
    // survives intact, and there is exactly one record for it.
    expect(data.get(582)).toEqual({
      lastReviewDate: '2026-04-28',
      nextReviewDate: '2026-05-05',
      interval: 7,
      easeFactor: 2.6,
      reviewCount: 4,
      consecutiveCorrect: 3,
    })
  })

  it('drops legacy’s up-front seeds — they are not real reviews', () => {
    const data = mergeReviewData(PLANS)
    // 583 was seeded by initializePageReviewData but never actually reviewed.
    expect(data.has(583)).toBe(false)
    expect(data.has(584)).toBe(false) // not seeded at all
  })

  it('preserves the SM-2 state of a genuinely reviewed page', () => {
    const data = mergeReviewData(PLANS)
    expect(data.get(1)).toMatchObject({
      lastReviewDate: '2026-04-30',
      nextReviewDate: '2026-05-03',
      interval: 3,
      easeFactor: 2.5,
      reviewCount: 2,
    })
  })

  it('keeps history from an archived plan — a review happened whatever became of the plan', () => {
    // Scope is per-plan; a schedule is a per-page *global* fact (Phase 5.0). Archiving
    // says "I stopped maintaining these pages", not "I never revised them".
    expect(mergeReviewData(PLANS).get(100)).toMatchObject({ lastReviewDate: '2026-01-15' })
  })

  it('history outside the plan’s scope is kept but never practised', () => {
    const { plan, reviewData } = migrateLegacyPlans({ plans: PLANS, today: TODAY })
    expect(reviewData.has(100)).toBe(true) // preserved…
    const tasks = generateDailyTasks({
      scopePages: [1, 2, 3], // …but juz 6 is not in the migrated scope
      memorized: new Set([1, 2, 3, 100]),
      reviewData,
      pace: plan!.pace,
      today: TODAY,
    })
    expect(tasks.revision).not.toContain(100)
    // If the user ever adds juz 6 back, the real history is still there for it.
  })

  it('a seeded page is still practised — revision walks the whole scope regardless of history', () => {
    const { plan, reviewData } = migrateLegacyPlans({ plans: PLANS, today: TODAY })
    const tasks = generateDailyTasks({
      scopePages: [582, 583, 584],
      memorized: new Set([582, 583, 584]),
      reviewData,
      pace: plan!.pace,
      today: TODAY,
    })
    // Nothing is lost by dropping the seed: the rotation doesn't consult SM-2 due
    // dates at all, so 582's real (not-yet-due) schedule doesn't exclude it —
    // it's revised right alongside the never-reviewed 583/584.
    expect(tasks.revision).toContain(582)
    expect(tasks.revision).toContain(583)
    expect(tasks.revision).toContain(584)
  })

  it('survives plans with no scheduler state at all', () => {
    expect(mergeReviewData([{ id: 'p', status: 'active' }]).size).toBe(0)
    expect(mergeReviewData([]).size).toBe(0)
  })
})

describe('planMigration — the unified plan', () => {
  it('unions the scope of every active plan and takes the dominant plan’s pace', () => {
    const plan = planFromLegacy(PLANS, { today: TODAY })!

    // Juz 30 (beginner) + juz 1–2 (hafiz) — neither is dropped.
    expect(plan.scope).toEqual({ kind: 'juz', juz: [1, 2, 30] })
    // plan_juz1 is dominant (9 target pages vs 3), so its pace and layout win.
    expect(plan.pace).toMatchObject({
      newPagesPerDay: 0,
      revisionPagesPerDay: 20,
      daysPerWeek: 7,
      offDays: [],
    })
    expect(plan.pace.weakPagesPerDay).toBe(2) // legacy had no such budget
    expect(plan.startDate).toBe('2026-03-01')
  })

  it('carries the memorization front over from the dominant plan', () => {
    // plan_juz1 (dominant) is a hafiz plan — no new memorization.
    expect(planFromLegacy(PLANS, { today: TODAY })!.newFront).toBeNull()

    // With only the beginner plan active, its front survives.
    const beginnerOnly = PLANS.filter((p) => p.id === 'plan_juz30')
    expect(planFromLegacy(beginnerOnly, { today: TODAY })!.newFront).toEqual({
      layout: 'qpc',
      nextPage: 585,
    })
  })

  it('returns no plan when nothing is active', () => {
    expect(planFromLegacy([], { today: TODAY })).toBeNull()
    const archived = PLANS.filter((p) => p.status === 'archived')
    expect(planFromLegacy(archived, { today: TODAY })).toBeNull()
  })

  it('falls back to all-memorized when a plan records no juz', () => {
    const plan = planFromLegacy([{ id: 'p', status: 'active', targetPages: [1, 2] }], {
      today: TODAY,
    })!
    expect(plan.scope).toEqual({ kind: 'all-memorized' })
  })
})

describe('planMigration — habits', () => {
  it('keeps the two standing habits and drops the two that became the queue', () => {
    // reviewRange → the revision queue; memorizeDaily → the new-memorization section.
    expect(habitsFromLegacy(GOALS.selectedTasks)).toEqual(['recite-ayahs', 'quick-test'])
    expect(habitsFromLegacy([])).toEqual([])
    expect(habitsFromLegacy(['nope'])).toEqual([])
  })
})

describe('planMigration — day log + streak continuity', () => {
  it('imports the goal history, including today’s in-progress day', () => {
    const log = dayLogFromLegacy(GOALS)
    expect([...log.keys()].sort()).toEqual(['2026-04-29', '2026-04-30', '2026-05-01'])

    expect(log.get('2026-04-30')).toEqual({
      date: '2026-04-30',
      completed: true,
      newMemorization: [],
      revision: [6, 7], // a finished reviewRange is evidence of pages revised
      weak: [],
      habits: ['recite-ayahs', 'quick-test'],
    })

    // Today is in progress: the habit is done, the review range is not.
    expect(log.get('2026-05-01')).toMatchObject({
      completed: false,
      revision: [],
      habits: ['recite-ayahs'],
    })
  })

  it('the streak survives the import, derived from the imported days', () => {
    const log = dayLogFromLegacy(GOALS)
    // 29th + 30th completed; the 1st is under way — so the run is alive at 2.
    expect(calculateStreak(log, TODAY)).toMatchObject({
      currentStreak: 2,
      longestStreak: 2,
      lastCompletedDate: '2026-04-30',
    })
  })

  it('handles an absent or empty daily-goals block', () => {
    expect(dayLogFromLegacy(null).size).toBe(0)
    expect(dayLogFromLegacy({}).size).toBe(0)
    expect(dayLogFromLegacy({ goalHistory: [{ completed: true }] }).size).toBe(0) // no date
  })
})

describe('planMigration — the whole import', () => {
  it('migrates plans, schedules and history in one pass', () => {
    const { plan, reviewData, dayLog } = migrateLegacyPlans({
      plans: PLANS,
      dailyGoals: GOALS,
      today: TODAY,
    })

    expect(plan).toMatchObject({
      scope: { kind: 'juz', juz: [1, 2, 30] },
      habits: ['recite-ayahs', 'quick-test'],
    })
    expect([...reviewData.keys()].sort((a, b) => a - b)).toEqual([1, 100, 582])
    expect(dayLog.size).toBe(3)
    expect(calculateStreak(dayLog, TODAY).currentStreak).toBe(2)
  })

  it('an empty legacy install migrates to nothing, not a broken plan', () => {
    const r = migrateLegacyPlans({})
    expect(r.plan).toBeNull()
    expect(r.reviewData.size).toBe(0)
    expect(r.dayLog.size).toBe(0)
  })
})
