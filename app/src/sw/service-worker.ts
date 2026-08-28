/// <reference lib="webworker" />
/**
 * Murajah service worker (redesigned app) — see plans/archive/phase-10-pwa-migration.md.
 *
 * - Navigation (documents): Workbox NetworkFirst on Android/desktop, with the
 *   same `networkTimeoutSeconds` as the manifest route below — a NetworkFirst
 *   with no timeout waits on the network indefinitely before ever trying the
 *   cache, so a returning user on a degraded-but-not-fully-offline connection
 *   (reported: a themed-but-empty screen, nothing rendering, no error — CSS
 *   painted the body but the shell never arrived) would hang rather than
 *   falling back to a perfectly good cached app shell. iOS/iPadOS instead gets
 *   `networkOnlyNavigation` — a plain fetch with zero Cache Storage
 *   involvement — because iOS WebKit has repeatedly broken on synthesized/cached
 *   Responses used to fulfil a navigation (three distinct incidents in the legacy
 *   `source/sw.js`, most recently WebKitBlobResource error 1 on Home Screen PWA
 *   relaunch; see plan §0.1). The `IS_IOS` gate mirrors that file's hotfix
 *   byte-for-byte in intent so both codebases reason about iOS the same way.
 * - `data/manifest.json` and `fonts/manifest.json`: network-first (short
 *   timeout), on every platform. These two files are the trust anchor every
 *   other `/data/*`/`/fonts/*` URL's content hash is checked against, so they
 *   must never be served stale from Cache Storage while a connection exists —
 *   see routeMatchers.ts's `isManifestRequest` docstring.
 * - Everything else under `/data/*`: cache-first on every platform, iOS
 *   included. Every dataset/index URL now carries a `?v=<hash>` of its own
 *   content (data-pipeline/src/lib/manifest.mjs), so a cache hit is never
 *   stale by construction — nothing left to revalidate, making cache-first a
 *   pure performance win over the previous stale-while-revalidate.
 * - Everything else under `/fonts/*`: cache-first too. Per-page font files
 *   aren't content-hashed (binary assets don't have JSON's silent-schema-drift
 *   failure mode, so the manifest-bloat cost of per-file hashing wasn't worth
 *   it — see the plan), but each URL is treated as immutable by convention
 *   (mirrors `_headers`), same as before.
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
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { isAppDataRequest, isAppFontsRequest, isManifestRequest } from './routeMatchers'

declare let self: ServiceWorkerGlobalScope

const IS_IOS = new URL(self.location.href).searchParams.get('platform') === 'ios'

// Shared by the navigation route and the manifest route below — both are
// NetworkFirst and both need the network given a fair chance before falling
// back, but neither should ever hang past this on a degraded connection.
const NETWORK_TIMEOUT_SECONDS = 4

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
  registerRoute(
    ({ request }) => request.mode === 'navigate',
    new NetworkFirst({ cacheName: 'murajah-app-navigation', networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS }),
  )
}

/**
 * A missing `/data` or `/fonts` asset returns the SPA shell (index.html, 200
 * text/html) via Cloudflare's not-found fallback rather than a real 404. Both
 * transports already reject that HTML at parse time (see transport.ts), but
 * the SW's cache would otherwise *store* the shell under the asset's URL,
 * poisoning it so the parse error persists across reloads. Refuse to cache any
 * text/html response on these sub-resource routes — refusing the write means
 * the entry never gets created, so it's still a cache miss (retried against
 * the network) next time, and a poisoned URL self-heals the moment a real
 * JSON/woff2 response comes back. Never applied to the navigation route below
 * — that one must cache HTML.
 */
const rejectHtml = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    (response.headers.get('content-type') ?? '').includes('text/html') ? null : response,
}

// Registered BEFORE the general /data/ and /fonts/ routes below — Workbox
// routing is first-match-wins, so the two manifest files never fall through to
// the generic (now cache-first) routes. Short network timeout: fast on a live
// connection, falls back to cache only when truly offline.
registerRoute(
  ({ url }) => isManifestRequest(url),
  new NetworkFirst({ cacheName: 'murajah-app-manifest', networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS }),
)

// cacheName bumped to -v3 (was stale-while-revalidate -v2): abandons any
// entries a prior version cached under an unversioned URL, rather than a
// cache-first hit serving one of those forever. New URLs are all `?v=<hash>`
// (data) or treated as immutable by convention (fonts, see the docstring
// above), so cache-first has nothing to revalidate going forward.
registerRoute(
  ({ url }) => isAppDataRequest(url),
  new CacheFirst({ cacheName: 'murajah-app-data-v3', plugins: [rejectHtml] }),
)

registerRoute(
  ({ url }) => isAppFontsRequest(url),
  new CacheFirst({ cacheName: 'murajah-app-fonts-v3', plugins: [rejectHtml] }),
)

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
