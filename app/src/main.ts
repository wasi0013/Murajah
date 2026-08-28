import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { router } from '@/router'
import { usePwaUpdate } from '@/composables/usePwaUpdate'

// The boot-fallback panel (index.html) is a dependency-free classic script so
// it still runs when this module never executes at all (old WebView, entry
// chunk 404, ...) — see the comment above its <style> block for the full
// rationale. These two hooks are how *this* module, once it does run, talks
// back to it: `__murajahBootReady` clears the spinner/timeout once there's
// something real on screen; `__murajahShowBootTrouble` surfaces the retry
// panel immediately on a known failure instead of waiting out the timeout.
// Both are optional — a plain `npm run dev`/test load that never touched
// index.html's fallback (e.g. Vitest's jsdom) simply has neither defined.
declare global {
  interface Window {
    __murajahBootReady?: () => void
    __murajahShowBootTrouble?: () => void
  }
}

const app = createApp(App)
app.use(createPinia()).use(router)

// `mount()` returns once the root component's own synchronous setup is done —
// well before the first route's lazy chunk has even been requested, let alone
// resolved. Clearing the boot fallback on `mount()` alone would hide the
// spinner while leaving an empty shell behind on a slow/failed first route:
// the original bug, minus the diagnosis. `router.isReady()` is the real
// signal — it resolves only once the initial navigation (including that lazy
// component) has completed, and rejects if it failed, which gets the retry
// panel up immediately instead of waiting out the full timeout.
let bootReady = false
void router.isReady().then(
  () => {
    bootReady = true
    window.__murajahBootReady?.()
  },
  (error: unknown) => {
    console.error('[router] initial navigation failed:', error)
    window.__murajahShowBootTrouble?.()
  },
)

// Vue swallows a setup/render error thrown during the initial mount by
// default (a console.error, no rethrow) — exactly the failure mode reported
// (dark screen, nothing loading, no visible error) if it happens to be what
// hangs boot. Logged either way; only escalates to the boot-trouble panel
// while the initial navigation hasn't resolved yet, so a later error deep in
// some already-running feature never re-hijacks the whole screen.
app.config.errorHandler = (error, _instance, info) => {
  console.error('[app] uncaught error:', error, info)
  if (!bootReady) window.__murajahShowBootTrouble?.()
}

app.mount('#app')

// Fire-and-forget: retires the legacy SW and registers the new one (see
// plans/archive/phase-10-pwa-migration.md §10.2) without blocking first paint.
// `.catch` guards against an unhandled rejection if `register()` itself
// throws (seen from some in-app browsers / locked-down environments) — a
// failure here must stay a non-fatal no-op for PWA/update-toast/pwa_boot
// (never an uncaught error), and it's already independent of page-view
// analytics (see router/index.ts), which is not gated on this succeeding.
// Logged, not swallowed silently — a real regression here should still be
// visible in the console/error monitoring, just never break the app.
usePwaUpdate()
  .init()
  .catch((error: unknown) => console.warn('[pwa] init failed (non-fatal):', error))
