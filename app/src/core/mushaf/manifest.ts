// Image manifest for the mushaf scan surface, emitted by
// data-pipeline/src/transcode-images.mjs → img/mushaf/manifest.json.
// Pure resolution (path + dimensions) — no IO, fully unit-testable, mirroring
// core/data/paths.ts.

export const MUSHAF_MANIFEST_PATH = 'img/mushaf/manifest.json'

export interface PageSize {
  w: number
  h: number
}

export interface MushafManifest {
  /** Total mushaf pages (Madani 604). */
  pageCount: number
  /** URL template, e.g. `img/mushaf/{page}.webp`. */
  pathTemplate: string
  /** Intrinsic page width/height (uniform 678×966 for the current scans). */
  width: number
  height: number
  /** Optional per-page overrides when a page differs from width/height. */
  pages?: Record<string, PageSize>
  /** Content signature — changes only when the page set changes. Guards the
   * image cache (URLs are unhashed), so immutable scans aren't re-downloaded. */
  version: string
}

/** App-relative image path for a page (fill the manifest's template). */
export function imagePath(m: MushafManifest, page: number): string {
  return m.pathTemplate.replace('{page}', String(page))
}

/** Intrinsic dimensions of a page (per-page override, else the uniform size). */
export function dimensions(m: MushafManifest, page: number): PageSize {
  return m.pages?.[String(page)] ?? { w: m.width, h: m.height }
}

/** True when `page` is within the manifest's page range. */
export function inRange(m: MushafManifest, page: number): boolean {
  return Number.isInteger(page) && page >= 1 && page <= m.pageCount
}
