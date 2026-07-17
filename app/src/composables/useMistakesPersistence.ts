import { watch } from 'vue'
import { useMistakesStore } from '@/stores/mistakes'
import { loadMistakes, saveMistakes } from '@/core/storage/userData'

const DEBOUNCE_MS = 300

/**
 * Binds the mistakes store to IndexedDB independently of the reader — so surfaces
 * that read mistakes without mounting the reader (e.g. the Progress view) still
 * see persisted marks. `hydrate()` loads them; a debounced watch persists changes.
 * The reader keeps its own binding via `useMistakes`; the two never mount at once
 * (separate routes). Best-effort — storage errors never surface.
 */
export function useMistakesPersistence(store = useMistakesStore()) {
  async function hydrate(): Promise<void> {
    const map = await loadMistakes()
    if (map.size) store.setAll(map)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = watch(
    () => store.snapshot(),
    (snap) => {
      clearTimeout(timer)
      timer = setTimeout(() => void saveMistakes(snap), DEBOUNCE_MS)
    },
  )

  function dispose(): void {
    clearTimeout(timer)
    stop()
  }

  return { hydrate, dispose }
}
