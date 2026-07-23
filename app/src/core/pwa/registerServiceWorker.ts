import { isIOS } from './platform'
import { OWN_SW_PATH, teardownLegacyPwa } from './legacyTeardown'

const SW_URL = OWN_SW_PATH
const SCOPE = '/' // must match legacy's scope exactly — see plan §10.2

export interface PwaController {
  registration: ServiceWorkerRegistration
  /** True when a legacy SW registration existed and was torn down this boot —
   * a returning/migrated user, as opposed to a fresh install (Phase 10.7.2's
   * rollout-health signal). */
  isFirstHandoff: boolean
  /** Ask the browser to check for a new deploy. Safe to call often — proactive
   * polling on foreground closes the gap where an installed iOS PWA left
   * backgrounded for days never notices a new deploy (plan 10.4.2). */
  checkForUpdate: () => Promise<void>
  /** Tell a waiting worker to activate and reload once it takes control. Only
   * called from an explicit user action (the update toast, or the first-
   * handoff nudge's own short auto-delay) — never silently, per decision 5: a
   * currently-open tab shouldn't be yanked out from under a mid-recitation
   * user without at least being told first. */
  applyUpdate: () => void
}

export interface PwaRegisterHandlers {
  /**
   * A new version has installed and is waiting — surface the update UX.
   * Fires immediately at boot too, if a prior visit already left a worker
   * waiting (re-offered next visit, not just mid-session) — and, critically,
   * this is also how a just-migrated legacy client learns to refresh: because
   * the legacy worker was still controlling this document when the new one
   * installed (see plan §10.2's teardown timing note), the new worker parks
   * in "waiting" exactly like a routine update rather than auto-activating —
   * `isFirstHandoff` lets the caller show the stronger one-time nudge
   * (decision 5 / open question 2) instead of the steady-state toast.
   */
  onNeedRefresh: (isFirstHandoff: boolean) => void
  /** The controlling worker just changed as a direct result of `applyUpdate()`
   * — reload to pick it up. Deliberately NOT fired for a first-ever/fresh
   * client's own `clientsClaim()` takeover (no prior controller): that
   * "controllerchange" is just the new worker acquiring a client that was
   * never controlled by anything, not an update superseding a live session,
   * and reloading for it is a no-op at best — see the guard below. */
  onControllerChange: () => void
}

/**
 * Tears down the legacy `source/sw.js` (universal — every platform, see
 * plan §10.2) and registers the new app's device-gated worker: on iOS this is
 * a legitimate distinct registration (`?platform=ios`) so the worker can
 * branch once at top level rather than per-fetch (decision 1).
 */
export async function registerServiceWorker(handlers: PwaRegisterHandlers): Promise<PwaController | null> {
  if (!('serviceWorker' in navigator)) return null

  const isFirstHandoff = await teardownLegacyPwa()

  const swUrl = isIOS() ? `${SW_URL}?platform=ios` : SW_URL
  const registration = await navigator.serviceWorker.register(swUrl, { scope: SCOPE })

  function watchForWaitingWorker(worker: ServiceWorker | null): void {
    if (!worker) return
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        handlers.onNeedRefresh(isFirstHandoff)
      }
    })
  }

  if (registration.waiting) handlers.onNeedRefresh(isFirstHandoff)
  watchForWaitingWorker(registration.installing)
  registration.addEventListener('updatefound', () => watchForWaitingWorker(registration.installing))

  // Only `applyUpdate()` — an explicit user action (or the first-handoff
  // nudge's own delay) — should ever cause a reload. A `controllerchange`
  // can also fire from `clientsClaim()` simply acquiring a client that had no
  // prior controller (a fresh install, or this document's own first-ever
  // activation) — reloading for that is the classic "reload on first
  // install" footgun: pointless at best, and in testing against a
  // still-active prior worker it compounded into a reload loop.
  let applyUpdateCalled = false
  let changed = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (changed || !applyUpdateCalled) return
    changed = true
    handlers.onControllerChange()
  })

  return {
    registration,
    isFirstHandoff,
    checkForUpdate: () => registration.update().then(() => {}, () => {}),
    applyUpdate: () => {
      applyUpdateCalled = true
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
    },
  }
}
