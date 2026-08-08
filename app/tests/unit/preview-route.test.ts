import { describe, it, expect, afterEach } from 'vitest'
import { router } from '@/router'
import { parsePreviewRange, withinPageCap } from '@/core/navigation/previewRoute'

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

describe('parsePreviewRange', () => {
  it('accepts a valid range', () => {
    expect(parsePreviewRange({ surah: '2', ayah: '12', endAyah: '45' })).toEqual({
      ok: true,
      value: { surah: 2, startAyah: 12, endAyah: 45 },
    })
  })

  it('accepts a bare single verse (no endAyah)', () => {
    expect(parsePreviewRange({ surah: '2', ayah: '255' })).toEqual({
      ok: true,
      value: { surah: 2, startAyah: 255, endAyah: 255 },
    })
  })

  it('rejects an inverted range', () => {
    expect(parsePreviewRange({ surah: '2', ayah: '45', endAyah: '12' })).toEqual({
      ok: false,
      error: 'range',
    })
  })

  it('rejects an out-of-bounds surah', () => {
    expect(parsePreviewRange({ surah: '0', ayah: '1' })).toEqual({ ok: false, error: 'surah' })
    expect(parsePreviewRange({ surah: '115', ayah: '1' })).toEqual({ ok: false, error: 'surah' })
  })

  it('rejects an ayah beyond the surah\'s actual count', () => {
    // Surah 1 (Al-Fatihah) has 7 ayahs.
    expect(parsePreviewRange({ surah: '1', ayah: '8' })).toEqual({ ok: false, error: 'range' })
    expect(parsePreviewRange({ surah: '1', ayah: '1', endAyah: '8' })).toEqual({
      ok: false,
      error: 'range',
    })
  })

  it('rejects non-numeric or non-positive ayahs', () => {
    expect(parsePreviewRange({ surah: '2', ayah: '0' })).toEqual({ ok: false, error: 'range' })
    expect(parsePreviewRange({ surah: '2', ayah: 'x' })).toEqual({ ok: false, error: 'range' })
  })
})

describe('withinPageCap', () => {
  it('passes at and under the cap, fails just over it', () => {
    expect(withinPageCap(1, 11)).toBe(true) // 11 pages
    expect(withinPageCap(1, 12)).toBe(true) // 12 pages — exact boundary
    expect(withinPageCap(1, 13)).toBe(false) // 13 pages
  })
})
