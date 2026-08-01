import { describe, it, expect } from 'vitest'
import {
  INITIAL_REVISION_CURSOR,
  revisionChunkForToday,
  advanceRevisionCursor,
  daysSinceCursorAdvance,
  type RevisionCursor,
} from '@/core/memorization/revisionCycle'

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

describe('revisionChunkForToday', () => {
  it('starts at the first page on a fresh cursor', () => {
    const pages = range(1, 10)
    expect(revisionChunkForToday(pages, INITIAL_REVISION_CURSOR, 2, '2026-07-15')).toEqual([1, 2])
  })

  it('10 pages at 2/day walks straight through in contiguous chunks', () => {
    const pages = range(1, 10)
    let cursor: RevisionCursor = INITIAL_REVISION_CURSOR
    const days: number[][] = []
    for (let d = 0; d < 5; d++) {
      const date = `2026-07-${15 + d}`
      const chunk = revisionChunkForToday(pages, cursor, 2, date)
      days.push(chunk)
      cursor = advanceRevisionCursor(chunk, date)
    }
    expect(days).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
      [9, 10],
    ])
  })

  it('13 pages at 2/day: the last chunk wraps mid-chunk into the next cycle', () => {
    const pages = range(1, 13)
    let cursor: RevisionCursor = INITIAL_REVISION_CURSOR
    const days: number[][] = []
    for (let d = 0; d < 7; d++) {
      const date = `2026-07-${15 + d}`
      const chunk = revisionChunkForToday(pages, cursor, 2, date)
      days.push(chunk)
      cursor = advanceRevisionCursor(chunk, date)
    }
    expect(days).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
      [9, 10],
      [11, 12],
      [13, 1], // the cycle's last page, immediately followed by the next cycle's first
    ])
    // Cursor is back at page 1 — the second cycle continues from page 2 next.
    expect(cursor).toEqual({ lastPage: 1, lastAdvanceDate: '2026-07-21' })
  })

  it('a chunk can wrap the whole way around when size >= total', () => {
    const pages = range(1, 3)
    const cursor: RevisionCursor = { lastPage: 2, lastAdvanceDate: '2026-07-14' }
    expect(revisionChunkForToday(pages, cursor, 5, '2026-07-15')).toEqual([3, 1, 2])
  })

  it('reconstructs today’s already-completed chunk instead of jumping ahead', () => {
    const pages = range(1, 13)
    const cursor: RevisionCursor = { lastPage: 12, lastAdvanceDate: '2026-07-15' }
    // Completed today's [11, 12] chunk — asking again the same day must return
    // the same chunk, not the next one, so the UI doesn't jump mid-session.
    expect(revisionChunkForToday(pages, cursor, 2, '2026-07-15')).toEqual([11, 12])
  })

  it('reconstructs a wrapped chunk that completed today', () => {
    const pages = range(1, 13)
    const cursor: RevisionCursor = { lastPage: 2, lastAdvanceDate: '2026-07-21' }
    expect(revisionChunkForToday(pages, cursor, 3, '2026-07-21')).toEqual([13, 1, 2])
  })

  it('is empty with no candidate pages or a zero budget', () => {
    expect(revisionChunkForToday([], INITIAL_REVISION_CURSOR, 2, '2026-07-15')).toEqual([])
    expect(revisionChunkForToday(range(1, 5), INITIAL_REVISION_CURSOR, 0, '2026-07-15')).toEqual([])
  })

  it('falls forward gracefully if the cursor’s page fell out of the set', () => {
    const pages = range(1, 5) // page 10 (the old cursor) has since been unmemorized
    const cursor: RevisionCursor = { lastPage: 10, lastAdvanceDate: '2026-07-15' }
    expect(revisionChunkForToday(pages, cursor, 2, '2026-07-15')).toEqual([1, 2])
  })
})

describe('advanceRevisionCursor', () => {
  it('advances to the chunk’s last element in rotation order, not its max value', () => {
    // A wrapped chunk like [13, 1, 2] must advance to 2, not 13.
    expect(advanceRevisionCursor([13, 1, 2], '2026-07-21')).toEqual({
      lastPage: 2,
      lastAdvanceDate: '2026-07-21',
    })
  })

  it('an empty chunk resets to the initial cursor', () => {
    expect(advanceRevisionCursor([], '2026-07-21')).toEqual(INITIAL_REVISION_CURSOR)
  })
})

describe('daysSinceCursorAdvance', () => {
  it('is 0 for a cursor that never advanced', () => {
    expect(daysSinceCursorAdvance(INITIAL_REVISION_CURSOR, '2026-07-21')).toBe(0)
  })

  it('is 0 the same day it advanced, and counts elapsed days after', () => {
    const cursor: RevisionCursor = { lastPage: 2, lastAdvanceDate: '2026-07-21' }
    expect(daysSinceCursorAdvance(cursor, '2026-07-21')).toBe(0)
    expect(daysSinceCursorAdvance(cursor, '2026-07-24')).toBe(3)
  })
})
