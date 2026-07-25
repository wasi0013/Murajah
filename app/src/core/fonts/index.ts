import { FontLoader } from './fontLoader'
import { createFontCache, type FontCache } from './fontCache'
import { createFetchTransport } from '@/core/data/transport'
import { createWorkerTransport, workersSupported } from '@/core/data/workerTransport'

export { FontLoader } from './fontLoader'
export { createFontCache, type FontCache } from './fontCache'
export * from './fontPaths'
export * from './types'

let loaderSingleton: FontLoader | null = null
let cacheSingleton: FontCache | null = null

/** Shared app-wide FontCache (lazily created) — the same instance `FontLoader`
 * uses internally, so a bulk "download for offline" (useOfflineDownload) and
 * the active reading session share one cache with no duplicate work. */
function sharedFontCache(): FontCache {
  if (!cacheSingleton) cacheSingleton = createFontCache()
  return cacheSingleton
}

export function getFontCache(): FontCache {
  return sharedFontCache()
}

/** Shared app-wide FontLoader (lazily created). */
export function getFontLoader(): FontLoader {
  if (!loaderSingleton) {
    const transport = workersSupported() ? createWorkerTransport() : createFetchTransport()
    loaderSingleton = new FontLoader(transport, sharedFontCache())
  }
  return loaderSingleton
}
