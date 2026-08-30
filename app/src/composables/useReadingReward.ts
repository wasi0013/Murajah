import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import { useProgressStore } from '@/stores/progress'
import { useSettingsStore } from '@/stores/settings'
import { initReadingReward, tickReadingReward, type ReadingRewardState } from '@/core/memorization/readingReward'

/**
 * How rarely accumulated active-reading seconds are pushed into the
 * (persisted, watched) progress store — see
 * plans/performance-audit-2026-08.md's P0-1 finding and
 * `useListeningTime.ts`'s matching constant/doc comment for the full
 * rationale (writing `readingSeconds` every second kept the debounced
 * IndexedDB persistence watcher firing every second too) and for the
 * `settings.trackReadingTime` gate's own doc comment below, which this
 * shares. A flush also fires immediately on unmount (leaving the reader) so
 * nothing beyond a true hard-kill is ever lost.
 */
const FLUSH_INTERVAL_S = 15

/**
 * Accrues the reading-time hasanah reward for whichever page is currently on
 * screen (text reader or mushaf). Counts **active** seconds only — the tab must
 * be visible and focused — so idle/backgrounded time never accrues and it can't
 * be farmed. A page change starts a fresh session. Awards flow into the progress
 * store's cumulative hasanah, multiplied by the caller-resolved page weight
 * (QPC/mushaf = pageHasanah; Indopak maps to its Madani page — see 4.1.2).
 *
 * `progress.addReadingSeconds` is batched (see `FLUSH_INTERVAL_S` above), not
 * called on every tick — a local `pendingSeconds` accumulates every active
 * second and is flushed periodically. This is independent of the per-page
 * `state`/`session` reward bookkeeping below (already event-based, only
 * touching the store when a reward threshold is actually crossed, and gated
 * by the separate `settings.trackHasanah` toggle via `awardHasanah` itself),
 * and of which page is on screen — reading seconds are a single global
 * counter, so a page change mid-flush-window doesn't need to force an early
 * flush.
 *
 * `pendingSeconds` only accumulates while `settings.trackReadingTime` is on
 * — matching `progress.addReadingSeconds`'s own gate (stores/progress.ts) at
 * the same 1s granularity the old (unbatched) per-tick call had, so turning
 * tracking ON mid-window can't over-credit seconds accrued while it was
 * off. The store's gate is re-checked again at flush time against whatever
 * the *current* setting is then, so the opposite direction (tracking turned
 * OFF between an already-legitimately-accrued tick and the next flush) can
 * still drop that small remainder — accepted, bounded to at most one flush
 * window, on a best-effort cumulative stat (see `useListeningTime.ts`'s
 * matching doc comment).
 */
export function useReadingReward(
  currentPage: Ref<number | undefined> | (() => number | undefined),
  pageWeight: (page: number) => number,
) {
  const progress = useProgressStore()
  const settings = useSettingsStore()
  const pageOf = typeof currentPage === 'function' ? currentPage : () => currentPage.value

  let state: ReadingRewardState = initReadingReward()
  let session: number | undefined
  let reviewedThisSession = false
  let timer: ReturnType<typeof setInterval> | undefined
  let flushTimer: ReturnType<typeof setInterval> | undefined
  let pendingSeconds = 0

  const isActive = () =>
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible' &&
    (typeof document.hasFocus !== 'function' || document.hasFocus())

  function flushReadingSeconds(): void {
    if (pendingSeconds > 0) {
      progress.addReadingSeconds(pendingSeconds)
      pendingSeconds = 0
    }
  }

  function resetFor(page: number | undefined): void {
    session = page
    state = initReadingReward()
    reviewedThisSession = false
  }

  function tick(): void {
    const page = pageOf()
    if (page == null) return
    if (page !== session) resetFor(page)
    if (!isActive()) return
    if (settings.trackReadingTime) pendingSeconds += 1
    const r = tickReadingReward(state, 1)
    state = r.state
    if (r.units > 0) {
      progress.awardHasanah(r.units * pageWeight(page))
      // Count one review the first time this session earns a reward (recency +
      // review-count feed weakness scoring; not once per threshold).
      if (!reviewedThisSession) {
        progress.markReviewed(page)
        reviewedThisSession = true
      }
    }
  }

  function onVisibilityChange(): void {
    if (document.hidden) flushReadingSeconds()
  }

  onMounted(() => {
    resetFor(pageOf())
    timer = setInterval(tick, 1000)
    flushTimer = setInterval(flushReadingSeconds, FLUSH_INTERVAL_S * 1000)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange)
    if (typeof window !== 'undefined') window.addEventListener('pagehide', flushReadingSeconds)
  })
  onBeforeUnmount(() => {
    clearInterval(timer)
    clearInterval(flushTimer)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange)
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', flushReadingSeconds)
    // Leaving the reader (route change/close) must not silently drop a
    // still-pending partial interval.
    flushReadingSeconds()
  })

  // A page change mid-session starts a new one immediately (not on the next tick).
  watch(
    () => pageOf(),
    (page) => {
      if (page !== session) resetFor(page)
    },
  )
}
