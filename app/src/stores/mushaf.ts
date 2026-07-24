import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { pageStep, visiblePages } from '@/core/mushaf/spread'

/** Default until the image manifest loads (Madani 604). */
const DEFAULT_PAGE_COUNT = 604

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)

/**
 * Mushaf image surface state: the current page, the page count (from the image
 * manifest), and whether the viewport is wide enough for the 2-up spread. Paging
 * respects the spread — `next`/`prev` move a whole spread on desktop, one page on
 * mobile — via the pure `pageStep` math, so every action stays synchronous and
 * unit-testable. Only `page` is persisted (the spread flag is width-driven).
 */
export const useMushafStore = defineStore('mushaf', () => {
  const page = ref(1)
  const pageCount = ref(DEFAULT_PAGE_COUNT)
  /** True when the viewport shows a 2-up spread (set by the view's width watch). */
  const spread = ref(false)

  /** The page(s) currently visible: one on mobile, the RTL pair on desktop. */
  const visible = computed(() => visiblePages(page.value, pageCount.value, spread.value))
  const canPrev = computed(() => pageStep(page.value, -1, pageCount.value, spread.value) !== page.value)
  const canNext = computed(() => pageStep(page.value, 1, pageCount.value, spread.value) !== page.value)

  /** Inject the real page count from the image manifest (falls back to default). */
  function configure(count: number) {
    if (count > 0) pageCount.value = count
    page.value = clamp(page.value, 1, pageCount.value)
  }

  function setSpread(on: boolean) {
    spread.value = on
  }

  function goToPage(n: number) {
    page.value = clamp(Math.trunc(n) || 1, 1, pageCount.value)
  }
  function next() {
    page.value = pageStep(page.value, 1, pageCount.value, spread.value)
  }
  function prev() {
    page.value = pageStep(page.value, -1, pageCount.value, spread.value)
  }

  function snapshot(): { page: number } {
    return { page: page.value }
  }
  function restore(p: Partial<{ page: number }>) {
    if (typeof p.page === 'number') goToPage(p.page)
  }

  return {
    page,
    pageCount,
    spread,
    visible,
    canPrev,
    canNext,
    configure,
    setSpread,
    goToPage,
    next,
    prev,
    snapshot,
    restore,
  }
})
