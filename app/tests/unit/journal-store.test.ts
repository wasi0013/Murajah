import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { useJournalStore } from '@/stores/journal'
import { loadJournalEntry, saveJournalNote, _resetUserDataDb, type JournalEvent } from '@/core/storage/userData'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  setActivePinia(createPinia())
})

const event = (over: Partial<JournalEvent> = {}): JournalEvent => ({
  id: 'band-up:12:2026-08-23T10:00:00.000Z',
  type: 'band-up',
  page: 12,
  fromRank: 1,
  toRank: 2,
  createdAt: '2026-08-23T10:00:00.000Z',
  ...over,
})

describe('journal store — in-memory state', () => {
  it('ensure() creates an empty entry on demand and is idempotent', () => {
    const journal = useJournalStore()
    const first = journal.ensure('2026-08-23')
    expect(first).toEqual({ date: '2026-08-23', note: '', noteUpdatedAt: null, events: [], eventsOverflow: 0 })
    first.note = 'mutated'
    expect(journal.ensure('2026-08-23').note).toBe('mutated') // same reactive record, not recreated
  })

  it('setNote truncates at 280 chars and stamps noteUpdatedAt', () => {
    const journal = useJournalStore()
    journal.setNote('2026-08-23', 'x'.repeat(300))
    const entry = journal.get('2026-08-23')!
    expect(entry.note.length).toBe(280)
    expect(entry.noteUpdatedAt).not.toBeNull()
  })

  it('addEvent mirrors into the in-memory entry when the date is already resident', () => {
    const journal = useJournalStore()
    journal.ensure('2026-08-23') // resident, via a prior calendar load in the real app
    journal.addEvent('2026-08-23', event())
    expect(journal.get('2026-08-23')!.events).toEqual([event()])
  })

  it('addEvent replaces a same-page/same-type event in memory instead of appending (12.2.3)', () => {
    const journal = useJournalStore()
    journal.ensure('2026-08-23')
    journal.addEvent('2026-08-23', event({ id: 'first', createdAt: '2026-08-23T09:00:00.000Z' }))
    journal.addEvent('2026-08-23', event({ id: 'second', createdAt: '2026-08-23T15:00:00.000Z' }))

    const events = journal.get('2026-08-23')!.events
    expect(events).toHaveLength(1)
    expect(events[0].id).toBe('second')
  })

  it('addEvent past the cap increments eventsOverflow in memory, not the array', () => {
    const journal = useJournalStore()
    journal.ensure('2026-08-23')
    for (let i = 0; i < 25; i++) journal.addEvent('2026-08-23', event({ id: `e${i}`, page: i }))
    const entry = journal.get('2026-08-23')!
    expect(entry.events.length).toBe(20)
    expect(entry.eventsOverflow).toBe(5)
  })

  it('setAll / snapshot round-trip a whole log', () => {
    const journal = useJournalStore()
    journal.setNote('2026-08-01', 'first of the month')
    journal.addEvent('2026-08-01', event())
    const snap = journal.snapshot()
    journal.setAll(new Map())
    expect(journal.byDate.size).toBe(0)
    journal.setAll(snap)
    expect(journal.get('2026-08-01')!.note).toBe('first of the month')
    expect(journal.get('2026-08-01')!.events).toHaveLength(1)
  })
})

describe('journal store — addEvent write-through (the 12.1.4 guarantee, from the store side)', () => {
  it('persists the event to disk even when the date was never made resident', async () => {
    const journal = useJournalStore()
    // No ensure()/loadMonth() for this date — it is not in `byDate` at all.
    expect(journal.get('2026-08-23')).toBeUndefined()

    journal.addEvent('2026-08-23', event())
    // The write is fire-and-forget; give the microtask queue a turn.
    await Promise.resolve()
    await Promise.resolve()

    const onDisk = await loadJournalEntry('2026-08-23')
    expect(onDisk.events).toHaveLength(1)
  })

  it('does not clobber a note already on disk when the date is not resident in the store', async () => {
    await saveJournalNote('2026-08-23', 'written from another route entirely', '2026-08-23T09:00:00.000Z')
    const journal = useJournalStore()

    journal.addEvent('2026-08-23', event())
    await Promise.resolve()
    await Promise.resolve()

    const onDisk = await loadJournalEntry('2026-08-23')
    expect(onDisk.note).toBe('written from another route entirely')
    expect(onDisk.events).toHaveLength(1)
  })
})

describe('journal store — loadMonth', () => {
  it('loads only the requested month into byDate', async () => {
    await saveJournalNote('2026-07-31', 'july', '2026-07-31T00:00:00.000Z')
    await saveJournalNote('2026-08-15', 'august', '2026-08-15T00:00:00.000Z')
    await saveJournalNote('2026-09-01', 'september', '2026-09-01T00:00:00.000Z')

    const journal = useJournalStore()
    await journal.loadMonth(2026, 8)

    expect([...journal.byDate.keys()]).toEqual(['2026-08-15'])
  })

  it('handles a 31-day month boundary correctly (no off-by-one into next month)', async () => {
    await saveJournalNote('2026-08-31', 'last day', '2026-08-31T00:00:00.000Z')
    await saveJournalNote('2026-09-01', 'next month', '2026-09-01T00:00:00.000Z')

    const journal = useJournalStore()
    await journal.loadMonth(2026, 8)

    expect([...journal.byDate.keys()]).toEqual(['2026-08-31'])
  })
})
