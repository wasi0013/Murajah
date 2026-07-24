import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SOURCE_DATA } from '../src/lib/paths.mjs'
import { buildPageChunks, reconstruct } from '../src/chunk-quran.mjs'

// Both per-page layouts share the same shape and chunking guarantees.
const datasets = [
  {
    name: 'qpc',
    pages: 604,
    layoutFile: `${SOURCE_DATA}/quran/qpc-v2-15-lines.json`,
    wordsFile: `${SOURCE_DATA}/quran/qpc-v2-word-by-word.json`,
  },
  {
    name: 'indopak',
    pages: 610,
    layoutFile: `${SOURCE_DATA}/quran/indopak-15-lines.json`,
    wordsFile: `${SOURCE_DATA}/indopak/indopak-nastaleeq.json`,
  },
]

for (const ds of datasets) {
  const layout = JSON.parse(readFileSync(ds.layoutFile, 'utf8'))
  const words = JSON.parse(readFileSync(ds.wordsFile, 'utf8'))

  test(`${ds.name}: chunking is lossless — reconstructs source exactly`, () => {
    const { chunks, meta } = buildPageChunks(layout, words)
    assert.equal(chunks.length, ds.pages, `expected ${ds.pages} page chunks`)

    const rebuilt = reconstruct({ chunks, meta })
    assert.deepStrictEqual(rebuilt.layout, layout, 'layout must round-trip')
    assert.deepStrictEqual(rebuilt.words, words, 'words must round-trip')
  })

  test(`${ds.name}: every word appears in exactly one page chunk`, () => {
    const { chunks } = buildPageChunks(layout, words)
    const seen = new Set()
    for (const c of chunks) {
      for (const w of c.words) {
        assert.ok(!seen.has(w.id), `word id ${w.id} duplicated across pages`)
        seen.add(w.id)
      }
    }
    assert.equal(seen.size, Object.keys(words).length, 'all words placed')
  })
}
