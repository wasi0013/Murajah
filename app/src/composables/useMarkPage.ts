import { ref, watch, type ComputedRef, type Ref } from 'vue'
import type { DataClient } from '@/core/data'
import type { FontLoader } from '@/core/fonts'
import type { PageChunk } from '@/core/data/types'
import { getDataClient } from '@/core/data'
import { getFontLoader } from '@/core/fonts'

type DataLike = Pick<DataClient, 'init' | 'getPage'>
type FontsLike = Pick<FontLoader, 'init' | 'ensure'>

export interface UseMarkPageOptions {
  data?: DataLike
  fonts?: FontsLike
}

export interface UseMarkPageResult {
  loading: Ref<boolean>
  error: Ref<boolean>
  chunk: Ref<PageChunk | undefined>
  family: Ref<string | undefined>
  retry: () => void
}

/**
 * Loads the plan's current new-memorization front page for `MarkPageView.vue`
 * — the same shape as `usePreviewPage.ts` (load `PageChunk` + font, track
 * loading/error, `retry()`), but driven by the plan's front page instead of a
 * route param. Forces the QPC tajweed glyph font, same as the share preview —
 * this is the page a new memorizer is looking straight at while learning it,
 * where the colour-coded rules are most useful. A new composable rather than
 * a modification of `usePreviewPage.ts`, which stays share-feature-only (see
 * plans/partial-page-tracking.md).
 */
export function useMarkPage(
  page: ComputedRef<number | undefined>,
  options: UseMarkPageOptions = {},
): UseMarkPageResult {
  const data = options.data ?? getDataClient()
  const fonts = options.fonts ?? getFontLoader()

  const loading = ref(true)
  const error = ref(false)
  const chunk = ref<PageChunk | undefined>()
  const family = ref<string | undefined>()

  async function load(): Promise<void> {
    const p = page.value
    chunk.value = undefined
    family.value = undefined
    error.value = false
    if (p == null) {
      loading.value = false
      return
    }
    loading.value = true
    try {
      await data.init()
      await fonts.init()
      const [c, f] = await Promise.all([
        data.getPage('qpc', p),
        fonts.ensure({ layout: 'qpc', page: p, tajweed: true }),
      ])
      chunk.value = c
      family.value = f
    } catch {
      error.value = true
    } finally {
      loading.value = false
    }
  }

  watch(page, () => void load(), { immediate: true })

  return {
    loading,
    error,
    chunk,
    family,
    retry: () => void load(),
  }
}
