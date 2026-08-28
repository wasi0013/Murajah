import { getPageHasanah } from './pageHasanah.js'
import { effectiveRank, type StrengthRank } from './strengthBands'

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

/** Total memorized-page hasanah *weight* (reference; the live reward is the counter). */
export function memorizedWeight(memorized: Set<number>): number {
  let total = 0
  for (const p of memorized) total += getPageHasanah(p)
  return total
}
