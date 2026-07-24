import { FontLoader } from './fontLoader'
import { createFetchTransport } from '@/core/data/transport'
import { createWorkerTransport, workersSupported } from '@/core/data/workerTransport'

export { FontLoader } from './fontLoader'
export * from './fontPaths'
export * from './types'

let singleton: FontLoader | null = null

/** Shared app-wide FontLoader (lazily created). */
export function getFontLoader(): FontLoader {
  if (!singleton) {
    const transport = workersSupported() ? createWorkerTransport() : createFetchTransport()
    singleton = new FontLoader(transport)
  }
  return singleton
}
