import { reactive, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { DataClient } from '@/core/data'
import type { FontLoader } from '@/core/fonts'
import type { PageChunk } from '@/core/data/types'
import { getDataClient } from '@/core/data'
import { getFontLoader } from '@/core/fonts'
import { withinPageCap, type PreviewRange } from '@/core/navigation/previewRoute'

export interface PreviewPageEntry {
  status: 'loading' | 'ready' | 'error'
  chunk?: PageChunk
  family?: string
}

/** The narrow slices of DataClient/FontLoader this composable actually calls —
 * named so tests can pass a lightweight fake instead of constructing the real
 * (Transport-backed) singletons. */
type DataLike = Pick<DataClient, 'init' | 'getNavIndex' | 'getPage'>
type FontsLike = Pick<FontLoader, 'init' | 'ensure'>

export interface UsePreviewPagesOptions {
  data?: DataLike
  fonts?: FontsLike
}

export interface UsePreviewPagesResult {
  /** True while resolving the ayah range into a page span, before any
   * per-page load has been requested. */
  resolving: Ref<boolean>
  /** True once resolution finds the range spans more pages than the cap
   * allows — no page or font fetch is ever attempted in that case. */
  rangeTooLarge: Ref<boolean>
  /** True if the range's start/end ayah couldn't be resolved to a page at all
   * (shouldn't happen for a range `previewRoute.ts` already validated, but the
   * nav index is a second, independent data source — defensive, not assumed). */
  navError: Ref<boolean>
  /** Ordered page numbers in the resolved range — empty until resolved, and
   * stays empty if capped or errored. */
  pages: Ref<number[]>
  /** A page's current load entry, or `undefined` before it's been requested. */
  entry: (page: number) => PreviewPageEntry | undefined
  /** Re-attempt a single page that failed to load — its siblings are untouched. */
  retry: (page: number) => void
}

/**
 * Data loading for the `/preview` route's stacked-page view — deliberately
 * NOT a reuse of `useReaderPages` (that composable is built around a single
 * scalar `reader.page` with keep-radius eviction, the wrong shape for a
 * stacked multi-page view). Always QPC + tajweed, resolved straight from
 * `data`/`fonts` — this file never reads `useReaderStore`, which is the actual
 * guarantee that a preview link ignores the visitor's own reader prefs.
 *
 * Reuses the shared `getFontLoader()` singleton rather than constructing a
 * dedicated `FontLoader` — a second instance would register the same
 * font-family names (`tj-p{page}`) into `document.fonts` from two independent
 * owners, which is worse than the (traced-out-as-low) risk of its default
 * 12-face eviction cap colliding with the page cap below; see tasks/plan.md.
 */
export function usePreviewPages(
  range: ComputedRef<PreviewRange | undefined>,
  options: UsePreviewPagesOptions = {},
): UsePreviewPagesResult {
  const data = options.data ?? getDataClient()
  const fonts = options.fonts ?? getFontLoader()

  const cache = reactive(new Map<number, PreviewPageEntry>())
  const pages = ref<number[]>([])
  const resolving = ref(true)
  const rangeTooLarge = ref(false)
  const navError = ref(false)

  async function loadPage(page: number): Promise<void> {
    let entry = cache.get(page)
    if (!entry) {
      entry = reactive<PreviewPageEntry>({ status: 'loading' })
      cache.set(page, entry)
    } else {
      entry.status = 'loading'
    }
    try {
      const [chunk, family] = await Promise.all([
        data.getPage('qpc', page),
        fonts.ensure({ layout: 'qpc', page, tajweed: true }),
      ])
      entry.chunk = chunk
      entry.family = family
      entry.status = 'ready'
    } catch {
      entry.status = 'error'
    }
  }

  async function resolve(): Promise<void> {
    cache.clear()
    pages.value = []
    rangeTooLarge.value = false
    navError.value = false
    resolving.value = true

    const r = range.value
    if (!r) {
      resolving.value = false
      return
    }

    try {
      await data.init()
      const nav = await data.getNavIndex('qpc')
      const startPage = nav.ayahToPage[`${r.surah}:${r.startAyah}`]
      const endPage = nav.ayahToPage[`${r.surah}:${r.endAyah}`]
      if (startPage == null || endPage == null) {
        navError.value = true
        return
      }
      if (!withinPageCap(startPage, endPage)) {
        rangeTooLarge.value = true
        return
      }
      const list: number[] = []
      for (let p = startPage; p <= endPage; p++) list.push(p)
      pages.value = list

      await fonts.init()
      // Independent per-page loads — no page's load blocks or is blocked by
      // any sibling's; each flips its own `cache` entry when it settles.
      void Promise.all(list.map(loadPage))
    } catch {
      navError.value = true
    } finally {
      resolving.value = false
    }
  }

  watch(range, () => void resolve(), { immediate: true })

  return {
    resolving,
    rangeTooLarge,
    navError,
    pages,
    entry: (page: number): PreviewPageEntry | undefined => cache.get(page),
    retry: (page: number): void => {
      void loadPage(page)
    },
  }
}
