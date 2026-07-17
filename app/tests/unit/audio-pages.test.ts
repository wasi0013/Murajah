import { describe, it, expect } from 'vitest'
import { audioPagesFor } from '@/core/audio/pages'
import { pageAudioAvailable } from '@/core/audio/pageMode'

describe('audioPagesFor', () => {
  it('text view plays the single reader page', () => {
    expect(audioPagesFor('text', { readerPage: 42, mushafVisible: [1, 2] })).toEqual([42])
  })

  it('mushaf spread plays both visible pages, ascending', () => {
    // mushaf.visible is [right(odd), left(even)] — already ascending.
    expect(audioPagesFor('mushaf', { readerPage: 42, mushafVisible: [3, 4] })).toEqual([3, 4])
  })

  it('mushaf single page (mobile / last page) plays one page', () => {
    expect(audioPagesFor('mushaf', { readerPage: 42, mushafVisible: [604] })).toEqual([604])
  })

  it('normalises order and de-duplicates', () => {
    expect(audioPagesFor('mushaf', { readerPage: 1, mushafVisible: [4, 3, 3] })).toEqual([3, 4])
  })
})

describe('pageAudioAvailable', () => {
  it('is available for QPC, not Indopak (decision 6)', () => {
    expect(pageAudioAvailable('qpc')).toBe(true)
    expect(pageAudioAvailable('indopak')).toBe(false)
  })
})
