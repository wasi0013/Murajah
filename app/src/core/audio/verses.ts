/**
 * Audio verse sourcing (7.0.2) — the ordered verse list for a set of pages.
 *
 * Verse-mode playback and the reader's verse-highlight both need the same thing:
 * the verses on the page(s) currently in view, in reading order. This assembles
 * them from page chunks via the shared `versesFromWords` grouping, so audio and
 * quiz agree on what "the verses on this page" means.
 */
import type { DataClient } from '@/core/data/dataClient'
import type { Layout } from '@/core/data/types'
import { versesFromWords, type PageVerse } from '@/core/quran/pageVerses'

/** The narrow slice of the data client audio needs (kept structurally in sync). */
export type AudioDataAccess = Pick<DataClient, 'getPage'>

/**
 * The verses on the given pages, in ascending page order (and reading order within
 * each page). Pages are loaded in parallel; a page that fails to load is skipped
 * rather than failing the whole set (a missing chunk shouldn't kill playback).
 */
export async function versesForPages(
  layout: Layout,
  pages: readonly number[],
  data: AudioDataAccess,
): Promise<PageVerse[]> {
  const ordered = [...pages].sort((a, b) => a - b)
  const chunks = await Promise.all(
    ordered.map((page) =>
      data
        .getPage(layout, page)
        .then((chunk) => versesFromWords(chunk.words, page))
        .catch(() => [] as PageVerse[]),
    ),
  )
  return chunks.flat()
}
