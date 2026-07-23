import { describe, it, expect } from 'vitest'
import { isAppDataRequest, isAppFontsRequest } from '@/sw/routeMatchers'

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
