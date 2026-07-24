/**
 * Contents-browser row data (Phase 8, 8.1) — pure builders over already-loaded
 * reference data, so the browser components stay presentational and the shaping is
 * unit-testable without mounting.
 */
import { AYAH_COUNTS, MAKKI_MADANI } from '@/core/quran/surahMeta'
import { surahsOnPage } from '@/core/quran/surahPages'
import { SURAH_NAMES } from './surahNames'

export interface SurahRow {
  surah: number
  /** Arabic name (from the shipped `surah-names` index). */
  arabic: string
  /** Transliterated name. */
  translit: string
  ayahs: number
  place: 'makki' | 'madani'
}

export interface JuzRow {
  juz: number
  /** The surah this juz opens with (universal — derived from the QPC page). */
  startSurah: number
  startSurahName: string
  /** Page span in the *current* layout (where tapping the row lands). */
  startPage: number
  endPage: number
}

/** All 114 surahs as browsable rows. `arabic` is the loaded surah-names index. */
export function surahRows(arabic: Record<string, string>): SurahRow[] {
  return SURAH_NAMES.map((translit, i) => ({
    surah: i + 1,
    arabic: arabic[String(i + 1)] ?? '',
    translit,
    ayahs: AYAH_COUNTS[i],
    place: MAKKI_MADANI[i],
  }))
}

/**
 * All 30 juz as rows. The page span uses the current layout's `juzToPage`; the
 * opening surah is derived from the QPC page (juz→surah is layout-independent).
 */
export function juzRows(
  juzToPage: Record<string, number>,
  qpcJuzToPage: Record<string, number>,
  pageCount: number,
): JuzRow[] {
  return Array.from({ length: 30 }, (_, i) => {
    const juz = i + 1
    const startPage = juzToPage[String(juz)]
    const nextStart = juzToPage[String(juz + 1)]
    const startSurah = surahsOnPage(qpcJuzToPage[String(juz)])[0]
    return {
      juz,
      startSurah,
      startSurahName: SURAH_NAMES[startSurah - 1],
      startPage,
      endPage: nextStart ? nextStart - 1 : pageCount,
    }
  })
}
