import { describe, it, expect, beforeEach, vi } from 'vitest'
import { reportAudioStartError } from '@/composables/audioPlaybackError'
import { useToasts } from '@/composables/useToast'

// Bug: tapping Play (Reader/Mushaf's headphone icon, Today, or Listen) while
// offline did nothing visible — every player composable's start/play awaited
// data.init()/fetches with no catch, and every caller fires it with `void
// player.start(...)` (fire-and-forget), so the rejection became a silent
// unhandled promise rejection. Feels like the app crashed; it's actually just
// offline. reportAudioStartError is the shared fix: a clear, specific toast
// instead of nothing happening.

beforeEach(() => {
  useToasts().splice(0) // clear any toasts left over from a prior test
  vi.restoreAllMocks()
})

describe('reportAudioStartError', () => {
  it('shows the network-specific message when navigator.onLine is false', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    reportAudioStartError(new Error('anything at all'))

    const last = useToasts().at(-1)
    expect(last?.variant).toBe('error')
    expect(last?.message).toMatch(/internet|wi-?fi/i)
  })

  it('shows the network-specific message for a browser fetch-failure error, even if reported online', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    reportAudioStartError(new TypeError('Failed to fetch'))

    const last = useToasts().at(-1)
    expect(last?.variant).toBe('error')
    expect(last?.message).toMatch(/internet|wi-?fi/i)
  })

  it('falls back to a generic playback-start message for a non-network error', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    reportAudioStartError(new TypeError('Cannot read properties of undefined'))

    const last = useToasts().at(-1)
    expect(last?.variant).toBe('error')
    expect(last?.message).not.toMatch(/internet|wi-?fi/i)
    expect(last?.message.length).toBeGreaterThan(0)
  })
})
