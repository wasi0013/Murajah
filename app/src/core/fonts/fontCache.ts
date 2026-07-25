import { resolveUrl } from '@/core/data/transport'
import { AssetCache, CACHE_SCHEMA_VERSION } from '@/core/storage/assetCache'

/**
 * Persistent byte cache for per-page Quran fonts, mirroring
 * `core/mushaf/imageTransport.ts`. Before this, fonts were only ever cached
 * via the service worker's Cache Storage route (`/fonts/*`) — a side effect of
 * the browser's own font fetch, invisible to and unverifiable by app code. That
 * made font availability an incidental property of which pages a user had
 * visited online, not a deterministic part of "download for offline complete."
 * Routing font bytes through this cache (like images and JSON already are)
 * makes them a first-class, verifiable part of the offline pack.
 *
 * Font content is static reference data (a given page's glyph mapping doesn't
 * change), so — like images — this opens with the fixed `CACHE_SCHEMA_VERSION`
 * rather than any content-derived version; there's nothing to purge on a data
 * deploy.
 */
export interface FontCache {
  /** Fetch a font file as an ArrayBuffer (cached). `path` is app-relative. */
  fetchBuffer(path: string): Promise<ArrayBuffer>
}

const FONT_DB = 'murajah-fonts'
/** ~180MB: comfortably holds the full font set (QPC + Tajweed + Indopak,
 * ~145MB) with headroom, so a completed "download for offline" is never
 * silently evicted under LRU pressure. */
const FONT_CAP = 180 * 1024 * 1024

export function createFontCache(): FontCache {
  // Opens eagerly (unlike the image cache, which waits for its own manifest's
  // content-derived version): the schema version here is a fixed constant, not
  // dependent on any fetched data, so there's nothing to wait for.
  const cachePromise: Promise<AssetCache | null> = AssetCache.open({
    name: FONT_DB,
    version: CACHE_SCHEMA_VERSION,
    maxBytes: FONT_CAP,
  }).catch(() => null)

  const inflight = new Map<string, Promise<ArrayBuffer>>()

  async function load(url: string): Promise<ArrayBuffer> {
    const cache = await cachePromise
    if (cache) {
      const hit = await cache.get<ArrayBuffer>(url)
      // A 0-byte hit is a poisoned entry (a past truncated response) — drop it
      // and re-fetch rather than handing back a font that will never load.
      if (hit !== undefined && hit.byteLength > 0) return hit
      if (hit !== undefined) await cache.delete(url).catch(() => {})
    }
    const res = await fetch(url)
    if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`)
    const buffer = await res.arrayBuffer()
    if (buffer.byteLength === 0) throw new Error(`empty font ${url}`)
    if (cache) void cache.put(url, buffer, buffer.byteLength).catch(() => {})
    return buffer
  }

  return {
    fetchBuffer(path: string): Promise<ArrayBuffer> {
      const url = resolveUrl(path)
      const pending = inflight.get(url)
      if (pending) return pending
      const p = load(url).finally(() => {
        if (inflight.get(url) === p) inflight.delete(url)
      })
      inflight.set(url, p)
      return p
    },
  }
}
