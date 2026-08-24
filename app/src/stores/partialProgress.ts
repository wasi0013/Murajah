import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import type { PageHighlightSpec } from '@/core/navigation/previewRoute'
import { toggleAyah as toggleAyahMark } from '@/core/memorization/partialProgress'

/** On-disk/hydrate shape — `null` means nothing in progress. */
export interface PartialProgressState {
  page: number
  marks: PageHighlightSpec[]
}

/**
 * In-progress verse marks on the plan's current new-memorization front page
 * (see plans/partial-page-tracking.md). Only one page is ever tracked at a
 * time — marking is restricted to the plan's front page by design, so there
 * is no per-page map here, unlike `mistakes`/`progress`.
 */
export const usePartialProgressStore = defineStore('partialProgress', () => {
  const page = ref<number | null>(null)
  const marks = reactive<PageHighlightSpec[]>([])

  const hasProgress = computed(() => page.value != null && marks.length > 0)

  /**
   * Toggle a whole ayah's mark on `targetPage`. If `targetPage` differs from
   * the page currently tracked, prior marks are dropped first rather than
   * merged — a plan-front change orphans stale marks by design (see the
   * design doc's risk table).
   */
  function toggleAyah(targetPage: number, surah: number, ayah: number): void {
    if (page.value !== targetPage) {
      page.value = targetPage
      marks.splice(0, marks.length)
    }
    const next = toggleAyahMark(marks.map((m) => ({ ...m })), surah, ayah)
    marks.splice(0, marks.length, ...next)
  }

  /** Drop all marks — called once a page has fully graduated into `memorizedPages`. */
  function clear(): void {
    page.value = null
    marks.splice(0, marks.length)
  }

  /** Replace the whole state (hydrate / import). */
  function setAll(state: PartialProgressState | null): void {
    page.value = state?.page ?? null
    marks.splice(0, marks.length, ...(state?.marks ?? []).map((m) => ({ ...m })))
  }

  /** A plain (proxy-free) copy for persistence. `null` when nothing is in progress. */
  function snapshot(): PartialProgressState | null {
    if (page.value == null) return null
    return { page: page.value, marks: marks.map((m) => ({ ...m })) }
  }

  return { page, marks, hasProgress, toggleAyah, clear, setAll, snapshot }
})
