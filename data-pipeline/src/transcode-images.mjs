import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { SOURCE_IMAGES, OUTPUT_PUBLIC } from './lib/paths.mjs'

/**
 * Transcode the mushaf page scans (611MB of ~2.4MB PNG spreads) into WebP and
 * split each 2-page spread into single pages. One single-page asset set serves
 * both mobile (one page) and desktop (two adjacent pages composed side-by-side).
 *
 * RTL assumption: in `page-{a}-{b}.png`, the lower page `a` is on the RIGHT half
 * and `b` on the LEFT half (Arabic reading order). Verified visually in Phase 3b
 * when the mushaf view is built in-browser.
 *
 * Requires `cwebp` (Homebrew). Incremental: existing outputs are skipped.
 */
const QUALITY = 80
const SPREAD_RE = /^page-(\d+)-(\d+)\.png$/i

function pngDimensions(file) {
  // `sips` ships with macOS; parse pixelWidth/pixelHeight.
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], {
    encoding: 'utf8',
  })
  const w = +out.match(/pixelWidth:\s*(\d+)/)[1]
  const h = +out.match(/pixelHeight:\s*(\d+)/)[1]
  return { w, h }
}

function encodeCrop(src, dest, { x, y, w, h }) {
  if (existsSync(dest)) return false
  execFileSync('cwebp', ['-quiet', '-q', String(QUALITY), '-crop', `${x}`, `${y}`, `${w}`, `${h}`, src, '-o', dest])
  return true
}

export function transcodeImages({ limit = Infinity } = {}) {
  const srcDir = `${SOURCE_IMAGES}/quran_pages`
  const outDir = `${OUTPUT_PUBLIC}/img/mushaf`
  mkdirSync(outDir, { recursive: true })

  const spreads = readdirSync(srcDir)
    .filter((n) => SPREAD_RE.test(n))
    .slice(0, limit)

  let made = 0
  for (const name of spreads) {
    const [, a, b] = name.match(SPREAD_RE)
    const src = `${srcDir}/${name}`
    const { w, h } = pngDimensions(src)
    const half = Math.floor(w / 2)
    // right half → lower page `a`; left half → `b`
    if (encodeCrop(src, `${outDir}/${a}.webp`, { x: half, y: 0, w: w - half, h })) made++
    if (encodeCrop(src, `${outDir}/${b}.webp`, { x: 0, y: 0, w: half, h })) made++
  }

  console.log(`[images] processed ${spreads.length} spreads → ${made} webp pages written to img/mushaf/`)
  return { spreads: spreads.length, made }
}
