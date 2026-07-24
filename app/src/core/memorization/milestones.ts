/**
 * Milestones (Phase 5.5.2) — juz-complete and cycle-complete, **derived**.
 *
 * Deliberately not a port of legacy's `generateMilestones`, which forecast a
 * `targetDate` for each juz at plan creation and stored `completedDate: null`
 * beside it. Neither half of that shape survives the unified model:
 *
 * 1. The plan is **adaptive** — pace and scope are editable and the queue re-derives
 *    daily, so a date predicted at creation is stale the moment the user changes
 *    their pace. It's a promise the app can't keep.
 * 2. A stored `completedDate` is a second source of truth about whether a juz is
 *    done, when that already follows from `progress.memorized` — exactly the
 *    duplicate-store problem Phase 5 exists to kill.
 *
 * So completion is recomputed from the real records every time. The one thing worth
 * storing is which milestones have already been *announced*: "we told you about this"
 * is genuinely new information that no other record holds. See `useMilestones`.
 */
import { getPagesForJuz, totalPagesForLayout } from './planBuilder'

export type MilestoneKind = 'juz-complete' | 'cycle-complete'

export interface Milestone {
  /** Stable across recomputes — it's the key the announced-set is keyed by. */
  id: string
  kind: MilestoneKind
  /** Present on `juz-complete` only. */
  juz?: number
  /** Celebration copy, written for the moment it's crossed. */
  message: string
}

export interface MilestoneInput {
  /** Memorized pages in the canonical 604-page scheme. */
  memorized: ReadonlySet<number>
  /** QPC nav juz-start map; without it no juz can be resolved. */
  juzToPage: Record<string, number>
  /** Pages the plan maintains. Empty/absent means no plan — no cycle to complete. */
  scopePages?: readonly number[]
  /** One schedule per page; a page counts as revised once it has one. */
  reviewData?: ReadonlyMap<number, unknown>
  totalPages?: number
}

/**
 * Every milestone the user has *currently* achieved — not the ones newly crossed.
 * Diffing against what's already been announced is the caller's job.
 */
export function detectMilestones(input: MilestoneInput): Milestone[] {
  const { memorized, juzToPage } = input
  const totalPages = input.totalPages ?? totalPagesForLayout('qpc')
  const out: Milestone[] = []

  // Juz completion is a fact about the *user*, not the plan: memorizing all of juz 5
  // is worth the same whether or not juz 5 is in today's scope. (Legacy scoped these
  // to a plan's targetPages, back when memorization lived inside a plan.)
  for (let juz = 1; juz <= 30; juz++) {
    const pages = getPagesForJuz([juz], juzToPage, totalPages)
    // A juz that resolves to no pages means the nav index isn't loaded yet — an
    // empty `every()` is vacuously true and would "complete" all 30 at once.
    if (pages.length === 0) continue
    if (!pages.every((p) => memorized.has(p))) continue
    out.push({ id: `juz-complete:${juz}`, kind: 'juz-complete', juz, message: `Juz ${juz} complete` })
  }

  // A full pass through the plan: every page it maintains has been revised at least
  // once. That's the only honest reading of "cycle" here — after the first pass SM-2
  // puts every page on its own interval, and there is no recurring cycle boundary to
  // detect. It's what `generateDailyTasks`' never-reviewed top-up is walking toward.
  const scopePages = input.scopePages ?? []
  const reviewData = input.reviewData
  const maintained = scopePages.filter((p) => memorized.has(p))
  // `maintained.length > 0` is load-bearing: a beginner with nothing memorized yet
  // would otherwise complete a cycle over zero pages on day one.
  if (reviewData && maintained.length > 0 && maintained.every((p) => reviewData.has(p))) {
    out.push({
      id: 'cycle-complete',
      kind: 'cycle-complete',
      message: "Full cycle complete — you've revised every page in your plan",
    })
  }

  return out
}
