import type { Layout, Manifest, TafsirLang, WbwLang } from './types'

// Pure path construction from the manifest — no IO, fully unit-testable.

export const MANIFEST_PATH = 'data/manifest.json'
export const FONT_MANIFEST_PATH = 'fonts/manifest.json'

function fill(template: string, key: string, value: string | number): string {
  return template.replace(`{${key}}`, String(value))
}

/** Cache-bust with the dataset/index's own content hash: a schema/content
 * change always lands on a new URL, so a stale cached response under the old
 * URL can never be served for a hash that no longer matches. */
function withVersion(path: string, hash: string): string {
  return `${path}?v=${hash}`
}

function dataset(manifest: Manifest, name: string) {
  const ds = manifest.datasets[name]
  if (!ds) throw new Error(`manifest: unknown dataset "${name}"`)
  return ds
}

export function pagePath(manifest: Manifest, layout: Layout, page: number): string {
  const ds = dataset(manifest, layout)
  return withVersion(fill(ds.pathTemplate, 'page', page), ds.hash)
}

export function translationPath(manifest: Manifest, lang: WbwLang, surah: number): string {
  const ds = dataset(manifest, `tr-${lang}`)
  return withVersion(fill(ds.pathTemplate, 'surah', surah), ds.hash)
}

export function tafsirPath(manifest: Manifest, lang: TafsirLang, surah: number): string {
  const ds = dataset(manifest, `tafsir-${lang}`)
  return withVersion(fill(ds.pathTemplate, 'surah', surah), ds.hash)
}

export function morphologyPath(manifest: Manifest, surah: number): string {
  const ds = dataset(manifest, 'morphology')
  return withVersion(fill(ds.pathTemplate, 'surah', surah), ds.hash)
}

export function quranTextPath(manifest: Manifest, surah: number): string {
  const ds = dataset(manifest, 'quran-text')
  return withVersion(fill(ds.pathTemplate, 'surah', surah), ds.hash)
}

export function indexPath(manifest: Manifest, name: string): string {
  const idx = manifest.indexes?.[name]
  if (!idx) throw new Error(`manifest: unknown index "${name}"`)
  return withVersion(idx.path, idx.hash)
}

/** Total pages for a layout, from the manifest (604 QPC / 610 Indopak). */
export function pageCount(manifest: Manifest, layout: Layout): number {
  return dataset(manifest, layout).count
}
