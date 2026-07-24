import { describe, it, expect } from 'vitest'
import { isIOS } from '@/core/pwa/platform'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15'
const IPAD_MASQUERADE_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36'
const DESKTOP_CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

describe('isIOS', () => {
  it('is true for a classic iPhone UA', () => {
    expect(isIOS({ userAgent: IPHONE_UA, platform: 'iPhone', maxTouchPoints: 5 })).toBe(true)
  })

  it('is true for a real iPad, which reports as desktop Safari (iPadOS 13+)', () => {
    expect(isIOS({ userAgent: IPAD_MASQUERADE_UA, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
  })

  it('is false for Android regardless of touch points (no MacIntel platform)', () => {
    expect(isIOS({ userAgent: ANDROID_UA, platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false)
  })

  it('is false for desktop Chrome on Mac (MacIntel but no touch)', () => {
    expect(isIOS({ userAgent: DESKTOP_CHROME_UA, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
  })
})
