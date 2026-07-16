import { getPageHasanah } from './pageHasanah.js'

/**
 * Pure view-model helpers for the Progress screen (canonical 604 scheme). No Vue
 * / no DOM, so fully unit-testable. Colours are decided in the component via
 * design tokens; here we only classify status + tier and slice by juz.
 */

/** Strength → tier 0–6 (0 = none, 6 = mastered). Drives the cell colour ramp. */
export function strengthTier(strength: number): number {
  return Math.max(0, Math.min(6, Math.floor(strength)))
}

export interface PageCell {
  page: number
  memorized: boolean
  strength: number
  tier: number
  mistakes: number
}

export function pageCell(
  page: number,
  memorized: boolean,
  strength: number,
  mistakes: number,
): PageCell {
  return { page, memorized, strength, tier: strengthTier(strength), mistakes }
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
}

export function memorizationStats(params: {
  memorized: Set<number>
  strength: Map<number, number>
  mistakes: Map<number, Set<number>>
  hasanah: number
  totalPages: number
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
    averageStrength: memorizedCount > 0 ? Math.round((strengthSum / memorizedCount) * 10) / 10 : 0,
  }
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
