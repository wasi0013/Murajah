import { watch } from 'vue'
import { usePlanStore } from '@/stores/plan'
import { loadPlan, savePlan } from '@/core/storage/userData'

const DEBOUNCE_MS = 300

/**
 * Binds the plan store to IndexedDB (the `plan` key): `hydrate()` loads the stored
 * plan (call once at app start), and a debounced watch persists changes off the
 * render path. Best-effort — storage errors never surface. Mirrors
 * {@link useProgressPersistence} / {@link useMistakesPersistence}.
 */
export function usePlanPersistence(plan = usePlanStore()) {
  async function hydrate(): Promise<void> {
    plan.setAll(await loadPlan())
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = watch(
    () => plan.snapshot(),
    (snap) => {
      clearTimeout(timer)
      timer = setTimeout(() => void savePlan(snap), DEBOUNCE_MS)
    },
    { deep: true },
  )

  function dispose(): void {
    clearTimeout(timer)
    stop()
  }

  return { hydrate, dispose }
}
