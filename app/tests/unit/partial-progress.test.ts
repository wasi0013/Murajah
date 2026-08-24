import { describe, it, expect } from 'vitest'
import type { Word, Line } from '@/core/data/types'
import type { PageHighlightSpec } from '@/core/navigation/previewRoute'
import { toggleAyah, isFullyMarked, coveredLineCount, describeDelta } from '@/core/memorization/partialProgress'

/** Hand-built fixtures — no data-layer dependency, matching preview-route.test.ts's style. */
function word(surah: number, ayah: number, wordIdx: number, id: number): Word {
  return {
    id,
    surah: String(surah),
    ayah: String(ayah),
    word: String(wordIdx),
    location: `${surah}:${ayah}:${wordIdx}`,
    text: `w${ayah}.${wordIdx}`,
  }
}

function ayahLine(lineNumber: number, firstId: number, lastId: number, surah: number | '' = ''): Line {
  return {
    page_number: 1,
    line_number: lineNumber,
    line_type: 'ayah',
    is_centered: 0,
    first_word_id: firstId,
    last_word_id: lastId,
    surah_number: surah,
  }
}

function headerLine(lineNumber: number, type: Line['line_type'] = 'surah_name'): Line {
  return {
    page_number: 1,
    line_number: lineNumber,
    line_type: type,
    is_centered: 1,
    first_word_id: '',
    last_word_id: '',
    surah_number: 1,
  }
}

// A tiny 3-ayah page: ayah 1 (2 words, line 2), ayah 2 (2 words, line 3), ayah 3
// (2 words, line 3 too — two short ayat sharing a line), preceded by a header line.
const words: Word[] = [
  word(2, 1, 1, 1),
  word(2, 1, 2, 2), // ayah 1 end glyph
  word(2, 2, 1, 3),
  word(2, 2, 2, 4), // ayah 2 end glyph
  word(2, 3, 1, 5),
  word(2, 3, 2, 6), // ayah 3 end glyph
]
const layout: Line[] = [
  headerLine(1),
  ayahLine(2, 1, 2, 2),
  ayahLine(3, 3, 6, 2), // ayah 2 + ayah 3 share line 3
]

describe('toggleAyah', () => {
  it('marks an unmarked ayah as a whole-ayah spec', () => {
    const marks = toggleAyah([], 2, 1)
    expect(marks).toEqual<PageHighlightSpec[]>([{ surah: 2, ayah: 1 }])
  })

  it('unmarks an already-marked ayah', () => {
    const marks = toggleAyah([{ surah: 2, ayah: 1 }], 2, 1)
    expect(marks).toEqual([])
  })

  it('leaves other ayat untouched', () => {
    const marks = toggleAyah([{ surah: 2, ayah: 1 }], 2, 2)
    expect(marks).toEqual(
      expect.arrayContaining([{ surah: 2, ayah: 1 }, { surah: 2, ayah: 2 }]),
    )
    expect(marks).toHaveLength(2)
  })
})

describe('isFullyMarked', () => {
  it('is false when nothing is marked', () => {
    expect(isFullyMarked([], words)).toBe(false)
  })

  it('is false when some ayat are marked but not all', () => {
    const marks = [{ surah: 2, ayah: 1 }, { surah: 2, ayah: 2 }]
    expect(isFullyMarked(marks, words)).toBe(false)
  })

  it('is true only once every word on the page is covered', () => {
    const marks = [{ surah: 2, ayah: 1 }, { surah: 2, ayah: 2 }, { surah: 2, ayah: 3 }]
    expect(isFullyMarked(marks, words)).toBe(true)
  })
})

describe('coveredLineCount', () => {
  it('total is the layout\'s real max line number, not a hardcoded 15', () => {
    const { total } = coveredLineCount([], layout, words)
    expect(total).toBe(3)
  })

  it('a header/basmallah line (no words) never counts as covered', () => {
    const { covered } = coveredLineCount([], layout, words)
    expect(covered).toBe(0)
  })

  it('a line counts as covered only when every word on it is marked', () => {
    // Line 2 is fully covered by ayah 1; line 3 needs both ayah 2 AND ayah 3.
    const partial = coveredLineCount([{ surah: 2, ayah: 1 }, { surah: 2, ayah: 2 }], layout, words)
    expect(partial.covered).toBe(1) // only line 2

    const full = coveredLineCount(
      [{ surah: 2, ayah: 1 }, { surah: 2, ayah: 2 }, { surah: 2, ayah: 3 }],
      layout,
      words,
    )
    expect(full.covered).toBe(2) // both content lines
    expect(full.total).toBe(3)
  })
})

describe('describeDelta', () => {
  it('returns null when nothing changed', () => {
    const marks = [{ surah: 2, ayah: 1 }]
    expect(describeDelta(marks, marks, words)).toBeNull()
  })

  it('returns the newly-covered ayah range, not the full cumulative range', () => {
    const before = [{ surah: 2, ayah: 1 }]
    const after = [{ surah: 2, ayah: 1 }, { surah: 2, ayah: 2 }, { surah: 2, ayah: 3 }]
    expect(describeDelta(before, after, words)).toEqual({ fromAyah: 2, toAyah: 3 })
  })

  it('a single newly-covered ayah reports the same from/to', () => {
    const before: PageHighlightSpec[] = []
    const after = [{ surah: 2, ayah: 2 }]
    expect(describeDelta(before, after, words)).toEqual({ fromAyah: 2, toAyah: 2 })
  })
})
