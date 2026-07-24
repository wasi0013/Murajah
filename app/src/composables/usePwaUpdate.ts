import { registerServiceWorker, type PwaController } from '@/core/pwa/registerServiceWorker'
import { trackEvent } from '@/core/analytics'
import { toast } from '@/composables/useToast'
import { t } from '@/core/i18n'

// Approved in plan open question 2: the very first legacy→new handoff gets a
// stronger, one-time nudge (brief message, then reload) rather than the
// steady-state "tap to refresh" toast — a stale legacy shell showing
// indefinitely is worse here than a short, explained reload.
const FIRST_HANDOFF_MESSAGE_MS = 1500
// iOS's background update-check is unreliable (plan 10.4.2) — proactively
// re-check on foreground, but not on every focus/visibilitychange flicker.
const UPDATE_CHECK_THROTTLE_MS = 60_000

let controller: PwaController | null = null
let initialized = false
// Seeded to "now" (not 0) at init — a visibilitychange/focus event firing
// moments after boot (routine right after a fresh load/reload) must NOT
// immediately re-check for updates: racing a manual `update()` call against
// the registration's own still-settling initial install reliably produced a
// spurious duplicate install cycle in testing (an infinite reload loop, every
// boot re-triggering "update found" for byte-identical content).
let lastCheck = Date.now()

function throttledCheck(): void {
  if (document.visibilityState !== 'visible') return
  const now = Date.now()
  if (now - lastCheck < UPDATE_CHECK_THROTTLE_MS) return
  lastCheck = now
  void controller?.checkForUpdate()
}

/**
 * Registers the new service worker (retiring the legacy one first, see
 * `registerServiceWorker`) and wires the update UX around it. A singleton —
 * call `init()` once from app boot; safe to import/call `usePwaUpdate()` from
 * anywhere without re-registering.
 */
export function usePwaUpdate() {
  async function init(): Promise<void> {
    if (initialized) return
    initialized = true

    controller = await registerServiceWorker({
      onNeedRefresh: (isFirstHandoff) => {
        if (isFirstHandoff) {
          // The legacy worker was still controlling this document when the
          // new one installed, so it parked in "waiting" just like a routine
          // update — approved stronger nudge (open question 2): a brief
          // explanation, then apply automatically rather than waiting on a tap.
          toast(t('pwa.rebuilt'), { duration: FIRST_HANDOFF_MESSAGE_MS })
          setTimeout(() => controller?.applyUpdate(), FIRST_HANDOFF_MESSAGE_MS)
          return
        }
        toast(t('pwa.updateAvailable'), {
          duration: 0, // stays until tapped or the user navigates away — re-offered next boot otherwise
          onAction: () => controller?.applyUpdate(),
        })
      },
      onControllerChange: () => window.location.reload(),
    })

    if (controller) {
      trackEvent('pwa_boot', { migrated: controller.isFirstHandoff })
      document.addEventListener('visibilitychange', throttledCheck)
      window.addEventListener('focus', throttledCheck)
    }
  }

  return { init }
}
