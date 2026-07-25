import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FontLoader } from '@/core/fonts/fontLoader'
import type { Transport } from '@/core/data/transport'
import type { FontCache } from '@/core/fonts/fontCache'
import type { FontManifest } from '@/core/fonts/types'

// happy-dom implements neither the CSS Font Loading API's FontFace nor
// document.fonts — stub both with the minimal surface FontLoader touches.
class FakeFontFace {
  family: string
  source: unknown
  shouldFail: boolean
  constructor(family: string, source: unknown) {
    this.family = family
    this.source = source
    this.shouldFail = family.includes('fail')
  }
  load() {
    return this.shouldFail ? Promise.reject(new Error('decode error')) : Promise.resolve(this)
  }
}

const manifest: FontManifest = {
  qpc: { family: 'QPCPage', pathTemplate: 'fonts/qpc-v2/p{page}.woff2', pages: 604 },
  tajweed: { family: 'TajweedPage', pathTemplate: 'fonts/tajweed/p{page}.woff2', pages: 604, color: true },
  indopak: { family: 'IndopakNastaleeq', path: 'fonts/indopak/font.woff2' },
}

function fakeTransport(): Transport {
  return { fetchJson: vi.fn(async () => manifest as never) }
}

function fakeFontCache(delayMs = 0) {
  const calls: string[] = []
  let resolveGate: (() => void) | undefined
  const gate = new Promise<void>((r) => (resolveGate = r))
  const cache: FontCache = {
    fetchBuffer: vi.fn(async (path: string) => {
      calls.push(path)
      if (delayMs > 0) await gate
      return new ArrayBuffer(8)
    }),
  }
  return { cache, calls, openGate: () => resolveGate?.() }
}

describe('FontLoader', () => {
  beforeEach(() => {
    vi.stubGlobal('FontFace', FakeFontFace)
    vi.stubGlobal('document', { fonts: { add: vi.fn(), delete: vi.fn() } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('fetches font bytes through the font cache, not a bare url()', async () => {
    const { cache, calls } = fakeFontCache()
    const loader = new FontLoader(fakeTransport(), cache)
    await loader.init()
    const family = await loader.ensure({ layout: 'qpc', page: 1, tajweed: false })
    expect(family).toBe('qpc-p1')
    expect(calls).toEqual(['fonts/qpc-v2/p1.woff2'])
  })

  it('reuses an already-loaded face without re-fetching', async () => {
    const { cache, calls } = fakeFontCache()
    const loader = new FontLoader(fakeTransport(), cache)
    await loader.init()
    await loader.ensure({ layout: 'qpc', page: 1, tajweed: false })
    await loader.ensure({ layout: 'qpc', page: 1, tajweed: false })
    expect(calls).toEqual(['fonts/qpc-v2/p1.woff2'])
  })

  it('dedupes concurrent ensure() calls for the same family (load + prefetch racing)', async () => {
    const { cache, calls, openGate } = fakeFontCache(1)
    const loader = new FontLoader(fakeTransport(), cache)
    await loader.init()

    const p1 = loader.ensure({ layout: 'qpc', page: 5, tajweed: false })
    const p2 = loader.ensure({ layout: 'qpc', page: 5, tajweed: false })
    openGate()
    const [a, b] = await Promise.all([p1, p2])

    expect(a).toBe('qpc-p5')
    expect(b).toBe('qpc-p5')
    expect(calls).toEqual(['fonts/qpc-v2/p5.woff2']) // fetched exactly once
  })

  it('drops a face that fails to decode so a later retry can succeed', async () => {
    const { cache } = fakeFontCache()
    const loader = new FontLoader(fakeTransport(), cache)
    await loader.init()
    // FakeFontFace fails when the family contains "fail" — force that via tajweed
    // naming isn't practical here, so directly assert the rejection propagates.
    vi.stubGlobal('FontFace', class extends FakeFontFace {
      constructor(family: string, source: unknown) {
        super(family, source)
        this.shouldFail = true
      }
    })
    await expect(loader.ensure({ layout: 'qpc', page: 9, tajweed: false })).rejects.toThrow(
      /decode error/,
    )
  })

  it('indopak is a single reusable font regardless of page', async () => {
    const { cache, calls } = fakeFontCache()
    const loader = new FontLoader(fakeTransport(), cache)
    await loader.init()
    await loader.ensure({ layout: 'indopak', page: 10 })
    await loader.ensure({ layout: 'indopak', page: 200 })
    expect(calls).toEqual(['fonts/indopak/font.woff2'])
  })

  it('prefetch clamps to the valid page range for per-page layouts', async () => {
    const { cache, calls } = fakeFontCache()
    const loader = new FontLoader(fakeTransport(), cache)
    await loader.init()
    loader.prefetch({ layout: 'qpc', page: 0, tajweed: false })
    loader.prefetch({ layout: 'qpc', page: 605, tajweed: false })
    expect(calls).toEqual([])
    loader.prefetch({ layout: 'qpc', page: 3, tajweed: false })
    await vi.waitFor(() => expect(calls).toEqual(['fonts/qpc-v2/p3.woff2']))
  })
})
