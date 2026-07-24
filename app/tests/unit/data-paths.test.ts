import { describe, it, expect } from 'vitest'
import {
  pagePath,
  translationPath,
  tafsirPath,
  indexPath,
  pageCount,
} from '@/core/data/paths'
import type { Manifest } from '@/core/data/types'

const manifest: Manifest = {
  version: 'test',
  datasets: {
    qpc: { pathTemplate: 'data/qpc/pages/{page}.json', count: 604 },
    indopak: { pathTemplate: 'data/indopak/pages/{page}.json', count: 610 },
    'tr-en': { pathTemplate: 'data/tr/en/{surah}.json', count: 114 },
    'tafsir-ar': { pathTemplate: 'data/tafsir/ar/{surah}.json', count: 114 },
  },
  indexes: {
    surahNames: { path: 'data/surah-names.json' },
    tafsirMapQpc: { path: 'data/tafsir/mapping/qpc.json' },
  },
}

describe('data paths', () => {
  it('builds per-page paths per layout', () => {
    expect(pagePath(manifest, 'qpc', 1)).toBe('data/qpc/pages/1.json')
    expect(pagePath(manifest, 'indopak', 253)).toBe('data/indopak/pages/253.json')
  })

  it('builds per-surah translation + tafsir paths', () => {
    expect(translationPath(manifest, 'en', 2)).toBe('data/tr/en/2.json')
    expect(tafsirPath(manifest, 'ar', 2)).toBe('data/tafsir/ar/2.json')
  })

  it('resolves index + page counts', () => {
    expect(indexPath(manifest, 'surahNames')).toBe('data/surah-names.json')
    expect(pageCount(manifest, 'qpc')).toBe(604)
    expect(pageCount(manifest, 'indopak')).toBe(610)
  })

  it('throws on unknown dataset/index', () => {
    expect(() => pagePath({ ...manifest, datasets: {} }, 'qpc', 1)).toThrow(/unknown dataset/)
    expect(() => indexPath(manifest, 'nope')).toThrow(/unknown index/)
  })
})
