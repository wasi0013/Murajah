import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { useProgressStore, todayISODate } from '@/stores/progress'
import { useJournalStore } from '@/stores/journal'
import { _resetUserDataDb } from '@/core/storage/userData'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  setActivePinia(createPinia())
})

/** Make today's date resident in the journal store so `addEvent`'s in-memory
 * mirror is synchronously observable (see `stores/journal.ts`'s doc comment —
 * a non-resident date still gets written through to disk, just not reflected
 * in `byDate` until the next `loadMonth`). */
function residentToday() {
  const journal = useJournalStore()
  journal.ensure(todayISODate())
  return journal
}

describe('progress store → journal event capture (12.2.1)', () => {
  it('recordReview crossing a band boundary appends exactly one band-up event', () => {
    const journal = residentToday()
    const p = useProgressStore()

    p.recordReview(10, 'perfect') // strength 0 → 1: crosses notMemorized(0) → jadid(1)

    const events = journal.get(todayISODate())!.events
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'band-up', page: 10, fromRank: 0, toRank: 1 })
  })

  it('a review that does not cross a band boundary appends no new event', () => {
    const journal = residentToday()
    const p = useProgressStore()

    p.recordReview(10, 'perfect') // 0 → 1 (crosses, 1 event)
    p.recordReview(10, 'perfect') // 1 → 2 (still band 1 'jadid' — minStrength for band 2 is 40)

    expect(journal.get(todayISODate())!.events).toHaveLength(1)
  })

  it('a failing review (no strength change) appends no event', () => {
    const journal = residentToday()
    const p = useProgressStore()

    p.recordReview(10, 'needs_work')

    expect(journal.get(todayISODate())?.events ?? []).toHaveLength(0)
  })

  it('penalizeMistake dropping a page out of its band appends a band-down event', () => {
    const journal = residentToday()
    const p = useProgressStore()
    p.strength.set(10, 1) // band 1 'jadid', set up directly (not via bumpStrength)

    p.penalizeMistake(10) // strength 1 → 0: crosses jadid(1) → notMemorized(0)

    const events = journal.get(todayISODate())!.events
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'band-down', page: 10, fromRank: 1, toRank: 0 })
  })

  it('penalizeMistake that stays within the same band appends no event', () => {
    const journal = residentToday()
    const p = useProgressStore()
    p.strength.set(10, 41) // band 2 'daif' (minStrength 40)

    p.penalizeMistake(10) // 41 → 40: still band 2

    expect(journal.get(todayISODate())?.events ?? []).toHaveLength(0)
  })

  it('setStrengthBand appends a band-up/band-down event for the picked band', () => {
    const journal = residentToday()
    const p = useProgressStore()

    p.setStrengthBand(10, 2) // notMemorized(0) → daif(2)

    const events = journal.get(todayISODate())!.events
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'band-up', page: 10, fromRank: 0, toRank: 2 })
  })

  it('setStrengthBand re-picking the already-current band appends no event', () => {
    const journal = residentToday()
    const p = useProgressStore()
    p.setStrengthBand(10, 2)

    p.setStrengthBand(10, 2) // no-op per setStrengthBand's own contract

    expect(journal.get(todayISODate())!.events).toHaveLength(1) // still just the first
  })
})

describe('progress store → journal event capture (12.2.2 — bulkMarkMemorized coalescing)', () => {
  it('one call over many freshly-marked pages appends exactly one bulk-memorized event', () => {
    const journal = residentToday()
    const p = useProgressStore()
    const pages = Array.from({ length: 300 }, (_, i) => i + 1)

    p.bulkMarkMemorized(pages, true)

    const events = journal.get(todayISODate())!.events
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'bulk-memorized', count: 300 })
    expect(events[0].page).toBeUndefined()
  })

  it('count reflects only pages actually credited (already-strong pages skipped)', () => {
    const journal = residentToday()
    const p = useProgressStore()
    p.strength.set(2, 50) // page 2 already has real strength — bulkMark must not re-credit it

    p.bulkMarkMemorized([1, 2, 3], true)

    const events = journal.get(todayISODate())!.events
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'bulk-memorized', count: 2 })
  })

  it('unmarking (on=false) credits nothing and appends no event', () => {
    const journal = residentToday()
    const p = useProgressStore()
    p.bulkMarkMemorized([1, 2], true)

    p.bulkMarkMemorized([1, 2], false)

    expect(journal.get(todayISODate())!.events).toHaveLength(1) // only the earlier mark-on event
  })

  it('an empty page list appends no event', () => {
    const journal = residentToday()
    const p = useProgressStore()

    p.bulkMarkMemorized([], true)

    expect(journal.get(todayISODate())?.events ?? []).toHaveLength(0)
  })
})
