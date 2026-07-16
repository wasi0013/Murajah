import type { NavIndex } from '@/core/data/types'

/**
 * Cross-layout page remapping. QPC (604 pages) and Indopak (610 pages) paginate
 * the same text differently, so switching layouts must keep the reader on the
 * same *ayah* rather than the same page number. Both nav indexes map an ayah to
 * its start page; we find the ayah being read at the top of the current page in
 * the source layout, then look up that ayah's page in the target layout.
 */

/**
 * The ayah at (or spanning into) the top of `page` — the ayah whose start page
 * is the greatest that is still ≤ `page`. Robust for pages that only contain the
 * continuation of a long ayah (no ayah *starts* on them).
 */
export function ayahAtPageTop(nav: NavIndex, page: number): string | undefined {
  let best: string | undefined
  let bestPage = -Infinity
  for (const [ayah, p] of Object.entries(nav.ayahToPage)) {
    if (p <= page && p > bestPage) {
      best = ayah
      bestPage = p
    }
  }
  return best
}

/**
 * Map `page` in the source layout to the page showing the same ayah in the
 * target layout. Falls back to the same page number if the ayah can't be
 * resolved (caller clamps to the target layout's page count).
 */
export function remapPage(fromNav: NavIndex, toNav: NavIndex, page: number): number {
  const ayah = ayahAtPageTop(fromNav, page)
  if (ayah === undefined) return page
  return toNav.ayahToPage[ayah] ?? page
}
