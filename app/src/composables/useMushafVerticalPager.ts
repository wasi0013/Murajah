import { computed, nextTick, onBeforeUnmount, watch, type Ref } from 'vue'
import type { useMushafStore } from '@/stores/mushaf'
import type { useMushafImages } from '@/composables/useMushafImages'

type MushafStore = ReturnType<typeof useMushafStore>
type MushafImages = ReturnType<typeof useMushafImages>

const SETTLE_MS = 120

export interface VPagerSlot {
  key: 'prev' | 'cur' | 'next'
  page: number | null
}

/**
 * Vertical swipe-to-page for the mobile single-page mushaf view (UX audit 3.x
 * follow-up): a 3-slot CSS scroll-snap window (prev/current/next) that recycles
 * in place as the reader scrolls, so paging down/up feels like a continuous
 * feed rather than a discrete tap. Vertical (not horizontal) specifically so
 * direction never has to account for the RTL page order.
 *
 * Native-scroll based, not a hand-rolled drag — momentum and edge rubber-band
 * come from the browser for free. The view is responsible for mounting `el`
 * only in single-page mode and for pausing it (`overflow:hidden`) while
 * pinch-zoomed, so this composable stays inert everywhere else (desktop's 2-up
 * spread, zoomed). Settling is detected with a scroll-stop debounce rather
 * than the `scrollend` event, since Safari only shipped that in 17.4.
 *
 * `el` is owned by the view (its `ref="..."` template binding), not created
 * here, so the view can bind it directly without an unused-locals false
 * positive from a destructured-and-renamed composable ref.
 */
export function useMushafVerticalPager(
  store: MushafStore,
  img: MushafImages,
  el: Ref<HTMLElement | undefined>,
  zoomed: () => boolean,
) {
  const slots = computed<VPagerSlot[]>(() => {
    const p = store.page
    return [
      { key: 'prev', page: p > 1 ? p - 1 : null },
      { key: 'cur', page: p },
      { key: 'next', page: p < store.pageCount ? p + 1 : null },
    ]
  })

  // Give prev/next a real decoded image ahead of time (not just a skeleton),
  // so scrolling to them is seamless. `preload` is cache-first and a no-op
  // once ready, so this is cheap on repeat calls as the window shifts by one.
  watch(
    slots,
    (list) => {
      for (const s of list) if (s.page && s.key !== 'cur') img.preload(s.page)
    },
    { immediate: true },
  )

  /** Instant (no animation) re-centre on the middle slot — a raw `scrollTop`
   * write never animates, unlike `scrollTo`/`scrollIntoView`. */
  function recenter(): void {
    const node = el.value
    if (node) node.scrollTop = node.clientHeight
  }

  let settleTimer: ReturnType<typeof setTimeout> | undefined
  function onScroll(): void {
    if (zoomed()) return
    clearTimeout(settleTimer)
    settleTimer = setTimeout(settle, SETTLE_MS)
  }

  function settle(): void {
    const node = el.value
    if (!node || zoomed()) return
    const h = node.clientHeight
    if (h === 0) return
    const idx = Math.round(node.scrollTop / h)
    if (idx === 1) return // already centred — nothing to do
    if (idx <= 0 && store.canPrev) store.prev() // → store.page watch recentres
    else if (idx >= 2 && store.canNext) store.next() // → store.page watch recentres
    else recenter() // at the mushaf's edge — nothing to page to, snap back
  }

  // (Re)mount (including switching back into single-page mode) and every
  // subsequent page change — from this pager, the top-bar arrows, keyboard,
  // quick-jump, or a deep link — all land here, so one recentre covers them.
  watch(el, (node) => {
    if (node) void nextTick(recenter)
  })
  watch(
    () => store.page,
    () => void nextTick(recenter),
  )

  window.addEventListener('resize', recenter)
  onBeforeUnmount(() => {
    clearTimeout(settleTimer)
    window.removeEventListener('resize', recenter)
  })

  return { slots, onScroll }
}
