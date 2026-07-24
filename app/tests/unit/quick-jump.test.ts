import { describe, it, expect } from 'vitest'
import { resolveJump } from '@/core/navigation/resolveJump'
import { findSurahByName } from '@/core/navigation/surahNames'
import type { NavIndex } from '@/core/data/types'

const nav: NavIndex = {
  ayahToPage: { '2:255': 42, '1:1': 1 },
  surahToPage: { '1': 1, '2': 2, '36': 440, '112': 604 },
  juzToPage: { '1': 1, '5': 87, '30': 582 },
}

describe('findSurahByName', () => {
  it('matches transliterations with/without the article and punctuation', () => {
    expect(findSurahByName('baqarah')).toBe(2)
    expect(findSurahByName('Al-Baqarah')).toBe(2)
    expect(findSurahByName('al baqara')).toBe(2)
    expect(findSurahByName('fatihah')).toBe(1)
    expect(findSurahByName('ya-sin')).toBe(36)
    expect(findSurahByName('yasin')).toBe(36)
    expect(findSurahByName('ikhlas')).toBe(112)
    expect(findSurahByName('nas')).toBe(114)
  })

  it('returns undefined for no match / too-short queries', () => {
    expect(findSurahByName('zzzz')).toBeUndefined()
    expect(findSurahByName('a')).toBeUndefined()
  })
})

describe('resolveJump', () => {
  it('resolves each target type to a page', () => {
    expect(resolveJump(nav, { type: 'page', page: 50 })).toBe(50)
    expect(resolveJump(nav, { type: 'ayah', surah: 2, ayah: 255 })).toBe(42)
    expect(resolveJump(nav, { type: 'juz', juz: 5 })).toBe(87)
    expect(resolveJump(nav, { type: 'surah', surah: 36 })).toBe(440)
    expect(resolveJump(nav, { type: 'name', query: 'baqarah' })).toBe(2)
  })

  it('returns undefined when the target does not exist', () => {
    expect(resolveJump(nav, { type: 'ayah', surah: 2, ayah: 999 })).toBeUndefined()
    expect(resolveJump(nav, { type: 'name', query: 'zzzz' })).toBeUndefined()
  })
})
