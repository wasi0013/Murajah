import { describe, it, expect } from 'vitest'
import { keyToPageDelta } from '@/core/reader/keyboard'
import { juzForPage, surahForPage } from '@/core/navigation/juz'

describe('keyToPageDelta (RTL-aware)', () => {
  it('mirrors arrows in RTL, keeps PageUp/Down semantic', () => {
    expect(keyToPageDelta('ArrowLeft', true)).toBe(1)
    expect(keyToPageDelta('ArrowRight', true)).toBe(-1)
    expect(keyToPageDelta('ArrowLeft', false)).toBe(-1)
    expect(keyToPageDelta('ArrowRight', false)).toBe(1)
    expect(keyToPageDelta('PageDown', true)).toBe(1)
    expect(keyToPageDelta('PageUp', true)).toBe(-1)
    expect(keyToPageDelta('Enter', true)).toBe(0)
  })
})

describe('page location (juz / surah)', () => {
  // juz 1 → p1, juz 2 → p22, juz 3 → p42 (illustrative)
  const juzToPage = { '1': 1, '2': 22, '3': 42 }
  const surahToPage = { '1': 1, '2': 2, '3': 50 }

  it('finds the juz/surah whose start is the closest at-or-before the page', () => {
    expect(juzForPage(juzToPage, 1)).toBe(1)
    expect(juzForPage(juzToPage, 30)).toBe(2)
    expect(juzForPage(juzToPage, 42)).toBe(3)
    expect(surahForPage(surahToPage, 49)).toBe(2)
    expect(surahForPage(surahToPage, 50)).toBe(3)
  })

  it('returns undefined before the first entry', () => {
    expect(juzForPage(juzToPage, 0)).toBeUndefined()
  })
})
