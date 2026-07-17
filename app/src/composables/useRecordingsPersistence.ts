import { watch } from 'vue'
import { useRecordingsStore } from '@/stores/recordings'
import { loadRecordings, saveRecordings } from '@/core/storage/userData'

const DEBOUNCE_MS = 300

/**
 * Binds the recordings store to IndexedDB (7.6.2). `hydrate()` loads saved
 * recordings; a debounced watch persists the list on change. Best-effort — storage
 * errors never surface. Shares the app DB (no separate database).
 */
export function useRecordingsPersistence(store = useRecordingsStore()) {
  async function hydrate(): Promise<void> {
    const list = await loadRecordings()
    if (list.length) store.setAll(list)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = watch(
    () => store.items,
    (items) => {
      clearTimeout(timer)
      timer = setTimeout(() => void saveRecordings(items), DEBOUNCE_MS)
    },
    { deep: false },
  )

  function dispose(): void {
    clearTimeout(timer)
    stop()
  }

  return { hydrate, dispose }
}
