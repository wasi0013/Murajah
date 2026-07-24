import { watch } from 'vue'
import { useQuizStore } from '@/stores/quiz'
import { loadQuizAccuracy, saveQuizAccuracy } from '@/core/storage/userData'

const DEBOUNCE_MS = 300

/**
 * Binds the quiz-accuracy store to IndexedDB (Phase 6.2). `hydrate()` loads the
 * per-page windows; a debounced watch persists each answered question. Shares the
 * app DB — no separate quiz database. Best-effort; storage errors never surface.
 *
 * Today loads this too (not just the quiz view), so weakness scoring reflects quiz
 * history even when you open straight to the practice screen.
 */
export function useQuizPersistence(store = useQuizStore()) {
  async function hydrate(): Promise<void> {
    const map = await loadQuizAccuracy()
    if (map.size) store.setAll(map)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = watch(
    () => store.snapshot(),
    (snap) => {
      clearTimeout(timer)
      timer = setTimeout(() => void saveQuizAccuracy(snap), DEBOUNCE_MS)
    },
  )

  function dispose(): void {
    clearTimeout(timer)
    stop()
  }

  return { hydrate, dispose }
}
