import { describe, it, expect } from 'vitest'
import { buildCandidatePool, wordBankFrom, completionCandidates } from '@/core/quiz/pool'
import type { QuizSource } from '@/core/quiz/source'
import type { Target, Verse } from '@/core/quiz/types'

/** A source backed by an in-memory page → verses map. */
function fakeSource(pages: Record<number, Verse[]>): QuizSource {
  return {
    versesOnPage: (page) => Promise.resolve(pages[page] ?? []),
    translationForVerse: () => Promise.resolve(''),
    adjacentVerse: () => Promise.resolve(null),
  }
}

const PAGES: Record<number, Verse[]> = {
  10: [
    { surah: 1, ayah: 1, page: 10, arabic: 'a b c' },
    { surah: 1, ayah: 2, page: 10, arabic: 'd' },
  ],
  11: [{ surah: 1, ayah: 3, page: 11, arabic: 'e f' }],
}

describe('buildCandidatePool', () => {
  it('flattens scope pages into targets, tagged weak by page', async () => {
    const pool = await buildCandidatePool([10, 11], fakeSource(PAGES), new Set([11]))
    expect(pool).toHaveLength(3)
    expect(pool.find((v) => v.ayah === 1)!.weak).toBe(false) // page 10 not weak
    expect(pool.find((v) => v.ayah === 3)!.weak).toBe(true) // page 11 weak
  })

  it('skips a page that fails to load rather than rejecting the whole pool', async () => {
    const flaky: QuizSource = {
      versesOnPage: (page) =>
        page === 11 ? Promise.reject(new Error('boom')) : Promise.resolve(PAGES[page] ?? []),
      translationForVerse: () => Promise.resolve(''),
      adjacentVerse: () => Promise.resolve(null),
    }
    const pool = await buildCandidatePool([10, 11], flaky, new Set())
    expect(pool).toHaveLength(2) // page 10's verses only
  })
})

describe('wordBankFrom', () => {
  it('collects distinct words across verses', () => {
    const verses: Verse[] = [
      { surah: 1, ayah: 1, page: 1, arabic: 'a b c' },
      { surah: 1, ayah: 2, page: 1, arabic: 'c d' }, // c repeats
    ]
    expect(wordBankFrom(verses).sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('completionCandidates', () => {
  it('keeps only verses with at least two words', async () => {
    const pool = await buildCandidatePool([10, 11], fakeSource(PAGES), new Set())
    const usable = completionCandidates(pool as Target[])
    // 'a b c' (3) and 'e f' (2) qualify; 'd' (1 word) does not.
    expect(usable.map((v) => v.arabic).sort()).toEqual(['a b c', 'e f'])
  })
})
