import { defineAsyncComponent, type AsyncComponentLoader } from 'vue'
import { toast } from '@/composables/useToast'
import { t } from '@/core/i18n'
import { isLikelyOffline } from '@/core/network/offline'

/** One retry (two attempts total) before giving up — network blips are
 * common and brief; a genuinely offline device will just fail again fast. */
const MAX_ATTEMPTS = 2
const RETRY_DELAY_MS = 500

/**
 * Wraps `defineAsyncComponent` for every in-page (non-route) lazy component
 * — `AudioHost`, `RecordingPanel`, `MorphologyPopup` — with the one thing
 * every bare `defineAsyncComponent(() => import(...))` call site in this
 * app was missing: what happens when the chunk fails to load, most commonly
 * because the device is offline.
 *
 * Unhandled, Vue's async-component wrapper throws to the app-level error
 * handler — by the time a user taps something mid-session to trigger one of
 * these, the app has already booted, so `main.ts`'s handler just logs it to
 * the console and shows nothing. The tap then does *nothing visible*, which
 * reads as the app having crashed rather than "you're offline" (reported:
 * the Reader/Mushaf headphone icon while offline). Worse: Vue caches a
 * failed load for the lifetime of the `defineAsyncComponent()` call (i.e.
 * the whole page visit, since it's created once in `<script setup>`) unless
 * something calls the `retry` callback — so even tapping the same trigger
 * again, after reconnecting, would silently do nothing again.
 *
 * This retries once, then surfaces a clear toast (network-specific when it
 * looks like one) and calls `onFail` so the caller can reset whatever
 * "open" state triggered the mount — leaving the trigger visually closed
 * rather than stuck in a broken-looking half-open state. Retrying again
 * within the *same* page visit still isn't possible after that (a Vue
 * limitation this doesn't work around) — the natural recovery is leaving
 * and returning to the page, which remounts a fresh `defineAsyncComponent`.
 */
export function lazyComponent<T extends object>(loader: AsyncComponentLoader<T>, onFail?: () => void): T {
  return defineAsyncComponent<T>({
    loader,
    onError(error, retry, fail, attempts) {
      if (attempts < MAX_ATTEMPTS) {
        setTimeout(retry, RETRY_DELAY_MS)
        return
      }
      console.error('[lazyComponent] failed to load:', error)
      toast(t(isLikelyOffline(error) ? 'common.networkError' : 'common.loadError'), { variant: 'error' })
      onFail?.()
      fail()
    },
  })
}
