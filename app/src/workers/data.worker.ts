/// <reference lib="webworker" />
// Thin data worker: fetch + parse JSON off the main thread, with an in-worker
// cache so repeated requests for the same URL don't re-fetch/re-parse.
// It receives already-absolute URLs (resolved on the main thread).

interface Req {
  id: number
  url: string
}
interface Res {
  id: number
  ok: boolean
  result?: unknown
  error?: string
}

const cache = new Map<string, Promise<unknown>>()

function fetchJson(url: string): Promise<unknown> {
  let hit = cache.get(url)
  if (!hit) {
    hit = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`)
        return res.json()
      })
      .catch((err) => {
        cache.delete(url)
        throw err
      })
    cache.set(url, hit)
  }
  return hit
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, url } = e.data
  try {
    const result = await fetchJson(url)
    ;(self as DedicatedWorkerGlobalScope).postMessage({ id, ok: true, result } satisfies Res)
  } catch (err) {
    ;(self as DedicatedWorkerGlobalScope).postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies Res)
  }
}
