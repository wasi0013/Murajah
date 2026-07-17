/**
 * Shared page→verse assembly.
 *
 * Both the quiz (`core/quiz/source.ts`) and audio (`core/audio/verses.ts`) need the
 * same thing: the verses whose words fall on a page, in reading order, with their
 * Arabic assembled from the page's words. This is the one place that grouping lives.
 *
 * Verified precondition (quiz 6.0.3): in both layouts every one of the 6236 verses
 * sits wholly on a single page, so a verse's full Arabic always assembles from one
 * page chunk — no cross-page stitching.
 */
import type { Word } from '@/core/data/types'

/** A verse located on a mushaf page, with its Arabic assembled from the page words. */
export interface PageVerse {
  surah: number
  ayah: number
  /** The page these words fall on. */
  page: number
  /** The verse's Arabic, its words joined with spaces. */
  arabic: string
}

/**
 * Group a page's words into verses, preserving the reading order of both verses
 * and the words within each. Word `surah`/`ayah` are strings in the data; they are
 * coerced to numbers here so callers get a clean numeric shape.
 */
export function versesFromWords(words: readonly Word[], page: number): PageVerse[] {
  const byVerse = new Map<string, { surah: number; ayah: number; words: string[] }>()
  for (const w of words) {
    const key = `${w.surah}:${w.ayah}`
    let entry = byVerse.get(key)
    if (!entry) {
      entry = { surah: Number(w.surah), ayah: Number(w.ayah), words: [] }
      byVerse.set(key, entry)
    }
    entry.words.push(w.text)
  }
  return [...byVerse.values()].map((v) => ({
    surah: v.surah,
    ayah: v.ayah,
    page,
    arabic: v.words.join(' '),
  }))
}
