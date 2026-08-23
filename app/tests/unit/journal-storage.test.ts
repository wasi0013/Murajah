import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory, IDBDatabase } from 'fake-indexeddb'
import { _resetUserDataDb } from '@/core/storage/userData'
import {
  serializeJournalEntry,
  deserializeJournalEntry,
  serializeJournalLog,
  deserializeJournal,
  loadJournalEntry,
  loadJournalRange,
  loadFullJournal,
  saveJournalNote,
  appendJournalEvent,
  saveFullJournal,
  MAX_EVENTS_PER_DAY,
  JOURNAL_NOTE_MAX_LEN,
  type JournalEntry,
  type JournalEvent,
  type JournalLog,
} from '@/core/storage/journalStorage'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
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

const entry = (date: string, over: Partial<JournalEntry> = {}): JournalEntry => ({
  date,
  note: '',
  noteUpdatedAt: null,
  events: [],
  eventsOverflow: 0,
  ...over,
})

describe('journal entry serialize/deserialize', () => {
  it('round-trips a full entry', () => {
    const e = entry('2026-08-23', {
      note: 'Alhamdulillah, smooth today',
      noteUpdatedAt: '2026-08-23T10:00:00.000Z',
      events: [event()],
      eventsOverflow: 2,
    })
    expect(deserializeJournalEntry(e.date, serializeJournalEntry(e))).toEqual(e)
  })

  it('fills safe defaults for a corrupt/partial stored value instead of throwing', () => {
    expect(deserializeJournalEntry('2026-08-23', undefined)).toEqual(entry('2026-08-23'))
    // Missing `events`/`eventsOverflow` (e.g. a pre-cap-field record) — same shape as
    // every other deserializer's `?? []` / `?? 0` defensiveness in this file.
    const back = deserializeJournalEntry('2026-08-23', { note: 'hi' } as never)
    expect(back).toEqual(entry('2026-08-23', { note: 'hi' }))
  })
})

describe('journal log serialize/deserialize (the export/import path)', () => {
  it('round-trips a whole log through the Map ↔ Record shape', () => {
    const log: JournalLog = new Map([
      ['2026-08-01', entry('2026-08-01', { note: 'first' })],
      ['2026-08-02', entry('2026-08-02', { events: [event()] })],
    ])
    const back = deserializeJournal(serializeJournalLog(log))
    expect(back).toEqual(log)
  })

  it('deserializeJournal returns an empty log for undefined', () => {
    expect(deserializeJournal(undefined)).toEqual(new Map())
  })
})

describe('journal storage — load', () => {
  it('loadJournalEntry returns an empty entry when nothing is stored', async () => {
    expect(await loadJournalEntry('2026-08-23')).toEqual(entry('2026-08-23'))
  })

  it('loadJournalRange returns only dates within the bound, sorted by date', async () => {
    await saveJournalNote('2026-07-31', 'last day of july', '2026-07-31T00:00:00.000Z')
    await saveJournalNote('2026-08-01', 'first', '2026-08-01T00:00:00.000Z')
    await saveJournalNote('2026-08-15', 'mid', '2026-08-15T00:00:00.000Z')
    await saveJournalNote('2026-08-31', 'last', '2026-08-31T00:00:00.000Z')
    await saveJournalNote('2026-09-01', 'next month', '2026-09-01T00:00:00.000Z')

    const range = await loadJournalRange('2026-08-01', '2026-08-31')
    expect([...range.keys()]).toEqual(['2026-08-01', '2026-08-15', '2026-08-31'])
    expect(range.get('2026-08-01')?.note).toBe('first')
  })

  it('loadFullJournal returns every stored date and never touches unrelated keys', async () => {
    await saveJournalNote('2026-01-01', 'new year', '2026-01-01T00:00:00.000Z')
    await saveJournalNote('2026-12-31', 'year end', '2026-12-31T00:00:00.000Z')
    const full = await loadFullJournal()
    expect([...full.keys()].sort()).toEqual(['2026-01-01', '2026-12-31'])
  })
})

