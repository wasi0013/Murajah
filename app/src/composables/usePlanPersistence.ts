import { effectScope, watch } from 'vue'
import { usePlanStore } from '@/stores/plan'
import { loadPlan, savePlan } from '@/core/storage/userData'
import { getDataClient } from '@/core/data'
import type { DataClient } from '@/core/data/dataClient'

const DEBOUNCE_MS = 300

/**
 * Binds the plan store to IndexedDB (the `plan` key): `hydrate()` loads the stored
 * plan, and a debounced watch persists changes off the render path. Best-effort —
 * storage errors never surface. Mirrors {@link useProgressPersistence} /
 * {@link useDayLogPersistence} / {@link usePartialProgressPersistence}, including
 * both fixes those carry:
 *
 * - `hydrate()` is idempotent per app run (`hydrated ??=`) — four different views
 *   (Today, Progress, Quiz, the marking view) each call it on their own mount, and
 *   a naive second `loadPlan()` + `setAll()` would silently overwrite an in-flight
 *   mutation the first caller made but hadn't flushed yet (e.g. finishing a task on
 *   Today, then immediately navigating to Progress before the 300ms debounce
 *   fires). This module previously had *no* guard at all — every `hydrate()` call
 *   unconditionally re-fetched and clobbered.
 * - The watcher (and its debounce timer) runs inside a **detached `effectScope`**,
 *   not directly inside whichever view's `setup()` calls `hydrate()` first — Vue
 *   auto-stops a `watch()` created during a component's `setup()` when that
 *   component unmounts. This module previously set the watcher up fresh on every
 *   call (unconditionally, outside any guard), which avoided *that* specific
 *   failure mode by accident (every view got its own independent watcher) but
 *   traded it for a different loss: navigating away before a view's own 300ms
 *   debounce fired called that view's `dispose()`, which cancelled its own pending
 *   save outright, silently dropping the mutation — the new view's fresh watcher
 *   only reacts to *further* changes, not the one already baked into its starting
 *   snapshot. A single shared, detached watcher has neither problem.
 *
 * `hydrate()` also injects the QPC nav index's `juzToPage`, which the store needs to
 * expand a juz scope into pages. It's fetched here rather than in the store so the
 * store stays free of async data loads, and here rather than in each view so no
 * surface can render a juz plan with an empty scope.
 */
let hydrated: Promise<void> | null = null
let stopWatcher: (() => void) | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined

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

  function hydrate(): Promise<void> {
    // Start the watcher before the load resolves — a change landing mid-flight
    // still gets captured (worst case it schedules a save of what `setAll` is
    // about to overwrite anyway), never lost.
    if (!stopWatcher) {
      const scope = effectScope(true)
      stopWatcher = () => scope.stop()
      scope.run(() => {
        watch(
          () => plan.snapshot(),
          (snap) => {
            clearTimeout(saveTimer)
            saveTimer = setTimeout(() => void savePlan(snap), DEBOUNCE_MS)
          },
          { deep: true },
        )
      })
    }
    return (hydrated ??= Promise.all([loadPlan(), loadJuzIndex()]).then(([stored]) => plan.setAll(stored)))
  }

  function dispose(): void {
    /* the watcher now lives for the app's lifetime — see module doc above */
  }

  return { hydrate, dispose }
}

/** Test-only: drop the singleton so a fresh Pinia/watcher can be bound. */
export function __resetPlanPersistence(): void {
  stopWatcher?.()
  stopWatcher = null
  hydrated = null
  clearTimeout(saveTimer)
}
