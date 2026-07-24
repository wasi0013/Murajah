// Shapes emitted by data-pipeline (see data-pipeline/src/chunk-quran.mjs).

export type Layout = 'qpc' | 'indopak'
export type WbwLang = 'en' | 'bn'
export type TafsirLang = 'ar' | 'en' | 'bn'
export type LineType = 'surah_name' | 'ayah' | 'basmallah'

export interface Word {
  id: number
  surah: string
  ayah: string
  word: string
  location: string
  text: string
}

export interface Line {
  page_number: number
  line_number: number
  line_type: LineType
  is_centered: number | boolean
  first_word_id: number | ''
  last_word_id: number | ''
  surah_number?: number | ''
}

/** One per-page chunk: exact layout lines + the words on that page. */
export interface PageChunk {
  page: number
  layout: Line[]
  words: Word[]
}

/** Word-by-word translation chunk (per surah), keyed by `s:a:w`. */
export type TranslationChunk = Record<string, string>

/** Tafsir chunk (per surah), keyed by `s:a`. */
export type TafsirChunk = Record<string, { text: string }>

/**
 * Morphology chunk (per surah), keyed by `s:a:w`. Each value is a self-contained
 * HTML analysis string rendered as-is in the morphology popup.
 */
export type MorphologyChunk = Record<string, string>

/** Page → verse list (`s:a`) for a layout. */
export type TafsirMapping = Record<string, string[]>

/** Surah number (as string) → Arabic surah name. */
export type SurahNames = Record<string, string>

/**
 * Per-layout navigation index for quick-jump: resolves an ayah / surah / juz to
 * a page number for that layout (QPC 604 pages, Indopak 610). Keys are strings
 * (`"s:a"`, `"s"`, `"j"`) as emitted by data-pipeline/build-nav-index.mjs.
 */
export interface NavIndex {
  ayahToPage: Record<string, number>
  surahToPage: Record<string, number>
  juzToPage: Record<string, number>
}

export interface Manifest {
  version: string
  datasets: Record<string, { pathTemplate: string; count: number }>
  indexes?: Record<string, { path: string }>
}
