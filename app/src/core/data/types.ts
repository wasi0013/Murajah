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
  /** Juz number → its start verse (`"s:a"`) — layout-independent. */
  juzToVerse: Record<string, string>
}

export interface Manifest {
  /** Build timestamp — display/debug only, NOT a cache-invalidation signal.
   * See `data-pipeline/src/lib/manifest.mjs` for why: it changes on every
   * deploy regardless of whether data content changed. Correctness comes from
   * the per-dataset/per-index `hash` below, appended as a cache-busting `?v=`
   * query param by `paths.ts` — never gate cache-purge logic on this field. */
  version: string
  /** `hash` is a content hash of the dataset's chunks (changes only when that
   * dataset's actual content changes, independent of `version`). */
  datasets: Record<string, { pathTemplate: string; count: number; hash: string }>
  indexes?: Record<string, { path: string; hash: string }>
}
