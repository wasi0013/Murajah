/**
 * Retires the legacy `source/sw.js` (live on murajah.pages.dev, scope `/`,
 * controlling every existing user) before the new app registers its own
 * service worker — see plans/phase-10-pwa-migration.md §10.2, the load-bearing
 * task this whole phase is organized around.
 *
 * Cache deletion is prefix-matched against the two known legacy bucket names
 * ONLY (`murajah-cache-`, `murajah-fonts-`) — never a blanket wipe, so it can
 * never eat the new app's own Workbox-named buckets. This function never
 * touches IndexedDB (a separate, origin-scoped API) — memorized pages, plans,
 * streaks, and recordings live there and must survive every migration.
 *
 * Unregistering is scoped to registrations that are NOT our own SW script —
 * this runs on every boot (not just the first), so it must never nuke the
 * app's own still-active registration on a routine visit; doing so once
 * caused a self-inflicted reload loop in testing (every boot "tore down" the
 * registration the previous boot had just created, forever re-triggering the
 * first-handoff nudge). In practice, on the very first run after a legacy
 * user's browser fetches the new app, the only registration present really is
 * the legacy one — same outcome as 10.2.1's "any registration at all"
 * shorthand, just without the routine-boot self-destruction.
 */
const LEGACY_CACHE_PREFIXES = ['murajah-cache-', 'murajah-fonts-']
export const OWN_SW_PATH = '/service-worker.js'

function scriptURLs(registration: ServiceWorkerRegistration): string[] {
  return [registration.active, registration.waiting, registration.installing]
    .filter((w): w is ServiceWorker => w !== null)
    .map((w) => w.scriptURL)
}

function isOwnRegistration(registration: ServiceWorkerRegistration): boolean {
  return scriptURLs(registration).some((url) => new URL(url).pathname === OWN_SW_PATH)
}

/** Returns true if a legacy (non-own) registration was found and unregistered. */
export async function unregisterLegacyServiceWorkers(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  const registrations = await navigator.serviceWorker.getRegistrations()
  const legacy = registrations.filter((r) => !isOwnRegistration(r))
  await Promise.all(legacy.map((r) => r.unregister()))
  return legacy.length > 0
}

export async function deleteLegacyCaches(): Promise<void> {
  if (!('caches' in self)) return
  const keys = await caches.keys()
  await Promise.all(
    keys
      .filter((key) => LEGACY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .map((key) => caches.delete(key)),
  )
}

/** Returns true if a legacy registration existed and was torn down. */
export async function teardownLegacyPwa(): Promise<boolean> {
  const [foundLegacy] = await Promise.all([unregisterLegacyServiceWorkers(), deleteLegacyCaches()])
  return foundLegacy
}
