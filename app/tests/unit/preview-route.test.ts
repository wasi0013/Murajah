import { describe, it, expect, afterEach } from 'vitest'
import { router } from '@/router'
import type { Word } from '@/core/data/types'
import {
  parsePreviewRange,
  withinPageCap,
  parseHighlightParams,
  resolveWordStates,
} from '@/core/navigation/previewRoute'

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

  // The example URL this feature was requested with had a trailing slash
  // (/preview/2/12-45/) — vue-router's default (non-strict) matching should
  // treat it the same as no slash, but that's worth proving, not assuming.
  it('resolves the same with a trailing slash', () => {
    const resolved = router.resolve('/preview/2/12-45/')
    expect(resolved.name).toBe('preview-range')
    expect(resolved.params).toEqual({ surah: '2', ayah: '12', endAyah: '45' })
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

describe('parseHighlightParams', () => {
  it('parses word and word-range tokens', () => {
    expect(parseHighlightParams({ red: '12:1,12:3-5' })).toEqual({
      red: [
        { ayah: 12, wordStart: 1, wordEnd: 1 },
        { ayah: 12, wordStart: 3, wordEnd: 5 },
      ],
    })
  })

  it('a bare ayah token has no word bound', () => {
    expect(parseHighlightParams({ blue: '20' })).toEqual({ blue: [{ ayah: 20 }] })
  })

  it('drops malformed tokens individually, keeps valid siblings', () => {
    expect(parseHighlightParams({ red: 'abc,12:1,12:,12:5-3,,12:3-5' })).toEqual({
      red: [
        { ayah: 12, wordStart: 1, wordEnd: 1 },
        { ayah: 12, wordStart: 3, wordEnd: 5 },
      ],
    })
  })

  it('merges hl= into red rather than overwriting it', () => {
    expect(parseHighlightParams({ hl: '12:1', red: '12:2' })).toEqual({
      red: [
        { ayah: 12, wordStart: 2, wordEnd: 2 },
        { ayah: 12, wordStart: 1, wordEnd: 1 },
      ],
    })
  })

  it('ignores unknown query params', () => {
    expect(parseHighlightParams({ amber: '5', foo: 'bar' } as never)).toEqual({
      amber: [{ ayah: 5 }],
    })
  })

  it('returns nothing for an empty query', () => {
    expect(parseHighlightParams({})).toEqual({})
  })
})

describe('resolveWordStates', () => {
  /** A hand-built fixture — no data-layer dependency, per the plan. */
  function word(ayah: number, wordIdx: number): Word {
    return {
      id: ayah * 100 + wordIdx,
      surah: '2',
      ayah: String(ayah),
      word: String(wordIdx),
      location: `2:${ayah}:${wordIdx}`,
      text: `w${ayah}.${wordIdx}`,
    }
  }
  const ayah12 = [1, 2, 3, 4, 5, 6].map((i) => word(12, i)) // a 6-word ayah
  const ayah20 = [1, 2].map((i) => word(20, i))

  it('surfaces non-overlapping specs from different colors', () => {
    const states = resolveWordStates(
      { red: [{ ayah: 12, wordStart: 1, wordEnd: 1 }], blue: [{ ayah: 20 }] },
      [...ayah12, ...ayah20],
    )
    expect(states).toEqual({
      '2:12:1': 'mistake',
      '2:20:1': 'hl-blue',
      '2:20:2': 'hl-blue',
    })
  })

  it('a higher-priority color wins an exact overlap', () => {
    const states = resolveWordStates(
      {
        red: [{ ayah: 12, wordStart: 3, wordEnd: 3 }],
        amber: [{ ayah: 12, wordStart: 3, wordEnd: 3 }],
      },
      ayah12,
    )
    expect(states['2:12:3']).toBe('mistake')
  })

  it('mixed-grain overlap: a single word carves a hole out of a whole-ayah color', () => {
    const states = resolveWordStates(
      { red: [{ ayah: 12, wordStart: 3, wordEnd: 3 }], blue: [{ ayah: 12 }] },
      ayah12,
    )
    expect(states).toEqual({
      '2:12:1': 'hl-blue',
      '2:12:2': 'hl-blue',
      '2:12:3': 'mistake',
      '2:12:4': 'hl-blue',
      '2:12:5': 'hl-blue',
      '2:12:6': 'hl-blue',
    })
  })

  it('a word matching no spec is absent from the map', () => {
    const states = resolveWordStates({ red: [{ ayah: 12, wordStart: 1, wordEnd: 1 }] }, ayah12)
    expect(Object.keys(states)).toEqual(['2:12:1'])
  })
})
