import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SOURCE_DATA } from '../src/lib/paths.mjs'
import { buildNavIndex, JUZ_STARTS } from '../src/build-nav-index.mjs'

const quran = JSON.parse(readFileSync(`${SOURCE_DATA}/quran/quran.json`, 'utf8'))
const qpc = buildNavIndex(quran, 'page')
const indopak = buildNavIndex(quran, 'indopak_page')

test('every verse resolves to a page (both layouts)', () => {
  let verses = 0
  for (const surah of Object.keys(quran)) {
    for (const v of quran[surah]) {
      verses++
      const key = `${surah}:${v.verse}`
      assert.equal(qpc.ayahToPage[key], v.page)
      assert.equal(indopak.ayahToPage[key], v.indopak_page)
    }
  }
  assert.equal(verses, 6236)
  assert.equal(Object.keys(qpc.ayahToPage).length, 6236)
})

test('counts are sane: 114 surahs, 30 juz, page ranges match layouts', () => {
  assert.equal(Object.keys(qpc.surahToPage).length, 114)
  assert.equal(Object.keys(indopak.surahToPage).length, 114)
  assert.equal(Object.keys(qpc.juzToPage).length, 30)
  assert.equal(JUZ_STARTS.length, 30)
  assert.equal(Math.max(...Object.values(qpc.ayahToPage)), 604)
  assert.equal(Math.max(...Object.values(indopak.ayahToPage)), 610)
})

test('known references resolve correctly', () => {
  // ayah
  assert.equal(qpc.ayahToPage['2:255'], 42)
  // surah start (Ya-Sin, 36:1)
  assert.equal(qpc.surahToPage['36'], 440)
  assert.equal(qpc.surahToPage['1'], 1)
  // juz starts: juz 1 → page 1; juz 30 (78:1) → same page as ayah 78:1
  assert.equal(qpc.juzToPage[1], 1)
  assert.equal(qpc.juzToPage[30], qpc.ayahToPage['78:1'])
})

test('surahToPage equals the page of the surah first verse', () => {
  for (const surah of Object.keys(quran)) {
    assert.equal(qpc.surahToPage[surah], qpc.ayahToPage[`${surah}:1`])
  }
})
