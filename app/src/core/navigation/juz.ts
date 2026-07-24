/**
 * Page-location lookups over the nav index's `{ key → start page }` maps: the
 * juz or surah a page belongs to is the entry with the highest start page that
 * is still ≤ `page`.
 */
function keyAtOrBeforePage(startByKey: Record<string, number>, page: number): number | undefined {
  let best: number | undefined
  let bestPage = -Infinity
  for (const [key, start] of Object.entries(startByKey)) {
    if (start <= page && start > bestPage) {
      best = Number(key)
      bestPage = start
    }
  }
  return best
}

/** The juz a page belongs to (from the nav index's `juzToPage`). */
export const juzForPage = (juzToPage: Record<string, number>, page: number) =>
  keyAtOrBeforePage(juzToPage, page)

/** The surah displayed at the top of a page (from the nav index's `surahToPage`). */
export const surahForPage = (surahToPage: Record<string, number>, page: number) =>
  keyAtOrBeforePage(surahToPage, page)
