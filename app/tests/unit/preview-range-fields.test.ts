import { describe, it, expect } from 'vitest'
import { usePreviewRangeFields, surahOptionLabel } from '@/composables/usePreviewRangeFields'

/**
 * Shared surah/from-ayah/to-ayah `<select>` state behind both `/preview`
 * range pickers (`PreviewJumpSheet` and the `/preview` landing page's
 * link-builder) — see `usePreviewRangeFields.ts`'s own doc comment.
 */
describe('usePreviewRangeFields', () => {
  it('seeds from the given initial surah/start/end', () => {
    const f = usePreviewRangeFields({ surah: 2, start: 12, end: 45 })
    expect(f.surah.value).toBe(2)
    expect(f.start.value).toBe(12)
    expect(f.end.value).toBe(45)
  })

  it('startOptions runs 1..ayahCount(surah); endOptions runs start..ayahCount(surah)', () => {
    const f = usePreviewRangeFields({ surah: 1, start: 3, end: 3 }) // Al-Fatihah, 7 ayahs
    expect(f.startOptions.value).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(f.endOptions.value).toEqual([3, 4, 5, 6, 7])
  })

  it('onSurahChange resets both start and end to 1 — a range from the old surah may not exist in the new one', () => {
    const f = usePreviewRangeFields({ surah: 2, start: 200, end: 250 })
    f.surah.value = 1 // Al-Fatihah — 200 is well past its 7 ayahs
    f.onSurahChange()
    expect(f.start.value).toBe(1)
    expect(f.end.value).toBe(1)
  })

  it('onStartChange drags end forward when start passes it, and leaves it alone otherwise', () => {
    const f = usePreviewRangeFields({ surah: 2, start: 5, end: 10 })
    f.start.value = 12
    f.onStartChange()
    expect(f.end.value).toBe(12) // dragged forward

    f.start.value = 3
    f.onStartChange()
    expect(f.end.value).toBe(12) // still ahead of start — left alone
  })
})

describe('surahOptionLabel', () => {
  it('prefixes the surah number onto its name when the name is loaded', () => {
    expect(surahOptionLabel({ '12': 'Yusuf' }, 12)).toBe('12. Yusuf')
  })

  it('falls back to the bare number before/without surah names loaded', () => {
    expect(surahOptionLabel({}, 12)).toBe('12')
  })
})
