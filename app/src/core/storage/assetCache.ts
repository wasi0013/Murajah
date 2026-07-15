import { idbGet, idbGetAll, openDb, txDone } from './idb'

/**
 * Persistent cache for fetched JSON chunks (owner of `/data/*` — see the
 * boundary note in phase-1-data-assets.md 1.7.2). Keyed by URL, with:
 *  - a byte-size cap enforced by LRU eviction (oldest `ts` first), and
 *  - a data-version stamp: opening with a new version clears stale entries.
 *
 * Runs inside the data worker, so all of this is off the main thread.
 */
const DB_NAME = 'murajah-assets'
const DB_VERSION = 1 // schema version (not data version)
const STORE = 'assets'
const META = 'meta'

interface Entry {
  url: string
  data: unknown
  bytes: number
  ts: number
}

export interface AssetCacheOptions {
  /** Data version (manifest.version). A change purges the store. */
  version: string
  /** Byte cap before LRU eviction kicks in. Default 24MB. */
  maxBytes?: number
}

export class AssetCache {
  private readonly db: IDBDatabase
  private readonly maxBytes: number
  private lastTs = 0

  private constructor(db: IDBDatabase, maxBytes: number) {
    this.db = db
    this.maxBytes = maxBytes
  }

  /** Strictly-increasing LRU stamp (wall-clock has ms granularity — too coarse
   * for rapid successive accesses). */
  private nextTs(): number {
    this.lastTs = Math.max(Date.now(), this.lastTs + 1)
    return this.lastTs
  }

  static async open(opts: AssetCacheOptions): Promise<AssetCache> {
    const db = await openDb(DB_NAME, DB_VERSION, (d) => {
      if (!d.objectStoreNames.contains(STORE)) {
        const s = d.createObjectStore(STORE, { keyPath: 'url' })
        s.createIndex('ts', 'ts')
      }
      if (!d.objectStoreNames.contains(META)) d.createObjectStore(META)
    })
    const cache = new AssetCache(db, opts.maxBytes ?? 24 * 1024 * 1024)
    await cache.purgeIfVersionChanged(opts.version)
    return cache
  }

  async get<T>(url: string): Promise<T | undefined> {
    const tx = this.db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const entry = await idbGet<Entry>(store, url)
    if (entry) {
      entry.ts = this.nextTs() // touch for LRU
      store.put(entry)
    }
    await txDone(tx)
    return entry?.data as T | undefined
  }

  async put(url: string, data: unknown, bytes: number): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ url, data, bytes, ts: this.nextTs() } satisfies Entry)
    await txDone(tx)
    await this.evict()
  }

  /** Evict least-recently-used entries until total bytes are under the cap. */
  private async evict(): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const entries = await idbGetAll<Entry>(store)
    let total = entries.reduce((sum, e) => sum + e.bytes, 0)
    if (total > this.maxBytes) {
      entries.sort((a, b) => a.ts - b.ts) // oldest first
      for (const e of entries) {
        if (total <= this.maxBytes) break
        store.delete(e.url)
        total -= e.bytes
      }
    }
    await txDone(tx)
  }

  private async purgeIfVersionChanged(version: string): Promise<void> {
    const tx = this.db.transaction([STORE, META], 'readwrite')
    const meta = tx.objectStore(META)
    const stored = await idbGet<string>(meta, 'version')
    if (stored !== version) {
      tx.objectStore(STORE).clear()
      meta.put(version, 'version')
    }
    await txDone(tx)
  }
}
