import { describe, it, expect } from 'vitest'
import {
  PAGE_COUNT_QPC,
  pageIsWhollyWithin,
  surahPageRange,
  surahsOnPage,
} from '@/core/quran/surahPages'

describe('surahPages', () => {
  it('exposes the QPC page count', () => {
    expect(PAGE_COUNT_QPC).toBe(604)
  })

  it('surahPageRange spans the known pages', () => {
    expect(surahPageRange(1)).toEqual([1, 1]) // Al-Fatihah
    expect(surahPageRange(25)).toEqual([359, 366]) // Al-Furqan
    expect(surahPageRange(114)).toEqual([604, 604]) // An-Nas
  })

  it('surahsOnPage flags wholly-within vs shared pages', () => {
    expect(surahsOnPage(1)).toEqual([1]) // page 1 is only Al-Fatihah
    expect(surahsOnPage(106)).toEqual([4, 5]) // Surah 4 ends, Surah 5 begins
    expect(surahsOnPage(602)).toEqual([106, 107, 108]) // three short surahs share a page
  })

  it('pageIsWhollyWithin distinguishes interior from boundary pages', () => {
    expect(pageIsWhollyWithin(2, 3)).toBe(true) // page 3 is inside Al-Baqarah
    expect(pageIsWhollyWithin(5, 106)).toBe(false) // shared with Surah 4
    expect(pageIsWhollyWithin(25, 360)).toBe(true) // interior page of Al-Furqan
    expect(pageIsWhollyWithin(25, 359)).toBe(false) // Al-Furqan's shared start page
  })
})
