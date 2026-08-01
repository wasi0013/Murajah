/**
 * The daily revision cycle — murajah proper: a fixed-size rotation through every
 * currently memorized scope page, N pages a day, wrapping straight back to the
 * start once the cycle finishes (the last page of one cycle and the first page
 * of the next can land in the same day's chunk). Deliberately blind to SM-2
 * schedules and weakness scores — that adaptive prioritisation is a different
 * goal, served separately by `reviewScheduler`/`weaknessScorer` for the weak-
 * reinforcement lane. Revision just keeps walking the whole memorized set.
 */

/** Where the rotation stands. `lastPage` is the true last page walked, in rotation
 * order — not necessarily the numerically highest page, since a chunk can wrap. */
export interface RevisionCursor {
  lastPage: number | null
  /** Local date the cursor last advanced, or null if never — lets a completed
   * day's chunk be reconstructed instead of jumping to the next one mid-session. */
  lastAdvanceDate: string | null
}

export const INITIAL_REVISION_CURSOR: RevisionCursor = { lastPage: null, lastAdvanceDate: null }

/**
 * Today's chunk: `size` pages of `sortedPages` (ascending, canonical scheme),
 * starting right after the cursor and wrapping around the end. If the cursor
 * already advanced today, reconstructs the chunk that produced that advance
 * instead of the next one — so the list on screen doesn't jump forward the
 * moment the last page of today's chunk is completed.
 */
export function revisionChunkForToday(
  sortedPages: number[],
  cursor: RevisionCursor,
  size: number,
  todayStr: string,
): number[] {
  const total = sortedPages.length
  if (total === 0 || size <= 0) return []
  const n = Math.min(size, total)

  if (cursor.lastAdvanceDate === todayStr && cursor.lastPage != null) {
    const idx = sortedPages.indexOf(cursor.lastPage)
    if (idx !== -1) {
      const chunk: number[] = []
      for (let i = n - 1; i >= 0; i--) chunk.push(sortedPages[(idx - i + total) % total])
      return chunk
    }
    // The cursor's page fell out of the set (e.g. unmemorized since) — fall
    // through and compute the forward chunk as if the cursor hadn't advanced yet.
  }

  let startIndex = 0
  if (cursor.lastPage != null) {
    const idx = sortedPages.findIndex((p) => p > cursor.lastPage!)
    startIndex = idx === -1 ? 0 : idx
  }
  const chunk: number[] = []
  for (let i = 0; i < n; i++) chunk.push(sortedPages[(startIndex + i) % total])
  return chunk
}

/** Advance the cursor past a completed chunk. `chunk` must be in rotation order
 * (as returned by {@link revisionChunkForToday}), not sorted by page number. */
export function advanceRevisionCursor(chunk: number[], todayStr: string): RevisionCursor {
  if (chunk.length === 0) return INITIAL_REVISION_CURSOR
  return { lastPage: chunk[chunk.length - 1], lastAdvanceDate: todayStr }
}

/** Days since the cursor last advanced (0 if it never has — a fresh cycle isn't stale). */
export function daysSinceCursorAdvance(cursor: RevisionCursor, todayStr: string): number {
  if (!cursor.lastAdvanceDate) return 0
  const diff =
    (new Date(todayStr + 'T00:00:00').getTime() - new Date(cursor.lastAdvanceDate + 'T00:00:00').getTime()) /
    86400000
  return Math.max(0, Math.floor(diff))
}
