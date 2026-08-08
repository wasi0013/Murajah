import { watch } from 'vue'
import { useMistakesStore } from '@/stores/mistakes'
import { useMistakeColorsStore } from '@/stores/mistakeColors'
import { loadMistakes, saveMistakes, loadMistakeColors, saveMistakeColors } from '@/core/storage/userData'

const DEBOUNCE_MS = 300

/**
 * Binds the mistakes store (+ its color layer, stores/mistakeColors.ts) to
 * IndexedDB independently of the reader — so surfaces that read mistakes
 * without mounting the reader (e.g. the Progress view) still see persisted
 * marks. `hydrate()` loads them; a debounced watch persists changes. The
 * reader keeps its own binding via `useMistakes`; the two never mount at once
 * (separate routes). Best-effort — storage errors never surface.
 */
export function useMistakesPersistence(
  store = useMistakesStore(),
  colors = useMistakeColorsStore(),
) {
  async function hydrate(): Promise<void> {
    const [map, colorMap] = await Promise.all([loadMistakes(), loadMistakeColors()])
    if (map.size) store.setAll(map)
    if (colorMap.size) colors.setAll(colorMap)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let colorTimer: ReturnType<typeof setTimeout> | undefined
  const stop = watch(
    () => store.snapshot(),
    (snap) => {
      clearTimeout(timer)
      timer = setTimeout(() => void saveMistakes(snap), DEBOUNCE_MS)
    },
  )
  const stopColors = watch(
    () => colors.snapshot(),
    (snap) => {
      clearTimeout(colorTimer)
      colorTimer = setTimeout(() => void saveMistakeColors(snap), DEBOUNCE_MS)
    },
  )

  function dispose(): void {
    clearTimeout(timer)
    clearTimeout(colorTimer)
    stop()
    stopColors()
  }

  return { hydrate, dispose }
}
