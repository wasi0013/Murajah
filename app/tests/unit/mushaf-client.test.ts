import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MushafClient } from '@/core/mushaf/mushafClient'
import type { ImageTransport } from '@/core/mushaf/imageTransport'
import type { MushafManifest } from '@/core/mushaf/manifest'

const manifest: MushafManifest = {
  pageCount: 604,
  pathTemplate: 'img/mushaf/{page}.webp',
  width: 678,
  height: 966,
  version: 'sig-1',
}

function mockTransport() {
  const calls: string[] = []
  const transport: ImageTransport = {
    fetchBlob: vi.fn((path: string) => {
      calls.push(path)
      return Promise.resolve(new Blob(['x'], { type: 'image/webp' }))
    }),
    setVersion: vi.fn(),
  }
  return { transport, calls }
}

describe('MushafClient', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(manifest), { status: 200 }))),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('loads the manifest once and sets the cache version from it', async () => {
    const { transport } = mockTransport()
    const client = new MushafClient(transport)
    await client.init()
    await client.init() // second call must not refetch
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(transport.setVersion).toHaveBeenCalledWith('sig-1')
  })

  it('resolves pageCount / imagePath / dimensions from the manifest', async () => {
    const { transport } = mockTransport()
    const client = new MushafClient(transport)
    await client.init()
    expect(client.pageCount()).toBe(604)
    expect(client.imagePath(50)).toBe('img/mushaf/50.webp')
    expect(client.dimensions(50)).toEqual({ w: 678, h: 966 })
  })

  it('fetches a page Blob through the transport by resolved path', async () => {
    const { transport, calls } = mockTransport()
    const client = new MushafClient(transport)
    await client.init()
    const blob = await client.getPageBlob(101)
    expect(blob).toBeInstanceOf(Blob)
    expect(calls).toEqual(['img/mushaf/101.webp'])
  })

  it('rejects out-of-range page fetches', async () => {
    const { transport } = mockTransport()
    const client = new MushafClient(transport)
    await client.init()
    await expect(client.getPageBlob(0)).rejects.toThrow(/out of range/)
    await expect(client.getPageBlob(605)).rejects.toThrow(/out of range/)
  })

  it('prefetch warms only in-range pages, never out of range', async () => {
    const { transport, calls } = mockTransport()
    const client = new MushafClient(transport)
    await client.init()
    client.prefetch([603, 604, 605, 0])
    expect(calls).toEqual(['img/mushaf/603.webp', 'img/mushaf/604.webp'])
  })

  it('throws if used before init()', () => {
    const { transport } = mockTransport()
    const client = new MushafClient(transport)
    expect(() => client.pageCount()).toThrow(/init/)
  })
})
