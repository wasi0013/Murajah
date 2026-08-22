import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
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
})
