import { describe, it, expect } from 'vitest'
import { mergeJournal, MAX_EVENTS_PER_DAY, type JournalEntry, type JournalEvent, type JournalLog } from '@/core/storage/userData'

const entry = (date: string, over: Partial<JournalEntry> = {}): JournalEntry => ({
  date,
  note: '',
  noteUpdatedAt: null,
  events: [],
  eventsOverflow: 0,
  ...over,
})

const event = (id: string, createdAt: string, over: Partial<JournalEvent> = {}): JournalEvent => ({
  id,
  type: 'band-up',
  page: 10,
  fromRank: 0,
  toRank: 1,
  createdAt,
  ...over,
})

const log = (...entries: JournalEntry[]): JournalLog => new Map(entries.map((e) => [e.date, e]))

describe('mergeJournal — the backup-import merge (Phase 12.6.2)', () => {
  it('unions disjoint dates from both sides cleanly', () => {
    const current = log(entry('2026-08-01', { note: 'current only' }))
    const incoming = log(entry('2026-08-02', { note: 'incoming only' }))

    const merged = mergeJournal(current, incoming)

    expect([...merged.keys()].sort()).toEqual(['2026-08-01', '2026-08-02'])
    expect(merged.get('2026-08-01')!.note).toBe('current only')
    expect(merged.get('2026-08-02')!.note).toBe('incoming only')
  })

  it('is idempotent: merging an identical current+incoming note produces no change', () => {
    const shared = entry('2026-08-01', { note: 'same note', noteUpdatedAt: '2026-08-01T09:00:00.000Z' })
    const current = log(shared)
    const incoming = log({ ...shared })

    const merged = mergeJournal(current, incoming)

    expect(merged.get('2026-08-01')).toEqual(shared)
  })

  it('a strictly later incoming noteUpdatedAt wins the note', () => {
    const current = log(entry('2026-08-01', { note: 'old', noteUpdatedAt: '2026-08-01T09:00:00.000Z' }))
    const incoming = log(entry('2026-08-01', { note: 'new', noteUpdatedAt: '2026-08-01T12:00:00.000Z' }))

    const merged = mergeJournal(current, incoming)

    expect(merged.get('2026-08-01')!.note).toBe('new')
    expect(merged.get('2026-08-01')!.noteUpdatedAt).toBe('2026-08-01T12:00:00.000Z')
  })

  it('a later CURRENT edit is never regressed by an older backup note', () => {
    const current = log(entry('2026-08-01', { note: 'edited after the backup was taken', noteUpdatedAt: '2026-08-01T18:00:00.000Z' }))
    const incoming = log(entry('2026-08-01', { note: 'stale backup note', noteUpdatedAt: '2026-08-01T09:00:00.000Z' }))

    const merged = mergeJournal(current, incoming)

    expect(merged.get('2026-08-01')!.note).toBe('edited after the backup was taken')
  })

  it('an incoming note with no noteUpdatedAt never clobbers an existing timestamped note', () => {
    const current = log(entry('2026-08-01', { note: 'real note', noteUpdatedAt: '2026-08-01T09:00:00.000Z' }))
    const incoming = log(entry('2026-08-01', { note: '', noteUpdatedAt: null }))

    const merged = mergeJournal(current, incoming)

    expect(merged.get('2026-08-01')!.note).toBe('real note')
  })

  it('an incoming timestamped note DOES fill in when current has none yet', () => {
    const current = log(entry('2026-08-01'))
    const incoming = log(entry('2026-08-01', { note: 'from the backup', noteUpdatedAt: '2026-08-01T09:00:00.000Z' }))

    const merged = mergeJournal(current, incoming)

    expect(merged.get('2026-08-01')!.note).toBe('from the backup')
  })

  it('overlapping events with shared ids dedupe to one', () => {
    const shared = event('e1', '2026-08-01T09:00:00.000Z')
    const current = log(entry('2026-08-01', { events: [shared] }))
    const incoming = log(entry('2026-08-01', { events: [shared] }))

    const merged = mergeJournal(current, incoming)

    expect(merged.get('2026-08-01')!.events).toHaveLength(1)
  })

  it('non-overlapping events from both sides union, sorted by createdAt', () => {
    const current = log(entry('2026-08-01', { events: [event('e1', '2026-08-01T09:00:00.000Z')] }))
    const incoming = log(entry('2026-08-01', { events: [event('e2', '2026-08-01T15:00:00.000Z')] }))

    const merged = mergeJournal(current, incoming)

    expect(merged.get('2026-08-01')!.events.map((e) => e.id)).toEqual(['e1', 'e2'])
  })

  it('re-caps a merged event list over the per-day limit, adjusting eventsOverflow honestly', () => {
    const currentEvents = Array.from({ length: 15 }, (_, i) =>
      event(`c${i}`, `2026-08-01T0${String(i).padStart(2, '0')}:00:00.000Z`),
    )
    const incomingEvents = Array.from({ length: 15 }, (_, i) =>
      event(`i${i}`, `2026-08-01T1${String(i).padStart(2, '0')}:00:00.000Z`),
    )
    const current = log(entry('2026-08-01', { events: currentEvents, eventsOverflow: 0 }))
    const incoming = log(entry('2026-08-01', { events: incomingEvents, eventsOverflow: 0 }))

    const merged = mergeJournal(current, incoming)
    const result = merged.get('2026-08-01')!

    // 30 total, deduped (all unique ids) — capped at MAX_EVENTS_PER_DAY, the
    // rest counted honestly as overflow, not silently discarded uncounted.
    expect(result.events.length).toBe(MAX_EVENTS_PER_DAY)
    expect(result.eventsOverflow).toBe(30 - MAX_EVENTS_PER_DAY)
    // Kept the most recent MAX_EVENTS_PER_DAY by createdAt, not an arbitrary slice.
    expect(result.events[0].id).not.toBe('c0')
  })

  it('sums pre-existing eventsOverflow from both sides (real prior loss, not fabricated)', () => {
    const current = log(entry('2026-08-01', { events: [event('c1', '2026-08-01T09:00:00.000Z')], eventsOverflow: 3 }))
    const incoming = log(entry('2026-08-01', { events: [event('i1', '2026-08-01T10:00:00.000Z')], eventsOverflow: 2 }))

    const merged = mergeJournal(current, incoming)

    expect(merged.get('2026-08-01')!.eventsOverflow).toBe(5)
    expect(merged.get('2026-08-01')!.events).toHaveLength(2)
  })

  it('an empty incoming journal (no backup journal key at all) leaves the current journal completely untouched', () => {
    const current = log(
      entry('2026-08-01', { note: 'untouched', events: [event('e1', '2026-08-01T09:00:00.000Z')] }),
    )
    const incoming: JournalLog = new Map()

    const merged = mergeJournal(current, incoming)

    expect(merged).toEqual(current)
  })

  it('both sides empty produces an empty log (the honest "start fresh" case)', () => {
    expect(mergeJournal(new Map(), new Map())).toEqual(new Map())
  })
})
