import { describe, it, expect, afterEach } from 'vitest'
import { router } from '@/router'

/**
 * Route-level wiring for `/preview/:surah/:ayah(-:endAyah)?` (task 1 of the
 * preview-route plan — see tasks/plan.md). Two route records, not one
 * `(\d+(-\d+)?)` custom-regex param: vue-router's own path tokenizer can't
 * handle a nested group inside a custom param regex (confirmed empirically —
 * it throws "Unterminated group" at router creation). Parsing/validation of
 * the resolved params themselves lives in core/navigation/previewRoute.ts and
 * is covered separately (tasks 4-6).
 */
describe('preview route registration', () => {
  it('resolves a range as two dash-joined params', () => {
    const resolved = router.resolve('/preview/12/12-45')
    expect(resolved.name).toBe('preview-range')
    expect(resolved.params).toEqual({ surah: '12', ayah: '12', endAyah: '45' })
  })

  it('resolves a bare single verse', () => {
    const resolved = router.resolve('/preview/12/12')
    expect(resolved.name).toBe('preview')
    expect(resolved.params).toEqual({ surah: '12', ayah: '12' })
  })

  it('does not match a malformed range', () => {
    // No route matches → Vue Router falls back to its synthetic not-found match.
    expect(router.resolve('/preview/12/abc').matched).toHaveLength(0)
    expect(router.resolve('/preview/12/12-abc').matched).toHaveLength(0)
  })

  afterEach(() => {
    localStorage.removeItem('murajah:reader')
  })

  it('redirects to reader-disabled when the reader flag is off', async () => {
    localStorage.setItem('murajah:reader', 'off')
    await router.push('/preview/12/1')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('reader-disabled')
  })

  it('navigates normally when the reader flag is on', async () => {
    localStorage.setItem('murajah:reader', 'on')
    await router.push('/preview/12/1')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('preview')
  })
})
