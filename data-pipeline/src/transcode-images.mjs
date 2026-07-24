import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { SOURCE_IMAGES, OUTPUT_PUBLIC } from './lib/paths.mjs'
import { writeJson, hash } from './lib/manifest.mjs'

/**
 * Transcode the mushaf page scans (611MB of ~2.4MB PNG spreads) into WebP and
 * split each 2-page spread into single pages. One single-page asset set serves
 * both mobile (one page) and desktop (two adjacent pages composed side-by-side).
 *
 * RTL assumption (verified in Phase 3b, task 3b.0.1): in `page-{a}-{b}.png` the
 * lower page `a` is on the RIGHT half and `b` on the LEFT half (Arabic reading
 * order). Page N's crop matches the QPC Madani-604 nav index page N.
 *
 * Requires `cwebp` (Homebrew). Incremental: existing outputs are skipped. The
 * manifest is always derived from the FULL source spread list (independent of
 * `limit`), so a sampled/limited encode still emits a complete, correct manifest.
 */
const QUALITY = 80
const SPREAD_RE = /^page-(\d+)-(\d+)\.png$/i
const PATH_TEMPLATE = 'img/mushaf/{page}.webp'

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

/**
 * Emit `img/mushaf/manifest.json`: page count, path template, and intrinsic
 * per-page dimensions for aspect-ratio boxing (avoids CLS while the image
 * loads). When every page shares the same size (the scans do — all 678×966) a
 * single top-level width/height is emitted; a `pages` override map is only
 * written if some page differs.
 */
function writeManifest(outDir, dims) {
  const pages = Object.keys(dims).map(Number).sort((a, b) => a - b)
  const first = dims[pages[0]]
  const uniform = pages.every((p) => dims[p].w === first.w && dims[p].h === first.h)

  const manifest = {
    pageCount: pages.length,
    pathTemplate: PATH_TEMPLATE,
    width: first.w,
    height: first.h,
  }
  if (!uniform) {
    manifest.pages = Object.fromEntries(
      pages.filter((p) => dims[p].w !== first.w || dims[p].h !== first.h).map((p) => [p, dims[p]]),
    )
  }
  // Content signature: stable across rebuilds of the SAME page set, so the app's
  // image cache (murajah-images) is only purged when the pages actually change —
  // not on every deploy (the scans are immutable; re-downloading 68MB would be
  // wasteful). URLs are unhashed (`{page}.webp`), so this version is the guard.
  manifest.version = hash(JSON.stringify(manifest))
  writeJson(`${outDir}/manifest.json`, manifest)
  return { pageCount: pages.length, uniform, width: first.w, height: first.h }
}

export function transcodeImages({ limit = Infinity } = {}) {
  const srcDir = `${SOURCE_IMAGES}/quran_pages`
  const outDir = `${OUTPUT_PUBLIC}/img/mushaf`
  mkdirSync(outDir, { recursive: true })

  const spreads = readdirSync(srcDir)
    .filter((n) => SPREAD_RE.test(n))
    .sort()

  // A limited run is for sampling/validation — encode a slice, and skip the
  // manifest (dimensioning all 302 spreads would defeat the point). The manifest
  // is only rewritten on a full run, so it always reflects the complete set.
  const full = limit === Infinity
  const toEncode = spreads.slice(0, limit)

  const dims = {}
  let made = 0
  for (const name of toEncode) {
    const [, a, b] = name.match(SPREAD_RE)
    const src = `${srcDir}/${name}`
    const { w, h } = pngDimensions(src)
    const half = Math.floor(w / 2)
    // right half → lower page `a`; left half → `b`
    dims[a] = { w: w - half, h }
    dims[b] = { w: half, h }
    if (encodeCrop(src, `${outDir}/${a}.webp`, { x: half, y: 0, w: w - half, h })) made++
    if (encodeCrop(src, `${outDir}/${b}.webp`, { x: 0, y: 0, w: half, h })) made++
  }

  const m = full ? writeManifest(outDir, dims) : null
  console.log(
    `[images] ${toEncode.length} spreads → ${made} webp written` +
      (m ? ` | manifest ${m.pageCount} pages @ ${m.width}×${m.height}${m.uniform ? ' (uniform)' : ' (+overrides)'}` : ' | manifest skipped (limited run)'),
  )
  return { spreads: toEncode.length, made, manifest: m }
}
