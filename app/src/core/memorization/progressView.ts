import type { ReviewSchedule } from '@/core/storage/userData'
import { getPageHasanah } from './pageHasanah.js'
import { daysSince, effectiveRank, type StrengthRank } from './strengthBands'

/**
 * Pure view-model helpers for the Progress screen (canonical 604 scheme). No Vue
 * / no DOM, so fully unit-testable. Colours are decided in the component via
 * design tokens; here we only classify status + level and slice by juz.
 */

export interface PageCell {
  page: number
  memorized: boolean
  /** Raw perfectRevisions counter (unbounded) — some callers still want it, e.g. an aria-label. */
  strength: number
  /** Effective (decay-capped) band rank 0–6 — what the cell is actually coloured/labelled by. */
  level: StrengthRank
  mistakes: number
}

export function pageCell(
  page: number,
  memorized: boolean,
  strength: number,
  mistakes: number,
  daysSinceLastRevision: number,
): PageCell {
  return { page, memorized, strength, level: effectiveRank(memorized, strength, daysSinceLastRevision), mistakes }
}

export interface JuzGroup {
  juz: number
  startPage: number
  endPage: number
  pages: number[]
}

/**
 * Group pages into juz using the derived per-layout `juzToPage` (juz → start
 * page). Juz J spans `[juzToPage[J], juzToPage[J+1] - 1]`, the last to
 * `totalPages`. Never the legacy 20-page blocks / off-by-one tables.
 */
export function buildJuzGroups(
  juzToPage: Record<string, number>,
  totalPages: number,
): JuzGroup[] {
  const starts: number[] = []
  for (let j = 1; j <= 30; j++) starts[j] = juzToPage[String(j)] ?? (j - 1) * 20 + 1
  const groups: JuzGroup[] = []
  for (let j = 1; j <= 30; j++) {
    const startPage = starts[j]
    const endPage = j < 30 ? starts[j + 1] - 1 : totalPages
    const pages: number[] = []
    for (let p = startPage; p <= endPage; p++) pages.push(p)
    groups.push({ juz: j, startPage, endPage, pages })
  }
  return groups
}

export interface MemorizationStats {
  memorizedCount: number
  totalPages: number
  percent: number
  remaining: number
  totalHasanah: number
  mistakePages: number
  averageStrength: number
  readingSeconds: number
  listeningSeconds: number
}

export function memorizationStats(params: {
  memorized: Set<number>
  strength: Map<number, number>
  mistakes: Map<number, Set<number>>
  hasanah: number
  totalPages: number
  readingSeconds?: number
  listeningSeconds?: number
}): MemorizationStats {
  const { memorized, strength, mistakes, hasanah, totalPages } = params
  const memorizedCount = memorized.size
  let strengthSum = 0
  for (const n of strength.values()) strengthSum += n
  return {
    memorizedCount,
    totalPages,
    percent: totalPages > 0 ? Math.round((memorizedCount / totalPages) * 100) : 0,
    remaining: Math.max(0, totalPages - memorizedCount),
    totalHasanah: hasanah,
    mistakePages: [...mistakes.values()].filter((s) => s.size > 0).length,
    // Raw average — deliberately NOT decay-adjusted (see strengthBands.ts). A
    // neglected page can show a lower band in the grid/dropdown while still
    // counting its full raw strength here; that's the documented scope
    // boundary of display-only decay, not a bug to reconcile.
    averageStrength: memorizedCount > 0 ? Math.round((strengthSum / memorizedCount) * 10) / 10 : 0,
    readingSeconds: params.readingSeconds ?? 0,
    listeningSeconds: params.listeningSeconds ?? 0,
  }
}

/**
 * Format a cumulative active-reading duration into a human-friendly string.
 * Handles any non-negative integer up to MAX_SAFE_INTEGER without precision loss.
 */
export function formatReadingTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '—'
  const s = Math.floor(totalSeconds)
  if (s < 60) return '< 1 min'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rm = m % 60
  if (h < 24) return rm > 0 ? `${h}h ${rm}m` : `${h}h`
  const d = Math.floor(h / 24)
  const rh = h % 24
  if (d < 365) return rh > 0 ? `${d}d ${rh}h` : `${d}d`
  const y = Math.floor(d / 365)
  const rd = d % 365
  return rd > 0 ? `${y}y ${rd}d` : `${y}y`
}

