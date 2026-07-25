import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { INPUT_DATA } from '../src/lib/paths.mjs'
import { groupBySurah, mergeSurahChunks } from '../src/chunk-by-surah.mjs'

// Word-by-word translations (keyed s:a:w) and tafsir (keyed s:a).
const files = [
  { name: 'tr-en', file: `${INPUT_DATA}/quran/english-wbw-translation.json` },
  { name: 'tr-bn', file: `${INPUT_DATA}/quran/bangali-word-by-word-translation.json` },
  { name: 'tafsir-ar', file: `${INPUT_DATA}/tafsir/ar-tafsir.json` },
  { name: 'tafsir-en', file: `${INPUT_DATA}/tafsir/en-tafsir.json` },
  { name: 'tafsir-bn', file: `${INPUT_DATA}/tafsir/bn-tafsir.json` },
]

for (const f of files) {
  const source = JSON.parse(readFileSync(f.file, 'utf8'))

  test(`${f.name}: per-surah chunking is lossless`, () => {
    const bySurah = groupBySurah(source)
    const rebuilt = mergeSurahChunks(bySurah)
    assert.deepStrictEqual(rebuilt, source)
  })

  test(`${f.name}: every key keeps its surah prefix`, () => {
    const bySurah = groupBySurah(source)
    for (const [surah, chunk] of Object.entries(bySurah)) {
      for (const key of Object.keys(chunk)) {
        assert.equal(key.slice(0, key.indexOf(':')), surah)
      }
    }
  })
}
