import { watch } from 'vue'
import { usePlanStore } from '@/stores/plan'
import { loadPlan, savePlan } from '@/core/storage/userData'
import { getDataClient } from '@/core/data'
import type { DataClient } from '@/core/data/dataClient'

const DEBOUNCE_MS = 300

/**
 * Binds the plan store to IndexedDB (the `plan` key): `hydrate()` loads the stored
 * plan (call once at app start), and a debounced watch persists changes off the
 * render path. Best-effort — storage errors never surface. Mirrors
 * {@link useProgressPersistence} / {@link useMistakesPersistence}.
 *
 * `hydrate()` also injects the QPC nav index's `juzToPage`, which the store needs to
 * expand a juz scope into pages. It's fetched here rather than in the store so the
 * store stays free of async data loads, and here rather than in each view so no
 * surface can render a juz plan with an empty scope.
 */
export function usePlanPersistence(plan = usePlanStore(), data: DataClient = getDataClient()) {
  /** Nav is best-effort and independent: a failed fetch must not lose the plan. */
  async function loadJuzIndex(): Promise<void> {
    try {
      await data.init()
      plan.setJuzToPage((await data.getNavIndex('qpc')).juzToPage)
    } catch {
      /* an all-memorized scope doesn't need it; a juz scope retries next launch */
    }
  }

  async function hydrate(): Promise<void> {
    const [stored] = await Promise.all([loadPlan(), loadJuzIndex()])
    plan.setAll(stored)
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
