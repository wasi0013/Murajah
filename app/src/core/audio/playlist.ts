/**
 * Playlist builder (7.0.5) — turns a grain + reciter + verses/pages + options into
 * a flat, ordered list of items the engine walks linearly. All expansion (repeat
 * count, spaced-repetition) happens here, as pure functions, so the engine stays a
 * dumb cursor over the list.
 */
import type { PageVerse } from '@/core/quran/pageVerses'
import type { AudioUrls, PageReciter, VerseReciter } from './types'

/** A verse item carries its location so the reader can highlight the active ayah. */
export interface VerseRef {
  surah: number
  ayah: number
  page: number
}

/** A page-part item: which page, and which part (0-based) when a page is multi-part. */
export interface PageRef {
  page: number
  part: number
}

export interface PlaylistItem {
  kind: 'verse' | 'page-part'
  /** Source URL(s) for this item. */
  urls: AudioUrls
  /** Short human label (e.g. "2:255" or "Page 42"). */
  label: string
  /** Present when `kind === 'verse'` — drives the reader highlight. */
  verse?: VerseRef
  /** Present when `kind === 'page-part'`. */
  page?: PageRef
}

export interface VersePlaylistOptions {
  /** Repeat each unit this many times (default 1). */
  repeatCount?: number
  /** Use the cumulative spaced-repetition drill instead of a straight run. */
  spaced?: boolean
}

/**
 * The cumulative spaced-repetition index groups for `n` verses, ported from the
 * legacy `generateSpacedPlaylist`: for each verse `i`, the singleton `[i]` then the
 * cumulative `[0..i]`. A hifz drill — recite the new verse, then everything so far.
 */
export function spacedGroups(n: number): number[][] {
  const groups: number[][] = []
  for (let i = 0; i < n; i++) {
    groups.push([i])
    groups.push(Array.from({ length: i + 1 }, (_, idx) => idx))
  }
  return groups
}

function verseItem(v: PageVerse, reciter: VerseReciter): PlaylistItem {
  return {
    kind: 'verse',
    urls: reciter.verseUrl(v.surah, v.ayah),
    label: `${v.surah}:${v.ayah}`,
    verse: { surah: v.surah, ayah: v.ayah, page: v.page },
  }
}

/**
 * Build a verse-grain playlist. Straight run by default; with `spaced`, expands the
 * cumulative drill (each group's sequence played `repeatCount` times); without it,
 * each verse is repeated `repeatCount` times consecutively.
 */
export function buildVersePlaylist(
  verses: readonly PageVerse[],
  reciter: VerseReciter,
  opts: VersePlaylistOptions = {},
): PlaylistItem[] {
  const repeatCount = Math.max(1, Math.floor(opts.repeatCount ?? 1))
  const items: PlaylistItem[] = []
  if (opts.spaced) {
    for (const group of spacedGroups(verses.length)) {
      for (let r = 0; r < repeatCount; r++) {
        for (const idx of group) items.push(verseItem(verses[idx], reciter))
      }
    }
    return items
  }
  for (const v of verses) {
    for (let r = 0; r < repeatCount; r++) items.push(verseItem(v, reciter))
  }
  return items
}

/**
 * Build a page-grain playlist: one item per page file, in ascending page order.
 * A multi-part page (Alafasy) contributes one item per part. Page mode has no
 * alternate CDN, so the fallback URL is the primary (the engine skips after two
 * failures).
 */
export function buildPagePlaylist(pages: readonly number[], reciter: PageReciter): PlaylistItem[] {
  const items: PlaylistItem[] = []
  for (const page of [...pages].sort((a, b) => a - b)) {
    const urls = reciter.pageUrls(page)
    urls.forEach((url, part) => {
      items.push({
        kind: 'page-part',
        urls: { primary: url, fallback: url },
        label: urls.length > 1 ? `Page ${page} · ${part + 1}/${urls.length}` : `Page ${page}`,
        page: { page, part },
      })
    })
  }
  return items
}
