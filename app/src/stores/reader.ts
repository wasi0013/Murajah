import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Layout, TafsirLang, WbwLang } from '@/core/data/types'

export type ReaderMode = 'read' | 'mark-mistake'

/** The persistable slice of reader state (view prefs + last page). */
export interface ReaderPrefs {
  page: number
  layout: Layout
  tajweed: boolean
  wbw: boolean
  wbwLang: WbwLang
  tafsir: boolean
  tafsirLang: TafsirLang
  textSizeStep: number
  mode: ReaderMode
}

/** Arabic reading sizes (rem), finest→largest. `textSizeStep` indexes this. */
export const READING_SIZES = ['1.4rem', '1.65rem', '1.9rem', '2.2rem', '2.55rem', '2.95rem'] as const
const DEFAULT_SIZE_STEP = 2 // 1.9rem (matches --reading-size-md)

/** Default page counts until the manifest is loaded (QPC 604 / Indopak 610). */
const DEFAULT_PAGE_COUNTS: Record<Layout, number> = { qpc: 604, indopak: 610 }

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)

/**
 * The reader session's single source of truth: which page/layout is showing and
 * every view option (tajweed, WBW, tafsir, text size, mode). Kept free of async
 * data access — page counts are injected via `configure()` and cross-layout page
 * remapping is computed by the caller (see core/navigation/remapPage) and passed
 * into `setLayout`, so every action here is synchronous and unit-testable.
 * Persistence (3.1.2) and URL sync (3.1.3) subscribe to this state.
 */
export const useReaderStore = defineStore('reader', () => {
  const page = ref(1)
  const layout = ref<Layout>('qpc')
  const pageCounts = ref<Record<Layout, number>>({ ...DEFAULT_PAGE_COUNTS })

  const tajweed = ref(true)
  const wbw = ref(false)
  const wbwLang = ref<WbwLang>('en')
  const tafsir = ref(false)
  const tafsirLang = ref<TafsirLang>('en')
  const textSizeStep = ref(DEFAULT_SIZE_STEP)
  const mode = ref<ReaderMode>('read')

  const pageCount = computed(() => pageCounts.value[layout.value])
  const readingSize = computed(() => READING_SIZES[textSizeStep.value])
  /** Indopak has no tajweed font — the surface only honours tajweed on QPC. */
  const tajweedActive = computed(() => layout.value === 'qpc' && tajweed.value)

  /** Inject real page counts from the data manifest (falls back to defaults). */
  function configure(counts: Partial<Record<Layout, number>>) {
    pageCounts.value = { ...pageCounts.value, ...counts }
    page.value = clamp(page.value, 1, pageCount.value)
  }

  function goToPage(n: number) {
    page.value = clamp(Math.trunc(n) || 1, 1, pageCount.value)
  }
  function nextPage() {
    goToPage(page.value + 1)
  }
  function prevPage() {
    goToPage(page.value - 1)
  }

  /**
   * Switch reading layout. `remappedPage` (computed by the caller from the nav
   * indexes) keeps the reader on the same ayah; without it the current page is
   * simply clamped to the new layout's page count.
   */
  function setLayout(next: Layout, remappedPage?: number) {
    layout.value = next
    page.value = clamp(remappedPage ?? page.value, 1, pageCount.value)
  }

  function setTextSizeStep(step: number) {
    textSizeStep.value = clamp(Math.trunc(step), 0, READING_SIZES.length - 1)
  }

  function toggleTajweed() {
    tajweed.value = !tajweed.value
  }
  function toggleWbw() {
    wbw.value = !wbw.value
  }
  function toggleTafsir() {
    tafsir.value = !tafsir.value
  }
  function setMode(next: ReaderMode) {
    mode.value = next
  }
  function toggleMode() {
    mode.value = mode.value === 'read' ? 'mark-mistake' : 'read'
  }

  /** The persistable slice (for prefs storage + URL sync). */
  function snapshot(): ReaderPrefs {
    return {
      page: page.value,
      layout: layout.value,
      tajweed: tajweed.value,
      wbw: wbw.value,
      wbwLang: wbwLang.value,
      tafsir: tafsir.value,
      tafsirLang: tafsirLang.value,
      textSizeStep: textSizeStep.value,
      mode: mode.value,
    }
  }

  /**
   * Apply a saved slice. Layout is set before the page so the page clamps to the
   * restored layout's count; unknown/missing fields keep their current value.
   */
  function restore(p: Partial<ReaderPrefs>) {
    if (p.layout) layout.value = p.layout
    if (typeof p.tajweed === 'boolean') tajweed.value = p.tajweed
    if (p.wbwLang) wbwLang.value = p.wbwLang
    if (typeof p.wbw === 'boolean') wbw.value = p.wbw
    if (p.tafsirLang) tafsirLang.value = p.tafsirLang
    if (typeof p.tafsir === 'boolean') tafsir.value = p.tafsir
    if (typeof p.textSizeStep === 'number') setTextSizeStep(p.textSizeStep)
    if (p.mode) mode.value = p.mode
    if (typeof p.page === 'number') goToPage(p.page)
  }

  return {
    // state
    page,
    layout,
    pageCounts,
    tajweed,
    wbw,
    wbwLang,
    tafsir,
    tafsirLang,
    textSizeStep,
    mode,
    // derived
    pageCount,
    readingSize,
    tajweedActive,
    // actions
    configure,
    goToPage,
    nextPage,
    prevPage,
    setLayout,
    setTextSizeStep,
    toggleTajweed,
    toggleWbw,
    toggleTafsir,
    setMode,
    toggleMode,
    snapshot,
    restore,
  }
})
