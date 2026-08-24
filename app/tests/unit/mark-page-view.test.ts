import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { usePlanStore } from '@/stores/plan'
import { usePartialProgressStore } from '@/stores/partialProgress'
import { savePlan } from '@/core/storage/userData'
import { __resetPlanPersistence } from '@/composables/usePlanPersistence'
import { __resetProgressPersistence } from '@/composables/useProgressPersistence'
import { __resetPartialProgressPersistence } from '@/composables/usePartialProgressPersistence'
import { __resetDayLogPersistence } from '@/composables/useDayLogPersistence'
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

// Lets one test hold `partialProgress`'s own hydrate() pending indefinitely
// while everything else (plan/progress/dayLog) resolves normally, to
// reproduce the tap-before-hydrate race without an artificial fixed delay.
const { blockPartialProgressHydrate } = vi.hoisted(() => ({ blockPartialProgressHydrate: { current: false } }))
vi.mock('@/composables/usePartialProgressPersistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/usePartialProgressPersistence')>()
  return {
    ...actual,
    usePartialProgressPersistence: (...args: Parameters<typeof actual.usePartialProgressPersistence>) => {
      const real = actual.usePartialProgressPersistence(...args)
      if (!blockPartialProgressHydrate.current) return real
      return { ...real, hydrate: () => new Promise<void>(() => {}) } // never resolves
    },
  }
})

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

beforeEach(() => {
  setActivePinia(createPinia())
  blockPartialProgressHydrate.current = false
  // Each of these persistence composables' hydrate() is idempotent per app
  // run (a module-level singleton) — without resetting them here, the first
  // test's hydrate (against an empty/no-plan disk) would stay memoized for
  // every later test in this file, silently skipping the real `setAll()` a
  // fresh mount is supposed to get.
  __resetPlanPersistence()
  __resetProgressPersistence()
  __resetPartialProgressPersistence()
  __resetDayLogPersistence()
})

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

  it('a tap before partialProgress finishes hydrating is ignored, not clobbered later', async () => {
    // Reproduces the real-world race: TodayView's own `useMarkPage(frontPage)`
    // (for its line-fill visual) can leave the page chunk/font already warm
    // by the time this view mounts, so the surface can render tappable words
    // well before the independent `partialProgress` IndexedDB read resolves.
    await savePlan(planConfig())
    blockPartialProgressHydrate.current = true
    const wrapper = mount(MarkPageView, { global: { stubs } })
    // Only the page-chunk/font fetch and the other three stores' hydrate()
    // settle here — partialProgress's own hydrate() is held pending.
    await flushAsync()

    const words = wrapper.findAll('.word')
    expect(words).toHaveLength(4) // the page rendered — the race window is real
    await words[0]!.trigger('pointerdown')
    await words[0]!.trigger('pointerup')
    await flushAsync()

    // The tap must be ignored outright, not applied-then-clobbered: nothing
    // toggled, and no line-fill/journal side effect fired.
    expect(wrapper.findAll('.word').some((w) => w.classes().includes('state-hl-green'))).toBe(false)
    expect(usePartialProgressStore().marks).toEqual([])
  })

  it('a rapid second tap landing before Vue re-renders the auto-advanced page is ignored, not misattributed', async () => {
    // `pageNum` advances synchronously inside `complete()` (the graduating
    // tap's own handler), but `useMarkPage`'s `watch(page, load)` — which
    // resets `chunk.value` for the new page — only runs on the next
    // reactivity flush, not synchronously in that same handler. Two taps
    // landing in the *same* browser task (a fast real double-tap, which
    // dispatches both pointerdown/pointerup pairs before any microtask
    // checkpoint) can both run before that flush: the second would otherwise
    // see `pageNum.value` already at the new page while `chunk.value` is
    // still the old page's data. `trigger()` always yields to `nextTick()`
    // internally, so this dispatches both taps' raw DOM events directly,
    // with no `await` between them, to reproduce that same-task ordering.
    await savePlan(planConfig())
    const wrapper = mount(MarkPageView, { global: { stubs } })
    await flushAsync()

    let words = wrapper.findAll('.word')
    dispatchTap(words[0]!.element as HTMLElement)
    await flushAsync()

    words = wrapper.findAll('.word')
    const staleWord = words[2]!.element as HTMLElement // ayah 2's first word — still page 22
    dispatchTap(staleWord) // graduates the page — pageNum flips to 23 synchronously
    dispatchTap(staleWord) // same task, no yield — lands before chunk catches up

    await flushAsync()

    // The graduation itself must be unaffected by the extra tap, and nothing
    // should have re-created a bogus, page-23-attributed partial mark.
    expect(usePlanStore().newFront).toEqual({ layout: 'qpc', nextPage: 23 })
    expect(usePartialProgressStore().page).toBeNull()
  })
})

/** Dispatch a full tap (pointerdown + pointerup) synchronously, bypassing
 * `trigger()`'s implicit `nextTick()` yield between calls. */
function dispatchTap(el: HTMLElement) {
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }))
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0 }))
}

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
