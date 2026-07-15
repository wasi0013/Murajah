import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

// data-pipeline/src/lib -> repo root is three levels up.
export const ROOT = resolve(here, '../../..')
export const SOURCE_DATA = resolve(ROOT, 'source/resources/data')
export const SOURCE_FONTS = resolve(ROOT, 'source/resources/styles/fonts')
export const SOURCE_IMAGES = resolve(ROOT, 'source/resources/assets/images')

// Output lands in the app's public/ so Vite serves it at /data, /fonts, /img.
export const OUTPUT_PUBLIC = resolve(ROOT, 'app/public')
export const OUTPUT_DATA = resolve(OUTPUT_PUBLIC, 'data')
