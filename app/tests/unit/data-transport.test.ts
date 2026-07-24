import { describe, it, expect, vi, afterEach } from 'vitest'
import { createFetchTransport } from '@/core/data/transport'

function mockFetch(status: number, contentType: string, body: string) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => JSON.parse(body),
  }))
}

describe('createFetchTransport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves real JSON responses', async () => {
    vi.stubGlobal('fetch', mockFetch(200, 'application/json', '{"page":1}'))
    const transport = createFetchTransport()
    await expect(transport.fetchJson('data/qpc/pages/1.json')).resolves.toEqual({ page: 1 })
  })

  it('rejects a 200 HTML response instead of trying to JSON.parse it', async () => {
    // Reproduces the SPA-fallback case: a missing file 200s with index.html
    // instead of 404ing (see public/_redirects) — this must surface as a
    // clear transport error, not a confusing "Unexpected token '<'" from
    // JSON.parse.
    vi.stubGlobal('fetch', mockFetch(200, 'text/html', '<!doctype html>'))
    const transport = createFetchTransport()
    await expect(transport.fetchJson('data/qpc/pages/9999.json')).rejects.toThrow(/expected JSON/)
  })

  it('still rejects on a genuine non-ok status before checking content-type', async () => {
    vi.stubGlobal('fetch', mockFetch(404, 'text/html', 'not found'))
    const transport = createFetchTransport()
    await expect(transport.fetchJson('data/missing.json')).rejects.toThrow(/404/)
  })
})
