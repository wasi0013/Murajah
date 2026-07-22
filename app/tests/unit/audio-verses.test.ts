import { describe, it, expect } from 'vitest'
import { versesForPages, type AudioDataAccess } from '@/core/audio/verses'
import type { PageChunk, Word } from '@/core/data/types'

/** Build a minimal page chunk from `[surah, ayah, text]` word tuples. */
function chunk(page: number, words: [number, number, string][]): PageChunk {
  return {
    page,
    layout: [],
    words: words.map(
      ([surah, ayah, text], i): Word => ({
        id: i,
        surah: String(surah),
        ayah: String(ayah),
        word: '',
        location: '',
        text,
      }),
    ),
  }
}

function stubData(pages: Record<number, PageChunk>): AudioDataAccess {
  return {
    getPage: async (_layout, page) => {
      const c = pages[page]
      if (!c) throw new Error(`no page ${page}`)
      return c
    },
  }
}

describe('versesForPages', () => {
  it('assembles verses in reading order with Arabic joined from words, dropping the trailing ayah-end marker word', async () => {
    const data = stubData({
      1: chunk(1, [
        [1, 1, 'بِسْمِ'],
        [1, 1, 'اللَّهِ'],
        [1, 1, 'ۧ'], // ayah-end marker — the real data appends one per ayah
        [1, 2, 'الْحَمْدُ'],
        [1, 2, 'ۧ'],
      ]),
    })
    const verses = await versesForPages('qpc', [1], data)
    expect(verses).toEqual([
      { surah: 1, ayah: 1, page: 1, arabic: 'بِسْمِ اللَّهِ' },
      { surah: 1, ayah: 2, page: 1, arabic: 'الْحَمْدُ' },
    ])
  })

  it('concatenates multiple pages in ascending page order (a mushaf spread)', async () => {
    const data = stubData({
      2: chunk(2, [
        [2, 5, 'أ'],
        [2, 5, 'ۧ'],
      ]),
      3: chunk(3, [
        [2, 6, 'ب'],
        [2, 6, 'ۧ'],
      ]),
    })
    // Pass out of order to prove the sort.
    const verses = await versesForPages('qpc', [3, 2], data)
    expect(verses.map((v) => v.page)).toEqual([2, 3])
    expect(verses.map((v) => `${v.surah}:${v.ayah}`)).toEqual(['2:5', '2:6'])
  })

  it('skips a page that fails to load rather than failing the whole set', async () => {
    const data = stubData({
      2: chunk(2, [
        [2, 5, 'أ'],
        [2, 5, 'ۧ'],
      ]),
    })
    const verses = await versesForPages('qpc', [2, 999], data)
    expect(verses.map((v) => v.page)).toEqual([2])
  })

  it('returns [] for no pages', async () => {
    const verses = await versesForPages('qpc', [], stubData({}))
    expect(verses).toEqual([])
  })
})
