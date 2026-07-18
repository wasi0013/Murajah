import { describe, it, expect } from 'vitest'
import { juzRows, surahRows } from '@/core/navigation/contents'

describe('surahRows', () => {
  const rows = surahRows({ '1': 'الفاتحة', '25': 'الفرقان' })

  it('builds all 114 rows in order', () => {
    expect(rows).toHaveLength(114)
    expect(rows[0].surah).toBe(1)
    expect(rows.at(-1)?.surah).toBe(114)
  })

  it('carries name, ayah count and place', () => {
    expect(rows[0]).toMatchObject({
      surah: 1,
      translit: 'Al-Fatihah',
      arabic: 'الفاتحة',
      ayahs: 7,
      place: 'makki',
    })
    expect(rows[24]).toMatchObject({ surah: 25, translit: 'Al-Furqan', ayahs: 77 })
    expect(rows[1].place).toBe('madani') // Al-Baqarah
  })

  it('leaves the Arabic name blank when the index lacks it', () => {
    expect(rows[1].arabic).toBe('') // surah 2 not in the fixture
  })
})

describe('juzRows', () => {
  // Current-layout juz starts (QPC here) and the QPC index for the opening surah.
  const juzToPage = { '1': 1, '2': 22, '30': 582 }
  const rows = juzRows(juzToPage, juzToPage, 604)

  it('builds 30 rows', () => {
    expect(rows).toHaveLength(30)
  })

  it('derives the opening surah and page span', () => {
    expect(rows[0]).toMatchObject({
      juz: 1,
      startSurah: 1,
      startSurahName: 'Al-Fatihah',
      startPage: 1,
      endPage: 21, // up to the page before juz 2
    })
    expect(rows[1]).toMatchObject({ juz: 2, startSurahName: 'Al-Baqarah', startPage: 22 })
  })

  it('runs the last juz to the final page', () => {
    expect(rows[29]).toMatchObject({ juz: 30, startPage: 582, endPage: 604 })
  })
})
