import { describe, it, expect, vi } from 'vitest'
import { createQuizSource, type QuizDataAccess } from '@/core/quiz/source'
import type { Layout, PageChunk, NavIndex, TafsirChunk, Word } from '@/core/data/types'

// —— A tiny fake mushaf ————————————————————————————————
// Surah 1: 3 verses across pages 1–2. Surah 2: 2 verses on page 2.
// Page 1: 1:1, 1:2.  Page 2: 1:3, 2:1, 2:2.

function word(surah: number, ayah: number, w: number, text: string): Word {
  return { id: surah * 1000 + ayah * 10 + w, surah: String(surah), ayah: String(ayah), word: String(w), location: `${surah}:${ayah}:${w}`, text }
}

const PAGES: Record<number, Word[]> = {
  1: [word(1, 1, 1, 'alif'), word(1, 1, 2, 'baa'), word(1, 2, 1, 'jiim')],
  2: [word(1, 3, 1, 'daal'), word(2, 1, 1, 'haa'), word(2, 1, 2, 'waw'), word(2, 2, 1, 'zay')],
}

const NAV: NavIndex = {
  ayahToPage: { '1:1': 1, '1:2': 1, '1:3': 2, '2:1': 2, '2:2': 2 },
  surahToPage: { '1': 1, '2': 2 },
  juzToPage: { '1': 1 },
}

const TAFSIR: Record<string, TafsirChunk> = {
  'en:1': { '1:1': { text: 'the first' }, '1:2': { text: 'the second' }, '1:3': { text: 'the third' } },
  'en:2': { '2:1': { text: 'sura two one' }, '2:2': { text: 'sura two two' } },
}

function fakeData(): QuizDataAccess {
  return {
    getPage: vi.fn((_l: Layout, page: number): Promise<PageChunk> =>
      Promise.resolve({ page, layout: 'qpc', words: PAGES[page] ?? [] })),
    getNavIndex: vi.fn((): Promise<NavIndex> => Promise.resolve(NAV)),
    getTafsir: vi.fn((lang, surah): Promise<TafsirChunk> =>
      Promise.resolve(TAFSIR[`${lang}:${surah}`] ?? {})),
  }
}

describe('createQuizSource.versesOnPage', () => {
  it('assembles full verse Arabic, grouped by verse in reading order', async () => {
    const src = createQuizSource('qpc', fakeData())
    const verses = await src.versesOnPage(1)
    expect(verses).toEqual([
      { surah: 1, ayah: 1, page: 1, arabic: 'alif baa' },
      { surah: 1, ayah: 2, page: 1, arabic: 'jiim' },
    ])
  })

  it('caches a page — the second call does not refetch', async () => {
    const data = fakeData()
    const src = createQuizSource('qpc', data)
    await src.versesOnPage(2)
    await src.versesOnPage(2)
    expect(data.getPage).toHaveBeenCalledTimes(1)
  })
})

describe('createQuizSource.translationForVerse', () => {
  it('returns the verse translation', async () => {
    const src = createQuizSource('qpc', fakeData())
    expect(await src.translationForVerse(1, 2, 'en')).toBe('the second')
  })

  it('returns empty string for a verse with no translation', async () => {
    const src = createQuizSource('qpc', fakeData())
    expect(await src.translationForVerse(9, 9, 'en')).toBe('')
  })
})

describe('createQuizSource.adjacentVerse', () => {
  it('finds the next verse, crossing a page boundary', async () => {
    const src = createQuizSource('qpc', fakeData())
    // 1:2 is on page 1; its next verse 1:3 is on page 2.
    expect(await src.adjacentVerse(1, 2, 'next')).toEqual({
      surah: 1,
      ayah: 3,
      page: 2,
      arabic: 'daal',
    })
  })

  it('finds the previous verse', async () => {
    const src = createQuizSource('qpc', fakeData())
    expect(await src.adjacentVerse(2, 2, 'previous')).toMatchObject({ surah: 2, ayah: 1 })
  })

  it('returns null at the start of a surah (no previous within surah)', async () => {
    const src = createQuizSource('qpc', fakeData())
    expect(await src.adjacentVerse(1, 1, 'previous')).toBeNull()
  })

  it('returns null at the end of a surah — never bleeds into the next surah', async () => {
    const src = createQuizSource('qpc', fakeData())
    // 1:3 is the last verse of surah 1; "next" must not return 2:1.
    expect(await src.adjacentVerse(1, 3, 'next')).toBeNull()
  })
})
