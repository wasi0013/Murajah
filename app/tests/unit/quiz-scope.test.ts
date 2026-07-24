import { describe, it, expect } from 'vitest'
import { resolveScopePages, pagesForSurahs } from '@/core/quiz/scope'

// Toy nav: surah 1 on pages 1–2, surah 2 on pages 2–4 (shares page 2 with surah 1).
const ayahToPage: Record<string, number> = {
  '1:1': 1,
  '1:2': 1,
  '1:3': 2,
  '2:1': 2,
  '2:2': 3,
  '2:3': 4,
}
// juz start pages (canonical scheme, toy values).
const juzToPage: Record<string, number> = { '1': 1, '2': 3 }

describe('pagesForSurahs', () => {
  it('returns every page a surah touches, sorted and deduped', () => {
    expect(pagesForSurahs(ayahToPage, [1])).toEqual([1, 2])
    expect(pagesForSurahs(ayahToPage, [2])).toEqual([2, 3, 4])
  })

  it('unions multiple surahs without duplicating a shared page', () => {
    expect(pagesForSurahs(ayahToPage, [1, 2])).toEqual([1, 2, 3, 4])
  })
})

describe('resolveScopePages', () => {
  const ctx = { ayahToPage, juzToPage, planPages: [5, 3, 9], layout: 'qpc' as const }

  it('plan scope returns the plan pages, sorted', () => {
    expect(resolveScopePages({ kind: 'plan' }, ctx)).toEqual([3, 5, 9])
  })

  it('surah scope resolves via the nav index', () => {
    expect(resolveScopePages({ kind: 'surah', surahs: [1] }, ctx)).toEqual([1, 2])
  })

  it('all scope spans the whole layout', () => {
    const pages = resolveScopePages({ kind: 'all' }, ctx)
    expect(pages[0]).toBe(1)
    expect(pages[pages.length - 1]).toBe(604) // QPC page count
    expect(pages).toHaveLength(604)
  })
})
