import { watch } from 'vue'
import { useProgressStore } from '@/stores/progress'
import { loadProgress, saveProgress } from '@/core/storage/userData'

const DEBOUNCE_MS = 300

/**
 * Binds the progress store to IndexedDB: `hydrate()` loads persisted memorization
 * (call it once at app/reader start), and a debounced watch persists changes off
 * the render path. Best-effort — storage errors never surface.
 */
export function useProgressPersistence(progress = useProgressStore()) {
  async function hydrate(): Promise<void> {
    progress.setAll(await loadProgress())
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = watch(
    () => progress.snapshot(),
    (snap) => {
      clearTimeout(timer)
      timer = setTimeout(() => void saveProgress(snap), DEBOUNCE_MS)
    },
    { deep: true },
  )

  function dispose(): void {
    clearTimeout(timer)
    stop()
  }

  return { hydrate, dispose }
}
