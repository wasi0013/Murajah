import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { IDBFactory } from 'fake-indexeddb'
import { loadRecordings, saveRecordings, _resetUserDataDb } from '@/core/storage/userData'
import { useRecordingsStore } from '@/stores/recordings'
import type { Recording } from '@/core/audio/recorder'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  setActivePinia(createPinia())
})

function rec(id: string, page: number, at: string): Recording {
  return {
    id,
    pageNumber: page,
    blob: new Blob([`audio-${id}`], { type: 'audio/webm' }),
    mimeType: 'audio/webm',
    duration: 3000,
    recordedAt: at,
  }
}

describe('recordings storage', () => {
  it('round-trips a recording (metadata + audio bytes) through IndexedDB', async () => {
    await saveRecordings([rec('a', 42, '2026-07-18T10:00:00Z')])
    const loaded = await loadRecordings()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toMatchObject({
      id: 'a',
      pageNumber: 42,
      mimeType: 'audio/webm',
      recordedAt: '2026-07-18T10:00:00Z',
    })
    // Stored as an ArrayBuffer, not the Blob itself — some engines (WebKit) throw
    // storing a Blob via structured clone, which silently discarded every
    // recording on the next persist. Assert the bytes actually survive the trip.
    await expect(loaded[0].blob.text()).resolves.toBe('audio-a')
  })

  it('reads a pre-fix record stored as a raw blob (old on-disk shape)', async () => {
    // Before the ArrayBuffer fix, `saveRecordings` stored `{ blob }` directly.
    // Those existing rows must still load instead of vanishing on upgrade.
    const legacy = [
      {
        id: 'legacy',
        pageNumber: 7,
        blob: new Blob(['legacy-audio'], { type: 'audio/webm' }),
        mimeType: 'audio/webm',
        duration: 1000,
        recordedAt: '2026-06-01T00:00:00Z',
      },
    ]
    await saveRecordings([]) // opens the DB/store
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('murajah-userdata', 1)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('data', 'readwrite')
      tx.objectStore('data').put(legacy, 'recordings')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    const loaded = await loadRecordings()
    expect(loaded).toHaveLength(1)
    // The old shape (`{ blob }`) must pass through unchanged, not get dropped for
    // lacking `data`. (Byte-level fidelity of a *stored* Blob isn't checkable here
    // — see the round-trip test above; fake-indexeddb + happy-dom don't preserve
    // Blob bytes through structured clone the way real engines do.)
    expect(loaded[0]).toMatchObject({ id: 'legacy', pageNumber: 7, mimeType: 'audio/webm' })
    expect(loaded[0].blob).toBeDefined()
  })

  it('returns an empty array when nothing is stored', async () => {
    expect(await loadRecordings()).toEqual([])
  })
})

describe('recordings store', () => {
  it('keeps items newest-first and supports add/remove', () => {
    const store = useRecordingsStore()
    store.setAll([rec('old', 1, '2026-07-10T09:00:00Z'), rec('new', 2, '2026-07-18T09:00:00Z')])
    expect(store.items.map((r) => r.id)).toEqual(['new', 'old'])
    store.add(rec('newest', 3, '2026-07-19T09:00:00Z'))
    expect(store.items[0].id).toBe('newest')
    store.remove('old')
    expect(store.items.map((r) => r.id)).toEqual(['newest', 'new'])
  })
})
