import { readFileSync } from 'node:fs'
import { writeJson } from './lib/manifest.mjs'

/**
 * Chunk a flat object keyed by `"surah:..."` (word-by-word translations keyed
 * by `s:a:w`, or tafsir keyed by `s:a`) into one file per surah. Translations
 * and tafsir map to locations/verses (layout-independent), so per-surah chunks
 * are shared across QPC and Indopak and cached once per surah by the reader.
 */

/** Group `{ "s:...": value }` into `{ surah: { "s:...": value } }`. */
export function groupBySurah(flat) {
  const bySurah = {}
  for (const [key, value] of Object.entries(flat)) {
    const surah = key.slice(0, key.indexOf(':'))
    ;(bySurah[surah] ??= {})[key] = value
  }
  return bySurah
}

/** Inverse of groupBySurah: merge surah chunks back into one flat object. */
export function mergeSurahChunks(bySurah) {
  const flat = {}
  for (const surah of Object.keys(bySurah)) Object.assign(flat, bySurah[surah])
  return flat
}

/** Read a flat surah-prefixed file, write per-surah chunks, return manifest entry. */
export function chunkFlatBySurah({ name, file, outDir, outputData }) {
  const flat = JSON.parse(readFileSync(file, 'utf8'))
  const bySurah = groupBySurah(flat)

  const info = []
  for (const surah of Object.keys(bySurah).sort((a, b) => +a - +b)) {
    const { bytes, hash } = writeJson(`${outputData}/${outDir}/${surah}.json`, bySurah[surah])
    info.push({ surah: +surah, bytes, hash })
  }

  return {
    name,
    pathTemplate: `data/${outDir}/{surah}.json`,
    count: info.length,
    chunks: info,
  }
}
