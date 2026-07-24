/**
 * The day's task generator (Phase 5.1.1) — one adaptive path.
 *
 * Collapses the legacy `planScheduler.js` beginner/hafiz/mixed branches into a
 * single queue driven by **scope + pace + the unified {@link ReviewSchedule}**:
 * today's revision = pages **due within scope**, ranked by overdue-ness then
 * weakness, capped at the daily budget, and topped up with never-reviewed pages.
 * New memorization walks the plan's front; weak pages get extra reinforcement.
 *
 * Pure and stateless: it says what *should* be done today. Completion state lives in
 * the day log (`DayRecord`), and finishing a task routes through the progress store's
 * `recordReview` — so reward, schedule and streak all advance from one write.
 */
import type { ReviewSchedule, NewFront, PlanPace } from '@/core/storage/userData'
import { calculateAllWeaknesses, getWeakestPages, WEAK_THRESHOLD } from './weaknessScorer'
import { totalPagesForLayout } from './planBuilder'
import { getTodayDate } from './streaks'

/** Overdue pages beyond which new memorization pauses until the backlog clears. */
export const MAX_BACKLOG_BEFORE_PAUSE = 10

/**
 * Pages already finished today (from the day log). They stay in the day's list and
 * count against its budgets — otherwise completing a page would drop it out of the
 * queue (its schedule just moved) and free budget would pull a replacement in,
 * turning the day into a treadmill that never finishes.
 */
export interface CompletedToday {
  newMemorization?: number[]
  revision?: number[]
  weak?: number[]
}

export interface DailyTasksInput {
  /** Pages the plan maintains (canonical 604 scheme) — from `plan.scopePages`. */
  scopePages: number[]
  /** The memorized set — only memorized pages can be revised. */
  memorized: Set<number> | Iterable<number>
  /** The one per-page schedule map (`progress.reviewData`). */
  reviewData?: Map<number, ReviewSchedule>
  /** Per-page mistake sets (feeds weakness). */
  mistakes?: Map<number, Set<unknown>>
  /** Per-page memorization strength (feeds weakness). */
  strength?: Map<number, number>
  /** Optional per-page quiz accuracy (0–1). */
  quizScores?: Map<number, number>
  /** Where new memorization is happening, or null when only maintaining. */
  newFront?: NewFront | null
  pace: PlanPace
  /** What's already been finished today — keeps the day's list stable as it's worked. */
  completedToday?: CompletedToday
  /** Override "now" for deterministic tests. */
  today?: Date
  /** Highest page the front may reach (defaults to the front layout's page count). */
  maxPage?: number
}

export interface DailyTasksMetadata {
  date: string
  /** Today is an off day — new memorization rests, maintenance continues. */
  isOffDay: boolean
  /** How many scoped pages are currently due (the backlog). */
  backlogSize: number
  /** New memorization is paused (off day, or the backlog is too deep). */
  pausedNewMemorization: boolean
  totalPages: number
}

/** Today's queue — page numbers per section, in the order they should be worked. */
export interface DailyTasks {
  newMemorization: number[]
  revision: number[]
  weakReinforcement: number[]
  metadata: DailyTasksMetadata
}

function toSet(pages: Set<number> | Iterable<number> | undefined): Set<number> {
  return pages instanceof Set ? pages : new Set(pages ?? [])
}

/**
 * Build today's adaptive task set. Off days rest **new memorization only** —
 * revision and weak reinforcement always run, since hifz decays on days off too.
 */
export function generateDailyTasks(input: DailyTasksInput): DailyTasks {
  const today = input.today ?? new Date()
  const todayStr = getTodayDate(today)
  const { pace, scopePages } = input
  const memorized = toSet(input.memorized)
  const reviewData = input.reviewData ?? new Map<number, ReviewSchedule>()
  const front = input.newFront ?? null

  const isOffDay = pace.offDays?.includes(today.getDay()) ?? false

  const doneNew = input.completedToday?.newMemorization ?? []
  const doneRevision = input.completedToday?.revision ?? []
  const doneWeak = input.completedToday?.weak ?? []

  // Only memorized pages inside the scope are revisable.
  const candidates = scopePages.filter((p) => memorized.has(p))

  const weakness = calculateAllWeaknesses({
    pages: candidates,
    perfectRevisions: input.strength ?? new Map(),
    mistakesMap: input.mistakes ?? new Map(),
    pageReviewData: reviewData,
    quizScores: input.quizScores ?? new Map(),
    today,
  })

  // Due = scheduled on or before today. Most overdue first, then weakest, then in
  // mushaf order — so the longest-neglected page is always the first one recited.
  const doneRevisionSet = new Set(doneRevision)
  const due = candidates
    .filter((p) => {
      if (doneRevisionSet.has(p)) return false
      const next = reviewData.get(p)?.nextReviewDate
      return !!next && next <= todayStr
    })
    .sort((a, b) => {
      const aNext = reviewData.get(a)!.nextReviewDate
      const bNext = reviewData.get(b)!.nextReviewDate
      if (aNext !== bNext) return aNext.localeCompare(bNext)
      const aWeak = weakness.get(a) ?? 0
      const bWeak = weakness.get(b) ?? 0
      if (aWeak !== bWeak) return bWeak - aWeak
      return a - b
    })

  const backlogSize = due.length
  const revisionBudget = Math.max(0, pace.revisionPagesPerDay - doneRevision.length)
  const picked = due.slice(0, revisionBudget)

  // Top up spare budget with pages that have never been reviewed at all — this is
  // what walks a fresh plan through its first cycle (no upfront seeding needed).
  if (picked.length < revisionBudget) {
    const scheduled = new Set([...picked, ...doneRevision])
    const neverReviewed = candidates.filter((p) => !scheduled.has(p) && !reviewData.has(p))
    picked.push(...neverReviewed.slice(0, revisionBudget - picked.length))
  }
  // Finished pages lead the list; what's left follows in priority order.
  const revision = [...doneRevision, ...picked]

  const pausedNewMemorization = isOffDay || backlogSize > MAX_BACKLOG_BEFORE_PAUSE
  const newBudget = Math.max(0, pace.newPagesPerDay - doneNew.length)
  const newPicked: number[] = []
  if (!pausedNewMemorization && front && newBudget > 0) {
    const max = input.maxPage ?? totalPagesForLayout(front.layout)
    for (let p = front.nextPage; p <= max && newPicked.length < newBudget; p++) {
      if (!memorized.has(p)) newPicked.push(p)
    }
  }
  const newMemorization = [...doneNew, ...newPicked]

  const alreadyScheduled = [...new Set([...newMemorization, ...revision, ...doneWeak])]
  const weakPicked = getWeakestPages(
    weakness,
    Math.max(0, pace.weakPagesPerDay - doneWeak.length),
    alreadyScheduled,
  ).filter((p) => (weakness.get(p) ?? 0) >= WEAK_THRESHOLD)
  const weakReinforcement = [...doneWeak, ...weakPicked]

  return {
    newMemorization,
    revision,
    weakReinforcement,
    metadata: {
      date: todayStr,
      isOffDay,
      backlogSize,
      pausedNewMemorization,
      totalPages: newMemorization.length + revision.length + weakReinforcement.length,
    },
  }
}
