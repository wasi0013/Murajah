import { idbGet, idbGetAll, openDb, txDone } from './idb'

/**
 * Persistent cache for fetched JSON chunks (owner of `/data/*` — see the
 * boundary note in phase-1-data-assets.md 1.7.2). Keyed by URL, with:
 *  - a byte-size cap enforced by LRU eviction (oldest `ts` first), and
 *  - a data-version stamp: opening with a new version clears stale entries.
 *
 * Runs inside the data worker, so all of this is off the main thread.
 */
const DEFAULT_DB_NAME = 'murajah-assets'
const DB_VERSION = 1 // schema version (not data version)
const STORE = 'assets'
const META = 'meta'

/**
 * Pass this (not the data manifest's `version`) to `AssetCache.open()` for the
 * JSON chunk cache. Every dataset/index URL is now content-hashed (`?v=`, see
 * `data-pipeline/src/lib/manifest.mjs` and `core/data/paths.ts`), so a stale
 * schema mismatch is impossible by construction — a changed URL is simply a
 * cache miss. `purgeIfVersionChanged` no longer needs to track data content at
 * all; keying it to a hardcoded schema constant means it only fires when THIS
 * `Entry` shape actually changes (bump the string then), decoupled from data
 * deploys entirely. The data manifest's `version` is a build timestamp that
 * changes on every deploy regardless of content — wiring it in here would
 * wipe every user's downloaded cache on every code-only deploy too.
 */
export const CACHE_SCHEMA_VERSION = '1'

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
  /**
   * IndexedDB database name. Defaults to `murajah-assets` (reader JSON chunks).
   * The mushaf image cache passes its own name (`murajah-images`) so large
   * page Blobs get an independent byte cap and never evict reader data.
   */
  name?: string
}

/**
 * How many `put()`s an instance goes between forced full-table resyncs of
 * `totalBytes` — see that field's doc comment. Chosen so the existing
 * "no full-table read while under the byte cap" contract still holds for any
 * realistic single browsing session's worth of writes (well above what one
 * mushaf reading session or one data-worker session touches), while still
 * bounding cross-instance drift to a modest, self-correcting amount rather
 * than letting it run unchecked for an entire page-load's lifetime.
 */
const RESYNC_EVERY_N_PUTS = 50

export class AssetCache {
  private readonly db: IDBDatabase
  private readonly maxBytes: number
  private lastTs = 0
  /**
   * Running total of `bytes` across every entry currently in `STORE`, kept
   * in memory for this instance's lifetime (seeded once in `open()`, then
   * maintained incrementally by `put`/`delete`/`evict`, and periodically
   * resynced — see `RESYNC_EVERY_N_PUTS`). Exists so `put()` can decide
   * whether eviction is even necessary — see its doc comment — without
   * re-`getAll()`-ing the whole store, potentially every cached Blob's
   * metadata, on every single write.
   *
   * Not persisted across page loads (a fresh instance recomputes it once in
   * `open()`), and — important caveat — not shared *across* instances either:
   * two `AssetCache`s open on the same underlying IndexedDB store at once
   * (e.g. this app open in two browser tabs, each writing to the same
   * `murajah-images` store) each only see their own writes, so each one's
   * belief about the total can understate the true on-disk size by however
   * much the other instance has written. The periodic full resync below
   * bounds how far that can drift before self-correcting, rather than
   * leaving it unbounded for an instance's entire lifetime; the old
   * `getAll()`-per-put implementation had no such gap (it recomputed the
   * true total from disk before every single decision) but paid for that
   * with the full-table read this class exists to avoid. See
   * plans/performance-audit-2026-08.md P0-2 and its code-review follow-up.
   */
  private totalBytes = 0
  /** Puts since the last full resync of `totalBytes` — see `RESYNC_EVERY_N_PUTS`. */
  private putsSinceResync = 0

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
    const db = await openDb(opts.name ?? DEFAULT_DB_NAME, DB_VERSION, (d) => {
      if (!d.objectStoreNames.contains(STORE)) {
        const s = d.createObjectStore(STORE, { keyPath: 'url' })
        s.createIndex('ts', 'ts')
      }
      if (!d.objectStoreNames.contains(META)) d.createObjectStore(META)
    })
    const cache = new AssetCache(db, opts.maxBytes ?? 24 * 1024 * 1024)
    await cache.purgeIfVersionChanged(opts.version)
    await cache.seedTotalBytes()
    return cache
  }

  /** Full scan to (re)seed `totalBytes` from the true on-disk state — see its
   * doc comment. Called once from `open()`, after `purgeIfVersionChanged` (so
   * a just-cleared store correctly seeds to 0 rather than recomputing over
   * stale entries), and again periodically from `put()` per
   * `RESYNC_EVERY_N_PUTS`. */
  private async seedTotalBytes(): Promise<void> {
    const tx = this.db.transaction(STORE, 'readonly')
    const entries = await idbGetAll<Entry>(tx.objectStore(STORE))
    await txDone(tx)
    this.totalBytes = entries.reduce((sum, e) => sum + e.bytes, 0)
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

  /**
   * Write an entry and evict only if that pushes the running total over the
   * cap. A single-key `get(url)` first (cheap — one record by primary key,
   * not a table scan) finds any existing entry's byte size so an overwrite
   * (e.g. a retried fetch for a URL already cached) adjusts `totalBytes` by
   * the *delta*, never double-counts. Previously this called the full
   * `getAll()`-based `evict()` unconditionally on every write — for the
   * common case of a cache nowhere near its cap (e.g. the mushaf image
   * cache: ~68MB of real data under a 96MB cap for most users), that was a
   * full-table read of every cached entry's metadata on every single page
   * fetch, on the main thread for images. Every `RESYNC_EVERY_N_PUTS` writes,
   * `totalBytes` is also force-resynced from a true full scan — see that
   * field's doc comment for why (bounding cross-instance drift), and
   * `seedTotalBytes`'s doc comment for why this reuses the exact same scan.
   * See plans/performance-audit-2026-08.md P0-2.
   */
  async put(url: string, data: unknown, bytes: number): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const existing = await idbGet<Entry>(store, url)
    store.put({ url, data, bytes, ts: this.nextTs() } satisfies Entry)
    await txDone(tx)
    this.totalBytes += bytes - (existing?.bytes ?? 0)
    this.putsSinceResync += 1
    if (this.putsSinceResync >= RESYNC_EVERY_N_PUTS) {
      this.putsSinceResync = 0
      await this.seedTotalBytes()
    }
    if (this.totalBytes > this.maxBytes) await this.evict()
  }

  /** Drop a single entry — used to force a fresh fetch when a cached asset is
   * bad (e.g. a truncated image the user asked to retry). Also keeps
   * `totalBytes` accurate so a later `put()` doesn't evict based on a stale
   * (too-high) total. */
  async delete(url: string): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const existing = await idbGet<Entry>(store, url)
    store.delete(url)
    await txDone(tx)
    if (existing) this.totalBytes = Math.max(0, this.totalBytes - existing.bytes)
  }

  /** Evict least-recently-used entries until total bytes are under the cap.
   * Only called from `put()` once `totalBytes` is actually over `maxBytes` —
   * a full-table scan, same as `seedTotalBytes`'s periodic resync, but it
   * now runs solely on the rare "cache is actually full" sweep instead of
   * on every write. */
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
    this.totalBytes = total
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

  /** Test hook: current running total, to assert `put`/`delete` keep it
   * accurate without reaching into private state. */
  _debugTotalBytes(): number {
    return this.totalBytes
  }
}
