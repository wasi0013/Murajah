/**
 * Legacy plan migration (Phase 5.7).
 *
 * Legacy kept *several* plans, each carrying its own private copy of a page's
 * review schedule inside `schedulerState.pageReviewData` — the "three copies"
 * problem Phase 5 exists to kill. Here they collapse into the unified model: one
 * plan config, and **one** `ReviewSchedule` per page merged into `progress`.
 *
 * This is **data-preservation** parity, not byte-identical task generation (the
 * roadmap's acceptance is "a plan created in legacy loads/advances in the new
 * app"). What must survive: real review history, the scope the user maintains,
 * their pace, where they were memorizing, and enough day history for the streak.
 *
 * Note `plans` / `planHistory` were **IndexedDB-only** in legacy — they never
 * appear in the v2.0.0 export JSON (see plans/legacy-schema.md §2). So this takes
 * plan records as read from the legacy `plans` store, alongside `dailyGoals`,
 * which *is* in the export.
 */
import type { Layout } from '@/core/data/types'
import type {
  DayLog,
  DayRecord,
  NewFront,
  PlanConfig,
  PlanPace,
  PlanScope,
  ReviewSchedule,
} from '@/core/storage/userData'
import { normalizeSchedule } from '@/core/storage/userData'
import { getTodayDate } from './streaks'
import { INITIAL_REVISION_CURSOR } from './revisionCycle'

/** One page's schedule as legacy stored it, inside a plan's `schedulerState`. */
export interface LegacyReviewRecord {
  lastReviewDate?: string | null
  nextReviewDate?: string | null
  interval?: number
  easeFactor?: number
  reviewCount?: number
  consecutiveCorrect?: number
  /** Legacy cached a weakness score here; the new model always recomputes it. */
  weaknessScore?: number
}

/** A legacy `plans` store record (see planManager.js `createPlan`). */
export interface LegacyPlan {
  id?: string
  type?: 'beginner' | 'hafiz' | 'mixed'
  layout?: Layout
  targetPages?: number[]
  targetJuz?: number[]
  createdAt?: string
  startDate?: string
  status?: string
  pace?: Partial<PlanPace>
  schedulerState?: { pageReviewData?: Record<string, LegacyReviewRecord> }
  currentMemorizationPage?: number | null
}

export interface LegacyGoalTask {
  completed?: boolean
  /** `reviewRange` carried the exact pages it asked for that day. */
  pages?: number[]
}

export interface LegacyDayGoal {
  date?: string
  completed?: boolean
  tasks?: Record<string, LegacyGoalTask>
}

export interface LegacyDailyGoals {
  todayGoal?: LegacyDayGoal | null
  goalHistory?: LegacyDayGoal[]
  streak?: number
  longestStreak?: number
  selectedTasks?: string[]
}

/**
 * Legacy's four daily tasks split cleanly along the Phase 5 merge: two *were* the
 * practice itself and are now the adaptive queue (so they aren't habits any more),
 * and two are standing habits that survive as-is.
 */
const HABIT_BY_LEGACY_TASK: Record<string, string> = {
  reciteAyahs: 'recite-ayahs',
  recordRandomPage: 'quick-test',
}

/** Legacy's default pace when a plan didn't record one (planManager `createPlan`). */
const LEGACY_FALLBACK_PACE: PlanPace = {
  newPagesPerDay: 0,
  revisionPagesPerDay: 5,
  weakPagesPerDay: 2,
  daysPerWeek: 6,
  offDays: [5],
}

/**
 * A record is real history only if a review actually happened. Legacy seeded a
 * schedule for **every** page in a plan up front (`initializePageReviewData`:
 * `lastReviewDate: null, reviewCount: 0`) — those are fabricated placeholders, not
 * user history, and importing them would recreate exactly the phantom schedules
 * Phase 5.0 forbids ("one record per page, only for real reviews"). Skipped: the
 * never-reviewed top-up in `generateDailyTasks` picks those pages up naturally.
 */
function isRealHistory(r: LegacyReviewRecord): boolean {
  return typeof r.lastReviewDate === 'string' && r.lastReviewDate.length > 0
}

/** Most recently reviewed wins; ties go to the copy that saw more reviews. */
function beats(a: LegacyReviewRecord, b: LegacyReviewRecord): boolean {
  const ad = a.lastReviewDate ?? ''
  const bd = b.lastReviewDate ?? ''
  if (ad !== bd) return ad > bd
  return (a.reviewCount ?? 0) > (b.reviewCount ?? 0)
}

/**
 * Collapse every plan's private `pageReviewData` into the one schedule map the new
 * model keeps per page. Plans overlap in legacy (a page can sit in three of them),
 * so the most recent real review wins — no page ends up scheduled twice.
 *
 * Unlike {@link planFromLegacy} this reads **archived plans too**, deliberately: a
 * schedule is a per-page global fact (Phase 5.0), so archiving a plan says "I stopped
 * maintaining these pages" — it doesn't unmake the reviews. Out-of-scope pages are
 * filtered out of the queue by `generateDailyTasks` anyway, so keeping the history
 * costs nothing and is there if the user ever widens their scope again.
 */