/** Per-juz memorized count + total (for the juz progress bars). */
export function juzProgress(
  group: JuzGroup,
  memorized: Set<number>,
): { memorized: number; total: number } {
  let count = 0
  for (const p of group.pages) if (memorized.has(p)) count++
  return { memorized: count, total: group.pages.length }
}

/** One coloured stretch of a `juzBandSegments` bar — a share of the juz's pages at a given band. */
export interface JuzBandSegment {
  /** 1–6 only; rank 0 (Not Memorized) is never a segment — see below. */
  rank: Exclude<StrengthRank, 0>
  /** 0–100, this band's share of the juz's total pages. */
  percent: number
}

/**
 * Segment a juz's pages by *effective* strength band (same 7-band colour
 * scheme + decay handling as the page cells — see `strengthBands.ts`), for a
 * progress bar that reads as a stacked ledger instead of one flat "%
 * memorized" fill. Sorted strongest → weakest (Mutqan first) to match the
 * grid legend's own ordering, so a bar and its legend never disagree on
 * which end is "better". Rank 0 is deliberately never a segment — it's the
 * bar's unfilled remainder, exactly like an ordinary binary progress bar's
 * "not done" portion, and it can be arbitrarily large (a mostly-unmemorized
 * juz), so giving it a segment would be redundant with the bar's own empty
 * track underneath.
 */
export function juzBandSegments(
  group: JuzGroup,
  memorized: Set<number>,
  strength: Map<number, number>,
  reviewData: Map<number, ReviewSchedule>,
  today: Date = new Date(),
): JuzBandSegment[] {
  const total = group.pages.length
  if (total === 0) return []

  const counts = new Map<StrengthRank, number>()
  for (const page of group.pages) {
    const level = effectiveRank(
      memorized.has(page),
      strength.get(page) ?? 0,
      daysSince(reviewData.get(page)?.lastReviewDate, today),
    )
    if (level === 0) continue
    counts.set(level, (counts.get(level) ?? 0) + 1)
  }

  const segments: JuzBandSegment[] = []
  for (let rank = 6; rank >= 1; rank--) {
    const count = counts.get(rank as StrengthRank) ?? 0
    if (count > 0) segments.push({ rank: rank as Exclude<StrengthRank, 0>, percent: (count / total) * 100 })
  }
  return segments
}

/** Total memorized-page hasanah *weight* (reference; the live reward is the counter). */
export function memorizedWeight(memorized: Set<number>): number {
  let total = 0
  for (const p of memorized) total += getPageHasanah(p)
  return total
}

/**
 * Up to `limit` memorized pages, most-recently-memorized first (Progress
 * Overview's "Recently memorized" chips — replaces the old weakest-page
 * suggestions there; `weaknessScorer.ts` itself is unaffected and still
 * drives the daily weak-reinforcement lane elsewhere).
 *
 * Pages with no `memorizedAt` entry — memorized before this was tracked, or
 * via any future code path that forgets to stamp it — are left out entirely
 * rather than ordered by a guess. There's no way to recover when they were
 * actually memorized, and the caller already hides this section when the
 * result is empty, so a long-time user on a fresh install simply sees nothing
 * here until their next real memorization — an honest empty state, not a
 * list of arbitrary old pages mislabeled "recent".
 *
 * ISO timestamps compare correctly with plain `<`/`>` (no need for
 * `localeCompare`, which is both slower and locale-sensitive for no benefit
 * here). ISO strings can and do tie: `bulkMarkMemorized` stamps every page in
 * one range with a fresh `Date.now()` inside a single synchronous loop, so a
 * whole range can land on the same millisecond. It iterates ascending, so the
 * *highest* page number in a tie was the one actually stamped last — the tie
 * break below is a real ordering, not an arbitrary one.
 */
export function recentlyMemorizedPages(
  memorized: Set<number>,
  memorizedAt: Map<number, string>,
  limit = 10,
): number[] {
  return [...memorized]
    .filter((p) => memorizedAt.has(p))
    .sort((a, b) => {
      const ta = memorizedAt.get(a)!
      const tb = memorizedAt.get(b)!
      if (ta !== tb) return ta < tb ? 1 : -1 // newest first
      return b - a // same instant — highest page number was stamped last
    })
    .slice(0, limit)
}
