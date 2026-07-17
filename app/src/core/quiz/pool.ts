/**
 * Candidate + distractor pools (Phase 6.0.2).
 *
 * Resolves a set of scope pages into the flat list of verses eligible to be
 * questioned, each tagged with whether its page is currently weak (for the
 * strong/weak interleave in `target.ts`). Distractors — wrong verses, wrong words —
 * are drawn from this same pool: plausible near-neighbours from the pages you're
 * actually studying, and no full-corpus scan (the legacy B7 "O(count)" that was
 * really O(6236)).
 */
import { splitWords } from './questions'
import type { QuizSource } from './source'
import type { Target, Verse } from './types'

/**
 * Load every verse on the scope pages, tagged weak/strong by page. Pages load in
 * parallel; a page that fails to load is skipped rather than failing the whole pool.
 */
export async function buildCandidatePool(
  scopePages: readonly number[],
  source: QuizSource,
  weakPages: ReadonlySet<number>,
): Promise<Target[]> {
  const perPage = await Promise.all(
    scopePages.map((page) => source.versesOnPage(page).catch(() => [] as Verse[])),
  )
  return perPage.flat().map((v) => ({ ...v, weak: weakPages.has(v.page) }))
}

/**
 * The distinct words across a set of verses — the distractor bank for word
 * completion. Deduped so the same word can't fill two bank slots; the builder
 * re-excludes the correct answers when it draws.
 */
export function wordBankFrom(verses: readonly Verse[]): string[] {
  const words = new Set<string>()
  for (const v of verses) for (const w of splitWords(v.arabic)) words.add(w)
  return [...words]
}

/** Verses with enough words to blank for a completion question (needs ≥ 2). */
export function completionCandidates(pool: readonly Target[]): Target[] {
  return pool.filter((v) => splitWords(v.arabic).length >= 2)
}
