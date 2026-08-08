import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { router } from '@/router'
import { usePwaUpdate } from '@/composables/usePwaUpdate'

createApp(App).use(createPinia()).use(router).mount('#app')

// Fire-and-forget: retires the legacy SW and registers the new one (see
// plans/phase-10-pwa-migration.md §10.2) without blocking first paint.
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
