import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { INPUT_FONTS, OUTPUT_PUBLIC } from './lib/paths.mjs'
import { writeJson } from './lib/manifest.mjs'

/**
 * Fonts are already optimal per-page woff2; we only make them available to the
 * app and emit a manifest. The rendering model is unchanged (priority-1): the
 * reader injects a per-page @font-face swapping `p{page}.woff2` under a fixed
 * family, exactly as legacy did. Tajweed is a separate per-page COLOR font set
 * (COLR/CPAL) toggled against the uthmani QPC set — kept verbatim for fidelity.
 *
 * Incremental: files already copied with the same size are skipped, so the
 * 144MB set only pays its cost once (this is why fonts are NOT on the fast
 * data prebuild — run `npm run assets:build`).
 */
function copyDir(srcDir, destDir, filter = () => true) {
  mkdirSync(destDir, { recursive: true })
  let copied = 0
  let skipped = 0
  for (const name of readdirSync(srcDir)) {
    if (!filter(name)) continue
    const src = `${srcDir}/${name}`
    const dest = `${destDir}/${name}`
    if (existsSync(dest) && statSync(dest).size === statSync(src).size) {
      skipped++
      continue
    }
    copyFileSync(src, dest)
    copied++
  }
  return { copied, skipped }
}

export function copyFonts() {
  const outFonts = `${OUTPUT_PUBLIC}/fonts`
  const isWoff2 = (n) => n.endsWith('.woff2')

  const qpc = copyDir(`${INPUT_FONTS}/qpc-v2`, `${outFonts}/qpc-v2`, isWoff2)
  const tajweed = copyDir(`${INPUT_FONTS}/tajweed`, `${outFonts}/tajweed`, isWoff2)
  const indopak = copyDir(`${INPUT_FONTS}/indopak`, `${outFonts}/indopak`, isWoff2)

  // Single static asset (not per-page generated): the ornamental surah-header
  // glyph font, referenced directly by design/tokens.css `@font-face`.
  mkdirSync(outFonts, { recursive: true })
  copyFileSync(`${INPUT_FONTS}/surah_names.woff2`, `${outFonts}/surah-names.woff2`)

  const manifest = {
    // Per-page glyph fonts: family is fixed, the woff2 URL varies by page.
    qpc: { family: 'QPCPage', pathTemplate: 'fonts/qpc-v2/p{page}.woff2', pages: 604 },
    tajweed: { family: 'TajweedPage', pathTemplate: 'fonts/tajweed/p{page}.woff2', pages: 604, color: true },
    // Single Nastaleeq font for all Indopak pages.
    indopak: { family: 'IndopakNastaleeq', path: 'fonts/indopak/font.woff2' },
  }
  writeJson(`${outFonts}/manifest.json`, manifest)

  console.log(
    `[fonts] qpc ${qpc.copied}+${qpc.skipped} | tajweed ${tajweed.copied}+${tajweed.skipped} | indopak ${indopak.copied}+${indopak.skipped}  (copied+skipped)`,
  )
  return manifest
}