describe('journal storage — write (read-modify-write, never a blind put)', () => {
  it('saveJournalNote truncates to the 280-char cap', async () => {
    const long = 'x'.repeat(300)
    await saveJournalNote('2026-08-23', long, '2026-08-23T10:00:00.000Z')
    const stored = await loadJournalEntry('2026-08-23')
    expect(stored.note.length).toBe(JOURNAL_NOTE_MAX_LEN)
  })

  it('appendJournalEvent past the cap evicts the oldest event and counts it as overflow, keeping the most recent (matches mergeJournal\'s re-cap policy)', async () => {
    for (let i = 0; i < MAX_EVENTS_PER_DAY + 5; i++) {
      await appendJournalEvent('2026-08-23', event({ id: `band-up:${i}`, page: i }))
    }
    const stored = await loadJournalEntry('2026-08-23')
    expect(stored.events.length).toBe(MAX_EVENTS_PER_DAY)
    expect(stored.eventsOverflow).toBe(5)
    // The most recently-appended 20 survive (ids 5..24), the earliest 5 (0..4)
    // were evicted, not the other way around — a day already at the cap must
    // still surface what just happened, not go stale on its oldest events.
    expect(stored.events.map((e) => e.id)).toEqual(
      Array.from({ length: MAX_EVENTS_PER_DAY }, (_, i) => `band-up:${i + 5}`),
    )
  })

  it('the same page crossing the same band direction twice in a day replaces, not appends (12.2.3)', async () => {
    await appendJournalEvent('2026-08-23', event({ id: 'first', createdAt: '2026-08-23T09:00:00.000Z' }))
    await appendJournalEvent(
      '2026-08-23',
      event({ id: 'second', fromRank: 0, toRank: 1, createdAt: '2026-08-23T15:00:00.000Z' }),
    )

    const stored = await loadJournalEntry('2026-08-23')
    expect(stored.events).toHaveLength(1)
    expect(stored.events[0]).toMatchObject({ id: 'second', createdAt: '2026-08-23T15:00:00.000Z' })
  })

  it('the same page crossing both directions in a day keeps both events', async () => {
    await appendJournalEvent('2026-08-23', event({ id: 'up', type: 'band-up' }))
    await appendJournalEvent('2026-08-23', event({ id: 'down', type: 'band-down' }))

    const stored = await loadJournalEntry('2026-08-23')
    expect(stored.events.map((e) => e.id).sort()).toEqual(['down', 'up'])
  })

  it('two separate bulk-memorized events in one day are never deduped against each other', async () => {
    await appendJournalEvent('2026-08-23', {
      id: 'bulk-1',
      type: 'bulk-memorized',
      count: 5,
      createdAt: '2026-08-23T09:00:00.000Z',
    })
    await appendJournalEvent('2026-08-23', {
      id: 'bulk-2',
      type: 'bulk-memorized',
      count: 3,
      createdAt: '2026-08-23T15:00:00.000Z',
    })

    const stored = await loadJournalEntry('2026-08-23')
    expect(stored.events).toHaveLength(2)
  })

  it('the blocker: appending an event for a date never resident in memory preserves that date\'s existing note', async () => {
    // A note was saved earlier (e.g. from the Journal panel, in an earlier session).
    await saveJournalNote('2026-08-23', 'wrote this earlier', '2026-08-23T09:00:00.000Z')

    // Later, from an entirely unrelated code path (e.g. a review recorded from the
    // Reader), a band-change event lands for the same date — this call has no idea
    // a note exists; it must not clobber it.
    await appendJournalEvent('2026-08-23', event())

    const stored = await loadJournalEntry('2026-08-23')
    expect(stored.note).toBe('wrote this earlier')
    expect(stored.events).toHaveLength(1)
  })

  it('the inverse: saving a note after an event was logged preserves the existing events', async () => {
    await appendJournalEvent('2026-08-23', event())
    await saveJournalNote('2026-08-23', 'reflecting after the fact', '2026-08-23T11:00:00.000Z')

    const stored = await loadJournalEntry('2026-08-23')
    expect(stored.events).toHaveLength(1)
    expect(stored.note).toBe('reflecting after the fact')
  })

  it('saveFullJournal writes every date in exactly one transaction', async () => {
    const log: JournalLog = new Map()
    for (let i = 0; i < 50; i++) {
      const date = `2026-01-${String((i % 28) + 1).padStart(2, '0')}`
      log.set(`${date}-${i}`, entry(`${date}-${i}`, { note: `entry ${i}` }))
    }

    // Open the module's cached connection first (a no-op read), then spy on the
    // shared `IDBDatabase.prototype.transaction` — the one thing that actually
    // distinguishes "N single-key writes" from "one bulk write" from outside the
    // module (every `IDBDatabase` instance fake-indexeddb creates shares this
    // prototype, including the connection cached inside `userData.ts`'s `db()`).
    await loadFullJournal()
    const txSpy = vi.spyOn(IDBDatabase.prototype, 'transaction')

    await saveFullJournal(log)

    expect(txSpy).toHaveBeenCalledTimes(1)
    txSpy.mockRestore()
    const full = await loadFullJournal()
    expect(full.size).toBe(50)
  })
})
