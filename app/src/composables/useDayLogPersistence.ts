import { watch } from 'vue'
import { useDayLogStore } from '@/stores/dayLog'
import { loadDayLog, saveDayLog } from '@/core/storage/userData'

const DEBOUNCE_MS = 300

/**
 * Binds the day log to IndexedDB (the `dayLog` key): `hydrate()` loads the stored
 * history (call once at app start — the streak depends on it), and a debounced watch
 * persists changes off the render path. Best-effort — storage errors never surface.
 */
export function useDayLogPersistence(dayLog = useDayLogStore()) {
  async function hydrate(): Promise<void> {
    dayLog.setAll(await loadDayLog())
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = watch(
    () => dayLog.snapshot(),
    (snap) => {
      clearTimeout(timer)
      timer = setTimeout(() => void saveDayLog(snap), DEBOUNCE_MS)
    },
    { deep: true },
  )

  function dispose(): void {
    clearTimeout(timer)
    stop()
  }

  return { hydrate, dispose }
}
