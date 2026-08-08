import { describe, it, expect, beforeAll } from 'vitest'
import { trackEvent, trackPageView } from '@/core/analytics'

interface GaWindow extends Window {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
}

function ga(): GaWindow {
  return window as GaWindow
}

// happy-dom actually attempts a real (network) load for any <script> that
// gets connected to the live document, which both prints a scary but harmless
// stack trace and isn't testing anything about our code. Intercept the
// append instead: real code path, no fake network attempt.
const appendedScripts: HTMLScriptElement[] = []
const realAppendChild = document.head.appendChild.bind(document.head)
beforeAll(() => {
  document.head.appendChild = ((node: Node) => {
    if (node instanceof HTMLScriptElement) {
      appendedScripts.push(node)
      return node
    }
    return realAppendChild(node)
  }) as typeof document.head.appendChild
})

// The module is a singleton (`loaded` persists for the life of the test
// file, same as it does for the life of a real page) — tests below build on
// each other in sequence rather than each starting from a fresh module, which
// is itself the behavior worth covering: exactly one script tag, ever.
describe('analytics', () => {
  it('never throws even before anything is wired up', () => {
    expect(() => trackEvent('whatever')).not.toThrow()
  })

  it('lazily injects exactly one gtag script tag, on first use', () => {
    trackEvent('first_call')
    expect(appendedScripts).toHaveLength(1)
    expect(appendedScripts[0]!.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-JEMZ83QK37')

    trackEvent('second_call')
    trackPageView('/somewhere')
    expect(appendedScripts).toHaveLength(1) // still exactly one — never re-injected
  })

  it('initializes with automatic pageview disabled, since trackPageView sends it explicitly', () => {
    const [, config] = ga().dataLayer!
    expect(config).toEqual(['config', 'G-JEMZ83QK37', { send_page_view: false }])
  })

  it('trackEvent queues a well-formed event onto dataLayer', () => {
    const before = ga().dataLayer!.length
    trackEvent('key_page_view', { page: 'download' })
    const pushed = ga().dataLayer![before]
    expect(pushed).toEqual(['event', 'key_page_view', { page: 'download' }])
  })

  it('trackPageView queues a page_view keyed by page_location — not page_path, which GA4 silently ignores', () => {
    const before = ga().dataLayer!.length
    trackPageView('/preview/2/255')
    const pushed = ga().dataLayer![before] as unknown[]
    expect(pushed[0]).toBe('event')
    expect(pushed[1]).toBe('page_view')
    expect(pushed[2]).toEqual({ page_location: `${window.location.origin}/preview/2/255` })
  })

  it('preserves the current query string in page_location, so utm_/gclid attribution on /download survives', () => {
    history.pushState({}, '', '/download?utm_source=twitter&utm_campaign=launch')
    const before = ga().dataLayer!.length
    trackPageView('/download') // router passes the normalized, query-free path…
    const pushed = ga().dataLayer![before] as unknown[]
    // …but page_location still carries the campaign params, read from location.search.
    expect(pushed[2]).toEqual({
      page_location: `${window.location.origin}/download?utm_source=twitter&utm_campaign=launch`,
    })
    history.pushState({}, '', '/') // leave no trace for later tests
  })

  it('survives a hostile window.gtag/dataLayer without throwing', () => {
    const realDataLayer = ga().dataLayer
    // Simulate a broken embed/ad-blocker shim that makes push throw.
    Object.defineProperty(ga(), 'dataLayer', {
      configurable: true,
      get() {
        throw new Error('blocked')
      },
    })
    expect(() => trackEvent('should_not_throw')).not.toThrow()
    expect(() => trackPageView('/still-should-not-throw')).not.toThrow()
    Object.defineProperty(ga(), 'dataLayer', { configurable: true, writable: true, value: realDataLayer })
  })
})
