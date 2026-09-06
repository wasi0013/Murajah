/**
 * The day's task generator (Phase 5.1.1) — one adaptive path.
 *
 * Collapses the legacy `planScheduler.js` beginner/hafiz/mixed branches into a
 * single queue driven by **scope + pace**: today's revision is a fixed-size
 * rotation through every memorized scope page (the murajah cycle — see
 * `revisionCycle`), completely blind to SM-2 due dates or weakness. New
 * memorization walks the plan's front; weak pages get extra reinforcement from
 * the unified {@link ReviewSchedule}/weakness score — a separate goal from
 * revision, served by its own lane, and drawn from *every* memorized page (not
 * just today's scope) so a page memorized long ago and since dropped out of
 * scope can still be rescued once it decays.
 *
 * Pure and stateless: it says what *should* be done today. Completion state lives in
 * the day log (`DayRecord`), and finishing a task routes through the progress store's
 * `recordReview` — so reward, schedule and streak all advance from one write.
 */
import type { ReviewSchedule, NewFront, PlanPace } from '@/core/storage/userData'
import { calculateAllWeaknesses, getWeakestPages, WEAK_THRESHOLD } from './weaknessScorer'
import { totalPagesForLayout } from './planBuilder'
import { getTodayDate } from './streaks'
import {
  INITIAL_REVISION_CURSOR,
  revisionChunkForToday,
  daysSinceCursorAdvance,
  type RevisionCursor,
} from './revisionCycle'

/** Days the revision rotation can stall before new memorization pauses to let it catch up. */
export const MAX_STALE_DAYS_BEFORE_PAUSE = 3

/**
 * Pages already finished today (from the day log). They stay in the day's list and
 * count against its budgets — otherwise completing a page would drop it out of the
 * queue (its schedule just moved) and free budget would pull a replacement in,
 * turning the day into a treadmill that never finishes.
 */
export interface CompletedToday {
  newMemorization?: number[]
  weak?: number[]
}

export interface DailyTasksInput {
  /** Pages the plan maintains (canonical 604 scheme) — from `plan.scopePages`. */
  scopePages: number[]
  /** The memorized set — only memorized pages can be revised. */
  memorized: Set<number> | Iterable<number>
  /** The one per-page schedule map (`progress.reviewData`) — feeds weakness only;
   * revision selection no longer reads SM-2 due dates. */
  reviewData?: Map<number, ReviewSchedule>
  /** Per-page mistake sets (feeds weakness). */
  mistakes?: Map<number, Set<unknown>>
  /** Per-page memorization strength (feeds weakness). */
  strength?: Map<number, number>
  /** Optional per-page quiz accuracy (0–1). */
  quizScores?: Map<number, number>
  /** Where new memorization is happening, or null when only maintaining. */
  newFront?: NewFront | null
  /** Where the revision rotation stands (`plan.revisionCursor`). */
  revisionCursor?: RevisionCursor
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
  /** Days since the revision rotation last fully advanced (0 = on track). */
  staleDays: number
  /** New memorization is paused (off day, or revision has stalled too long). */
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
  const doneWeak = input.completedToday?.weak ?? []

  // Only memorized pages inside the scope rotate through the murajah cycle.
  const scopedCandidates = scopePages.filter((p) => memorized.has(p))

  // Weakness is scored over *every* memorized page, not just today's maintenance
  // scope — a page memorized long ago and since dropped out of scope still decays,
  // and the murajah rotation above will never visit it again to catch that. Weak
  // reinforcement is its own lane precisely so a page like that isn't orphaned.
  const weakness = calculateAllWeaknesses({
    pages: [...memorized],
    perfectRevisions: input.strength ?? new Map(),
    mistakesMap: input.mistakes ?? new Map(),
    pageReviewData: reviewData,
    quizScores: input.quizScores ?? new Map(),
    today,
  })

  // The murajah rotation: N pages a day, walking every memorized scope page in
  // mushaf order and wrapping back to the start — no due dates, no weakness.
  const cursor = input.revisionCursor ?? INITIAL_REVISION_CURSOR
  const revision = revisionChunkForToday(scopedCandidates, cursor, pace.revisionPagesPerDay, todayStr)

  // The rotation can only stall (not overflow) — it's a fixed-size chunk every
  // day. Gate the new-memorization pause on the cursor going stale, and only
  // when there's a rotation to stall in the first place (revisionPagesPerDay: 0
  // has no chunk to complete, so it must never block new memorization).
  const staleDays = daysSinceCursorAdvance(cursor, todayStr)
  const pausedNewMemorization = isOffDay || (revision.length > 0 && staleDays > MAX_STALE_DAYS_BEFORE_PAUSE)
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
      staleDays,
      pausedNewMemorization,
      totalPages: newMemorization.length + revision.length + weakReinforcement.length,
    },
  }
}
