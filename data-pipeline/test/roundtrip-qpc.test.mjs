import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SOURCE_DATA } from '../src/lib/paths.mjs'
import { buildPageChunks, reconstruct } from '../src/chunk-quran.mjs'

const layout = JSON.parse(
  readFileSync(`${SOURCE_DATA}/quran/qpc-v2-15-lines.json`, 'utf8'),
)
const words = JSON.parse(
  readFileSync(`${SOURCE_DATA}/quran/qpc-v2-word-by-word.json`, 'utf8'),
)

test('QPC chunking is lossless — chunks reconstruct the source exactly', () => {
  const { chunks, meta } = buildPageChunks(layout, words)
  assert.equal(chunks.length, 604, 'expected 604 page chunks')

  const rebuilt = reconstruct({ chunks, meta })
  assert.deepStrictEqual(rebuilt.layout, layout, 'layout must round-trip')
  assert.deepStrictEqual(rebuilt.words, words, 'words must round-trip')
})

test('every word appears in exactly one page chunk', () => {
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
