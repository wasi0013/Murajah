import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { usePartialProgressStore } from '@/stores/partialProgress'
import {
  usePartialProgressPersistence,
  __resetPartialProgressPersistence,
} from '@/composables/usePartialProgressPersistence'
import { _resetUserDataDb } from '@/core/storage/userData'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  setActivePinia(createPinia())
  __resetPartialProgressPersistence()
})

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('usePartialProgressPersistence', () => {
  it('a store mutation persists within the debounce window; a fresh session reloads it', async () => {
    const store = usePartialProgressStore()
    const p = usePartialProgressPersistence(store)
    await p.hydrate()

    store.toggleAyah(202, 2, 5)
    await wait(400)
    p.dispose()
    __resetPartialProgressPersistence()

    setActivePinia(createPinia())
    const fresh = usePartialProgressStore()
    const second = usePartialProgressPersistence(fresh)
    await second.hydrate()
    expect(fresh.page).toBe(202)
    expect(fresh.marks).toEqual([{ surah: 2, ayah: 5 }])
    second.dispose()
  })

  it('a second hydrate() from a different mounted view does not clobber an in-flight mutation', async () => {
    const store = usePartialProgressStore()
    const first = usePartialProgressPersistence(store)
    await first.hydrate()

    store.toggleAyah(202, 2, 5) // mutated, not yet saved

    const second = usePartialProgressPersistence(store)
    await second.hydrate() // must NOT overwrite the live store from stale disk

    expect(store.page).toBe(202)
    expect(store.marks).toEqual([{ surah: 2, ayah: 5 }])

    await wait(400)
    first.dispose()
    second.dispose()
  })

  it('defaults to empty when nothing has been stored', async () => {
    const store = usePartialProgressStore()
    const p = usePartialProgressPersistence(store)
    await p.hydrate()
    expect(store.page).toBeNull()
    expect(store.marks).toEqual([])
  })
})
