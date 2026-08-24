import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { usePlanStore } from '@/stores/plan'
import { usePartialProgressStore } from '@/stores/partialProgress'
import { savePlan } from '@/core/storage/userData'
import type { PageChunk } from '@/core/data/types'
import type { PlanConfig } from '@/core/storage/userData'

vi.mock('@/core/data', () => ({
  getDataClient: () => ({
    init: async () => {},
    getPage: async (_layout: string, page: number): Promise<PageChunk> => ({
      page,
      words: [
        { id: 1, surah: '2', ayah: '1', word: '1', location: '2:1:1', text: 'w1' },
        { id: 2, surah: '2', ayah: '1', word: '2', location: '2:1:2', text: 'w2' },
        { id: 3, surah: '2', ayah: '2', word: '1', location: '2:2:1', text: 'w3' },
        { id: 4, surah: '2', ayah: '2', word: '2', location: '2:2:2', text: 'w4' },
      ],
      layout: [
        { page_number: page, line_number: 1, line_type: 'ayah', is_centered: 0, first_word_id: 1, last_word_id: 2 },
        { page_number: page, line_number: 2, line_type: 'ayah', is_centered: 0, first_word_id: 3, last_word_id: 4 },
      ],
    }),
  }),
}))
vi.mock('@/core/fonts', () => ({
  getFontLoader: () => ({
    init: async () => {},
    ensure: async () => 'qpc-p22',
  }),
}))

// Imported after the mocks above so MarkPageView's own imports resolve to them.
const { default: MarkPageView } = await import('@/features/memorize/MarkPageView.vue')

const planConfig = (over: Partial<PlanConfig> = {}): PlanConfig => ({
  scope: { kind: 'all-memorized' },
  newFront: { layout: 'qpc', nextPage: 22 },
  pace: { newPagesPerDay: 1, revisionPagesPerDay: 0, weakPagesPerDay: 0, daysPerWeek: 7, offDays: [] },
  habits: [],
  startDate: '2026-07-15',
  createdAt: '2026-07-15T00:00:00.000Z',
  revisionCursor: { lastPage: null, lastAdvanceDate: null },
  ...over,
})

const stubs = { RouterLink: { template: '<a><slot /></a>' } }

beforeEach(() => setActivePinia(createPinia()))

describe('MarkPageView', () => {
  it('shows the empty state when there is no plan front page', async () => {
    const wrapper = mount(MarkPageView, { global: { stubs } })
    await flushAsync()
    expect(wrapper.text()).toContain("You don't have a page to memorize right now.")
  })

  it('renders the front page and tapping a word marks its whole ayah', async () => {
    // Seeded on disk (not via the store directly) — the view now owns its
    // own hydrate() on mount, so it must load this like a real fresh visit.
    await savePlan(planConfig())
    const wrapper = mount(MarkPageView, { global: { stubs } })
    await flushAsync()

    const words = wrapper.findAll('.word')
    expect(words).toHaveLength(4)
    expect(words.some((w) => w.classes().includes('state-hl-green'))).toBe(false)

    await words[0]!.trigger('pointerdown')
    await words[0]!.trigger('pointerup')
    await flushAsync()

    // Tapping any word in ayah 1 marks the whole ayah (both its words).
    const after = wrapper.findAll('.word')
    expect(after[0]!.classes()).toContain('state-hl-green')
    expect(after[1]!.classes()).toContain('state-hl-green')
    expect(after[2]!.classes()).not.toContain('state-hl-green')

    expect(wrapper.text()).toContain('1 of 2 lines')

    const partialProgress = usePartialProgressStore()
    expect(partialProgress.page).toBe(22)
    expect(partialProgress.marks).toEqual([{ surah: 2, ayah: 1 }])
  })

  it('marking the whole page graduates it and flows to the next front page', async () => {
    await savePlan(planConfig())
    const plan = usePlanStore()
    const wrapper = mount(MarkPageView, { global: { stubs } })
    await flushAsync()

    let words = wrapper.findAll('.word')
    await words[0]!.trigger('pointerdown')
    await words[0]!.trigger('pointerup')
    await flushAsync()

    words = wrapper.findAll('.word')
    await words[2]!.trigger('pointerdown') // ayah 2's first word
    await words[2]!.trigger('pointerup')
    await flushAsync()

    expect(plan.newFront).toEqual({ layout: 'qpc', nextPage: 23 }) // graduated, front advanced
    expect(usePartialProgressStore().page).toBeNull() // cleared once graduated

    // The view flows to page 23 automatically — no explicit redirect needed,
    // since `pageNum` is reactive to `plan.newFront`.
    await flushAsync()
    expect(wrapper.text()).toContain('Page 23')
  })
})

/**
 * Flush the microtask queue + several ticks, for the composable's async
 * load() plus this view's own four hydrate() calls (Task: hydration fix) —
 * fake-indexeddb resolves each `IDBRequest` via a queued macrotask, so a
 * chain of plan/progress/partialProgress/dayLog reads needs more than one
 * `setTimeout(0)` round to fully settle.
 */
async function flushAsync() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
  }
}
