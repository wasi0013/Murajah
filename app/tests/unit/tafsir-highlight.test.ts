import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TafsirPanel from '@/features/reader/TafsirPanel.vue'
import type { VerseStudy } from '@/composables/useVerseStudy'

function entries(): VerseStudy[] {
  return [
    { verse: '1:1', arabic: 'بِسْمِ اللَّهِ', en: 'In the name of Allah', bn: '' },
    { verse: '1:2', arabic: 'الْحَمْدُ لِلَّهِ', en: 'All praise is due to Allah', bn: '' },
  ]
}

describe('TafsirPanel verse-highlight (7.4 / auto-scroll)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('anchors every verse and highlights only the active one', () => {
    const wrapper = mount(TafsirPanel, {
      props: { entries: entries(), fontFamily: 'qpc-p1', tafsir: {}, loading: false, activeVerse: '1:2' },
    })
    const verses = wrapper.findAll('.verse')
    expect(verses.map((v) => v.attributes('data-verse'))).toEqual(['1:1', '1:2'])
    expect(verses.map((v) => v.classes().includes('is-playing'))).toEqual([false, true])
  })

  it('highlights nothing when no verse is active', () => {
    const wrapper = mount(TafsirPanel, {
      props: { entries: entries(), fontFamily: 'qpc-p1', tafsir: {}, loading: false, activeVerse: null },
    })
    expect(wrapper.findAll('.is-playing')).toHaveLength(0)
  })
})
