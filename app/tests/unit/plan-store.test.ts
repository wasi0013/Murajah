import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { usePlanStore } from '@/stores/plan'
import { useProgressStore } from '@/stores/progress'
import { usePlanPersistence } from '@/composables/usePlanPersistence'
import { loadPlan, _resetUserDataDb, type PlanConfig } from '@/core/storage/userData'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  setActivePinia(createPinia())
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
    const { dispose } = usePlanPersistence(plan)

    plan.create(samplePlan())
    // Debounced: nothing written synchronously.
    expect(await loadPlan()).toBeNull()

    await wait(400)
    dispose()

    setActivePinia(createPinia())
    const plan2 = usePlanStore()
    const p2 = usePlanPersistence(plan2)
    await p2.hydrate()
    expect(plan2.config).toEqual(samplePlan())
    p2.dispose()
  })

  it('clearing a plan persists as an empty slot', async () => {
    const plan = usePlanStore()
    const { dispose } = usePlanPersistence(plan)
    plan.create(samplePlan())
    await wait(400)
    plan.clear()
    await wait(400)
    dispose()
    expect(await loadPlan()).toBeNull()
  })
})
