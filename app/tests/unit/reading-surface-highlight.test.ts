import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ReadingSurface from '@/features/reader/ReadingSurface.vue'
import type { PageChunk, Word } from '@/core/data/types'

/** A 2-line page: ayah 1:1 (two words) then ayah 1:2 (one word). */
function fixture(): PageChunk {
  const words: Word[] = [
    { id: 1, surah: '1', ayah: '1', word: '1', location: '1:1:1', text: 'بِسْمِ' },
    { id: 2, surah: '1', ayah: '1', word: '2', location: '1:1:2', text: 'اللَّهِ' },
    { id: 3, surah: '1', ayah: '2', word: '1', location: '1:2:1', text: 'الْحَمْدُ' },
  ]
  return {
    page: 1,
    words,
    layout: [
      { page_number: 1, line_number: 1, line_type: 'ayah', is_centered: 0, first_word_id: 1, last_word_id: 2 },
      { page_number: 1, line_number: 2, line_type: 'ayah', is_centered: 0, first_word_id: 3, last_word_id: 3 },
    ],
  }
}

describe('ReadingSurface verse-highlight (7.4)', () => {
  it('tags every word with its verse and highlights only the active ayah', async () => {
    const wrapper = mount(ReadingSurface, {
      props: { page: fixture(), fontFamily: 'qpc-p1', activeVerse: '1:1' },
    })
    const words = wrapper.findAll('.word')
    expect(words).toHaveLength(3)
    // Anchors present for the reader→audio mapping.
    expect(words.map((w) => w.attributes('data-verse'))).toEqual(['1:1', '1:1', '1:2'])
    // Only the two words of ayah 1:1 are highlighted.
    expect(words.map((w) => w.classes().includes('state-playing'))).toEqual([true, true, false])
  })

  it('highlights nothing when there is no active verse', () => {
    const wrapper = mount(ReadingSurface, {
      props: { page: fixture(), fontFamily: 'qpc-p1', activeVerse: null },
    })
    expect(wrapper.findAll('.state-playing')).toHaveLength(0)
  })
})
