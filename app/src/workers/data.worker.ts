/// <reference lib="webworker" />
// Data worker: fetch + parse JSON off the main thread, backed by two caches —
// an in-memory map (this session) and a persistent IndexedDB AssetCache
// (across sessions / offline). The AssetCache opens once the main thread signals
// the manifest has loaded; per-URL content hashing (see paths.ts) means the
// cache itself never needs purging on a data change, so it opens with a fixed
// schema version rather than the manifest's (deploy-timestamp) version.
import { AssetCache, CACHE_SCHEMA_VERSION } from '@/core/storage/assetCache'

interface FetchReq {
  id: number
  url: string
}
interface ConfigReq {
  cmd: 'setVersion'
  version: string
}
type Req = FetchReq | ConfigReq

interface Res {
  id: number
  ok: boolean
  result?: unknown
  error?: string
}

// ~100MB: generous headroom for organically-cached JSON (both layouts' text,
// translations, tafsir, morphology, nav indexes, surah names) built up over a
// normal reading session, well above the default 24MB cap sized for casual,
// unpinned reading only.
const JSON_CAP = 100 * 1024 * 1024

const mem = new Map<string, Promise<unknown>>()
let cachePromise: Promise<AssetCache | null> = Promise.resolve(null)

function fetchJson(url: string): Promise<unknown> {
  let hit = mem.get(url)
  if (!hit) {
    hit = load(url).catch((err) => {
      mem.delete(url)
      throw err
    })
    mem.set(url, hit)
  }
  return hit
}

async function load(url: string): Promise<unknown> {
  const cache = await cachePromise
  if (cache) {
    const cached = await cache.get<unknown>(url)
    if (cached !== undefined) return cached
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`)
  // A missing file can still come back 200 (SPA/history fallback serving
  // index.html instead of a real 404 — see public/_redirects) — catch that
  // here with a clear error instead of JSON.parse choking on "<!doctype ...".
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('json')) {
    throw new Error(`fetch ${url}: expected JSON, got "${contentType || 'unknown'}" (missing file?)`)
  }
  const text = await res.text()
  const data = JSON.parse(text)
  if (cache) void cache.put(url, data, text.length).catch(() => {})
  return data
}

const post = (r: Res) => (self as DedicatedWorkerGlobalScope).postMessage(r)

self.onmessage = async (e: MessageEvent<Req>) => {
  const msg = e.data
  if ('cmd' in msg) {
    if (msg.cmd === 'setVersion') {
      // msg.version (the manifest's build timestamp) is intentionally unused
      // here — see the import comment above.
      cachePromise = AssetCache.open({ version: CACHE_SCHEMA_VERSION, maxBytes: JSON_CAP }).catch(
        () => null,
      )
    }
    return
  }
  try {
    post({ id: msg.id, ok: true, result: await fetchJson(msg.url) })
  } catch (err) {
    post({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
