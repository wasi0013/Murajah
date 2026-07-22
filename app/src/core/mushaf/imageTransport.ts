import { resolveUrl } from '@/core/data/transport'
import { AssetCache } from '@/core/storage/assetCache'

/**
 * Blob transport for the mushaf scans. Unlike the reader's JSON transport there
 * is no parse step to offload, and the browser decodes `<img>` bitmaps off the
 * main thread, so this runs on the main thread — no Web Worker. Persistence is
 * the point: page Blobs are cached in a dedicated IndexedDB store
 * (`murajah-images`, byte-capped LRU) so revisits and offline reads are instant.
 * That store is separate from the reader's `murajah-assets`, so 68MB of scans
 * never evict reader JSON chunks and vice-versa.
 */
export interface ImageTransport {
  /**
   * Fetch a page image as a Blob (cached). `path` is app-relative. Pass
   * `{ reload: true }` to force a fresh network fetch that bypasses both the
   * IndexedDB cache and the browser HTTP cache — used by an explicit retry, so a
   * cached bad/partial image can never keep serving the same failure.
   */
  fetchBlob(path: string, opts?: { reload?: boolean }): Promise<Blob>
  /** Set the image-set version; a change purges the image cache. */
  setVersion(version: string): void
}

const IMAGE_DB = 'murajah-images'
/** ~96MB: comfortably holds a long reading session's pages, still bounded well
 * under the full 68MB set so a device never fills up. */
const IMAGE_CAP = 96 * 1024 * 1024

export function createImageTransport(): ImageTransport {
  // In-flight only: concurrent requests for the same URL share one fetch, but
  // resolved Blobs are NOT retained here — subsequent reads come from the
  // IndexedDB cache (fast), keeping the JS heap bounded during a full read.
  const inflight = new Map<string, Promise<Blob>>()
  let cachePromise: Promise<AssetCache | null> = Promise.resolve(null)

  async function load(url: string, reload: boolean): Promise<Blob> {
    const cache = await cachePromise
    if (cache && reload) await cache.delete(url).catch(() => {})
    if (cache && !reload) {
      const hit = await cache.get<Blob>(url)
      // A 0-byte hit is a poisoned entry (a past truncated response) — drop it
      // and re-fetch rather than handing back an image that will never decode.
      if (hit !== undefined && hit.size > 0) return hit
      if (hit !== undefined) await cache.delete(url).catch(() => {})
    }
    const res = await fetch(url, reload ? { cache: 'reload' } : undefined)
    if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`)
    const blob = await res.blob()
    // Guard against a truncated body that resolved without throwing: caching an
    // empty blob would make every later read (and retry) fail identically.
    if (blob.size === 0) throw new Error(`empty image ${url}`)
    if (cache) void cache.put(url, blob, blob.size).catch(() => {})
    return blob
  }

  return {
    fetchBlob(path: string, opts?: { reload?: boolean }): Promise<Blob> {
      const url = resolveUrl(path)
      const reload = opts?.reload ?? false
      // A forced reload must not be de-duped onto an in-flight cached fetch.
      if (!reload) {
        const pending = inflight.get(url)
        if (pending) return pending
      }
      const p = load(url, reload).finally(() => {
        if (inflight.get(url) === p) inflight.delete(url)
      })
      if (!reload) inflight.set(url, p)
      return p
    },
    setVersion(version: string): void {
      cachePromise = AssetCache.open({ name: IMAGE_DB, version, maxBytes: IMAGE_CAP }).catch(
        () => null,
      )
    },
  }
}
