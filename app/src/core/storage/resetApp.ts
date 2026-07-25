/**
 * Full "reset to brand new" — wipes every persistence layer the app writes to
 * (all IndexedDB databases, every Cache Storage bucket, the reader
 * feature-flag override and anything else in localStorage) and unregisters
 * the service worker, so the next load boots exactly like a first-ever
 * install. Irreversible — callers must get explicit user confirmation first
 * (see SettingsView's "Reset app" section).
 */
const DATABASES = [
  'murajah-userdata',
  'murajah-prefs',
  'murajah-assets',
  'murajah-images',
  'murajah-fonts',
]

/** Regenerable caches only — never the user's memorization/progress data
 * (`murajah-userdata`) or the rest of their preferences (`murajah-prefs`'s
 * theme/reader/locale keys). Used by the safe "Clear cache" action. */
const REGENERABLE_DATABASES = ['murajah-assets', 'murajah-images', 'murajah-fonts']

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    // Best-effort: a stuck/blocked deletion (another tab holding the db open)
    // shouldn't stop the rest of the reset from proceeding.
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

async function deleteAllCaches(): Promise<void> {
  if (!('caches' in window)) return
  const keys = await caches.keys()
  await Promise.all(keys.map((key) => caches.delete(key)))
}

async function unregisterAllServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.map((r) => r.unregister()))
}

export async function resetApp(): Promise<void> {
  localStorage.clear()
  await Promise.all([
    ...DATABASES.map(deleteDatabase),
    deleteAllCaches(),
    unregisterAllServiceWorkers(),
  ])
}

/**
 * Safe cache reset: wipes only the regenerable caches — downloaded/cached
 * Quran text, images, fonts, and the service worker's Cache Storage buckets.
 * Never touches `murajah-userdata` (memorization progress, mistakes, plan,
 * recordings) or the rest of `murajah-prefs` (theme, reader view options,
 * locale) — those are the reason this exists as a distinct, non-destructive
 * action from `resetApp()`. The most common reason to use it: clearing out
 * stale or corrupted cached data as a first, non-destructive troubleshooting
 * step. Callers should still confirm with the user first (it can be a
 * multi-hundred MB deletion) and reload afterward so in-memory caches (the
 * data worker's dedupe map, loaded font faces) start clean.
 */
export async function clearResourceCache(): Promise<void> {
  await Promise.all([...REGENERABLE_DATABASES.map(deleteDatabase), deleteAllCaches()])
}
