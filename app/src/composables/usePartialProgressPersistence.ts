import { effectScope, watch } from 'vue'
import { usePartialProgressStore } from '@/stores/partialProgress'
import { loadPartialProgress, savePartialProgress } from '@/core/storage/userData'

const DEBOUNCE_MS = 300

/**
 * Binds the partialProgress store to IndexedDB (the `partialProgress` key): a
 * debounced watch persists changes off the render path. Best-effort — storage
 * errors never surface. Mirrors `useDayLogPersistence.ts`'s shape, including
 * its idempotent-per-app-run `hydrate()` (a second caller reusing the same
 * in-flight/resolved load rather than re-fetching or clobbering an in-flight
 * mutation with a second `setAll()`), and its detached-`effectScope` watcher —
 * without it, the watcher set up inside whichever view's `setup()` calls
 * `hydrate()` first dies the moment that view unmounts (Vue auto-stops a
 * `watch()` created during a component's `setup()` on unmount), and the
 * idempotent guard then permanently blocks a replacement for the rest of the
 * session. See that module's doc comment for the fuller rationale.
 */
let hydrated: Promise<void> | null = null
let stopWatcher: (() => void) | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined

export function usePartialProgressPersistence(store = usePartialProgressStore()) {
  function hydrate(): Promise<void> {
    if (!stopWatcher) {
      const scope = effectScope(true)
      stopWatcher = () => scope.stop()
      scope.run(() => {
        watch(
          () => store.snapshot(),
          (snap) => {
            clearTimeout(saveTimer)
            saveTimer = setTimeout(() => void savePartialProgress(snap), DEBOUNCE_MS)
          },
          { deep: true },
        )
      })
    }
    return (hydrated ??= loadPartialProgress().then((state) => store.setAll(state)))
  }

  function dispose(): void {
    /* the watcher lives for the app's lifetime — see module doc above */
  }

  return { hydrate, dispose }
}

/** Test-only: drop the singleton so a fresh Pinia/watcher can be bound. */
export function __resetPartialProgressPersistence(): void {
  hydrated = null
  if (stopWatcher) {
    stopWatcher()
    stopWatcher = null
  }
  clearTimeout(saveTimer)
}
