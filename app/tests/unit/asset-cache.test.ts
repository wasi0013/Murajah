import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { AssetCache, CACHE_SCHEMA_VERSION } from '@/core/storage/assetCache'

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
