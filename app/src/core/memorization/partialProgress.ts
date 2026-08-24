/**
 * Pure logic behind partial-page memorization tracking (see
 * plans/partial-page-tracking.md and tasks/plan.md Task 4): toggling a verse
 * mark, deciding whether a page is fully marked, deriving the "N of total
 * lines filled" display figure, and describing what changed for the journal.
 *
 * MVP is verse-glyph-tap only (no word-range gesture yet — see the design
 * doc's "Not Doing"), so every mark this module ever produces is a
 * whole-ayah `PageHighlightSpec` (`wordStart`/`wordEnd` both absent). The
 * matching logic still honours a word-range spec generically, the same way
 * `previewRoute.ts`'s `resolvePageWordStates` does, so this module keeps
 * working unmodified if that gesture ships later.
 *
 * Deliberately reuses `PageHighlightSpec` (a flat `{surah, ayah, wordStart?,
 * wordEnd?}`), never the six-color `PageHighlightSpecsByColor` container —
 * this is a single "memorized" set, not a highlight palette.
 */
import type { Word, Line } from '@/core/data/types'
import type { PageHighlightSpec } from '@/core/navigation/previewRoute'

/** Whether `word` is covered by any spec in `marks`. Mirrors `resolvePageWordStates`'s matching rule. */
function isWordCovered(w: Word, marks: PageHighlightSpec[]): boolean {
  const wSurah = Number(w.surah)
  const wAyah = Number(w.ayah)
  const wWord = Number(w.word)
  return marks.some((spec) => {
    if (spec.surah !== wSurah || spec.ayah !== wAyah) return false
    if (spec.wordStart == null) return true
    return wWord >= spec.wordStart && wWord <= (spec.wordEnd ?? spec.wordStart)
  })
}

/**
 * Toggle a whole ayah on/off: unmarked → a whole-ayah spec (`{surah, ayah}`);
 * already marked (as a whole ayah) → removed. This is the only mark shape
 * MVP's verse-glyph-tap gesture ever produces.
 */
export function toggleAyah(marks: PageHighlightSpec[], surah: number, ayah: number): PageHighlightSpec[] {
  const idx = marks.findIndex((m) => m.surah === surah && m.ayah === ayah && m.wordStart == null)
  if (idx !== -1) return marks.filter((_, i) => i !== idx)
  return [...marks, { surah, ayah }]
}

/** Whether every word on the page is covered by `marks` — the page-complete test. */
export function isFullyMarked(marks: PageHighlightSpec[], words: Word[]): boolean {
  if (words.length === 0) return false
  return words.every((w) => isWordCovered(w, marks))
}

export interface LineCoverage {
  /** Lines whose every word is covered by `marks` — never counts a header/basmallah line, which has no words. */
  covered: number
  /** The page's real max line number (from its own layout), not a hardcoded 15 — pages 1-2 have 8, not 15. */
  total: number
}

/**
 * "N of total lines filled" for the fill visual. `layout` is a `PageChunk`'s
 * line metadata (word membership is an id range, `first_word_id..last_word_id`,
 * the same grouping `ReadingSurface.vue`'s `lines` computed uses — words don't
 * carry their own line number). A line counts as covered only when it has at
 * least one word and every one of them is covered; a `surah_name`/`basmallah`
 * line (no words) still counts toward `total` — it occupies a real line on
 * the page — but can never itself be "covered".
 */
export function coveredLineCount(marks: PageHighlightSpec[], layout: Line[], words: Word[]): LineCoverage {
  const byId = new Map(words.map((w) => [w.id, w]))
  let total = 0
  let covered = 0
  for (const line of layout) {
    total = Math.max(total, line.line_number)
    if (line.first_word_id === '' || line.last_word_id === '') continue
    const lineWords: Word[] = []
    for (let id = +line.first_word_id; id <= +line.last_word_id; id++) {
      const w = byId.get(id)
      if (w) lineWords.push(w)
    }
    if (lineWords.length > 0 && lineWords.every((w) => isWordCovered(w, marks))) covered++
  }
  return { covered, total }
}

export interface MarkDelta {
  fromAyah: number
  toAyah: number
}

/**
 * The ayah range newly covered by `after` that wasn't covered by `before` —
 * for the journal's "Memorized verses X-Y of page N" narration. `null` when
 * nothing changed. Only ever considers ayah numbers (not surah), an honest
 * approximation on the rare page whose front-page marking session spans two
 * surahs — see the design doc's Open Questions.
 */
export function describeDelta(
  before: PageHighlightSpec[],
  after: PageHighlightSpec[],
  words: Word[],
): MarkDelta | null {
  const newlyCovered = words.filter((w) => !isWordCovered(w, before) && isWordCovered(w, after))
  if (newlyCovered.length === 0) return null
  const ayahs = newlyCovered.map((w) => Number(w.ayah))
  return { fromAyah: Math.min(...ayahs), toAyah: Math.max(...ayahs) }
}
