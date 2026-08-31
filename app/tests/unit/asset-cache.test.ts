import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { AssetCache, CACHE_SCHEMA_VERSION } from '@/core/storage/assetCache'
import * as idb from '@/core/storage/idb'

// Fresh IndexedDB per test.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('AssetCache', () => {
  it('stores and retrieves JSON by url', async () => {
    const cache = await AssetCache.open({ version: 'v1' })
    expect(await cache.get('a')).toBeUndefined()
    await cache.put('a', { hello: 'world' }, 100)
    expect(await cache.get('a')).toEqual({ hello: 'world' })
  })

  it('evicts least-recently-used entries past the byte cap', async () => {
    const cache = await AssetCache.open({ version: 'v1', maxBytes: 250 })
    await cache.put('a', 1, 100)
    await cache.put('b', 2, 100)
    // Touch 'a' so 'b' becomes least-recently-used.
    await cache.get('a')
    await cache.put('c', 3, 100) // total 300 > 250 → evict oldest (b)

    expect(await cache.get('a')).toBe(1)
    expect(await cache.get('c')).toBe(3)
    expect(await cache.get('b')).toBeUndefined()
  })

  it('purges everything when the data version changes', async () => {
    const c1 = await AssetCache.open({ version: 'v1' })
    await c1.put('a', 1, 100)
    expect(await c1.get('a')).toBe(1)

    // Reopen with a new version → stale entries cleared.
    const c2 = await AssetCache.open({ version: 'v2' })
    expect(await c2.get('a')).toBeUndefined()

    // Same version → entries survive.
    await c2.put('b', 2, 100)
    const c3 = await AssetCache.open({ version: 'v2' })
    expect(await c3.get('b')).toBe(2)
  })

  it('CACHE_SCHEMA_VERSION is a stable constant, not data-content-derived', async () => {
    // data.worker.ts opens the JSON chunk cache with this fixed constant
    // (not the data manifest's build-timestamp version) — per-URL content
    // hashing (paths.ts's `?v=`) means a data change never needs a purge, so
    // reopening with the same schema version must never drop entries.
    const c1 = await AssetCache.open({ version: CACHE_SCHEMA_VERSION })
    await c1.put('a', 1, 100)
    const c2 = await AssetCache.open({ version: CACHE_SCHEMA_VERSION })
    expect(await c2.get('a')).toBe(1)
  })
})

// P0-2 (plans/performance-audit-2026-08.md): put() used to call the
// full-table-scan evict() unconditionally on every write. It now tracks a
// running in-memory byte total (seeded once in open()) and only scans when
// that total is actually over the cap — these tests pin the new behavior
// directly, on top of the existing black-box eviction test above.
describe('AssetCache — running byte total (P0-2)', () => {
  it('does not scan the whole store on a put() that stays under the byte cap', async () => {
    const getAllSpy = vi.spyOn(idb, 'idbGetAll')
    const cache = await AssetCache.open({ version: 'v1', maxBytes: 10_000 })
    getAllSpy.mockClear() // drop the one-time seed scan from open()

    for (let i = 0; i < 20; i++) await cache.put(`url-${i}`, i, 100) // 2000 total, well under 10,000

    expect(getAllSpy).not.toHaveBeenCalled()
    getAllSpy.mockRestore()
  })

  it('still evicts oldest-first once puts push the running total over the cap', async () => {
    const getAllSpy = vi.spyOn(idb, 'idbGetAll')
    const cache = await AssetCache.open({ version: 'v1', maxBytes: 250 })
    getAllSpy.mockClear()

    await cache.put('a', 1, 100)
    await cache.put('b', 2, 100)
    expect(getAllSpy).not.toHaveBeenCalled() // 200 <= 250, no scan needed yet
    // Touch 'a' so 'b' becomes least-recently-used (matches the black-box
    // eviction test above) — this scan-triggering behavior isn't about LRU
    // ordering per se, just that going over cap forces exactly one scan.
    await cache.get('a')
    await cache.put('c', 3, 100) // 300 > 250 → must scan to evict

    expect(getAllSpy).toHaveBeenCalledTimes(1)
    expect(await cache.get('a')).toBe(1)
    expect(await cache.get('c')).toBe(3)
    expect(await cache.get('b')).toBeUndefined() // oldest (by LRU), evicted
    getAllSpy.mockRestore()
  })

  it('re-putting the same url tracks the size delta, not the sum', async () => {
    const cache = await AssetCache.open({ version: 'v1', maxBytes: 1000 })
    await cache.put('a', 'small', 100)
    expect(cache._debugTotalBytes()).toBe(100)
    await cache.put('a', 'bigger', 300) // overwrite, not an addition
    expect(cache._debugTotalBytes()).toBe(300) // not 400
  })

  it('delete() decrements the running total so a later put() evicts correctly', async () => {
    const cache = await AssetCache.open({ version: 'v1', maxBytes: 250 })
    await cache.put('a', 1, 100)
    await cache.put('b', 2, 100)
    await cache.delete('a')
    expect(cache._debugTotalBytes()).toBe(100)

    await cache.put('c', 3, 100) // 200 total, under cap — must NOT evict 'b'
    expect(await cache.get('b')).toBe(2)
    expect(await cache.get('c')).toBe(3)
  })

  it('seeds the running total from an existing (pre-fix) store on open, not from zero', async () => {
    const c1 = await AssetCache.open({ version: 'v1', maxBytes: 10_000 })
    await c1.put('a', 1, 4000)
    await c1.put('b', 2, 4000)

    // Reopen (simulates a fresh page load / a cache created before this fix
    // existed) — the new instance must recompute the real total, not start
    // from 0 and let the cache silently grow past its cap.
    const c2 = await AssetCache.open({ version: 'v1', maxBytes: 10_000 })
    expect(c2._debugTotalBytes()).toBe(8000)
    await c2.put('c', 3, 3000) // 11,000 > 10,000 → must evict despite starting fresh
    expect(await c2.get('a')).toBeUndefined() // oldest, evicted
    expect(await c2.get('c')).toBe(3)
  })

  // Code-review follow-up: totalBytes is per-instance, seeded once at open()
  // — two instances on the same underlying store (e.g. this app open in two
  // tabs) each stay blind to the other's writes indefinitely otherwise. A
  // forced full resync every RESYNC_EVERY_N_PUTS(50) puts bounds that drift
  // instead of leaving it unbounded for an instance's whole lifetime.
  it('periodically resyncs totalBytes from disk, catching drift from another instance on the same store', async () => {
    const cacheA = await AssetCache.open({ version: 'v1', maxBytes: 1_000_000 })
    const cacheB = await AssetCache.open({ version: 'v1', maxBytes: 1_000_000 }) // e.g. a second tab

    await cacheA.put('from-a', 1, 5000) // cacheB has no way to know this happened
    expect(cacheB._debugTotalBytes()).toBe(0) // drifted

    // 49 puts on cacheB stay on the fast path — no resync yet, still unaware of cacheA.
    for (let i = 0; i < 49; i++) await cacheB.put(`b-${i}`, i, 10)
    expect(cacheB._debugTotalBytes()).toBe(490)

    // The 50th put forces a full resync, correcting the drift.
    await cacheB.put('b-49', 49, 10)
    expect(cacheB._debugTotalBytes()).toBe(5000 + 500) // cacheA's 5000 + cacheB's own 500
  })
})
