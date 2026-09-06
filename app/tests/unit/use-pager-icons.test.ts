import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { usePagerIcons } from '@/composables/usePagerIcons'
import type { Dir } from '@/core/i18n/types'

describe('usePagerIcons (RTL-aware)', () => {
  it('keeps prev/next pointing left/right in ltr', () => {
    const dir = ref<Dir>('ltr')
    const { prevIcon, nextIcon } = usePagerIcons(dir)
    expect(prevIcon.value).toBe(ChevronLeft)
    expect(nextIcon.value).toBe(ChevronRight)
  })

  it('swaps the glyphs in rtl, so each still points outward', () => {
    const dir = ref<Dir>('rtl')
    const { prevIcon, nextIcon } = usePagerIcons(dir)
    expect(prevIcon.value).toBe(ChevronRight)
    expect(nextIcon.value).toBe(ChevronLeft)
  })

  it('reacts to a later direction change', () => {
    const dir = ref<Dir>('ltr')
    const { prevIcon, nextIcon } = usePagerIcons(dir)
    dir.value = 'rtl'
    expect(prevIcon.value).toBe(ChevronRight)
    expect(nextIcon.value).toBe(ChevronLeft)
  })
})
