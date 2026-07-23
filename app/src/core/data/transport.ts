// A Transport fetches + parses a JSON resource by app-relative path.
// Injectable so the DataClient can run over a Web Worker in production or a
// direct fetch/mock in tests.
export interface Transport {
  fetchJson<T>(path: string): Promise<T>
  /** Optional: tell a persistent-cache transport the current data version
   * (a change purges stale entries). No-op for memory-only transports. */
  setVersion?(version: string): void
}

/**
 * Resolve an app-relative path (e.g. `data/qpc/pages/1.json`) to an absolute
 * URL using Vite's BASE_URL. Done on the main thread so a Web Worker receives
 * an absolute URL (a worker's relative fetch would resolve against the worker
 * script path, not the app root).
 */
export function resolveUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  return new URL(base + path, location.origin).href
}

/** In-memory promise cache: dedupes in-flight and completed requests. */
function memoize<T>(fn: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>()
  return (key) => {
    let hit = cache.get(key)
    if (!hit) {
      hit = fn(key).catch((err) => {
        cache.delete(key) // don't cache failures
        throw err
      })
      cache.set(key, hit)
    }
    return hit
  }
}

/** Direct-fetch transport (main thread). Fallback when Workers are unavailable. */
export function createFetchTransport(): Transport {
  const get = memoize<unknown>(async (url: string) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`)
    // See data.worker.ts's identical guard: a missing file can still 200 via
    // the SPA fallback, so check content-type before trusting the body is JSON.
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('json')) {
      throw new Error(`fetch ${url}: expected JSON, got "${contentType || 'unknown'}" (missing file?)`)
    }
    return res.json()
  })
  return {
    fetchJson<T>(path: string): Promise<T> {
      return get(resolveUrl(path)) as Promise<T>
    },
  }
}
