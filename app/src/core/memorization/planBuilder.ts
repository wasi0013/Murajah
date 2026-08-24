/**
 * Plan construction & scope helpers (Phase 5), slimmed from the legacy
 * `planManager.js` to the unified adaptive-plan model.
 *
 * What survives the port: juz⇄page scope math (retargeted to the **derived** nav
 * index, not the legacy off-by-one tables — see plans/archive/legacy-hardcoded-tables.md),
 * `generateSmartPlan` (defaults a plan from existing memorized/strength/mistake
 * data), and the memorization-front advance/sync helpers. What's dropped: multi-plan
 * CRUD, status transitions, `juzModes`/mixed logic, milestones, and the
 * plan→daily-goals bridge — all superseded by the single {@link PlanConfig}.
 *
 * The legacy `planManager.js` stays put as the parity net for the still-coupled
 * legacy `planScheduler.js`; extensionless `./planManager` would resolve to it, so
 * this lives under a distinct name until the coordinated 5.1 removal.
 */
import type { Layout } from '@/core/data/types'
import type { PlanConfig, PlanScope, NewFront, PlanPace } from '@/core/storage/userData'
import { INITIAL_REVISION_CURSOR } from './revisionCycle'
import type { ReviewSchedule } from '@/core/storage/userData'
import { juzForPage } from '@/core/navigation/juz'
import { calculateAllWeaknesses, WEAK_THRESHOLD } from './weaknessScorer'
import { getTodayDate } from './streaks'

/** Canonical page count per layout (QPC/Uthmani 604, Indopak 610). */
export const LAYOUT_TOTAL_PAGES: Record<Layout, number> = { qpc: 604, indopak: 610 }

/** Total pages for a layout (defaults to the 604 scheme). */
export function totalPagesForLayout(layout: Layout = 'qpc'): number {
  return LAYOUT_TOTAL_PAGES[layout] ?? 604
}

/** A page is treated as memorized once its strength reaches this (legacy parity). */
const STRENGTH_MEMORIZED_THRESHOLD = 40
/** Ratio of memorized pages above which a user is treated as a hafiz. */
const HAFIZ_RATIO = 0.85

type PageSet = Set<number> | Iterable<number>

function toSet(pages: PageSet | null | undefined): Set<number> {
  return pages instanceof Set ? pages : new Set(pages ?? [])
}

/**
 * `[start, end]` page range for each juz 1…30, derived from the nav index's
 * `juzToPage` starts: a juz ends the page before the next juz begins, and juz 30
 * ends at the layout's last page.
 */
export function juzPageRanges(
  juzToPage: Record<string, number>,
  totalPages: number,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  for (let j = 1; j <= 30; j++) {
    const start = juzToPage[String(j)]
    if (start == null) continue
    const nextStart = juzToPage[String(j + 1)]
    const end = j < 30 && nextStart != null ? nextStart - 1 : totalPages
    ranges.push([start, end])
  }
  return ranges
}

/** Sorted, de-duplicated page numbers covered by the given juz. */
export function getPagesForJuz(
  juzNumbers: number[],
  juzToPage: Record<string, number>,
  totalPages: number,
): number[] {
  const pages = new Set<number>()
  for (const j of juzNumbers) {
    if (j < 1 || j > 30) continue
    const start = juzToPage[String(j)]
    if (start == null) continue
    const nextStart = juzToPage[String(j + 1)]
    const end = j < 30 && nextStart != null ? nextStart - 1 : totalPages
    for (let p = start; p <= end; p++) pages.add(p)
  }
  return [...pages].sort((a, b) => a - b)
}

/** Sorted juz numbers that contain any of the given pages (via the nav index). */
export function getJuzForPages(pages: number[], juzToPage: Record<string, number>): number[] {
  const juz = new Set<number>()
  for (const page of pages) {
    const j = juzForPage(juzToPage, page)
    if (j != null) juz.add(j)
  }
  return [...juz].sort((a, b) => a - b)
}

/** First page in `[from, max]` that isn't memorized, or `null` if none. */
function nextUnmemorized(from: number, memorized: Set<number>, max: number): number | null {
  for (let p = Math.max(1, from); p <= max; p++) {
    if (!memorized.has(p)) return p
  }
  return null
}

export interface SmartPlanInput {
  /** Explicitly memorized pages (the authoritative set). */
  memorized: PageSet
  /** Per-page memorization strength (persisted as legacy `perfectRevisions`). */
  strength?: Map<number, number>
  /** Per-page mistake sets. */
  mistakes?: Map<number, Set<unknown>>
  /** Optional per-page quiz accuracy (0–1 — the scorer clamps, so 0–100 reads as perfect). */
  quizScores?: Map<number, number>
  /** Global per-page review schedules (feeds weakness recency). */
  reviewData?: Map<number, ReviewSchedule>
  /** Nav index juz starts for the active layout. */
  juzToPage: Record<string, number>
  layout?: Layout
  /** Override "now" for deterministic `startDate`/`createdAt`. */
  today?: Date
}

export interface SmartPlanAnalysis {
  totalMemorized: number
  totalPages: number
  memorizedRatio: number
  detectedType: 'beginner' | 'mixed' | 'hafiz'
  scopeJuz: number[]
  weakPageCount: number
  topWeakPages: Array<{ page: number; score: number }>
}

/**
 * Default a full {@link PlanConfig} from the user's existing data. The legacy
 * beginner/hafiz/mixed detection collapses into **scope + optional new front**:
 * a hafiz maintains everything with no new front; a beginner starts a small scope
 * (juz 30) with an active front; a partially-memorized user maintains all they know
 * while continuing to grow. Pace scales with volume and tilts toward revision when
 * many weak pages are present. Everything here is an editable default.
 */
