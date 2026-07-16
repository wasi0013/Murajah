import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { SOURCE_DATA, OUTPUT_DATA, OUTPUT_PUBLIC } from './lib/paths.mjs'
import { createManifest, writeJson } from './lib/manifest.mjs'
import { chunkQuranLayout } from './chunk-quran.mjs'
import { chunkFlatBySurah } from './chunk-by-surah.mjs'
import { chunkMorphology } from './chunk-morphology.mjs'
import { writeNavIndexes } from './build-nav-index.mjs'

/** Orchestrates the full data build. Add datasets here as phases land. */
function main() {
  const manifest = createManifest()

  const datasets = [
    {
      name: 'qpc',
      layoutFile: `${SOURCE_DATA}/quran/qpc-v2-15-lines.json`,
      wordsFile: `${SOURCE_DATA}/quran/qpc-v2-word-by-word.json`,
      outDir: 'qpc/pages',
    },
    {
      name: 'indopak',
      layoutFile: `${SOURCE_DATA}/quran/indopak-15-lines.json`,
      wordsFile: `${SOURCE_DATA}/indopak/indopak-nastaleeq.json`,
      outDir: 'indopak/pages',
    },
  ]

  for (const ds of datasets) {
    const entry = chunkQuranLayout({ ...ds, outputData: OUTPUT_DATA })
    manifest.addDataset(entry.name, entry)
    reportSizes(entry)
  }

  // Word-by-word translations + tafsir → per-surah chunks (layout-independent).
  const surahDatasets = [
    { name: 'tr-en', file: `${SOURCE_DATA}/quran/english-wbw-translation.json`, outDir: 'tr/en' },
    { name: 'tr-bn', file: `${SOURCE_DATA}/quran/bangali-word-by-word-translation.json`, outDir: 'tr/bn' },
    { name: 'tafsir-ar', file: `${SOURCE_DATA}/tafsir/ar-tafsir.json`, outDir: 'tafsir/ar' },
    { name: 'tafsir-en', file: `${SOURCE_DATA}/tafsir/en-tafsir.json`, outDir: 'tafsir/en' },
    { name: 'tafsir-bn', file: `${SOURCE_DATA}/tafsir/bn-tafsir.json`, outDir: 'tafsir/bn' },
  ]
  for (const ds of surahDatasets) {
    const entry = chunkFlatBySurah({ ...ds, outputData: OUTPUT_DATA })
    manifest.addDataset(entry.name, entry)
    reportSurahSizes(entry)
  }

  // Morphology → per-surah chunks (source is already per-surah, wrapped in `.data`).
  const morphology = chunkMorphology({
    srcDir: `${SOURCE_DATA}/morphology`,
    outDir: 'morphology',
    outputData: OUTPUT_DATA,
  })
  manifest.addDataset(morphology.name, morphology)
  reportSurahSizes(morphology)

  // Whole-file indexes the app loads once (small).
  const indexes = [
    { name: 'surahNames', src: `${SOURCE_DATA}/quran/surah-names.json`, out: 'surah-names.json' },
    { name: 'tafsirMapQpc', src: `${SOURCE_DATA}/tafsir/qpc-page-tafsir-mapping.json`, out: 'tafsir/mapping/qpc.json' },
    { name: 'tafsirMapIndopak', src: `${SOURCE_DATA}/tafsir/indopak-page-tafsir-mapping.json`, out: 'tafsir/mapping/indopak.json' },
  ]
  for (const idx of indexes) {
    const value = JSON.parse(readFileSync(idx.src, 'utf8'))
    const { bytes, hash } = writeJson(`${OUTPUT_DATA}/${idx.out}`, value)
    manifest.addIndex(idx.name, { path: `data/${idx.out}`, bytes, hash })
  }

  // Per-layout navigation indexes (ayah/juz/surah → page) for quick-jump.
  for (const { name, path, bytes, hash } of writeNavIndexes({
    quranFile: `${SOURCE_DATA}/quran/quran.json`,
    outputData: OUTPUT_DATA,
  })) {
    manifest.addIndex(name, { path, bytes, hash })
    console.log(`[${name}] ${kb(bytes)}`)
  }

  const { runtime } = manifest.write(OUTPUT_DATA)
  console.log(`\nmanifest.json version ${runtime.version}`)
}

function reportSizes(entry) {
  const sizes = entry.chunks.map((c) => c.bytes)
  const total = sizes.reduce((a, b) => a + b, 0)
  const max = Math.max(...sizes)
  const avg = Math.round(total / sizes.length)
  // gzip the largest chunk to reflect real transfer cost
  const biggest = entry.chunks.find((c) => c.bytes === max)
  // pathTemplate is public-relative (starts with `data/`), so resolve from public root.
  const gz = gzipSync(
    readFileSync(`${OUTPUT_PUBLIC}/${entry.pathTemplate.replace('{page}', biggest.page)}`),
  ).length
  console.log(
    `[${entry.name}] ${entry.count} pages | avg ${kb(avg)} | max ${kb(max)} (page ${biggest.page}) | max gz ${kb(gz)} | total ${kb(total)}`,
  )
}

function reportSurahSizes(entry) {
  const sizes = entry.chunks.map((c) => c.bytes)
  const total = sizes.reduce((a, b) => a + b, 0)
  const max = Math.max(...sizes)
  const biggest = entry.chunks.find((c) => c.bytes === max)
  const gz = gzipSync(
    readFileSync(`${OUTPUT_PUBLIC}/${entry.pathTemplate.replace('{surah}', biggest.surah)}`),
  ).length
  console.log(
    `[${entry.name}] ${entry.count} surahs | max ${kb(max)} (surah ${biggest.surah}) | max gz ${kb(gz)} | total ${kb(total)}`,
  )
}

const kb = (b) => `${(b / 1024).toFixed(1)}KB`

main()
