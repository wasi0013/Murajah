import { describe, it, expect } from 'vitest'
import { buildScopePlaylist, pagesForScope } from '@/core/audio/scope'
import { pageReciter, verseReciter } from '@/core/audio/reciters'
import type { NavIndex } from '@/core/data/types'

// Minimal fixture: only the boundary-page verse lookups and juz starts the scope
// builder actually reads. Interior wholly-within pages come from the real page-range
// table, so they need no nav entries.
const nav: NavIndex = {
  ayahToPage: {
    // Al-Furqan's shared start page 359 carries 25:1–25:2 (rest are on later pages).
    '25:1': 359,
    '25:2': 359,
    // Surah 108 (Al-Kawthar) sits entirely on the shared page 602.
    '108:1': 602,
    '108:2': 602,
    '108:3': 602,
  },
  surahToPage: {},
  juzToPage: { '1': 1, '2': 22, '30': 582 },
}

const husary = pageReciter('husary') // single-file page reciter
const alafasy = pageReciter('alafasy') // surah-split (multi-part)

describe('pagesForScope', () => {
  it('a surah spans its page range', () => {
    expect(pagesForScope({ kind: 'surah', surah: 25 }, nav)).toEqual([
      359, 360, 361, 362, 363, 364, 365, 366,
    ])
  })

  it('a juz spans from its start page to the next juz start minus one', () => {
    expect(pagesForScope({ kind: 'juz', juz: 1 }, nav)).toEqual(
      Array.from({ length: 21 }, (_, i) => i + 1),
    )
  })

  it('the last juz runs to page 604', () => {
    const pages = pagesForScope({ kind: 'juz', juz: 30 }, nav)
    expect(pages[0]).toBe(582)
    expect(pages.at(-1)).toBe(604)
  })

  it('the whole Quran is pages 1..604', () => {
    const pages = pagesForScope({ kind: 'quran' }, nav)
    expect(pages).toHaveLength(604)
    expect(pages[0]).toBe(1)
    expect(pages.at(-1)).toBe(604)
  })
})

describe('buildScopePlaylist — juz / whole-Quran (page-aligned)', () => {
  it('a juz is a straight run of page files', () => {
    const items = buildScopePlaylist({ kind: 'juz', juz: 1 }, husary, verseReciter('shuraim'), nav)
    expect(items).toHaveLength(21)
    expect(items.every((i) => i.kind === 'page-part')).toBe(true)
    expect(items[0].label).toBe('Page 1')
  })

  it('the whole Quran is 604 page items for a single-file reciter', () => {
    const items = buildScopePlaylist({ kind: 'quran' }, husary, verseReciter('shuraim'), nav)
    expect(items).toHaveLength(604)
  })
})

describe('buildScopePlaylist — surah (hybrid)', () => {
  it('Alafasy plays a surah entirely from surah-split page parts, no verse audio', () => {
    const items = buildScopePlaylist({ kind: 'surah', surah: 25 }, alafasy, verseReciter('alafasy'), nav)
    expect(items).toHaveLength(8) // pages 359..366, one part each
    expect(items.every((i) => i.kind === 'page-part')).toBe(true)
    // The shared start page (359) pulls just Al-Furqan's part.
    expect(items[0].urls.primary).toContain('page359-025000.mp3')
  })

  it('a single-file reciter uses verse audio on the shared start page, then page files', () => {
    const items = buildScopePlaylist({ kind: 'surah', surah: 25 }, husary, verseReciter('shuraim'), nav)
    // page 359 → verses 25:1, 25:2; pages 360..366 → 7 page files.
    expect(items).toHaveLength(9)
    expect(items.slice(0, 2).map((i) => ({ kind: i.kind, label: i.label }))).toEqual([
      { kind: 'verse', label: '25:1' },
      { kind: 'verse', label: '25:2' },
    ])
    expect(items.slice(2).every((i) => i.kind === 'page-part')).toBe(true)
    expect(items[2].label).toBe('Page 360')
  })

  it('a short surah sharing a page is all verse audio for a single-file reciter', () => {
    const items = buildScopePlaylist({ kind: 'surah', surah: 108 }, husary, verseReciter('shuraim'), nav)
    expect(items.map((i) => ({ kind: i.kind, label: i.label }))).toEqual([
      { kind: 'verse', label: '108:1' },
      { kind: 'verse', label: '108:2' },
      { kind: 'verse', label: '108:3' },
    ])
  })

  it('a short surah sharing a page is one surah-part for Alafasy', () => {
    const items = buildScopePlaylist({ kind: 'surah', surah: 108 }, alafasy, verseReciter('alafasy'), nav)
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('page-part')
    expect(items[0].urls.primary).toContain('page602-108000.mp3')
  })
})
