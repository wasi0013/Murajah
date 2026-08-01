import { describe, it, expect } from 'vitest'
import {
  PAGE_COUNT_QPC,
  getPagesForSurah,
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

  describe('getPagesForSurah', () => {
    it('expands a single surah with no shared boundaries to its exact page set', () => {
      expect(getPagesForSurah([1])).toEqual([1]) // Al-Fatihah — one page, nothing before or after it
      // Surah 6 neither starts nor ends on a page any other surah touches (5
      // ends at 127, 6 spans 128–150, 7 starts at 151) — a fully "clean" surah.
      expect(getPagesForSurah([6])).toEqual(Array.from({ length: 150 - 128 + 1 }, (_, i) => 128 + i))
    })

    it('excludes a boundary page shared with an unselected neighbour', () => {
      // Surah 24 ends and surah 25 begins on page 359 — selecting 25 alone must
      // not claim that page, since most of it could be surah 24 (not memorized).
      const pages = getPagesForSurah([25])
      expect(pages).not.toContain(359)
      expect(pages[0]).toBe(360)
      expect(pages.at(-1)).toBe(366)
    })

    it('includes a shared boundary page once every surah on it is selected', () => {
      // Now both sides of page 359 are selected — nothing on that page is
      // un-memorized, so it joins the result and the range becomes contiguous.
      const pages = getPagesForSurah([24, 25])
      expect(pages).toEqual(Array.from({ length: 366 - 350 + 1 }, (_, i) => 350 + i))
    })

    it('a surah that never has a page to itself contributes nothing alone', () => {
      // Al-Qiyamah (75) spans only pages 577–578, and both are shared — 577
      // with surah 74, 578 with surah 76. Picking 75 in isolation is correct
      // per the mushaf, but resolves to zero pages until a neighbour joins it.
      expect(getPagesForSurah([75])).toEqual([])
    })

    it('the user’s worked example — page 578 needs both Al-Qiyamah and Al-Insan', () => {
      const pages = getPagesForSurah([75, 76])
      // 577 stays excluded (needs 74 too); 578 is now covered by both its
      // surahs; 579 is Al-Insan's own interior page; 580 stays excluded
      // (shared with 77, not selected).
      expect(pages).toEqual([578, 579])
    })

    it('the user’s worked example — page 604 needs Al-Ikhlas, Al-Falaq, and An-Nas together', () => {
      expect(getPagesForSurah([112, 113])).toEqual([]) // two of three: not yet
      expect(getPagesForSurah([112, 113, 114])).toEqual([604]) // all three: complete
    })

    it('sorts and de-dupes across out-of-order, non-adjacent surahs', () => {
      const pages = getPagesForSurah([114, 112, 113, 1])
      expect(pages).toEqual([1, 604]) // 604 needs all of 112/113/114, which it has
    })

    it('ignores out-of-range surah numbers', () => {
      expect(getPagesForSurah([0, 115, -1, 1000])).toEqual([])
      expect(getPagesForSurah([0, 1, 115])).toEqual([1])
    })

    it('is empty for an empty selection', () => {
      expect(getPagesForSurah([])).toEqual([])
    })
  })
})
