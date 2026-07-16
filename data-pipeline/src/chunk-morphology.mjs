import { readFileSync } from 'node:fs'
import { writeJson } from './lib/manifest.mjs'

/**
 * Morphology chunking. The source ships one file per surah already, but each is
 * wrapped as `{ data: { "s:a:w": "<html analysis>" } }`. We unwrap `.data` to
 * the flat location→string map the reader consumes (mirroring the WBW/tafsir
 * per-surah chunks), so a tapped word loads only its surah's morphology. The
 * value is a self-contained HTML string rendered as-is in the popup — there are
 * no separable grammar fields to strip; unwrapping the envelope is the win.
 */

/** Unwrap a source morphology file `{ data: {…} }` to its flat location map. */
export function unwrapMorphology(raw) {
  return raw?.data ?? {}
}

/** Re-wrap a flat map back into the source envelope (inverse, for round-trip tests). */
export function wrapMorphology(data) {
  return { data }
}

/** Read per-surah morphology sources, unwrap, write flat chunks, return manifest entry. */
export function chunkMorphology({ srcDir, outDir, outputData, surahCount = 114 }) {
  const info = []
  for (let surah = 1; surah <= surahCount; surah++) {
    const raw = JSON.parse(readFileSync(`${srcDir}/${surah}.json`, 'utf8'))
    const data = unwrapMorphology(raw)
    const { bytes, hash } = writeJson(`${outputData}/${outDir}/${surah}.json`, data)
    info.push({ surah, bytes, hash })
  }

  return {
    name: 'morphology',
    pathTemplate: `data/${outDir}/{surah}.json`,
    count: info.length,
    chunks: info,
  }
}
