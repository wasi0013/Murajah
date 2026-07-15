import type { Layout } from '@/core/data/types'
import type { FontManifest } from './types'

// Pure font family + path logic — no browser APIs, unit-testable.
// QPC and tajweed are per-page glyph fonts (each page's woff2 maps the same
// codepoints to page-specific glyphs), so every page needs a UNIQUE family to
// avoid glyph collisions. Indopak is a single Nastaleeq font for all pages.

export interface FontRequest {
  layout: Layout
  page: number
  tajweed?: boolean
}

export function fontFamily({ layout, page, tajweed }: FontRequest): string {
  if (layout === 'indopak') return 'indopak'
  return tajweed ? `tj-p${page}` : `qpc-p${page}`
}

export function fontPath(manifest: FontManifest, { layout, page, tajweed }: FontRequest): string {
  if (layout === 'indopak') return manifest.indopak.path
  const spec = tajweed ? manifest.tajweed : manifest.qpc
  return spec.pathTemplate.replace('{page}', String(page))
}

/** Page count for a per-page layout (Indopak is page-independent → Infinity). */
export function fontPageCount(manifest: FontManifest, layout: Layout, tajweed = false): number {
  if (layout === 'indopak') return Infinity
  return (tajweed ? manifest.tajweed : manifest.qpc).pages
}
