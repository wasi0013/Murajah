/**
 * Full "reset to brand new" — wipes every persistence layer the app writes to
 * (all IndexedDB databases, every Cache Storage bucket, the reader
 * feature-flag override and anything else in localStorage) and unregisters
 * the service worker, so the next load boots exactly like a first-ever
 * install. Irreversible — callers must get explicit user confirmation first
 * (see SettingsView's "Reset app" section).
 */
const DATABASES = ['murajah-userdata', 'murajah-prefs', 'murajah-assets', 'murajah-images']

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
