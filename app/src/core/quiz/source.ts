/**
 * Quiz data sourcing (Phase 6.0.1) — the seam between the pure builders and the
 * data client. Everything a question needs comes from chunks the reader already
 * caches: page chunks for Arabic words, tafsir chunks for verse translations, the
 * nav index for adjacency. No new pipeline dataset (decision 4).
 *
 * Verified precondition: in **both** layouts every one of the 6236 verses sits
 * wholly on a single page (page boundaries fall on verse boundaries), so a verse's
 * full Arabic is always assembled from one page chunk — no cross-page stitching.
 */
import type { DataClient } from '@/core/data/dataClient'
import type { Layout, TafsirLang } from '@/core/data/types'
import { versesFromWords } from '@/core/quran/pageVerses'
import type { Verse } from './types'

/** The narrow slice of the data client the quiz needs (kept in sync structurally). */
export type QuizDataAccess = Pick<DataClient, 'getPage' | 'getNavIndex' | 'getTafsir'>

export interface QuizSource {
  /** Every verse whose words fall on `page`, in reading order, with full Arabic. */
  versesOnPage(page: number): Promise<Verse[]>
  /** A verse's translation in `lang`, or `''` when absent. */
  translationForVerse(surah: number, ayah: number, lang: TafsirLang): Promise<string>
  /** The next/previous verse **within the same surah**, or `null` at a surah edge. */
  adjacentVerse(surah: number, ayah: number, dir: 'next' | 'previous'): Promise<Verse | null>
}

/**
 * Build a session-scoped source for one layout. Caches each page chunk, the nav
 * index, and each tafsir surah, so repeated questions over the same scope don't
 * refetch. (The data client caches too; this avoids even the promise churn.)
 */
export function createQuizSource(layout: Layout, data: QuizDataAccess): QuizSource {
  const pageCache = new Map<number, Promise<Verse[]>>()
  const tafsirCache = new Map<string, Promise<Record<string, { text: string }>>>()
  let navPromise: ReturnType<QuizDataAccess['getNavIndex']> | null = null

  function nav() {
    return (navPromise ??= data.getNavIndex(layout))
  }

  function versesOnPage(page: number): Promise<Verse[]> {
    let p = pageCache.get(page)
    if (!p) {
      p = data.getPage(layout, page).then((chunk) => versesFromWords(chunk.words, page))
      pageCache.set(page, p)
    }
    return p
  }

  function tafsir(lang: TafsirLang, surah: number) {
    const key = `${lang}:${surah}`
    let t = tafsirCache.get(key)
    if (!t) {
      t = data.getTafsir(lang, surah)
      tafsirCache.set(key, t)
    }
    return t
  }

  async function translationForVerse(surah: number, ayah: number, lang: TafsirLang): Promise<string> {
    const chunk = await tafsir(lang, surah)
    return chunk[`${surah}:${ayah}`]?.text ?? ''
  }

  async function adjacentVerse(
    surah: number,
    ayah: number,
    dir: 'next' | 'previous',
  ): Promise<Verse | null> {
    const targetAyah = dir === 'next' ? ayah + 1 : ayah - 1
    if (targetAyah < 1) return null
    // The nav index keys every valid `s:a`, so a missing key *is* the surah edge —
    // and because the key encodes the surah, a hit is guaranteed same-surah.
    const page = (await nav()).ayahToPage[`${surah}:${targetAyah}`]
    if (page == null) return null
    const verses = await versesOnPage(page)
    return verses.find((v) => v.surah === surah && v.ayah === targetAyah) ?? null
  }

  return { versesOnPage, translationForVerse, adjacentVerse }
}
