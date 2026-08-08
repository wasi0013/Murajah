import { describe, it, expect, vi, beforeEach } from 'vitest'

const trackPageView = vi.fn()
const trackEvent = vi.fn()
vi.mock('@/core/analytics', () => ({ trackPageView, trackEvent }))

// The router is a singleton (`@/router` exports one instance), so every test
// below shares navigation history — sequential, not isolated per-`it`, same
// as a real user clicking around the app. Order matters for the very first
// test: it depends on the router not having navigated anywhere yet, to
// exercise the true `from === START_LOCATION` boot case.
describe('router analytics tracking', () => {
  beforeEach(() => {
    trackPageView.mockClear()
    trackEvent.mockClear()
  })

  it('tracks the very first navigation even though it happens to land on "/" — the same path START_LOCATION reports', async () => {
    const { router } = await import('@/router')
    await router.push('/')
    expect(trackPageView).toHaveBeenCalledWith('/')
  })

  it('sends a page_view for an ordinary route, with no key_page_view alongside it', async () => {
    const { router } = await import('@/router')
    await router.push('/today')
    expect(trackPageView).toHaveBeenCalledWith('/today')
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('tags /download as the "download" key page, on top of the normal page_view', async () => {
    const { router } = await import('@/router')
    await router.push('/download')
    expect(trackPageView).toHaveBeenCalledWith('/download')
    expect(trackEvent).toHaveBeenCalledWith('key_page_view', { page: 'download' })
  })

  it('tags every /preview shape (landing, single verse, range) as the same "preview" key page', async () => {
    const { router } = await import('@/router')

    await router.push('/preview')
    expect(trackPageView).toHaveBeenCalledWith('/preview')
    expect(trackEvent).toHaveBeenCalledWith('key_page_view', { page: 'preview' })

    trackEvent.mockClear()
    trackPageView.mockClear()
    await router.push('/preview/2/255')
    expect(trackPageView).toHaveBeenCalledWith('/preview/2/255')
    expect(trackEvent).toHaveBeenCalledWith('key_page_view', { page: 'preview' })

    trackEvent.mockClear()
    trackPageView.mockClear()
    await router.push('/preview/2/12-45')
    expect(trackPageView).toHaveBeenCalledWith('/preview/2/12-45')
    expect(trackEvent).toHaveBeenCalledWith('key_page_view', { page: 'preview' })
  })

  it('normalizes a trailing slash so it is never a distinct page from its bare form', async () => {
    // vue-router matches a trailing-slash path the same route (confirmed in
    // preview-route.test.ts) but doesn't strip it from `.path` — a
    // regression in our own normalization would silently split one page
    // into two in reports.
    const { router } = await import('@/router')
    await router.push('/today') // land somewhere else first, so the next push is a real navigation
    trackPageView.mockClear()
    await router.push('/preview/2/12-45/')
    expect(trackPageView).toHaveBeenCalledWith('/preview/2/12-45')
  })

  it('does NOT re-track a query-only change on the same page — the /preview tap-to-paint editor rewrites the query on every tap', async () => {
    const { router } = await import('@/router')
    await router.push('/preview/2/12-45') // establish the page (path already tracked by a prior test)
    trackPageView.mockClear()
    trackEvent.mockClear()

    await router.push('/preview/2/12-45?red=12:1')
    expect(trackPageView).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()

    await router.push('/preview/2/12-45?red=12:1,12:3-5&blue=20')
    expect(trackPageView).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()

    // Leaving the page for a different one still tracks normally afterward.
    await router.push('/today')
    expect(trackPageView).toHaveBeenCalledWith('/today')
  })
})
