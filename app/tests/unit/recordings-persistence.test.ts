import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { useRecordingsStore } from '@/stores/recordings'
import { useRecordingsPersistence, __resetRecordingsPersistence } from '@/composables/useRecordingsPersistence'
import { _resetUserDataDb } from '@/core/storage/userData'
import type { Recording } from '@/core/audio/recorder'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  setActivePinia(createPinia())
  __resetRecordingsPersistence()
})

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const recording = (id: string): Recording => ({
  id,
  pageNumber: 1,
  blob: new Blob(['audio']),
  mimeType: 'audio/webm',
  duration: 1000,
  recordedAt: '2026-08-23T00:00:00.000Z',
})

describe('useRecordingsPersistence — idempotent hydrate (Phase 12.4.1 cross-view fix)', () => {
  it('a second hydrate() call from a different mounted view does not clobber an in-flight add', async () => {
    // Reproduces RecordingPanel → JournalPanel: RecordingPanel hydrates
    // (finds nothing on disk), a recording is added, and before the debounce
    // flushes, JournalPanel mounts and hydrates the same store again.
    const store = useRecordingsStore()
    const panel = useRecordingsPersistence(store)
    await panel.hydrate()

    store.add(recording('r1'))

    const journal = useRecordingsPersistence(store)
    await journal.hydrate()

    expect(store.items.map((r) => r.id)).toEqual(['r1'])

    await wait(400)
    panel.dispose()
    journal.dispose()
  })

  it('still loads real persisted recordings on the first hydrate of a fresh session', async () => {
    const store = useRecordingsStore()
    const first = useRecordingsPersistence(store)
    await first.hydrate()
    store.add(recording('r2'))
    await wait(400)
    first.dispose()
    __resetRecordingsPersistence()

    setActivePinia(createPinia())
    const fresh = useRecordingsStore()
    const second = useRecordingsPersistence(fresh)
    await second.hydrate()
    expect(fresh.items.map((r) => r.id)).toEqual(['r2'])
    second.dispose()
  })
})
