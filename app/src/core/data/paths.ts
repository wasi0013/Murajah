import type { Layout, Manifest, TafsirLang, WbwLang } from './types'

// Pure path construction from the manifest — no IO, fully unit-testable.

export const MANIFEST_PATH = 'data/manifest.json'
export const FONT_MANIFEST_PATH = 'fonts/manifest.json'

function fill(template: string, key: string, value: string | number): string {
  return template.replace(`{${key}}`, String(value))
}

function dataset(manifest: Manifest, name: string) {
  const ds = manifest.datasets[name]
  if (!ds) throw new Error(`manifest: unknown dataset "${name}"`)
  return ds
}

export function pagePath(manifest: Manifest, layout: Layout, page: number): string {
  return fill(dataset(manifest, layout).pathTemplate, 'page', page)
}

export function translationPath(manifest: Manifest, lang: WbwLang, surah: number): string {
  return fill(dataset(manifest, `tr-${lang}`).pathTemplate, 'surah', surah)
}

export function tafsirPath(manifest: Manifest, lang: TafsirLang, surah: number): string {
  return fill(dataset(manifest, `tafsir-${lang}`).pathTemplate, 'surah', surah)
}

export function morphologyPath(manifest: Manifest, surah: number): string {
  return fill(dataset(manifest, 'morphology').pathTemplate, 'surah', surah)
}

export function indexPath(manifest: Manifest, name: string): string {
  const idx = manifest.indexes?.[name]
  if (!idx) throw new Error(`manifest: unknown index "${name}"`)
  return idx.path
}

/** Total pages for a layout, from the manifest (604 QPC / 610 Indopak). */
export function pageCount(manifest: Manifest, layout: Layout): number {
  return dataset(manifest, layout).count
}
