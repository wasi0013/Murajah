import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

// data-pipeline/src/lib -> repo root is three levels up.
export const ROOT = resolve(here, '../../..')

// data-pipeline/src/lib -> data-pipeline/ is two levels up. Input data is owned
// by this package (data-pipeline/input/), not borrowed from elsewhere.
const PACKAGE_ROOT = resolve(here, '../..')
export const INPUT_DATA = resolve(PACKAGE_ROOT, 'input/data')
export const INPUT_FONTS = resolve(PACKAGE_ROOT, 'input/fonts')
export const INPUT_IMAGES = resolve(PACKAGE_ROOT, 'input/images')

// Output lands in the app's public/ so Vite serves it at /data, /fonts, /img.
export const OUTPUT_PUBLIC = resolve(ROOT, 'app/public')
export const OUTPUT_DATA = resolve(OUTPUT_PUBLIC, 'data')