export function generateSmartPlan(input: SmartPlanInput): {
  config: PlanConfig
  analysis: SmartPlanAnalysis
} {
  const layout = input.layout ?? 'qpc'
  const totalPages = totalPagesForLayout(layout)
  const today = input.today ?? new Date()

  const memorized = toSet(input.memorized)
  const strength = input.strength ?? new Map<number, number>()
  for (const [page, s] of strength) {
    if (s >= STRENGTH_MEMORIZED_THRESHOLD) memorized.add(page)
  }
  const memCount = memorized.size
  const memorizedRatio = totalPages > 0 ? memCount / totalPages : 0

  let detectedType: SmartPlanAnalysis['detectedType']
  if (memCount === 0) detectedType = 'beginner'
  else if (memorizedRatio >= HAFIZ_RATIO) detectedType = 'hafiz'
  else detectedType = 'mixed'

  // Weakness over the memorized set (recency comes from the global review data).
  const weakness = calculateAllWeaknesses({
    pages: [...memorized],
    perfectRevisions: strength,
    mistakesMap: input.mistakes ?? new Map(),
    quizScores: input.quizScores ?? new Map(),
    pageReviewData: input.reviewData ?? new Map(),
    today,
  })
  const weakPages = [...weakness.entries()]
    .filter(([, score]) => score >= WEAK_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
  const weakCount = weakPages.length

  // Scope + new memorization front.
  let scope: PlanScope
  let newFront: NewFront | null
  if (detectedType === 'beginner') {
    scope = { kind: 'juz', juz: [30] }
    const juz30Start = juzPageRanges(input.juzToPage, totalPages)[29]?.[0] ?? 1
    newFront = { layout, nextPage: juz30Start }
  } else {
    scope = { kind: 'all-memorized' }
    if (detectedType === 'hafiz') {
      newFront = null
    } else {
      const maxMemorized = Math.max(...memorized)
      const next =
        nextUnmemorized(maxMemorized + 1, memorized, totalPages) ??
        nextUnmemorized(1, memorized, totalPages)
      newFront = next != null ? { layout, nextPage: next } : null
    }
  }

  // Pace: revision scales with volume; new memorization off for a hafiz.
  let revisionPagesPerDay: number
  let newPagesPerDay: number
  if (detectedType === 'hafiz') {
    revisionPagesPerDay = clamp(Math.ceil(memCount / 30), 5, 30)
    newPagesPerDay = 0
  } else if (detectedType === 'mixed') {
    revisionPagesPerDay = clamp(Math.ceil(memCount / 30), 5, 20)
    newPagesPerDay = 1
  } else {
    revisionPagesPerDay = clamp(memCount, 3, 5)
    newPagesPerDay = 1
  }
  // Many weak pages → boost revision, pause new memorization.
  if (weakCount > 10 && detectedType !== 'hafiz') {
    revisionPagesPerDay = Math.max(revisionPagesPerDay, Math.min(15, weakCount))
    newPagesPerDay = 0
    newFront = null
  }

  const pace: PlanPace = {
    newPagesPerDay,
    revisionPagesPerDay,
    weakPagesPerDay: 2,
    daysPerWeek: 6,
    offDays: [5], // Friday off, by convention
  }

  const startDate = getTodayDate(today)
  const config: PlanConfig = {
    scope,
    newFront,
    pace,
    habits: ['recite-ayahs'],
    startDate,
    createdAt: today.toISOString(),
    revisionCursor: INITIAL_REVISION_CURSOR,
  }

  const scopeJuz =
    scope.kind === 'juz' ? [...scope.juz].sort((a, b) => a - b) : getJuzForPages([...memorized], input.juzToPage)

  const analysis: SmartPlanAnalysis = {
    totalMemorized: memCount,
    totalPages,
    memorizedRatio,
    detectedType,
    scopeJuz,
    weakPageCount: weakCount,
    topWeakPages: weakPages.slice(0, 5).map(([page, score]) => ({ page, score })),
  }

  return { config, analysis }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export interface FrontOptions {
  /** Highest page the front may reach (defaults to the layout's page count). */
  maxPage?: number
}

/**
 * Advance the memorization front past the just-completed page to the next
 * un-memorized page. Returns the updated front, or `null` when nothing remains.
 */
export function advanceMemorizationPage(
  front: NewFront | null,
  memorized: PageSet,
  { maxPage }: FrontOptions = {},
): NewFront | null {
  if (!front) return null
  const set = toSet(memorized)
  const max = maxPage ?? totalPagesForLayout(front.layout)
  const next = nextUnmemorized(front.nextPage + 1, set, max)
  return next != null ? { ...front, nextPage: next } : null
}

/**
 * Reconcile the front after memorization changes elsewhere: if the front already
 * points at an un-memorized page it's returned unchanged; otherwise it advances to
 * the next un-memorized page (or `null` when the scope is fully memorized).
 */
export function syncExternalMemorization(
  front: NewFront | null,
  memorized: PageSet,
  { maxPage }: FrontOptions = {},
): NewFront | null {
  if (!front) return null
  const set = toSet(memorized)
  const max = maxPage ?? totalPagesForLayout(front.layout)
  const next = nextUnmemorized(front.nextPage, set, max)
  if (next == null) return null
  return next === front.nextPage ? front : { ...front, nextPage: next }
}
