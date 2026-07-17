/**
 * Quiz scope resolution (Phase 6.4.2) — turn a scope choice into a set of pages.
 *
 * All four scope kinds collapse to the same unit the rest of the quiz speaks in: a
 * sorted list of pages. Pure, so it's unit-tested without the data client.
 */
import { getPagesForJuz, totalPagesForLayout } from '@/core/memorization/planBuilder'
import type { Layout } from '@/core/data/types'

export type QuizScopeKind = 'plan' | 'surah' | 'juz' | 'all'

export interface QuizScope {
  kind: QuizScopeKind
  /** Selected surahs (kind === 'surah'). */
  surahs?: number[]
  /** Selected juz (kind === 'juz'). */
  juz?: number[]
}

export interface ScopeContext {
  /** `s:a → page` from the nav index — the exact source for a surah's pages. */
  ayahToPage: Record<string, number>
  /** `juz → start page`, as the plan store holds it. */
  juzToPage: Record<string, number>
  /** The active plan's scope pages (kind === 'plan'). */
  planPages: readonly number[]
  layout: Layout
}

/** Every page a set of surahs touches, from the nav index (exact — a surah can share a page). */
export function pagesForSurahs(
  ayahToPage: Record<string, number>,
  surahs: readonly number[],
): number[] {
  const want = new Set(surahs)
  const pages = new Set<number>()
  for (const [key, page] of Object.entries(ayahToPage)) {
    const surah = Number(key.slice(0, key.indexOf(':')))
    if (want.has(surah)) pages.add(page)
  }
  return [...pages].sort((a, b) => a - b)
}

/** Resolve a scope choice to its sorted page list. */
export function resolveScopePages(scope: QuizScope, ctx: ScopeContext): number[] {
  switch (scope.kind) {
    case 'plan':
      return [...ctx.planPages].sort((a, b) => a - b)
    case 'surah':
      return pagesForSurahs(ctx.ayahToPage, scope.surahs ?? [])
    case 'juz':
      return getPagesForJuz(scope.juz ?? [], ctx.juzToPage, totalPagesForLayout(ctx.layout))
    case 'all': {
      const n = totalPagesForLayout(ctx.layout)
      return Array.from({ length: n }, (_, i) => i + 1)
    }
  }
}
