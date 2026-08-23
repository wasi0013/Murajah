import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { importUserData, exportUserData, type ExportSnapshot } from '@/core/storage/exportImport'
import { _resetUserDataDb } from '@/core/storage/userData'
import { saveJournalNote, appendJournalEvent, loadJournalEntry } from '@/core/storage/journalStorage'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
})

describe('importUserData — journal merges instead of replacing (Phase 12.6.3)', () => {
  it('a backup with journal entries on dates the live profile has none of adds them', async () => {
    await saveJournalNote('2026-08-20', 'already here', '2026-08-20T09:00:00.000Z')

    const snap: ExportSnapshot = {
      journal: {
        '2026-08-21': { date: '2026-08-21', note: 'from the backup', noteUpdatedAt: '2026-08-21T09:00:00.000Z', events: [], eventsOverflow: 0 },
      },
    }
    await importUserData(snap)

    expect((await loadJournalEntry('2026-08-20')).note).toBe('already here')
    expect((await loadJournalEntry('2026-08-21')).note).toBe('from the backup')
  })

  it('an older backup note never regresses a newer live edit on the same date', async () => {
    await saveJournalNote('2026-08-20', 'edited on this device after the backup', '2026-08-20T18:00:00.000Z')

    const snap: ExportSnapshot = {
      journal: {
        '2026-08-20': { date: '2026-08-20', note: 'stale backup note', noteUpdatedAt: '2026-08-20T09:00:00.000Z', events: [], eventsOverflow: 0 },
      },
    }
    await importUserData(snap)

    expect((await loadJournalEntry('2026-08-20')).note).toBe('edited on this device after the backup')
  })

  it('a newer backup note DOES win over an older live edit on the same date', async () => {
    await saveJournalNote('2026-08-20', 'stale live note', '2026-08-20T09:00:00.000Z')

    const snap: ExportSnapshot = {
      journal: {
        '2026-08-20': { date: '2026-08-20', note: 'newer, from another device', noteUpdatedAt: '2026-08-20T18:00:00.000Z', events: [], eventsOverflow: 0 },
      },
    }
    await importUserData(snap)

    expect((await loadJournalEntry('2026-08-20')).note).toBe('newer, from another device')
  })

  it('events from both sides union rather than one side replacing the other', async () => {
    await appendJournalEvent('2026-08-20', {
      id: 'live-1',
      type: 'band-up',
      page: 1,
      fromRank: 0,
      toRank: 1,
      createdAt: '2026-08-20T09:00:00.000Z',
    })

    const snap: ExportSnapshot = {
      journal: {
        '2026-08-20': {
          date: '2026-08-20',
          note: '',
          noteUpdatedAt: null,
          events: [{ id: 'backup-1', type: 'band-up', page: 2, fromRank: 0, toRank: 1, createdAt: '2026-08-20T10:00:00.000Z' }],
          eventsOverflow: 0,
        },
      },
    }
    await importUserData(snap)

    const entry = await loadJournalEntry('2026-08-20')
    expect(entry.events.map((e) => e.id).sort()).toEqual(['backup-1', 'live-1'])
  })

  it('a backup with no journal key at all leaves the live journal completely untouched', async () => {
    await saveJournalNote('2026-08-20', 'untouched', '2026-08-20T09:00:00.000Z')

    await importUserData({ progress: { memorized: [1], perfectRevisions: {}, hasanah: 0 } })

    expect((await loadJournalEntry('2026-08-20')).note).toBe('untouched')
  })

  it('re-importing the same export twice is idempotent (no duplicate events, no note churn)', async () => {
    await saveJournalNote('2026-08-20', 'once', '2026-08-20T09:00:00.000Z')
    await appendJournalEvent('2026-08-20', {
      id: 'e1',
      type: 'band-up',
      page: 1,
      fromRank: 0,
      toRank: 1,
      createdAt: '2026-08-20T09:00:00.000Z',
    })

    const backup = await exportUserData()
    await importUserData(backup.data)
    await importUserData(backup.data) // a second, redundant import of the same file

    const entry = await loadJournalEntry('2026-08-20')
    expect(entry.note).toBe('once')
    expect(entry.events).toHaveLength(1)
  })
})
