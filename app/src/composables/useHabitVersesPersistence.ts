import { watch } from 'vue'
import { useHabitVersesStore } from '@/stores/habitVerses'
import { loadHabitVerseCursor, saveHabitVerseCursor } from '@/core/storage/userData'

const DEBOUNCE_MS = 300

/**
 * Binds the habit-builder verse cursor to IndexedDB (the `habitVerses` key):
 * `hydrate()` loads it (call once at app start), and a debounced watch persists
 * changes off the render path. Best-effort — storage errors never surface.
 */
export function useHabitVersesPersistence(store = useHabitVersesStore()) {
  async function hydrate(): Promise<void> {
    store.setAll(await loadHabitVerseCursor())
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = watch(
    () => store.snapshot(),
    (snap) => {
      clearTimeout(timer)
      timer = setTimeout(() => void saveHabitVerseCursor(snap), DEBOUNCE_MS)
    },
    { deep: true },
  )

  function dispose(): void {
    clearTimeout(timer)
    stop()
  }

  return { hydrate, dispose }
}
