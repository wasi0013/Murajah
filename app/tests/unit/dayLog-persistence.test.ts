import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { useDayLogStore } from '@/stores/dayLog'
import { useDayLogPersistence, __resetDayLogPersistence } from '@/composables/useDayLogPersistence'
import { _resetUserDataDb } from '@/core/storage/userData'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  setActivePinia(createPinia())
  __resetDayLogPersistence()
})

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('useDayLogPersistence — idempotent hydrate (Phase 12.4.1 cross-view fix)', () => {
  it('a second hydrate() call from a different mounted view does not clobber an in-flight mutation', async () => {
    // Reproduces the exact sequence Today → Journal hit: Today's own
    // useDayLogPersistence instance hydrates and starts watching; a task
    // completion mutates the (single, app-wide) store; before the 300ms
    // debounce flushes, the user navigates and a second view (JournalPanel)
    // calls hydrate() again on the same live store.
    const dayLog = useDayLogStore()
    const today = useDayLogPersistence(dayLog)
    await today.hydrate() // loads the empty disk state

    dayLog.setCompleted('2026-08-23', true) // mutated, not yet saved

    const journal = useDayLogPersistence(dayLog)
    await journal.hydrate() // must NOT overwrite the live store from stale disk

    expect(dayLog.get('2026-08-23')?.completed).toBe(true)

    await wait(400) // let the debounce flush for a clean teardown
    today.dispose()
    journal.dispose()
  })

  it('still loads real persisted history on the first hydrate of a fresh session', async () => {
    const dayLog = useDayLogStore()
    const first = useDayLogPersistence(dayLog)
    await first.hydrate()
    dayLog.setCompleted('2026-08-20', true)
    await wait(400)
    first.dispose()
    __resetDayLogPersistence()

    // A fresh "app run" (new store instance) still gets the real data.
    setActivePinia(createPinia())
    const fresh = useDayLogStore()
    const second = useDayLogPersistence(fresh)
    await second.hydrate()
    expect(fresh.get('2026-08-20')?.completed).toBe(true)
    second.dispose()
  })
})
