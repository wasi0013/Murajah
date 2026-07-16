import { computed, reactive, ref, watch, type ComputedRef } from 'vue'
import type { useReaderStore } from '@/stores/reader'
import type { DataClient } from '@/core/data'
import type { FontLoader, FontRequest } from '@/core/fonts'
import type { PageChunk } from '@/core/data/types'
import { getDataClient } from '@/core/data'
import { getFontLoader } from '@/core/fonts'
import { windowPages } from '@/core/reader/pageWindow'

export interface PageEntry {
  status: 'loading' | 'ready' | 'error'
  chunk?: PageChunk
  family?: string
}

export interface UseReaderPagesOptions {
  data?: DataClient
  fonts?: FontLoader
  /** Pages kept beyond the mounted window before eviction. Default 1. */
  keepRadius?: number
}

/**
 * Reactive loader behind the paged reader: keeps a small cache of loaded pages
 * (data chunk + resolved font family), (re)loads the current page and its ±1
 * neighbours whenever page/layout/tajweed change, prefetches those neighbours,
 * and evicts pages that fall outside the keep radius. Data + fonts are injected
 * so this is unit-testable without a browser. On init it also feeds the real
 * manifest page counts into the store (`configure`).
 */
export function useReaderPages(
  reader: ReturnType<typeof useReaderStore>,
  options: UseReaderPagesOptions = {},
) {
  const data = options.data ?? getDataClient()
  const fonts = options.fonts ?? getFontLoader()
  const keepRadius = options.keepRadius ?? 1

  const cache = reactive(new Map<number, PageEntry>())
  const ready = ref(false)
  let cachedLayout = reader.layout

  const pages: ComputedRef<number[]> = computed(() => windowPages(reader.page, reader.pageCount))

  function fontRequest(page: number): FontRequest {
    return reader.layout === 'indopak'
      ? { layout: 'indopak', page }
      : { layout: 'qpc', page, tajweed: reader.tajweed }
  }

  async function load(page: number): Promise<void> {
    let entry = cache.get(page)
    if (!entry) {
      entry = reactive<PageEntry>({ status: 'loading' })
      cache.set(page, entry)
    }
    try {
      if (!entry.chunk) entry.chunk = await data.getPage(reader.layout, page)
      // Re-resolving the family is cheap when already loaded (FontLoader caches),
      // and swaps QPC↔tajweed on toggle without refetching the chunk.
      entry.family = await fonts.ensure(fontRequest(page))
      entry.status = 'ready'
    } catch {
      entry.status = 'error'
    }
  }

  function refresh(): void {
    if (!ready.value) return
    // A layout switch changes what each page number contains — drop the cache.
    if (cachedLayout !== reader.layout) {
      cache.clear()
      cachedLayout = reader.layout
    }
    // Current page first, then its neighbours (all within the mounted window).
    void load(reader.page)
    for (const p of pages.value) if (p !== reader.page) void load(p)
    // Warm the neighbours' data + font off the main thread (idempotent).
    data.prefetchPage(reader.layout, reader.page - 1)
    data.prefetchPage(reader.layout, reader.page + 1)
    fonts.prefetch(fontRequest(reader.page - 1))
    fonts.prefetch(fontRequest(reader.page + 1))
    // Evict pages that fall outside the keep radius.
    for (const key of [...cache.keys()]) {
      if (Math.abs(key - reader.page) > keepRadius) cache.delete(key)
    }
  }

  const stop = watch(() => [reader.layout, reader.page, reader.tajweed], refresh)

  void (async () => {
    await Promise.all([data.init(), fonts.init()])
    reader.configure({ qpc: data.pageCount('qpc'), indopak: data.pageCount('indopak') })
    ready.value = true
    refresh()
  })()

  return {
    ready,
    pages,
    entry: (page: number): PageEntry | undefined => cache.get(page),
    dispose: () => stop(),
  }
}
