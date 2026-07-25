import { idbGet, openDb, txDone } from './idb'

/**
 * Tiny key/value store for app preferences (reader view options, last page),
 * kept separate from the asset cache (`murajah-assets`) and from migrating user
 * data (mistakes/progress, Phase 4/8). Prefs are small and non-critical: writes
 * are debounced by the caller and failures are swallowed so persistence never
 * blocks or breaks the reader.
 */
const DB_NAME = 'murajah-prefs'
const DB_VERSION = 1
const STORE = 'prefs'

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDb(DB_NAME, DB_VERSION, (d) => {
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE)
    })
  }
  return dbPromise
}

/** Read a pref by key; resolves `undefined` if absent or on any error. */
export async function getPref<T>(key: string): Promise<T | undefined> {
  try {
    const tx = (await db()).transaction(STORE, 'readonly')
    const value = await idbGet<T>(tx.objectStore(STORE), key)
    await txDone(tx)
    return value
  } catch {
    return undefined
  }
}

/** Write a pref. Errors are swallowed (best-effort persistence). */
export async function setPref(key: string, value: unknown): Promise<void> {
  try {
    const tx = (await db()).transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    await txDone(tx)
  } catch {
    /* best-effort */
  }
}

/** Remove a single pref by key. Errors are swallowed (best-effort). */
export async function deletePref(key: string): Promise<void> {
  try {
    const tx = (await db()).transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    await txDone(tx)
  } catch {
    /* best-effort */
  }
}

/** Test hook: drop the cached connection so a fresh DB is opened next call. */
export function _resetPrefsDb(): void {
  dbPromise = null
}