export function mergeReviewData(plans: LegacyPlan[]): Map<number, ReviewSchedule> {
  const best = new Map<number, LegacyReviewRecord>()
  for (const plan of plans) {
    for (const [key, rec] of Object.entries(plan.schedulerState?.pageReviewData ?? {})) {
      const page = Number(key)
      if (!Number.isInteger(page) || page < 1) continue
      if (!rec || !isRealHistory(rec)) continue
      const prev = best.get(page)
      if (!prev || beats(rec, prev)) best.set(page, rec)
    }
  }

  const out = new Map<number, ReviewSchedule>()
  for (const [page, r] of best) {
    out.set(
      page,
      normalizeSchedule({
        lastReviewDate: r.lastReviewDate as string,
        reviewCount: r.reviewCount ?? 0,
        interval: r.interval,
        easeFactor: r.easeFactor,
        consecutiveCorrect: r.consecutiveCorrect,
        nextReviewDate: r.nextReviewDate ?? undefined,
      }),
    )
  }
  return out
}

/** The active plan that most defines the user's practice — the broadest, then newest. */
function dominantPlan(active: LegacyPlan[]): LegacyPlan {
  return [...active].sort(
    (a, b) =>
      (b.targetPages?.length ?? 0) - (a.targetPages?.length ?? 0) ||
      (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  )[0]
}

/**
 * Fold the legacy plans into the single unified config.
 *
 * Scope is the **union** of every active plan's juz. The spec says "dominant plan
 * wins", which settles the fields that genuinely can't merge (pace, layout, the
 * memorization front) — but scope *can* merge, and picking one plan would silently
 * stop maintaining pages the user was actively revising, which is the one thing
 * data-preservation parity may not do.
 *
 * Archived/completed plans are ignored: they describe practice the user has stopped.
 */
export function planFromLegacy(
  plans: LegacyPlan[],
  opts: { habits?: string[]; today?: Date } = {},
): PlanConfig | null {
  const active = plans.filter((p) => (p.status ?? 'active') === 'active')
  if (active.length === 0) return null

  const today = opts.today ?? new Date()
  const dominant = dominantPlan(active)
  const layout: Layout = dominant.layout ?? 'qpc'

  const juz = [...new Set(active.flatMap((p) => p.targetJuz ?? []))].sort((a, b) => a - b)
  const scope: PlanScope = juz.length ? { kind: 'juz', juz } : { kind: 'all-memorized' }

  const front = dominant.currentMemorizationPage
  const newFront: NewFront | null =
    typeof front === 'number' && front > 0 ? { layout, nextPage: front } : null

  const pace: PlanPace = {
    ...LEGACY_FALLBACK_PACE,
    ...dominant.pace,
    // Legacy had no weak-reinforcement budget; adopt the new model's default.
    weakPagesPerDay: LEGACY_FALLBACK_PACE.weakPagesPerDay,
    offDays: [...(dominant.pace?.offDays ?? LEGACY_FALLBACK_PACE.offDays)],
  }

  return {
    scope,
    newFront,
    pace,
    habits: opts.habits ?? [],
    startDate: dominant.startDate ?? getTodayDate(today),
    createdAt: dominant.createdAt ?? today.toISOString(),
    revisionCursor: INITIAL_REVISION_CURSOR,
  }
}

/** The standing habits the user had selected, minus the two that became the queue. */
export function habitsFromLegacy(selectedTasks: string[] = []): string[] {
  return selectedTasks.map((t) => HABIT_BY_LEGACY_TASK[t]).filter((h): h is string => !!h)
}

function dayRecordFromGoal(goal: LegacyDayGoal): DayRecord {
  const tasks = goal.tasks ?? {}
  const habits = Object.entries(HABIT_BY_LEGACY_TASK)
    .filter(([legacyId]) => tasks[legacyId]?.completed)
    .map(([, habitId]) => habitId)

  // `reviewRange` recorded exactly which pages it asked for, so a finished one is
  // real evidence of pages revised that day — it lands in the history calendar.
  const reviewRange = tasks.reviewRange
  const revision = reviewRange?.completed ? [...(reviewRange.pages ?? [])] : []

  return {
    date: goal.date as string,
    completed: !!goal.completed,
    newMemorization: [], // legacy counted pages added, never which ones
    revision,
    weak: [],
    habits,
  }
}

/**
 * Legacy's daily-goal history → the day log, for streak continuity.
 *
 * The stored `streak` / `longestStreak` counters are deliberately **not** imported:
 * the new model derives both from the log (see `calculateStreak`), so a stored
 * counter would be a second source of truth that could contradict the days it
 * claims to summarise. Given a complete legacy history the derived values match.
 */
export function dayLogFromLegacy(goals?: LegacyDailyGoals | null): DayLog {
  const log: DayLog = new Map()
  const days = [...(goals?.goalHistory ?? []), ...(goals?.todayGoal ? [goals.todayGoal] : [])]
  for (const goal of days) {
    if (!goal?.date) continue
    log.set(goal.date, dayRecordFromGoal(goal)) // todayGoal is last, so it wins its date
  }
  return log
}

export interface PlanMigrationInput {
  /** Records from the legacy `plans` IndexedDB store. */
  plans?: LegacyPlan[]
  dailyGoals?: LegacyDailyGoals | null
  today?: Date
}

export interface PlanMigrationResult {
  /** The single unified plan, or null when the user had no active legacy plan. */
  plan: PlanConfig | null
  /** One schedule per page, to merge into `progress.reviewData`. */
  reviewData: Map<number, ReviewSchedule>
  dayLog: DayLog
}

/** Migrate legacy plans + daily goals into the unified Phase 5 model. */
export function migrateLegacyPlans(input: PlanMigrationInput = {}): PlanMigrationResult {
  const plans = input.plans ?? []
  return {
    plan: planFromLegacy(plans, {
      habits: habitsFromLegacy(input.dailyGoals?.selectedTasks),
      today: input.today,
    }),
    reviewData: mergeReviewData(plans),
    dayLog: dayLogFromLegacy(input.dailyGoals),
  }
}
