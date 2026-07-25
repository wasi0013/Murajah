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
    qpc: { pathTemplate: 'data/qpc/pages/{page}.json', count: 604, hash: 'qpchash' },
    indopak: { pathTemplate: 'data/indopak/pages/{page}.json', count: 610, hash: 'indohash' },
    'tr-en': { pathTemplate: 'data/tr/en/{surah}.json', count: 114, hash: 'trenhash' },
    'tafsir-ar': { pathTemplate: 'data/tafsir/ar/{surah}.json', count: 114, hash: 'tafarhash' },
  },
  indexes: {
    surahNames: { path: 'data/surah-names.json', hash: 'namehash' },
    tafsirMapQpc: { path: 'data/tafsir/mapping/qpc.json', hash: 'mapqpchash' },
  },
}

describe('data paths', () => {
  it('builds per-page paths per layout, cache-busted with the dataset hash', () => {
    expect(pagePath(manifest, 'qpc', 1)).toBe('data/qpc/pages/1.json?v=qpchash')
    expect(pagePath(manifest, 'indopak', 253)).toBe('data/indopak/pages/253.json?v=indohash')
  })

  it('builds per-surah translation + tafsir paths, cache-busted with the dataset hash', () => {
    expect(translationPath(manifest, 'en', 2)).toBe('data/tr/en/2.json?v=trenhash')
    expect(tafsirPath(manifest, 'ar', 2)).toBe('data/tafsir/ar/2.json?v=tafarhash')
  })

  it('resolves index + page counts, index paths cache-busted with the index hash', () => {
    expect(indexPath(manifest, 'surahNames')).toBe('data/surah-names.json?v=namehash')
    expect(pageCount(manifest, 'qpc')).toBe(604)
    expect(pageCount(manifest, 'indopak')).toBe(610)
  })

  it('a changed dataset/index hash changes the resulting URL', () => {
    const bumped: Manifest = {
      ...manifest,
      datasets: { ...manifest.datasets, qpc: { ...manifest.datasets.qpc, hash: 'newhash' } },
    }
    expect(pagePath(bumped, 'qpc', 1)).toBe('data/qpc/pages/1.json?v=newhash')
    expect(pagePath(bumped, 'qpc', 1)).not.toBe(pagePath(manifest, 'qpc', 1))
  })

  it('throws on unknown dataset/index', () => {
    expect(() => pagePath({ ...manifest, datasets: {} }, 'qpc', 1)).toThrow(/unknown dataset/)
    expect(() => indexPath(manifest, 'nope')).toThrow(/unknown index/)
  })
})
