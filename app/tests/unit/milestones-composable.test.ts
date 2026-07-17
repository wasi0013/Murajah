import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useMilestones } from '@/composables/useMilestones'
import { useProgressStore } from '@/stores/progress'
import { usePlanStore } from '@/stores/plan'
import type { Milestone } from '@/core/memorization/milestones'
import type { PlanConfig } from '@/core/storage/userData'

// Toy nav index: 30 juz of 20 pages. Unlike the pure function, the composable is
// wired to the canonical 604-page scheme, so the fixture has to span it — juz 30
// runs to 604 or it can never complete.
const TOTAL = 604
const juzToPage: Record<string, number> = {}
for (let j = 1; j <= 30; j++) juzToPage[String(j)] = (j - 1) * 20 + 1
const juzPages = (j: number) => {
  const start = (j - 1) * 20 + 1
  const end = j === 30 ? TOTAL : j * 20
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

function planFor(juz: number[]): PlanConfig {
  return {
    scope: { kind: 'juz', juz },
    newFront: null,
    pace: {
      newPagesPerDay: 0,
      revisionPagesPerDay: 5,
      weakPagesPerDay: 0,
      daysPerWeek: 7,
      offDays: [],
    },
    habits: [],
    startDate: '2026-07-15',
    createdAt: '2026-07-15T08:00:00.000Z',
  }
}

beforeEach(() => setActivePinia(createPinia()))

/** Collect announcements instead of toasting. */
function spy() {
  const seen: Milestone[] = []
  return { seen, announce: (m: Milestone) => void seen.push(m) }
}

describe('useMilestones — arming', () => {
  it('adopts what is already true instead of celebrating history', async () => {
    // The returning-hafiz case: 30 juz already complete when the app opens. That's
    // history, not something just earned — 30 toasts would be a bug, not a party.
    const progress = useProgressStore()
    const plan = usePlanStore()
    plan.setJuzToPage(juzToPage)
    for (let j = 1; j <= 30; j++) for (const p of juzPages(j)) progress.setMemorized(p, true)

    const { seen, announce } = spy()
    const m = useMilestones({ announce })
    m.arm()
    await nextTick()

    expect(seen).toEqual([])
    expect(m.announced.size).toBe(30) // adopted, so they can't fire later either
    m.dispose()
  })

  it('says nothing before it is armed', async () => {
    // Stores hydrate asynchronously; everything that lands during loading is the
    // app catching up, not the user achieving.
    const progress = useProgressStore()
    const plan = usePlanStore()

    const { seen, announce } = spy()
    const m = useMilestones({ announce })

    plan.setJuzToPage(juzToPage)
    for (const p of juzPages(1)) progress.setMemorized(p, true)
    await nextTick()

    expect(seen).toEqual([])
    m.dispose()
  })

  it('adopts data that appeared while it was away, on the next arm', async () => {
    // How a restored backup stays silent: Today unmounts, the data lands, and the
    // next mount arms against it. This is the remount half of the e2e that caught
    // an earlier design firing 30 toasts at a migrated user.
    const progress = useProgressStore()
    const plan = usePlanStore()
    plan.setJuzToPage(juzToPage)

    const first = spy()
    const m1 = useMilestones({ announce: first.announce })
    m1.arm() // an empty install
    await nextTick()
    m1.dispose() // navigated away

    for (let j = 1; j <= 30; j++) for (const p of juzPages(j)) progress.setMemorized(p, true)

    const second = spy()
    const m2 = useMilestones({ announce: second.announce })
    m2.arm()
    await nextTick()

    expect(second.seen).toEqual([])
    expect(m2.announced.size).toBe(30)
    m2.dispose()
  })
})

describe('useMilestones — crossing a milestone', () => {
  it('announces a juz the moment its last page is memorized', async () => {
    const progress = useProgressStore()
    const plan = usePlanStore()
    plan.setJuzToPage(juzToPage)
    for (const p of juzPages(1).slice(0, -1)) progress.setMemorized(p, true)

    const { seen, announce } = spy()
    const m = useMilestones({ announce })
    m.arm()
    await nextTick()
    expect(seen).toEqual([]) // one page short — nothing yet

    progress.setMemorized(juzPages(1).at(-1)!, true)
    await nextTick()

    expect(seen.map((x) => x.id)).toEqual(['juz-complete:1'])
    m.dispose()
  })

  it('announces a milestone once, not on every change after it', async () => {
    const progress = useProgressStore()
    const plan = usePlanStore()
    plan.setJuzToPage(juzToPage)
    for (const p of juzPages(1).slice(0, -1)) progress.setMemorized(p, true)

    const { seen, announce } = spy()
    const m = useMilestones({ announce })
    m.arm()
    await nextTick()

    progress.setMemorized(juzPages(1).at(-1)!, true)
    await nextTick()
    expect(seen).toHaveLength(1)

    progress.setMemorized(juzPages(2)[0], true) // unrelated work; juz 1 is still done
    await nextTick()
    expect(seen).toHaveLength(1)
    m.dispose()
  })

  it('announces the cycle when the last maintained page is revised', async () => {
    const progress = useProgressStore()
    const plan = usePlanStore()
    plan.setJuzToPage(juzToPage)
    plan.setAll(planFor([1]))
    for (const p of juzPages(1)) progress.setMemorized(p, true)
    for (const p of juzPages(1).slice(0, -1)) progress.recordReview(p, 5)

    const { seen, announce } = spy()
    const m = useMilestones({ announce })
    m.arm()
    await nextTick()
    expect(seen).toEqual([]) // juz 1 already complete and adopted; cycle still short

    progress.recordReview(juzPages(1).at(-1)!, 5)
    await nextTick()

    expect(seen.map((x) => x.id)).toEqual(['cycle-complete'])
    m.dispose()
  })
})
