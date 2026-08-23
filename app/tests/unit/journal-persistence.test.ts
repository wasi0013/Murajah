import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { useJournalStore } from '@/stores/journal'
import { useJournalPersistence } from '@/composables/useJournalPersistence'
import { loadJournalEntry, _resetUserDataDb } from '@/core/storage/userData'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  setActivePinia(createPinia())
})

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('useJournalPersistence — note debounce', () => {
  it('writes a single date once, after the debounce window, not on every keystroke', async () => {
    const journal = useJournalStore()
    const persistence = useJournalPersistence(journal)

    journal.setNote('2026-08-23', 'A')
    persistence.scheduleNoteSave('2026-08-23')
    journal.setNote('2026-08-23', 'Al')
    persistence.scheduleNoteSave('2026-08-23')
    journal.setNote('2026-08-23', 'Alh')
    persistence.scheduleNoteSave('2026-08-23')

    // Debounced: nothing written synchronously (before the window elapses).
    expect((await loadJournalEntry('2026-08-23')).note).toBe('')

    await wait(400)
    expect((await loadJournalEntry('2026-08-23')).note).toBe('Alh')
    persistence.dispose()
  })

  it('debounces two different dates independently — one write each, not combined', async () => {
    const journal = useJournalStore()
    const persistence = useJournalPersistence(journal)

    journal.setNote('2026-08-23', 'today')
    persistence.scheduleNoteSave('2026-08-23')
    journal.setNote('2026-08-24', 'tomorrow')
    persistence.scheduleNoteSave('2026-08-24')

    await wait(400)

    expect((await loadJournalEntry('2026-08-23')).note).toBe('today')
    expect((await loadJournalEntry('2026-08-24')).note).toBe('tomorrow')
    persistence.dispose()
  })

  it('dispose() clears pending timers without saving', async () => {
    const journal = useJournalStore()
    const persistence = useJournalPersistence(journal)

    journal.setNote('2026-08-23', 'never saved')
    persistence.scheduleNoteSave('2026-08-23')
    persistence.dispose()

    await wait(400)
    expect((await loadJournalEntry('2026-08-23')).note).toBe('')
  })
})
