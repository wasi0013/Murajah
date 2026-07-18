import { describe, it, expect } from 'vitest'
import { AYAH_COUNTS, MAKKI_MADANI, ayahCount, versesInSurah } from '@/core/quran/surahMeta'

describe('surahMeta', () => {
  it('has 114 ayah counts totalling 6236', () => {
    expect(AYAH_COUNTS).toHaveLength(114)
    expect(AYAH_COUNTS.reduce((a, b) => a + b, 0)).toBe(6236)
  })

  it('ayahCount matches known surahs', () => {
    expect(ayahCount(1)).toBe(7) // Al-Fatihah
    expect(ayahCount(2)).toBe(286) // Al-Baqarah
    expect(ayahCount(25)).toBe(77) // Al-Furqan
    expect(ayahCount(114)).toBe(6) // An-Nas
  })

  it('versesInSurah enumerates 1..count in order', () => {
    const furqan = versesInSurah(25)
    expect(furqan).toHaveLength(77)
    expect(furqan[0]).toEqual({ surah: 25, ayah: 1 })
    expect(furqan.at(-1)).toEqual({ surah: 25, ayah: 77 })
    expect(versesInSurah(1)).toHaveLength(7)
  })

  it('records place of revelation for all 114 surahs', () => {
    expect(MAKKI_MADANI).toHaveLength(114)
    expect(MAKKI_MADANI[0]).toBe('makki') // Al-Fatihah
    expect(MAKKI_MADANI[1]).toBe('madani') // Al-Baqarah
    expect(MAKKI_MADANI[24]).toBe('makki') // Al-Furqan
    expect(MAKKI_MADANI.every((v) => v === 'makki' || v === 'madani')).toBe(true)
  })
})
