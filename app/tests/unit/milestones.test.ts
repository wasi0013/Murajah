import { describe, it, expect } from 'vitest'
import { detectMilestones } from '@/core/memorization/milestones'

// A toy nav index: 30 juz of 10 pages each over a 300-page mushaf. Real boundaries
// are the derived index's business (planBuilder.test.ts); what matters here is the
// completion logic on top of them.
const juzToPage: Record<string, number> = {}
for (let j = 1; j <= 30; j++) juzToPage[String(j)] = (j - 1) * 10 + 1
const TOTAL = 300

/** Pages of juz `j` in the toy index. */
const juzPages = (j: number) => Array.from({ length: 10 }, (_, i) => (j - 1) * 10 + 1 + i)

const schedules = (pages: number[]) => new Map(pages.map((p) => [p, {}]))

function detect(over: Partial<Parameters<typeof detectMilestones>[0]> = {}) {
  return detectMilestones({
    memorized: new Set<number>(),
    juzToPage,
    totalPages: TOTAL,
    ...over,
  })
}

describe('detectMilestones — juz completion', () => {
  it('reports nothing when nothing is memorized', () => {
    expect(detect()).toEqual([])
  })

  it('does not report a juz that is only partly memorized', () => {
    const partial = juzPages(1).slice(0, 9) // one page short
    expect(detect({ memorized: new Set(partial) })).toEqual([])
  })

  it('reports a juz once its last page is memorized', () => {
    const found = detect({ memorized: new Set(juzPages(1)) })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ id: 'juz-complete:1', kind: 'juz-complete', juz: 1 })
    expect(found[0].message).toContain('Juz 1')
  })

  it('reports every completed juz, in order', () => {
    const memorized = new Set([...juzPages(3), ...juzPages(1)])
    expect(detect({ memorized }).map((m) => m.juz)).toEqual([1, 3])
  })

  it('is a fact about the user, not the plan — an out-of-scope juz still counts', () => {
    // Scope is juz 30; juz 1 is fully memorized anyway. Memorizing a juz is worth
    // the same whether or not today's plan happens to maintain it.
    const found = detect({
      memorized: new Set(juzPages(1)),
      scopePages: juzPages(30),
      reviewData: new Map(),
    })
    expect(found.map((m) => m.id)).toContain('juz-complete:1')
  })

  it('reports nothing while the nav index is still empty', () => {
    // Every juz resolves to zero pages, and `[].every()` is vacuously true — without
    // the guard this would complete all 30 juz at once for a user with no data.
    expect(detect({ memorized: new Set(juzPages(1)), juzToPage: {} })).toEqual([])
  })
})

describe('detectMilestones — cycle completion', () => {
  const scope = juzPages(1)

  it('reports a cycle once every maintained page has been revised', () => {
    const found = detect({
      memorized: new Set(scope),
      scopePages: scope,
      reviewData: schedules(scope),
    })
    expect(found.map((m) => m.id)).toContain('cycle-complete')
  })

  it('does not report a cycle while a maintained page is still unrevised', () => {
    const found = detect({
      memorized: new Set(scope),
      scopePages: scope,
      reviewData: schedules(scope.slice(0, 9)),
    })
    expect(found.map((m) => m.id)).not.toContain('cycle-complete')
  })

  it('ignores scoped pages that are not memorized yet', () => {
    // A beginner's scope is the whole juz, but only 2 pages are memorized. Revising
    // both is a complete cycle of what there is to revise — the other 8 aren't work
    // the plan is asking for yet.
    const memorized = scope.slice(0, 2)
    const found = detect({
      memorized: new Set(memorized),
      scopePages: scope,
      reviewData: schedules(memorized),
    })
    expect(found.map((m) => m.id)).toContain('cycle-complete')
  })

  it('does not complete a cycle over zero pages on day one', () => {
    // The trap: a beginner with a scope but nothing memorized has an empty
    // maintained set, and `[].every()` is true. Day one is not a finished cycle.
    const found = detect({
      memorized: new Set(),
      scopePages: scope,
      reviewData: new Map(),
    })
    expect(found).toEqual([])
  })

  it('reports no cycle without a plan to have cycled through', () => {
    const found = detect({
      memorized: new Set(scope),
      scopePages: [],
      reviewData: schedules(scope),
    })
    expect(found.map((m) => m.id)).not.toContain('cycle-complete')
  })

  it('reports a juz and its cycle together when both land at once', () => {
    const found = detect({
      memorized: new Set(scope),
      scopePages: scope,
      reviewData: schedules(scope),
    })
    expect(found.map((m) => m.id)).toEqual(['juz-complete:1', 'cycle-complete'])
  })
})
