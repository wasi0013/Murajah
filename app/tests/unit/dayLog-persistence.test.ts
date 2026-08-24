import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { defineComponent, h, onMounted } from 'vue'
import { useDayLogStore } from '@/stores/dayLog'
import { useDayLogPersistence, __resetDayLogPersistence } from '@/composables/useDayLogPersistence'
import { loadDayLog, _resetUserDataDb } from '@/core/storage/userData'

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

  /**
   * The bug the detached-`effectScope` fix (see the module's own doc comment)
   * actually caught: calling `hydrate()` at the top level of a test, like
   * every case above, never puts the watcher inside a component's `setup()`
   * — so it could never exercise Vue's auto-stop-on-unmount behavior in the
   * first place. Only a real mount happens to hit it, which is why this needs
   * `@vue/test-utils`, not the plain composable calls above. Discovered via
   * `tests/e2e/mark-page.spec.ts`: TodayView (the first view to hydrate) sets
   * up the watcher inside its own setup; navigating to the marking view
   * unmounts TodayView, which used to kill the watcher outright and, by the
   * idempotent guard, leave it dead for the rest of the session — every
   * future mutation kept updating the live store (so the UI looked fine) but
   * silently stopped ever reaching disk.
   */
  const StubView = defineComponent({
    setup() {
      const persistence = useDayLogPersistence()
      onMounted(() => void persistence.hydrate())
      return () => h('div')
    },
  })

  it('a mutation made while a second view is mounted still reaches disk, even though the first (watcher-establishing) view already unmounted', async () => {
    const first = mount(StubView) // e.g. TodayView — the first to hydrate, so it sets up the watcher
    await Promise.resolve()
    await wait(10)
    first.unmount() // e.g. navigating away — used to silently kill the watcher along with this view

    const second = mount(StubView) // e.g. JournalPanel/MarkPageView, hydrating again
    await Promise.resolve()
    await wait(10)

    const dayLog = useDayLogStore()
    dayLog.setCompleted('2026-08-24', true) // e.g. a tap while the second view is live

    await wait(400) // the debounced save
    const stored = await loadDayLog()
    expect(stored.get('2026-08-24')?.completed).toBe(true)

    second.unmount()
  })
})
