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
  /** Fetch a page image as a Blob (cached). `path` is app-relative. */
  fetchBlob(path: string): Promise<Blob>
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

  async function load(url: string): Promise<Blob> {
    const cache = await cachePromise
    if (cache) {
      const hit = await cache.get<Blob>(url)
      if (hit !== undefined) return hit
    }
    const res = await fetch(url)
    if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`)
    const blob = await res.blob()
    if (cache) void cache.put(url, blob, blob.size).catch(() => {})
    return blob
  }

  return {
    fetchBlob(path: string): Promise<Blob> {
      const url = resolveUrl(path)
      const pending = inflight.get(url)
      if (pending) return pending
      const p = load(url).finally(() => inflight.delete(url))
      inflight.set(url, p)
      return p
    },
    setVersion(version: string): void {
      cachePromise = AssetCache.open({ name: IMAGE_DB, version, maxBytes: IMAGE_CAP }).catch(
        () => null,
      )
    },
  }
}
