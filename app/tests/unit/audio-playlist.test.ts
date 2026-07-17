import { describe, it, expect } from 'vitest'
import {
  buildVersePlaylist,
  buildPagePlaylist,
  spacedGroups,
} from '@/core/audio/playlist'
import { verseReciter, pageReciter } from '@/core/audio/reciters'
import type { PageVerse } from '@/core/quran/pageVerses'

const verses: PageVerse[] = [
  { surah: 1, ayah: 1, page: 1, arabic: 'a' },
  { surah: 1, ayah: 2, page: 1, arabic: 'b' },
  { surah: 1, ayah: 3, page: 1, arabic: 'c' },
]

describe('buildVersePlaylist', () => {
  const shuraim = verseReciter('shuraim')

  it('a straight run is one item per verse, in order, tagged for highlight', () => {
    const items = buildVersePlaylist(verses, shuraim)
    expect(items.map((i) => i.label)).toEqual(['1:1', '1:2', '1:3'])
    expect(items.every((i) => i.kind === 'verse')).toBe(true)
    expect(items[0].verse).toEqual({ surah: 1, ayah: 1, page: 1 })
    expect(items[0].urls.primary).toContain('001001.mp3')
  })

  it('repeatCount repeats each verse consecutively', () => {
    const items = buildVersePlaylist(verses, shuraim, { repeatCount: 2 })
    expect(items.map((i) => i.label)).toEqual(['1:1', '1:1', '1:2', '1:2', '1:3', '1:3'])
  })

  it('clamps a bad repeatCount to at least 1', () => {
    expect(buildVersePlaylist(verses, shuraim, { repeatCount: 0 })).toHaveLength(3)
    expect(buildVersePlaylist(verses, shuraim, { repeatCount: -5 })).toHaveLength(3)
  })

  it('spaced expansion is the cumulative drill', () => {
    // groups for 3 verses: [0],[0],[1],[0,1],[2],[0,1,2] → labels flattened.
    const items = buildVersePlaylist(verses, shuraim, { spaced: true })
    expect(items.map((i) => i.label)).toEqual([
      '1:1', // [0]
      '1:1', // [0] cumulative
      '1:2', // [1]
      '1:1', '1:2', // [0,1] cumulative
      '1:3', // [2]
      '1:1', '1:2', '1:3', // [0,1,2] cumulative
    ])
  })

  it('spaced item count equals the legacy totalSpacedRepetitionPlays', () => {
    // sum(group.length) * repeatCount = 9 * 2 = 18.
    const items = buildVersePlaylist(verses, shuraim, { spaced: true, repeatCount: 2 })
    const groupTotal = spacedGroups(verses.length).reduce((n, g) => n + g.length, 0)
    expect(items).toHaveLength(groupTotal * 2)
    expect(items).toHaveLength(18)
  })
})

describe('spacedGroups', () => {
  it('produces singleton then cumulative for each verse', () => {
    expect(spacedGroups(3)).toEqual([[0], [0], [1], [0, 1], [2], [0, 1, 2]])
  })
  it('is empty for no verses', () => {
    expect(spacedGroups(0)).toEqual([])
  })
})

describe('buildPagePlaylist', () => {
  it('single-part reciter yields one item per page, ascending', () => {
    const items = buildPagePlaylist([4, 3], pageReciter('husary'))
    expect(items.map((i) => i.page)).toEqual([
      { page: 3, part: 0 },
      { page: 4, part: 0 },
    ])
    expect(items.map((i) => i.label)).toEqual(['Page 3', 'Page 4'])
    expect(items.every((i) => i.kind === 'page-part')).toBe(true)
  })

  it('multi-part page (Alafasy) contributes one item per part with a part label', () => {
    // Page 604 carries surahs 112, 113, 114 → 3 parts.
    const items = buildPagePlaylist([604], pageReciter('alafasy'))
    expect(items).toHaveLength(3)
    expect(items.map((i) => i.label)).toEqual([
      'Page 604 · 1/3',
      'Page 604 · 2/3',
      'Page 604 · 3/3',
    ])
    expect(items.map((i) => i.page?.part)).toEqual([0, 1, 2])
  })

  it('page items have fallback === primary (no alternate CDN)', () => {
    const [item] = buildPagePlaylist([42], pageReciter('husary'))
    expect(item.urls.fallback).toBe(item.urls.primary)
  })
})
