import { effectScope, watch } from 'vue'
import { useDayLogStore } from '@/stores/dayLog'
import { loadDayLog, saveDayLog } from '@/core/storage/userData'

const DEBOUNCE_MS = 300

/**
 * Binds the day log to IndexedDB (the `dayLog` key): a debounced watch persists
 * changes off the render path. Best-effort — storage errors never surface.
 *
 * `hydrate()` is idempotent **per app run** (Phase 12.4.1) — the day log used to
 * have exactly one caller (`TodayView`), so a second, naive `hydrate()` was never
 * exercised; Journal (Phase 12) is now a second view that needs the same store
 * hydrated on its own mount, and a second `setAll()` from a fresh disk load would
 * silently overwrite an in-flight mutation the first caller made but hadn't
 * flushed yet (a task just completed in Today, then an immediate navigation to
 * Journal before the 300ms debounce fires — reproduced in
 * `tests/unit/dayLog-persistence.test.ts`). Mirrors the same fix
 * `useProgressPersistence.ts` already carries for the identical class of bug —
 * see that module's doc comment for the fuller rationale.
 *
 * The watcher is created inside a **detached `effectScope`**, not directly
 * inside whichever view's `setup()` happens to call `hydrate()` first. Vue
 * auto-stops any `watch()` created during a component's `setup()` when that
 * component unmounts — so without this, the watcher set up by the first
 * caller (say, TodayView) silently dies the moment that view unmounts (e.g.
 * navigating to Journal, or to the marking view), and the idempotent guard
 * above then permanently blocks any later caller from re-establishing it:
 * every dayLog mutation for the rest of the session keeps updating the live
 * store (so the UI looks correct) but never reaches disk again. A unit test
 * calling `hydrate()` directly (outside any component) never exercises this,
 * since a bare `watch()` outside `setup()` was never scope-bound to begin
 * with — only a real mount-unmount-mount sequence surfaces it (see
 * `tests/e2e/mark-page.spec.ts`, which is what caught this).
 */
let hydrated: Promise<void> | null = null
let stopWatcher: (() => void) | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined

export function useDayLogPersistence(dayLog = useDayLogStore()) {
  function hydrate(): Promise<void> {
    // Start the watcher before the load resolves — a change landing mid-flight
    // still gets captured (worst case it schedules a save of what `setAll` is
    // about to overwrite anyway), never lost.
    if (!stopWatcher) {
      const scope = effectScope(true)
      stopWatcher = () => scope.stop()
      scope.run(() => {
        watch(
          () => dayLog.snapshot(),
          (snap) => {
            clearTimeout(saveTimer)
            saveTimer = setTimeout(() => void saveDayLog(snap), DEBOUNCE_MS)
          },
          { deep: true },
        )
      })
    }
    return (hydrated ??= loadDayLog().then((log) => dayLog.setAll(log)))
  }

  function dispose(): void {
    /* the watcher now lives for the app's lifetime — see module doc above */
  }

  return { hydrate, dispose }
}

/** Test-only: drop the singleton so a fresh Pinia/watcher can be bound. */
export function __resetDayLogPersistence(): void {
  stopWatcher?.()
  stopWatcher = null
  hydrated = null
  clearTimeout(saveTimer)
}
