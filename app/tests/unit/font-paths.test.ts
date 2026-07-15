import { describe, it, expect } from 'vitest'
import { fontFamily, fontPath, fontPageCount } from '@/core/fonts/fontPaths'
import type { FontManifest } from '@/core/fonts/types'

const manifest: FontManifest = {
  qpc: { family: 'QPCPage', pathTemplate: 'fonts/qpc-v2/p{page}.woff2', pages: 604 },
  tajweed: { family: 'TajweedPage', pathTemplate: 'fonts/tajweed/p{page}.woff2', pages: 604, color: true },
  indopak: { family: 'IndopakNastaleeq', path: 'fonts/indopak/font.woff2' },
}

describe('font paths', () => {
  it('gives each QPC/tajweed page a unique family, but Indopak a fixed one', () => {
    expect(fontFamily({ layout: 'qpc', page: 1 })).toBe('qpc-p1')
    expect(fontFamily({ layout: 'qpc', page: 2 })).toBe('qpc-p2')
    expect(fontFamily({ layout: 'qpc', page: 1, tajweed: true })).toBe('tj-p1')
    expect(fontFamily({ layout: 'indopak', page: 5 })).toBe('indopak')
    expect(fontFamily({ layout: 'indopak', page: 99 })).toBe('indopak')
  })

  it('builds per-page and single-font paths', () => {
    expect(fontPath(manifest, { layout: 'qpc', page: 576 })).toBe('fonts/qpc-v2/p576.woff2')
    expect(fontPath(manifest, { layout: 'qpc', page: 3, tajweed: true })).toBe('fonts/tajweed/p3.woff2')
    expect(fontPath(manifest, { layout: 'indopak', page: 42 })).toBe('fonts/indopak/font.woff2')
  })

  it('reports page counts (Indopak is page-independent)', () => {
    expect(fontPageCount(manifest, 'qpc')).toBe(604)
    expect(fontPageCount(manifest, 'qpc', true)).toBe(604)
    expect(fontPageCount(manifest, 'indopak')).toBe(Infinity)
  })
})
