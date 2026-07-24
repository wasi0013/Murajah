import { readFileSync } from 'node:fs'
import { writeJson } from './lib/manifest.mjs'

/**
 * Pure builder for the reader's navigation indexes — no file IO, so unit-testable.
 *
 * `parseJump` turns a quick-jump query into ayah / juz / surah / page targets,
 * but resolving a target to a *page* needs a lookup that depends on the layout
 * (QPC = 604 pages, Indopak = 610). The source `quran.json` carries both page
 * numbers per verse (`page` for QPC, `indopak_page` for Indopak), so we derive
 * every index from it. Juz boundaries aren't in the data — they're the fixed
 * canonical 30-juz start verses of the Madani mushaf.
 */

/** Canonical juz start verses (Madani mushaf): juz N begins at [surah, ayah]. */
export const JUZ_STARTS = [
  [1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148], [5, 82], [6, 111],
  [7, 88], [8, 41], [9, 93], [11, 6], [12, 53], [15, 1], [17, 1], [18, 75],
  [21, 1], [23, 1], [25, 21], [27, 56], [29, 46], [33, 31], [36, 28], [39, 32],
  [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1],
]

/**
 * Build the three nav maps for one layout from `quran.json`.
 * @param quran  `{ "<surah>": [{ chapter, verse, page, indopak_page }, …] }`
 * @param pageField  `'page'` (QPC) or `'indopak_page'` (Indopak)
 * @returns `{ ayahToPage: {"s:a":page}, surahToPage: {"s":page}, juzToPage: {"j":page} }`
 */
export function buildNavIndex(quran, pageField) {
  const ayahToPage = {}
  const surahToPage = {}

  for (const surah of Object.keys(quran).sort((a, b) => +a - +b)) {
    for (const v of quran[surah]) {
      const page = v[pageField]
      if (page == null) throw new Error(`${surah}:${v.verse} missing ${pageField}`)
      ayahToPage[`${surah}:${v.verse}`] = page
      // First verse of the surah fixes its starting page.
      if (v.verse === 1) surahToPage[surah] = page
    }
  }

  const juzToPage = {}
  JUZ_STARTS.forEach(([surah, ayah], i) => {
    const key = `${surah}:${ayah}`
    const page = ayahToPage[key]
    if (page == null) throw new Error(`juz ${i + 1} start ${key} not found`)
    juzToPage[i + 1] = page
  })

  return { ayahToPage, surahToPage, juzToPage }
}

/** Read quran.json, build + write per-layout nav indexes, return manifest entries. */
export function writeNavIndexes({ quranFile, outputData }) {
  const quran = JSON.parse(readFileSync(quranFile, 'utf8'))
  const layouts = [
    { name: 'navQpc', pageField: 'page', out: 'nav/qpc.json' },
    { name: 'navIndopak', pageField: 'indopak_page', out: 'nav/indopak.json' },
  ]

  const entries = []
  for (const { name, pageField, out } of layouts) {
    const index = buildNavIndex(quran, pageField)
    const { bytes, hash } = writeJson(`${outputData}/${out}`, index)
    entries.push({ name, path: `data/${out}`, bytes, hash })
  }
  return entries
}
