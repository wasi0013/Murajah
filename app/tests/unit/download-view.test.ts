import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import DownloadView from '@/features/download/DownloadView.vue'

// DownloadView is a static top-level import below (unlike router-analytics.test.ts's
// dynamic `await import(...)`), so the mock factory runs before any plain
// `const` would be initialized — vi.hoisted is required here to survive that.
const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }))
vi.mock('@/core/analytics', () => ({ trackEvent }))

// jsdom/happy-dom don't implement scrollIntoView — stub it so scrollToIos
// doesn't throw when the iOS CTAs are clicked below.
Element.prototype.scrollIntoView = vi.fn()

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  trackEvent.mockClear()
})

// Covers the gap identified in the GTM/GA4 investigation: the /download
// page_view alone can't tell a bounce from an actual install attempt, so
// every CTA that leads to an install (2 Android links, 2 iOS links, hero +
// closing banner) must fire its own event.
describe('DownloadView install CTA tracking', () => {
  it('tracks the hero Android CTA click, without blocking the outbound Play Store nav', async () => {
    wrapper = mount(DownloadView)
    const cta = wrapper.get('a.cta-android')
    await cta.trigger('click')
    expect(trackEvent).toHaveBeenCalledWith('install_cta_click', { platform: 'android' })
    // Real outbound link — click must not be prevented (unlike the iOS anchor jump).
    expect(cta.attributes('href')).toBe('https://play.google.com/store/apps/details?id=com.murajah.webview')
  })

  it('tracks the banner Android badge click', async () => {
    wrapper = mount(DownloadView)
    await wrapper.get('.badge-row a[href*="play.google.com"]').trigger('click')
    expect(trackEvent).toHaveBeenCalledWith('install_cta_click', { platform: 'android' })
  })

  it('tracks the hero iOS CTA click (in-page scroll, not an outbound link)', async () => {
    wrapper = mount(DownloadView)
    await wrapper.get('a.cta-ios').trigger('click')
    expect(trackEvent).toHaveBeenCalledWith('install_cta_click', { platform: 'ios' })
  })

  it('tracks the banner iOS badge click', async () => {
    wrapper = mount(DownloadView)
    await wrapper.get('.badge-row a[href="#ios-install"]').trigger('click')
    expect(trackEvent).toHaveBeenCalledWith('install_cta_click', { platform: 'ios' })
  })
})
