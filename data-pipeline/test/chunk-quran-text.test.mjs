import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { INPUT_DATA } from '../src/lib/paths.mjs'
import { buildQuranTextFlat } from '../src/chunk-quran-text.mjs'
import { groupBySurah, mergeSurahChunks } from '../src/chunk-by-surah.mjs'

const quran = JSON.parse(readFileSync(`${INPUT_DATA}/quran/quran.json`, 'utf8'))
const flat = buildQuranTextFlat(quran)

test('flattens to one entry per verse, keyed "s:a"', () => {
  assert.equal(Object.keys(flat).length, 6236)
  assert.deepEqual(flat['1:1'], { text: quran['1'][0].text })
  for (const key of Object.keys(flat)) assert.match(key, /^\d+:\d+$/)
})

test('text is plain Unicode Arabic, not the QPC glyph font\'s presentation forms', () => {
  // Presentation-form ligature codepoints (U+FB50-FDFF, U+FE70-FEFF) are how
  // the QPC glyph font hijacks Unicode as glyph indices; plain verse text
  // must not contain them.
  for (const { text } of Object.values(flat)) {
    for (const ch of text) {
      const cp = ch.codePointAt(0)
      assert.ok(
        !(cp >= 0xfb50 && cp <= 0xfdff) && !(cp >= 0xfe70 && cp <= 0xfeff),
        `unexpected presentation-form codepoint ${cp.toString(16)} in "${text}"`,
      )
    }
  }
})

test('per-surah chunking of the flattened text is lossless', () => {
  const bySurah = groupBySurah(flat)
  assert.equal(Object.keys(bySurah).length, 114)
  assert.deepStrictEqual(mergeSurahChunks(bySurah), flat)
})
