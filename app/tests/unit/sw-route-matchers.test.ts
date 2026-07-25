import { describe, it, expect } from 'vitest'
import { isAppDataRequest, isAppFontsRequest, isManifestRequest } from '@/sw/routeMatchers'

describe('isAppDataRequest', () => {
  it('matches same-origin /data/* requests', () => {
    expect(isAppDataRequest(new URL('/data/qpc/1.json', self.location.origin))).toBe(true)
  })

  it('rejects cross-origin requests whose path happens to start with /data/', () => {
    // reciters.ts's everyayah.com verse-audio URLs are exactly this shape —
    // this is the regression this predicate exists to prevent (see
    // service-worker.ts's route registration comment).
    expect(isAppDataRequest(new URL('https://everyayah.com/data/Alafasy_128kbps/001001.mp3'))).toBe(false)
  })

  it('rejects same-origin requests outside /data/', () => {
    expect(isAppDataRequest(new URL('/fonts/quran.woff2', self.location.origin))).toBe(false)
  })
})

describe('isAppFontsRequest', () => {
  it('matches same-origin /fonts/* requests', () => {
    expect(isAppFontsRequest(new URL('/fonts/quran.woff2', self.location.origin))).toBe(true)
  })

  it('rejects cross-origin requests whose path happens to start with /fonts/', () => {
    expect(isAppFontsRequest(new URL('https://example.com/fonts/quran.woff2'))).toBe(false)
  })
})

describe('isManifestRequest', () => {
  it('matches the two exact same-origin manifest paths', () => {
    expect(isManifestRequest(new URL('/data/manifest.json', self.location.origin))).toBe(true)
    expect(isManifestRequest(new URL('/fonts/manifest.json', self.location.origin))).toBe(true)
  })

  it('rejects other /data/ or /fonts/ paths, even hash-versioned ones', () => {
    expect(isManifestRequest(new URL('/data/qpc/pages/1.json?v=abc', self.location.origin))).toBe(false)
    expect(isManifestRequest(new URL('/fonts/qpc-v2/p1.woff2', self.location.origin))).toBe(false)
  })

  it('rejects cross-origin requests to the same-looking path', () => {
    expect(isManifestRequest(new URL('https://example.com/data/manifest.json'))).toBe(false)
  })
})
