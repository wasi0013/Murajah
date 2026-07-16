import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import { useProgressStore } from '@/stores/progress'
import { initReadingReward, tickReadingReward, type ReadingRewardState } from '@/core/memorization/readingReward'

/**
 * Accrues the reading-time hasanah reward for whichever page is currently on
 * screen (text reader or mushaf). Counts **active** seconds only — the tab must
 * be visible and focused — so idle/backgrounded time never accrues and it can't
 * be farmed. A page change starts a fresh session. Awards flow into the progress
 * store's cumulative hasanah, multiplied by the caller-resolved page weight
 * (QPC/mushaf = pageHasanah; Indopak maps to its Madani page — see 4.1.2).
 */
export function useReadingReward(
  currentPage: Ref<number | undefined> | (() => number | undefined),
  pageWeight: (page: number) => number,
) {
  const progress = useProgressStore()
  const pageOf = typeof currentPage === 'function' ? currentPage : () => currentPage.value

  let state: ReadingRewardState = initReadingReward()
  let session: number | undefined
  let timer: ReturnType<typeof setInterval> | undefined

  const isActive = () =>
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible' &&
    (typeof document.hasFocus !== 'function' || document.hasFocus())

  function resetFor(page: number | undefined): void {
    session = page
    state = initReadingReward()
  }

  function tick(): void {
    const page = pageOf()
    if (page == null) return
    if (page !== session) resetFor(page)
    if (!isActive()) return
    const r = tickReadingReward(state, 1)
    state = r.state
    if (r.units > 0) progress.awardHasanah(r.units * pageWeight(page))
  }

  onMounted(() => {
    resetFor(pageOf())
    timer = setInterval(tick, 1000)
  })
  onBeforeUnmount(() => clearInterval(timer))

  // A page change mid-session starts a new one immediately (not on the next tick).
  watch(
    () => pageOf(),
    (page) => {
      if (page !== session) resetFor(page)
    },
  )
}
