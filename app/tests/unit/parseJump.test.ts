import { describe, it, expect } from 'vitest'
import { parseJump } from '@/core/navigation/parseJump'

describe('parseJump', () => {
  it('parses surah:ayah', () => {
    expect(parseJump('2:255')).toEqual([{ type: 'ayah', surah: 2, ayah: 255 }])
    expect(parseJump(' 1 : 7 ')).toEqual([{ type: 'ayah', surah: 1, ayah: 7 }])
  })

  it('rejects an out-of-range surah in ayah form', () => {
    expect(parseJump('115:1')).toEqual([])
  })

  it('parses page forms', () => {
    expect(parseJump('page 50')).toEqual([{ type: 'page', page: 50 }])
    expect(parseJump('p50')).toEqual([{ type: 'page', page: 50 }])
  })

  it('parses juz within 1–30', () => {
    expect(parseJump('juz 5')).toEqual([{ type: 'juz', juz: 5 }])
    expect(parseJump('j30')).toEqual([{ type: 'juz', juz: 30 }])
    expect(parseJump('juz 40')).toEqual([])
  })

  it('offers page + surah for a small bare number, page only for large', () => {
    expect(parseJump('5')).toEqual([
      { type: 'page', page: 5 },
      { type: 'surah', surah: 5 },
    ])
    expect(parseJump('300')).toEqual([{ type: 'page', page: 300 }])
  })

  it('treats text as a name search (Latin or Arabic)', () => {
    expect(parseJump('baqarah')).toEqual([{ type: 'name', query: 'baqarah' }])
    expect(parseJump('البقرة')).toEqual([{ type: 'name', query: 'البقرة' }])
  })

  it('returns nothing for empty input', () => {
    expect(parseJump('')).toEqual([])
    expect(parseJump('   ')).toEqual([])
  })
})
