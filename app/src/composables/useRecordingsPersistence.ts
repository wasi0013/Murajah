import { watch } from 'vue'
import { useRecordingsStore } from '@/stores/recordings'
import { loadRecordings, saveRecordings } from '@/core/storage/userData'

const DEBOUNCE_MS = 300

/**
 * Binds the recordings store to IndexedDB (7.6.2): a debounced watch persists
 * the list on change. Best-effort — storage errors never surface. Shares the
 * app DB (no separate database).
 *
 * `hydrate()` is idempotent **per app run** (Phase 12.4.1), matching
 * `useProgressPersistence`/`useDayLogPersistence` — recordings now have two
 * mount points (`RecordingPanel` and the Journal day-detail sheet), and a
 * naive second `hydrate()` calling `setAll()` from a fresh disk read could
 * overwrite a recording just added by the first view before its own debounced
 * save had flushed.
 */
let hydrated: Promise<void> | null = null
let stopWatcher: (() => void) | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined

export function useRecordingsPersistence(store = useRecordingsStore()) {
  function hydrate(): Promise<void> {
    stopWatcher ??= watch(
      () => store.items,
      (items) => {
        clearTimeout(saveTimer)
        saveTimer = setTimeout(() => void saveRecordings(items), DEBOUNCE_MS)
      },
      { deep: false },
    )
    return (hydrated ??= loadRecordings().then((list) => {
      if (list.length) store.setAll(list)
    }))
  }

  function dispose(): void {
    /* the watcher now lives for the app's lifetime — see module doc above */
  }

  return { hydrate, dispose }
}

/** Test-only: drop the singleton so a fresh Pinia/watcher can be bound. */
export function __resetRecordingsPersistence(): void {
  stopWatcher?.()
  stopWatcher = null
  hydrated = null
  clearTimeout(saveTimer)
}
