/**
 * Listen scope → playlist (Phase 8, decision 5).
 *
 * Turns a whole-scope choice (a surah, a juz, or the entire Quran) into the flat
 * `PlaylistItem[]` the Phase 7 engine already walks — page-first, from page audio.
 *
 * Juz and whole-Quran are **page-aligned** in the 604-page mushaf (every juz begins
 * at the top of a page), so both are just a straight page sequence. Only **surahs**
 * start/end mid-page, so surah scope is the one hybrid case:
 *   - Alafasy's page files are surah-split (`page{P}-{surah}{offset}`), so a surah is
 *     its own parts, one per page — no verse audio.
 *   - Other reciters play whole pages that sit entirely within the surah, and fall
 *     back to the same qari's per-ayah audio for the verses on a shared boundary page.
 */
import { PAGE_COUNT_QPC, pageIsWhollyWithin, surahPageRange } from '@/core/quran/surahPages'
import { versesInSurah } from '@/core/quran/surahMeta'
import type { PageVerse } from '@/core/quran/pageVerses'
import type { NavIndex } from '@/core/data/types'
import { buildPagePlaylist, buildVersePlaylist, type PlaylistItem } from './playlist'
import type { PageReciter, VerseReciter } from './types'

export type PlaybackScope =
  | { kind: 'surah'; surah: number }
  | { kind: 'juz'; juz: number }
  | { kind: 'quran' }

const range = (start: number, end: number): number[] =>
  Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i)

/** The QPC pages a scope spans, ascending. */
export function pagesForScope(scope: PlaybackScope, nav: NavIndex): number[] {
  if (scope.kind === 'surah') {
    const [start, end] = surahPageRange(scope.surah)
    return range(start, end)
  }
  if (scope.kind === 'juz') {
    const start = nav.juzToPage[String(scope.juz)]
    if (!start) return []
    const nextStart = nav.juzToPage[String(scope.juz + 1)]
    return range(start, nextStart ? nextStart - 1 : PAGE_COUNT_QPC)
  }
  return range(1, PAGE_COUNT_QPC)
}

/** This surah's verses that fall on the given page (for a boundary-page fallback). */
function surahVersesOnPage(surah: number, page: number, nav: NavIndex): PageVerse[] {
  return versesInSurah(surah)
    .filter((v) => nav.ayahToPage[`${v.surah}:${v.ayah}`] === page)
    .map((v) => ({ surah: v.surah, ayah: v.ayah, page, arabic: '' }))
}

function surahPlaylist(
  surah: number,
  pageReciter: PageReciter,
  verseReciter: VerseReciter,
  nav: NavIndex,
): PlaylistItem[] {
  const [start, end] = surahPageRange(surah)
  const items: PlaylistItem[] = []
  for (let page = start; page <= end; page++) {
    if (pageIsWhollyWithin(surah, page)) {
      // A whole page inside the surah — one page item (Alafasy: its single part here).
      items.push(...buildPagePlaylist([page], pageReciter))
    } else if (pageReciter.multiPart) {
      // Shared boundary page, surah-split reciter — pull just this surah's part.
      const url = pageReciter.surahPartUrl(page, surah)
      if (url) {
        items.push({
          kind: 'page-part',
          urls: { primary: url, fallback: url },
          label: `Page ${page}`,
          page: { page, part: 0 },
        })
      }
    } else {
      // Shared boundary page, single-file reciter — same qari's verse audio.
      items.push(...buildVersePlaylist(surahVersesOnPage(surah, page, nav), verseReciter))
    }
  }
  return items
}

/**
 * Build the ready-to-play playlist for a scope. Surah scope is the hybrid above;
 * juz / whole-Quran are a straight page run (each page's part(s) in order).
 */
export function buildScopePlaylist(
  scope: PlaybackScope,
  pageReciter: PageReciter,
  verseReciter: VerseReciter,
  nav: NavIndex,
): PlaylistItem[] {
  if (scope.kind === 'surah') return surahPlaylist(scope.surah, pageReciter, verseReciter, nav)
  return buildPagePlaylist(pagesForScope(scope, nav), pageReciter)
}
