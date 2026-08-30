import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useProgressStore } from '@/stores/progress'
import { useMistakesStore } from '@/stores/mistakes'

// P1 (plans/performance-audit-2026-08.md): MemorizedGrid.vue's per-cell and
// per-juz values now come from useMemorization()'s memoized `cells`/juzStats
// instead of calling `cell()`/`juzProgress()`/`juzBandSegments()` fresh from
// the template. This is meant to be a pure refactor — these tests assert the
// *rendered output* is correct, which would fail if the memoized path ever
// served stale or wrong data, independent of whether it's actually faster.
//
// Cell aria-labels read "memorized"/"not memorized" (lowercase — see
// `grid.cell.*` in core/i18n/catalogs/en.ts), and "not memorized" itself
// contains the substring "memorized" — assertions below use word-boundary
// regexes rather than `.toContain('memorized')` to avoid that collision.

vi.mock('@/core/data', () => ({
  getDataClient: () => ({
    init: async () => {},
    // Uniform 20-page-per-juz fixture — buildJuzGroups only needs *a* start
    // page per juz, not the Quran's real irregular boundaries.
    getNavIndex: async () => ({
      juzToPage: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [String(i + 1), i * 20 + 1])),
    }),
  }),
}))

// Imported after the mock above so MemorizedGrid's own `useMemorization()`
// call (via `@/core/data`'s default `getDataClient()`) resolves to it.
const { default: MemorizedGrid } = await import('@/features/progress/MemorizedGrid.vue')

const NOT_MEMORIZED = /\bnot memorized\b/
const MEMORIZED_ONLY = /(?<!not )\bmemorized\b/

async function flushDataLoad() {
  // useMemorization's juzGroups populate after a chain of async hops
  // (data.init() → getNavIndex() → assigning juzToPage, each its own
  // microtask) followed by Vue's own render flush — flushPromises() drains
  // both instead of guessing a fixed number of ticks.
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('MemorizedGrid.vue — rendered output stays correct under memoization (P1)', () => {
  it('an unmemorized page renders as a plain, unmarked cell', async () => {
    const wrapper = mount(MemorizedGrid)
    await flushDataLoad()

    const cell = wrapper.find('[data-page="1"]')
    expect(cell.exists()).toBe(true)
    expect(cell.classes()).not.toContain('mistake')
    expect(cell.attributes('aria-label')).toMatch(NOT_MEMORIZED)
  })

  it('marking a page memorized updates that cell live, without touching siblings', async () => {
    const progress = useProgressStore()
    const wrapper = mount(MemorizedGrid)
    await flushDataLoad()

    expect(wrapper.find('[data-page="5"]').attributes('aria-label')).toMatch(NOT_MEMORIZED)

    progress.setMemorized(5, true)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-page="5"]').attributes('aria-label')).toMatch(MEMORIZED_ONLY)
    // A neighboring, untouched page must not have picked up the change.
    expect(wrapper.find('[data-page="6"]').attributes('aria-label')).toMatch(NOT_MEMORIZED)
  })

  it('a page with mistakes gets the mistake marker; a clean page does not', async () => {
    const progress = useProgressStore()
    progress.setMemorized(9, true)
    const mistakes = useMistakesStore()
    mistakes.toggle(9, 1) // marks word 1 on QPC page 9 as a mistake

    const wrapper = mount(MemorizedGrid)
    await flushDataLoad()

    expect(wrapper.find('[data-page="9"]').classes()).toContain('mistake')
    expect(wrapper.find('[data-page="8"]').classes()).not.toContain('mistake')
  })

  it("juz 1's header count reflects exactly its own memorized pages, not the whole grid's", async () => {
    const progress = useProgressStore()
    // Juz 1 = pages 1-20 in this fixture's uniform boundaries.
    progress.setMemorized(2, true)
    progress.setMemorized(4, true)
    // Juz 2 (page 25) — must not leak into juz 1's count.
    progress.setMemorized(25, true)

    const wrapper = mount(MemorizedGrid)
    await flushDataLoad()

    const juz1Count = wrapper.find('[data-juz="1"] .juz-count')
    expect(juz1Count.text()).toContain('2/20')
  })

  it('bulk-marking a whole juz range updates its progress bar and every cell in it', async () => {
    const progress = useProgressStore()
    const wrapper = mount(MemorizedGrid)
    await flushDataLoad()

    progress.bulkMarkMemorized([1, 2, 3, 4, 5], true)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-juz="1"] .juz-count').text()).toContain('5/20')
    expect(wrapper.find('[data-page="5"]').attributes('aria-label')).toMatch(MEMORIZED_ONLY)
    expect(wrapper.find('[data-page="6"]').attributes('aria-label')).toMatch(NOT_MEMORIZED)
  })
})
