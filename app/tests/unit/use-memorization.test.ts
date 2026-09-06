import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useMemorization } from '@/composables/useMemorization'
import { useProgressStore, TOTAL_PAGES } from '@/stores/progress'
import type { DataClient } from '@/core/data'

// P1 (plans/performance-audit-2026-08.md): `cells` memoizes `cell(page)`
// across all TOTAL_PAGES pages instead of leaving `MemorizedGrid.vue`'s
// template to call `cell(page)` fresh, up to 3x per cell, on every render.
// These tests pin the memoized map's correctness (same values `cell()`
// itself would return) and that it actually re-uses its cached result
// rather than silently recomputing every access.

function fakeDataClient(): DataClient {
  // Uniform 20-page-per-juz fixture (buildJuzGroups only needs *a* start
  // page per juz, not the Quran's real irregular boundaries) — enough to
  // exercise juzGroups without depending on real nav-index data.
  const juzToPage = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [String(i + 1), i * 20 + 1]))
  return {
    init: async () => {},
    getNavIndex: async () => ({ juzToPage }),
  } as unknown as DataClient
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useMemorization — cells memoization (P1)', () => {
  it('cells.value has exactly TOTAL_PAGES entries, each matching cell(page) standalone', () => {
    const progress = useProgressStore()
    progress.setMemorized(3, true)
    progress.strength.set(3, 60)
    progress.setMemorized(604, true)

    const { cell, cells } = useMemorization(fakeDataClient())

    expect(cells.value.size).toBe(TOTAL_PAGES)
    for (const page of [1, 3, 302, 604]) {
      expect(cells.value.get(page)).toEqual(cell(page))
    }
  })

  it('returns the same Map reference across reads with no intervening store mutation', () => {
    const { cells } = useMemorization(fakeDataClient())
    const first = cells.value
    const second = cells.value
    expect(second).toBe(first) // Vue's computed cache actually engaged, not bypassed
  })

  it('a store mutation produces a new map reflecting the change', () => {
    const progress = useProgressStore()
    const { cells } = useMemorization(fakeDataClient())

    const before = cells.value
    expect(before.get(10)?.memorized).toBe(false)

    progress.setMemorized(10, true)

    const after = cells.value
    expect(after).not.toBe(before) // recomputed
    expect(after.get(10)?.memorized).toBe(true)
    // Unrelated pages are unaffected by the mutation.
    expect(after.get(11)?.memorized).toBe(false)
  })
})

describe('useMemorization — recentlyMemorized', () => {
  // Ordering itself (newest-first, the ≤10 cap, the legacy/no-timestamp
  // fallback) is covered exhaustively against controlled timestamps in
  // progress-view.test.ts's `recentlyMemorizedPages` suite — this just pins
  // that the composable wires the live store into it and updates reactively.
  it('reflects the store live, and stops growing past 10', () => {
    const progress = useProgressStore()
    const { recentlyMemorized } = useMemorization(fakeDataClient())

    expect(recentlyMemorized.value).toEqual([])
    progress.setMemorized(3, true)
    expect(recentlyMemorized.value).toEqual([3])

    for (let page = 10; page <= 20; page++) progress.setMemorized(page, true)
    expect(recentlyMemorized.value).toHaveLength(10)
  })
})
