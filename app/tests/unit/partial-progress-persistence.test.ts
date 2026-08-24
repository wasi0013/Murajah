import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { defineComponent, h, onMounted } from 'vue'
import { usePartialProgressStore } from '@/stores/partialProgress'
import {
  usePartialProgressPersistence,
  __resetPartialProgressPersistence,
} from '@/composables/usePartialProgressPersistence'
import { loadPartialProgress, _resetUserDataDb } from '@/core/storage/userData'

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

  /**
   * Every case above calls `hydrate()` at the top level of the test, never
   * inside a mounted component's `setup()` — so none of them could exercise
   * Vue's auto-stop-on-unmount for a `watch()` created there, which is
   * exactly the bug the detached-`effectScope` fix closes (see the module's
   * own doc comment, caught for real via `tests/e2e/mark-page.spec.ts`).
   * MarkPageView is currently this composable's only caller, but the fix is
   * kept consistent with its `useDayLogPersistence`/`useProgressPersistence`
   * siblings so a second future caller doesn't silently reintroduce it.
   */
  const StubView = defineComponent({
    setup() {
      const persistence = usePartialProgressPersistence()
      onMounted(() => void persistence.hydrate())
      return () => h('div')
    },
  })

  it('a mutation made while a second view is mounted still reaches disk, even though the first (watcher-establishing) view already unmounted', async () => {
    const first = mount(StubView)
    await Promise.resolve()
    await wait(10) // let hydrate()'s load resolve before unmounting
    first.unmount()

    const second = mount(StubView)
    await Promise.resolve()
    await wait(10)

    const store = usePartialProgressStore()
    store.toggleAyah(202, 2, 5)

    await wait(400)
    const stored = await loadPartialProgress()
    expect(stored).toEqual({ page: 202, marks: [{ surah: 2, ayah: 5 }] })

    second.unmount()
  })
})
