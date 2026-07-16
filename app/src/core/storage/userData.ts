import { idbGet, openDb, txDone } from './idb'

/**
 * Persistence for migratable user data (mistakes now; memorized pages, perfect
 * revisions, etc. join in Phase 4) — the local-first source of truth that must
 * survive across sessions and stay importable from legacy backups. Stored in its
 * own DB, separate from the regenerable asset cache and from view prefs. Maps and
 * Sets are serialized to plain JSON for storage.
 */
const DB_NAME = 'murajah-userdata'
const DB_VERSION = 1
const STORE = 'data'
const MISTAKES_KEY = 'mistakes'

/** On-disk mistakes shape: `{ "<qpcPage>": wordId[] }` (matches legacy export). */
export type StoredMistakes = Record<string, number[]>

let dbPromise: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDb(DB_NAME, DB_VERSION, (d) => {
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE)
    })
  }
  return dbPromise
}

export function serializeMistakes(map: Map<number, Set<number>>): StoredMistakes {
  const out: StoredMistakes = {}
  for (const [page, set] of map) out[String(page)] = [...set]
  return out
}

export function deserializeMistakes(stored: StoredMistakes | undefined): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>()
  for (const [page, ids] of Object.entries(stored ?? {})) {
    map.set(Number(page), new Set(ids))
  }
  return map
}

/** Load persisted mistakes (empty map if none / on error). */
export async function loadMistakes(): Promise<Map<number, Set<number>>> {
  try {
    const tx = (await db()).transaction(STORE, 'readonly')
    const stored = await idbGet<StoredMistakes>(tx.objectStore(STORE), MISTAKES_KEY)
    await txDone(tx)
    return deserializeMistakes(stored)
  } catch {
    return new Map()
  }
}

/** Persist mistakes (best-effort). */
export async function saveMistakes(map: Map<number, Set<number>>): Promise<void> {
  try {
    const tx = (await db()).transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(serializeMistakes(map), MISTAKES_KEY)
    await txDone(tx)
  } catch {
    /* best-effort */
  }
}

/** Test hook: drop the cached connection. */
export function _resetUserDataDb(): void {
  dbPromise = null
}
