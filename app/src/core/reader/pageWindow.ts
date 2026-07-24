/**
 * The set of pages the reader keeps mounted: the current page and its immediate
 * neighbours. Everything else stays virtual, so a long surah never mounts more
 * than three page surfaces at once (see phase-3-reader 3.2). Clamped to the
 * layout's page range and de-duplicated at the ends.
 */
export function windowPages(page: number, pageCount: number): number[] {
  const pages: number[] = []
  for (let p = page - 1; p <= page + 1; p++) {
    if (p >= 1 && p <= pageCount && !pages.includes(p)) pages.push(p)
  }
  return pages
}
