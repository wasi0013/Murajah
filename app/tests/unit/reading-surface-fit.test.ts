import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReadingSurface from '@/features/reader/ReadingSurface.vue'
import type { PageChunk, Word } from '@/core/data/types'

/** A 2-line page: a 3-word line (the widest) and a 2-word line. */
function fixture(): PageChunk {
  const words: Word[] = [1, 2, 3, 4, 5].map((id) => ({
    id,
    surah: '18',
    ayah: '19',
    word: String(id),
    location: `18:19:${id}`,
    text: 'كَذَٰلِكَ',
  }))
  return {
    page: 295,
    words,
    layout: [
      { page_number: 295, line_number: 1, line_type: 'ayah', is_centered: 0, first_word_id: 1, last_word_id: 3 },
      { page_number: 295, line_number: 2, line_type: 'ayah', is_centered: 0, first_word_id: 4, last_word_id: 5 },
    ],
  }
}

const BASE_PX = 30.4 // --reading-size-md (1.9rem)
const AVAIL_PX = 344 // a ~360px-wide phone column
const WORD_EM = 5 // each word's width, in ems of its rendered size

/**
 * Android WebView's text zoom (it follows the system font size) multiplies
 * absolute font sizes; an `em` size inherits the already-zoomed parent size, and
 * getComputedStyle reports the zoomed value. Returns a row's rendered px size.
 */
function renderedPx(row: HTMLElement, zoom: number): number {
  const own = row.style.fontSize
  if (own.endsWith('em')) return parseFloat(own) * BASE_PX * zoom
  if (own.endsWith('px')) return parseFloat(own) * zoom
  return BASE_PX * zoom
}

function stubLayout(zoom: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('line-ayah') ? AVAIL_PX : 0
  })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const row = this.parentElement as HTMLElement
    const w = WORD_EM * renderedPx(row, zoom)
    const i = Array.from(row.children).indexOf(this)
    // RTL, flex-start: words pack leftward from the row's right edge.
    return { left: AVAIL_PX - (i + 1) * w, right: AVAIL_PX - i * w } as DOMRect
  })
  const real = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    if (!(el as HTMLElement).classList?.contains('line-ayah')) return real(el)
    return { fontSize: `${renderedPx(el as HTMLElement, zoom)}px` } as CSSStyleDeclaration
  })
}

describe('ReadingSurface line fitting', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([
    ['default font size', 1],
    ['115% system font size', 1.15],
    ['150% system font size', 1.5],
    ['200% system font size', 2],
  ])('fills the column without clipping at %s', async (_label, zoom) => {
    stubLayout(zoom)
    const wrapper = mount(ReadingSurface, { props: { page: fixture(), fontFamily: 'qpc-p295' } })
    await nextTick()
    await nextTick()
    const rows = wrapper.findAll<HTMLElement>('.line-ayah').map((r) => r.element)
    const widest = Math.max(...rows.map((r) => r.children.length * WORD_EM * renderedPx(r, zoom)))
    expect(widest / AVAIL_PX).toBeCloseTo(1, 6)
    // Every line shares one size, and justification is restored.
    expect(new Set(rows.map((r) => r.style.fontSize)).size).toBe(1)
    expect(rows.every((r) => r.style.justifyContent === '')).toBe(true)
    wrapper.unmount()
  })
})
