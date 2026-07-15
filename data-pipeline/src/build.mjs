import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { SOURCE_DATA, OUTPUT_DATA, OUTPUT_PUBLIC } from './lib/paths.mjs'
import { createManifest } from './lib/manifest.mjs'
import { chunkQuranLayout } from './chunk-quran.mjs'

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
  ]

  for (const ds of datasets) {
    const entry = chunkQuranLayout({ ...ds, outputData: OUTPUT_DATA })
    manifest.addDataset(entry.name, entry)
    reportSizes(entry)
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

const kb = (b) => `${(b / 1024).toFixed(1)}KB`

main()
