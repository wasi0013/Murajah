import { resolveUrl, type Transport } from './transport'

interface Pending {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
}

/** Transport backed by the data Web Worker (fetch + parse off the main thread). */
export function createWorkerTransport(): Transport {
  const worker = new Worker(new URL('../../workers/data.worker.ts', import.meta.url), {
    type: 'module',
  })

  const pending = new Map<number, Pending>()
  let nextId = 1

  worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
    const { id, ok, result, error } = e.data
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    if (ok) p.resolve(result)
    else p.reject(new Error(error))
  }

  return {
    fetchJson<T>(path: string): Promise<T> {
      const id = nextId++
      const url = resolveUrl(path)
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
        worker.postMessage({ id, url })
      })
    },
  }
}

/** True when Web Workers are available (false in SSR / some test envs). */
export function workersSupported(): boolean {
  return typeof Worker !== 'undefined'
}
