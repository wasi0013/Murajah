/**
 * Audio domain types (Phase 7).
 *
 * The audio feature plays recitation in one of two **grains**: per-ayah files
 * (verse mode, layout-independent, keyed `surah:ayah`) or one file per mushaf page
 * (page mode, QPC-604 indexed). Everything in `core/audio/` is pure — no data
 * client, no `<audio>` element, no DOM — so these are plain data shapes.
 */

/** A recitation source with a fallback, tried in order (see bug catalogue A2). */
export interface AudioUrls {
  /** Preferred URL. */
  primary: string
  /** Used only if `primary` fails to load. */
  fallback: string
}

/** A reciter for verse-by-verse playback (per-ayah mp3 files). */
export interface VerseReciter {
  id: string
  /** Display name (transliterated). */
  name: string
  /** The audio URLs for a single ayah. */
  verseUrl(surah: number, ayah: number): AudioUrls
}

/** A reciter for page-by-page playback (one or more files per mushaf page). */
export interface PageReciter {
  id: string
  name: string
  /** Whether this reciter's page files are split per surah (Alafasy). */
  multiPart: boolean
  /**
   * The audio file URL(s) for a QPC page, in reading order. Usually one; the
   * multi-part reciter (Alafasy) emits one file per surah that starts/continues
   * on the page.
   */
  pageUrls(page: number): string[]
  /**
   * The single file for one surah's audio on a page. Only meaningful for
   * `multiPart` reciters (whose page files are surah-split); used by the Listen
   * scope builder to pull just one surah's part from a shared page. Non-multi-part
   * reciters return `null` (the whole page belongs to at most one surah anyway).
   */
  surahPartUrl(page: number, surah: number): string | null
}

/** The two playback grains the user chooses between. */
export type AudioGrain = 'verse' | 'page'
