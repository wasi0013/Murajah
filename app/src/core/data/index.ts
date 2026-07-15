import { DataClient } from './dataClient'
import { createFetchTransport } from './transport'
import { createWorkerTransport, workersSupported } from './workerTransport'

export { DataClient } from './dataClient'
export * from './types'

/** Build a DataClient using the Web Worker transport, falling back to fetch. */
export function createDataClient(): DataClient {
  const transport = workersSupported() ? createWorkerTransport() : createFetchTransport()
  return new DataClient(transport)
}

let singleton: DataClient | null = null

/** Shared app-wide DataClient (lazily created). */
export function getDataClient(): DataClient {
  if (!singleton) singleton = createDataClient()
  return singleton
}
