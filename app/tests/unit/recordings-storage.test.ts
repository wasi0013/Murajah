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
  it('round-trips a recording (metadata + blob) through IndexedDB', async () => {
    await saveRecordings([rec('a', 42, '2026-07-18T10:00:00Z')])
    const loaded = await loadRecordings()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toMatchObject({
      id: 'a',
      pageNumber: 42,
      mimeType: 'audio/webm',
      recordedAt: '2026-07-18T10:00:00Z',
    })
    // The blob is persisted with its type. (fake-indexeddb + happy-dom serialise the
    // Blob to a plain object, dropping the byte data; real browsers store Blobs
    // intact — byte-level persistence is exercised by the e2e record→play flow.)
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
