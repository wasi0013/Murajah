/// <reference lib="webworker" />
/**
 * Murajah service worker (redesigned app) — see plans/phase-10-pwa-migration.md.
 *
 * - Navigation (documents): Workbox NetworkFirst on Android/desktop. iOS/iPadOS
 *   instead gets `networkOnlyNavigation` — a plain fetch with zero Cache Storage
 *   involvement — because iOS WebKit has repeatedly broken on synthesized/cached
 *   Responses used to fulfil a navigation (three distinct incidents in the legacy
 *   `source/sw.js`, most recently WebKitBlobResource error 1 on Home Screen PWA
 *   relaunch; see plan §0.1). The `IS_IOS` gate mirrors that file's hotfix
 *   byte-for-byte in intent so both codebases reason about iOS the same way.
 * - `/data/*` and `/fonts/*`: stale-while-revalidate on every platform, iOS
 *   included — sub-resource caching was never implicated in any navigation
 *   incident, so it stays identical everywhere (mirrors `_headers`' own
 *   revalidation policy).
 * - `clientsClaim()` on activate, matching legacy's aggressive-takeover
 *   precedent for *uncontrolled* clients (a fresh install, or the very first
 *   legacy→new handoff). `skipWaiting()` is deliberately NOT called
 *   automatically — a waiting worker instead sits until the app's update
 *   toast (`usePwaUpdate`) posts `SKIP_WAITING` on an explicit user tap (see
 *   plan decision 5: invite a refresh, never silently yank an open tab out
 *   from under a mid-recitation user).
 */
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope

const IS_IOS = new URL(self.location.href).searchParams.get('platform') === 'ios'

clientsClaim()

// Precaching the app shell is exactly the thing iOS's navigation bug family
// keeps finding new ways to break on — skip it there entirely. Android/desktop
// get the normal Workbox-injected manifest.
if (!IS_IOS) {
  precacheAndRoute(self.__WB_MANIFEST)
}

/**
 * Network-only navigation for iOS/iPadOS: no `cache.put`, no `cache.match`
 * fallback — nothing WebKit can later decide is stale or invalid. The
 * tradeoff (accepted, see plan decision 2): iOS loses "read fully offline
 * forever" for the app shell but keeps everything below (per-page data/fonts).
 */
async function networkOnlyNavigation(request: Request): Promise<Response> {
  try {
    return await fetch(request)
  } catch {
    return new Response('Offline — please reconnect and try again.', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' },
    })
  }
}

if (IS_IOS) {
  registerRoute(({ request }) => request.mode === 'navigate', ({ request }) => networkOnlyNavigation(request))
} else {
  registerRoute(({ request }) => request.mode === 'navigate', new NetworkFirst({ cacheName: 'murajah-app-navigation' }))
}

registerRoute(
  ({ url }) => url.pathname.startsWith('/data/'),
  new StaleWhileRevalidate({ cacheName: 'murajah-app-data' }),
)

registerRoute(
  ({ url }) => url.pathname.startsWith('/fonts/'),
  new StaleWhileRevalidate({ cacheName: 'murajah-app-fonts' }),
)

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
