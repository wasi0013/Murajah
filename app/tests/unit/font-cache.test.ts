import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { createFontCache } from '@/core/fonts/fontCache'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})
afterEach(() => vi.unstubAllGlobals())

function stubFetch(bytes: number) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response(new ArrayBuffer(bytes), { status: 200 })),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('createFontCache', () => {
  it('fetches once over the network, then serves from the persistent cache', async () => {
    const fetchMock = stubFetch(1024)
    const cache = createFontCache()

    const first = await cache.fetchBuffer('fonts/qpc-v2/p1.woff2')
    expect(first.byteLength).toBe(1024)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // A second cache instance (simulating a later session) must still hit the
    // persistent cache, not the network — this is what makes a downloaded
    // font durable across reloads, unlike the old SW-Cache-Storage-only path.
    const cache2 = createFontCache()
    const second = await cache2.fetchBuffer('fonts/qpc-v2/p1.woff2')
    expect(second.byteLength).toBe(1024)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('dedupes concurrent fetches for the same URL', async () => {
    const fetchMock = stubFetch(2048)
    const cache = createFontCache()

    const [a, b] = await Promise.all([
      cache.fetchBuffer('fonts/tajweed/p1.woff2'),
      cache.fetchBuffer('fonts/tajweed/p1.woff2'),
    ])
    expect(a.byteLength).toBe(2048)
    expect(b.byteLength).toBe(2048)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws on a non-ok response and does not cache it', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))))
    const cache = createFontCache()
    await expect(cache.fetchBuffer('fonts/qpc-v2/p999.woff2')).rejects.toThrow(/404/)
  })

  it('treats an empty response as a poisoned fetch, throws, and retries later', async () => {
    const fetchMock = stubFetch(0)
    const cache = createFontCache()
    await expect(cache.fetchBuffer('fonts/qpc-v2/p2.woff2')).rejects.toThrow(/empty font/)

    // A later real response should succeed rather than replay the empty one.
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(new ArrayBuffer(512), { status: 200 })),
    )
    const retried = await cache.fetchBuffer('fonts/qpc-v2/p2.woff2')
    expect(retried.byteLength).toBe(512)
  })
})
