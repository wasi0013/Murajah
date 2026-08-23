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

  return { progress, juzGroups, stats, cell, weakestPages }
}
