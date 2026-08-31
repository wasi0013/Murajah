import { computed, ref } from 'vue'
import { useProgressStore, TOTAL_PAGES } from '@/stores/progress'
import { useMistakesStore } from '@/stores/mistakes'
import type { DataClient } from '@/core/data'
import { getDataClient } from '@/core/data'
import {
  buildJuzGroups,
  memorizationStats,
  pageCell,
  type JuzGroup,
  type PageCell,
} from '@/core/memorization/progressView'
import { calculateAllWeaknesses, getWeakestPages } from '@/core/memorization/weaknessScorer'
import { daysSince } from '@/core/memorization/strengthBands'

/**
 * Reactive view-model for the Progress screen: the juz-grouped 604-page grid,
 * summary stats, and weakest-page suggestions — all derived from the canonical
 * progress + mistakes stores. Juz boundaries come from the derived QPC nav index
 * (not the legacy off-by-one tables).
 */
export function useMemorization(data: DataClient = getDataClient()) {
  const progress = useProgressStore()
  const mistakes = useMistakesStore()
  const juzToPage = ref<Record<string, number>>({})

  data
    .init()
    .then(() => data.getNavIndex('qpc'))
    .then((n) => (juzToPage.value = n.juzToPage))
    .catch(() => {})

  const juzGroups = computed<JuzGroup[]>(() =>
    Object.keys(juzToPage.value).length ? buildJuzGroups(juzToPage.value, TOTAL_PAGES) : [],
  )

  const stats = computed(() =>
    memorizationStats({
      memorized: progress.memorized,
      strength: progress.strength,
      mistakes: mistakes.byPage,
      hasanah: progress.hasanah,
      readingSeconds: progress.readingSeconds,
      listeningSeconds: progress.listeningSeconds,
      totalPages: TOTAL_PAGES,
    }),
  )

  function cell(page: number): PageCell {
    return pageCell(
      page,
      progress.isMemorized(page),
      progress.strengthOf(page),
      mistakes.byPage.get(page)?.size ?? 0,
      daysSince(progress.reviewData.get(page)?.lastReviewDate),
    )
  }

  /**
   * `cell()` above, memoized across all `TOTAL_PAGES` pages, keyed by page.
   * `MemorizedGrid.vue`'s template used to call `cell(page)` fresh, up to 3x
   * per cell (class/style/aria-label bindings), for all 604 cells — meaning
   * every unrelated reactive change the render touched redid every page's
   * band classification from scratch. `cell()` itself is kept as-is (still a
   * legitimate pure per-page function; nothing here changes its behavior)
   * — this just computes it once per relevant store change instead of once
   * per template binding. See plans/performance-audit-2026-08.md P1.
   */
  const cells = computed<Map<number, PageCell>>(() => {
    const map = new Map<number, PageCell>()
    for (let page = 1; page <= TOTAL_PAGES; page++) map.set(page, cell(page))
    return map
  })

  /** Top-N weakest memorized pages (weakness = recency + revision + mistakes). */
  const weakestPages = computed<number[]>(() => {
    const pages = [...progress.memorized]
    if (pages.length === 0) return []
    const weakness = calculateAllWeaknesses({
      pages,
      perfectRevisions: progress.strength,
      mistakesMap: mistakes.byPage,
      pageReviewData: progress.reviewData, // lightweight recency/count (Phase 4.8)
    })
    return getWeakestPages(weakness, 10)
  })

  return { progress, juzGroups, stats, cell, cells, weakestPages }
}
