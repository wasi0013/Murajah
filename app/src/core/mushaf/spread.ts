/**
 * Pure spread/paging math for the mushaf image surface, isolated from the DOM so
 * the RTL pairing and step logic are unit-testable.
 *
 * Source pairing (verified 3b.0.1): scans group pages (1,2), (3,4), … (603,604)
 * — the lower, odd page on the RIGHT, the next even page on the LEFT (Arabic
 * reading order). The desktop 2-up spread is composed from these two adjacent
 * single-page images; mobile shows one page. So a "spread" is always
 * (odd → right, odd+1 → left).
 */

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)

export interface Spread {
  /** Lower (odd) page, shown on the right in RTL. */
  right: number
  /** Higher (even) page, shown on the left. Absent only if it exceeds range. */
  left?: number
}

/** The spread (RTL pair) that contains `page`. */
export function spreadFor(page: number, pageCount: number): Spread {
  const right = page % 2 === 1 ? page : page - 1
  const left = right + 1
  return left <= pageCount ? { right, left } : { right }
}

/**
 * Pages visible for the current mode — one page on mobile, the pair on desktop.
 * Drives both rendering and which images to load.
 */
export function visiblePages(page: number, pageCount: number, spread: boolean): number[] {
  if (!spread) return [clamp(page, 1, pageCount)]
  const s = spreadFor(page, pageCount)
  return s.left ? [s.right, s.left] : [s.right]
}

/**
 * Advance (`+1`) or retreat (`-1`) — single mode moves one page, spread mode
 * moves a whole spread (two pages) and never splits a pair. Returns the new
 * anchor page, clamped; in spread mode the anchor is the spread's right page.
 */
export function pageStep(page: number, delta: 1 | -1, pageCount: number, spread: boolean): number {
  if (!spread) return clamp(page + delta, 1, pageCount)
  const right = spreadFor(page, pageCount).right
  return clamp(right + delta * 2, 1, pageCount)
}

/**
 * Neighbour pages to prefetch: ±1 in single mode, the adjacent spreads' pages in
 * 2-up mode (±2 each side). Clamped to range and de-duplicated; the visible
 * pages are excluded (already being loaded).
 */
export function prefetchPages(page: number, pageCount: number, spread: boolean): number[] {
  const visible = new Set(visiblePages(page, pageCount, spread))
  const candidates: number[] = []
  if (!spread) {
    candidates.push(page - 1, page + 1)
  } else {
    const s = spreadFor(page, pageCount)
    const left = s.left ?? s.right
    candidates.push(s.right - 1, s.right - 2, left + 1, left + 2)
  }
  const out = new Set<number>()
  for (const p of candidates) {
    if (p >= 1 && p <= pageCount && !visible.has(p)) out.add(p)
  }
  return [...out].sort((a, b) => a - b)
}
