import { readFileSync } from 'node:fs'
import { writeJson } from './lib/manifest.mjs'

/**
 * Pure chunking logic — no file IO — so it is unit-testable in memory.
 *
 * A layout file is `{ pages: Line[] }` where each Line has page_number,
 * line_number, line_type, and (for ayah lines) first_word_id/last_word_id
 * referencing global word ids. A words file is `{ "<location>": Word }` where
 * each Word has a global `id`. Every word id is covered by exactly one ayah
 * line range (verified: 0 orphans / 0 gaps for QPC), so grouping is lossless.
 */

/**
 * Group layout lines + their words into one chunk per page (page-ascending).
 * Returns `{ chunks, meta }` where `meta` holds any dataset-level layout keys
 * besides `pages` (e.g. `info`), preserved so reconstruction is lossless.
 */
export function buildPageChunks(layout, words) {
  const { pages, ...meta } = layout

  const byId = new Map()
  for (const w of Object.values(words)) byId.set(w.id, w)

  const linesByPage = new Map()
  for (const line of pages) {
    if (!linesByPage.has(line.page_number)) linesByPage.set(line.page_number, [])
    linesByPage.get(line.page_number).push(line)
  }

  const chunks = []
  for (const page of [...linesByPage.keys()].sort((a, b) => a - b)) {
    const lines = linesByPage.get(page)
    const pageWords = []
    for (const line of lines) {
      if (line.first_word_id !== '' && line.last_word_id !== '') {
        for (let id = +line.first_word_id; id <= +line.last_word_id; id++) {
          const w = byId.get(id)
          if (!w) throw new Error(`page ${page}: missing word id ${id}`)
          pageWords.push(w)
        }
      }
    }
    chunks.push({ page, layout: lines, words: pageWords })
  }
  return { chunks, meta }
}

/** Inverse of buildPageChunks: rebuild the original layout + words objects. */
export function reconstruct({ chunks, meta = {} }) {
  const sorted = [...chunks].sort((a, b) => a.page - b.page)
  const pages = []
  const words = {}
  for (const c of sorted) {
    for (const line of c.layout) pages.push(line)
    for (const w of c.words) words[w.location] = w
  }
  return { layout: { pages, ...meta }, words }
}

/** Read source, chunk per page, write files, return manifest dataset entry. */
export function chunkQuranLayout({ name, layoutFile, wordsFile, outDir, outputData }) {
  const layout = JSON.parse(readFileSync(layoutFile, 'utf8'))
  const words = JSON.parse(readFileSync(wordsFile, 'utf8'))
  const { chunks, meta } = buildPageChunks(layout, words)

  const info = []
  for (const chunk of chunks) {
    const filePath = `${outputData}/${outDir}/${chunk.page}.json`
    const { bytes, hash } = writeJson(filePath, chunk)
    info.push({ page: chunk.page, bytes, hash })
  }

  // Dataset-level layout metadata (e.g. `info`), written once.
  if (Object.keys(meta).length > 0) {
    writeJson(`${outputData}/${outDir}/../meta.json`, meta)
  }

  return {
    name,
    pathTemplate: `data/${outDir}/{page}.json`,
    count: chunks.length,
    chunks: info,
  }
}
