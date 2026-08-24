import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { defineComponent, h, onMounted } from 'vue'
import { useProgressStore } from '@/stores/progress'
import { loadProgress, _resetUserDataDb } from '@/core/storage/userData'
import { useProgressPersistence, __resetProgressPersistence } from '@/composables/useProgressPersistence'

// Regression coverage for the bug where listening/reading time earned on a
// view with no persistence watcher of its own (Listen, playing a surah/juz/
// whole-Quran scope) got silently discarded the moment any other view's
// `onMounted` re-hydrated the store from the last IndexedDB snapshot — see
// useProgressPersistence.ts's module doc.

const DEBOUNCE_MS = 300
const settle = (ms = DEBOUNCE_MS + 150) => new Promise((r) => setTimeout(r, ms))

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  __resetProgressPersistence()
  setActivePinia(createPinia())
})

describe('useProgressPersistence', () => {
  it('hydrates from storage only once no matter how many views call it', async () => {
    const progress = useProgressStore()

    // "App.vue" hydrates first — the real load (storage is empty, so this is
    // a no-op beyond starting the watcher).
    await useProgressPersistence(progress).hydrate()

    // A ticker outside any view's lifetime (useListeningTime) bumps the store,
    // the way it would while the user is on a route with no persistence watcher
    // (e.g. Listen, playing a surah/juz/whole-Quran scope).
    progress.addListeningSeconds(42)

    // A second view (e.g. ProgressView/TodayView) mounts and calls hydrate()
    // too, exactly like today's per-view onMounted call — this must NOT
    // re-load-and-overwrite the store from the (stale, pre-tick) snapshot.
    await useProgressPersistence(progress).hydrate()

    expect(progress.listeningSeconds).toBe(42)
  })

  it('a route with no hydrate() call still gets its ticks saved (the Listen-tab bug)', async () => {
    const progress = useProgressStore()

    // App-level hydrate starts the debounced watcher, same as App.vue.
    await useProgressPersistence(progress).hydrate()

    // Simulate listening via the Listen tab: nothing on that route calls
    // hydrate() itself, but the store is still ticking (useListeningTime is
    // mounted globally in App.vue, independent of the current route).
    progress.addListeningSeconds(120)
    await settle()

    // Now the user taps Progress; that view re-hydrates from storage.
    const reloaded = await loadProgress()
    expect(reloaded.listeningSeconds).toBe(120)
  })

  it('dispose() no longer drops a pending debounced save', async () => {
    const progress = useProgressStore()
    const persistence = useProgressPersistence(progress)
    await persistence.hydrate()

    progress.addReadingSeconds(7)
    persistence.dispose() // e.g. the view unmounts right away, before the debounce fires
    await settle()

    const reloaded = await loadProgress()
    expect(reloaded.readingSeconds).toBe(7)
  })

  /**
   * Every case above calls `hydrate()` at the top level of the test, never
   * inside a mounted component's `setup()` — so none of them could exercise
   * Vue's auto-stop-on-unmount for a `watch()` created there, which is
   * exactly the bug the detached-`effectScope` fix closes (see the module's
   * own doc comment, and `useDayLogPersistence.ts`'s sibling test, which is
   * what actually caught this via a real mount-unmount-mount sequence).
   */
  const StubView = defineComponent({
    setup() {
      const persistence = useProgressPersistence()
      onMounted(() => void persistence.hydrate())
      return () => h('div')
    },
  })

  it('a tick made while a second view is mounted still reaches disk, even though the first (watcher-establishing) view already unmounted', async () => {
    const first = mount(StubView) // e.g. App.vue's own hydrate — the first to run, so it sets up the watcher
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 10)) // let hydrate()'s load resolve before unmounting
    first.unmount() // in the real bug, App.vue never unmounts — this simulates any route that raced it

    const second = mount(StubView) // e.g. TodayView, hydrating again
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 10))

    const progress = useProgressStore()
    progress.addReadingSeconds(9)

    await settle()
    const reloaded = await loadProgress()
    expect(reloaded.readingSeconds).toBe(9)

    second.unmount()
  })
})
