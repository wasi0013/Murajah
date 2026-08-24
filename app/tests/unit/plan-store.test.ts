import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { defineComponent, h, onBeforeUnmount, onMounted } from 'vue'
import { usePlanStore } from '@/stores/plan'
import { useProgressStore } from '@/stores/progress'
import { usePlanPersistence, __resetPlanPersistence } from '@/composables/usePlanPersistence'
import { loadPlan, _resetUserDataDb, type PlanConfig } from '@/core/storage/userData'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  setActivePinia(createPinia())
  __resetPlanPersistence()
})

const QPC_JUZ_TO_PAGE: Record<string, number> = { '1': 1, '2': 22, '30': 582 }

const samplePlan = (): PlanConfig => ({
  scope: { kind: 'all-memorized' },
  newFront: { layout: 'qpc', nextPage: 22 },
  pace: { newPagesPerDay: 1, revisionPagesPerDay: 5, weakPagesPerDay: 2, daysPerWeek: 6, offDays: [5] },
  habits: ['recite-ayahs'],
  startDate: '2026-07-15',
  createdAt: '2026-07-15T00:00:00.000Z',
  revisionCursor: { lastPage: null, lastAdvanceDate: null },
})

describe('plan store', () => {
  it('create / update / updatePace / clear', () => {
    const plan = usePlanStore()
    expect(plan.hasPlan).toBe(false)

    plan.create(samplePlan())
    expect(plan.hasPlan).toBe(true)
    expect(plan.pace?.revisionPagesPerDay).toBe(5)

    plan.update({ habits: ['recite-ayahs', 'quick-test'] })
    expect(plan.config?.habits).toEqual(['recite-ayahs', 'quick-test'])

    plan.updatePace({ revisionPagesPerDay: 12 })
    expect(plan.pace?.revisionPagesPerDay).toBe(12)
    expect(plan.pace?.newPagesPerDay).toBe(1) // untouched fields preserved

    plan.clear()
    expect(plan.hasPlan).toBe(false)
    // mutations are no-ops without a plan
    plan.update({ habits: [] })
    plan.updatePace({ newPagesPerDay: 9 })
    expect(plan.config).toBeNull()
  })

  it('scopePages: all-memorized mirrors the memorized set (sorted)', () => {
    const progress = useProgressStore()
    progress.setMemorized(30, true)
    progress.setMemorized(5, true)
    progress.setMemorized(17, true)

    const plan = usePlanStore()
    plan.create(samplePlan())
    expect(plan.scopePages).toEqual([5, 17, 30])
  })

  it('scopePages: juz scope expands via the injected nav index', () => {
    const plan = usePlanStore()
    plan.setJuzToPage(QPC_JUZ_TO_PAGE)
    plan.create({ ...samplePlan(), scope: { kind: 'juz', juz: [1] } })
    // juz 1 = pages 1..21 (next juz starts at 22)
    expect(plan.scopePages[0]).toBe(1)
    expect(plan.scopePages.at(-1)).toBe(21)
    expect(plan.scopePages).toHaveLength(21)
  })

  it('scopePages is empty with no plan', () => {
    expect(usePlanStore().scopePages).toEqual([])
  })
})

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('usePlanPersistence', () => {
  it('debounce-persists a plan and rehydrates into a fresh store', async () => {
    const plan = usePlanStore()
    const { hydrate, dispose } = usePlanPersistence(plan)
    await hydrate() // starts the watcher (empty disk, so a no-op load)

    plan.create(samplePlan())
    // Debounced: nothing written synchronously.
    expect(await loadPlan()).toBeNull()

    await wait(400)
    dispose()
    __resetPlanPersistence() // a genuinely fresh "app run" for the check below

    setActivePinia(createPinia())
    const plan2 = usePlanStore()
    const p2 = usePlanPersistence(plan2)
    await p2.hydrate()
    expect(plan2.config).toEqual(samplePlan())
    p2.dispose()
  })

  it('clearing a plan persists as an empty slot', async () => {
    const plan = usePlanStore()
    const { hydrate, dispose } = usePlanPersistence(plan)
    await hydrate()
    plan.create(samplePlan())
    await wait(400)
    plan.clear()
    await wait(400)
    dispose()
    expect(await loadPlan()).toBeNull()
  })

  it('a second hydrate() from a different mounted view does not clobber an in-flight mutation', async () => {
    // Reproduces the sequence Today → Progress/Quiz/the marking view hit: the
    // first caller hydrates and starts watching; a mutation lands, not yet
    // saved; a second view calls hydrate() again on the same live store.
    const plan = usePlanStore()
    const first = usePlanPersistence(plan)
    await first.hydrate()

    plan.create(samplePlan()) // mutated, not yet saved

    const second = usePlanPersistence(plan)
    await second.hydrate() // must NOT overwrite the live store from stale (empty) disk

    expect(plan.config).toEqual(samplePlan())

    await wait(400) // let the debounce flush for a clean teardown
    first.dispose()
    second.dispose()
  })

  /**
   * Every case above calls `hydrate()` at the top level of the test, never
   * inside a mounted component's `setup()` — so none of them could exercise
   * Vue's auto-stop-on-unmount for a `watch()` created there, which is
   * exactly the bug the detached-`effectScope` fix closes (see the module's
   * own doc comment, and `useDayLogPersistence.ts`'s sibling test, which is
   * what actually caught this class of bug via a real mount-unmount-mount
   * sequence). `usePlanPersistence` previously avoided the *symptom* by
   * accident (an unshared watcher per view meant no view could kill another's),
   * but traded it for a different loss — see the module doc's second bullet.
   */
  const StubView = defineComponent({
    setup() {
      const persistence = usePlanPersistence()
      onMounted(() => void persistence.hydrate())
      onBeforeUnmount(() => persistence.dispose())
      return () => h('div')
    },
  })

  it('a mutation made just before a view unmounts (inside the debounce window) is not lost', async () => {
    // The old module's *other* failure mode, distinct from the clobber above:
    // every `usePlanPersistence()` call got its own independent watcher, so a
    // view's own `dispose()` on unmount cancelled *its own* pending save —
    // and the next view's fresh watcher only reacts to further changes, not
    // the one already baked into its starting snapshot. `dispose()` is now a
    // no-op (the watcher is a shared, detached singleton), so this can't
    // happen any more.
    const first = mount(StubView)
    await Promise.resolve()
    await wait(10)

    usePlanStore().create(samplePlan())
    await wait(50) // well under the 300ms debounce
    first.unmount() // navigating away before the save fired

    const second = mount(StubView)
    await Promise.resolve()
    await wait(400)
    second.unmount()

    expect(await loadPlan()).toEqual(samplePlan())
  })

  it('a mutation made while a second view is mounted still reaches disk, even though the first (watcher-establishing) view already unmounted', async () => {
    const first = mount(StubView) // e.g. TodayView — the first to hydrate, so it sets up the watcher
    await Promise.resolve()
    await wait(10) // let hydrate()'s load resolve before unmounting
    first.unmount() // e.g. navigating to Progress/Quiz/the marking view

    const second = mount(StubView)
    await Promise.resolve()
    await wait(10)

    const plan = usePlanStore()
    plan.create(samplePlan()) // e.g. an edit made while the second view is live

    await wait(400) // the debounced save
    const stored = await loadPlan()
    expect(stored).toEqual(samplePlan())

    second.unmount()
  })
})
