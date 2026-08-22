import { watch } from 'vue'
import { useProgressStore } from '@/stores/progress'
import { loadProgress, saveProgress } from '@/core/storage/userData'

const DEBOUNCE_MS = 300

/**
 * Binds the progress store to IndexedDB. `progress` isn't only mutated by the
 * view that happens to be mounted — `useListeningTime` (App.vue) ticks it every
 * second for as long as audio plays, from *any* route, precisely so listening
 * keeps counting across navigation. A watcher that lived and died with each
 * view (the old design) meant any route that forgot to instantiate this
 * composable — Listen, browsing Contents, Settings, … — silently had no save
 * path: seconds ticked in memory, then vanished the moment some other view's
 * `hydrate()` next overwrote the store from the last snapshot that *did* get
 * saved. So this now hydrates and watches **once per app run**, not once per
 * view: `hydrate()` is idempotent — the first caller (App.vue, at startup)
 * performs the real load and starts the debounced save watcher; every other
 * caller (each view's own "load progress before accruing rewards/milestones"
 * call) just awaits that same resolved promise. The watcher then lives for the
 * app's lifetime, so a route without its own hydrate() call is still covered.
 *
 * `dispose()` is kept only so existing call sites don't need to change — there
 * is nothing left to tear down per view.
 */
let hydrated: Promise<void> | null = null
let stopWatcher: (() => void) | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined

export function useProgressPersistence(progress = useProgressStore()) {
  function hydrate(): Promise<void> {
    // Start the debounced watcher before the load resolves, not after: a
    // change landing while `loadProgress()` is still in flight must still be
    // captured, and starting first only ever means it schedules a save of
    // whatever `setAll` is about to overwrite anyway — never a lost write.
    stopWatcher ??= watch(
      () => progress.snapshot(),
      (snap) => {
        clearTimeout(saveTimer)
        saveTimer = setTimeout(() => void saveProgress(snap), DEBOUNCE_MS)
      },
      { deep: true },
    )
    return (hydrated ??= loadProgress().then((p) => progress.setAll(p)))
  }

  function dispose(): void {
    /* the watcher now lives for the app's lifetime — see module doc above */
  }

  return { hydrate, dispose }
}

/** Test-only: drop the singleton so a fresh Pinia/watcher can be bound. */
export function __resetProgressPersistence(): void {
  stopWatcher?.()
  stopWatcher = null
  hydrated = null
  clearTimeout(saveTimer)
}
