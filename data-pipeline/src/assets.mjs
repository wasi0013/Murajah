import { copyFonts } from './copy-fonts.mjs'
import { transcodeImages } from './transcode-images.mjs'

/**
 * Binary-asset build (fonts + mushaf images). Slow and incremental, so it is
 * kept OUT of the fast data prebuild. Run explicitly: `npm run assets:build`.
 *
 * Flags:
 *   --no-images        skip image transcode (fonts only)
 *   --images-limit=N   transcode only the first N spreads (sampling/validation)
 */
function main() {
  const args = process.argv.slice(2)
  const noImages = args.includes('--no-images')
  const limitArg = args.find((a) => a.startsWith('--images-limit='))
  const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity

  copyFonts()
  if (!noImages) transcodeImages({ limit })
}

main()
