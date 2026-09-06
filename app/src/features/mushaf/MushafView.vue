<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Headphones, Mic, Search, ZoomOut } from 'lucide-vue-next'
import { useMushafStore } from '@/stores/mushaf'
import { useAudioStore } from '@/stores/audio'
import { useRecorderStore } from '@/stores/recorder'
import { useMushafPage } from '@/composables/useMushafPage'
import { useMushafImages } from '@/composables/useMushafImages'
import { useMushafVerticalPager } from '@/composables/useMushafVerticalPager'
import { useMushafZoom } from '@/composables/useMushafZoom'
import { useMushafQuickJump } from '@/composables/useMushafQuickJump'
import { useMushafLocation } from '@/composables/useMushafLocation'
import { useProgressPersistence } from '@/composables/useProgressPersistence'
import { useReadingReward } from '@/composables/useReadingReward'
import { lazyComponent, prefetchComponent } from '@/composables/lazyComponent'
import { getPageHasanah } from '@/core/memorization/pageHasanah.js'
import { keyToPageDelta } from '@/core/reader/keyboard'
import { usePagerIcons } from '@/composables/usePagerIcons'
import Icon from '@/components/Icon.vue'
import Skeleton from '@/components/Skeleton.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import { useI18n } from '@/core/i18n'

/**
 * Standalone mushaf scan surface (code-split — never in the reader bundle). One
 * page on mobile, an RTL 2-up spread on desktop (composed from two adjacent
 * single-page images). Paging is by the top-bar arrows, the keyboard, and — in
 * mobile single-page mode only — a vertical scroll-snap swipe (see
 * useMushafVerticalPager; deliberately vertical, not horizontal, so it never has
 * to account for the RTL page order). Pinch / double-tap zoom stay everywhere,
 * and pause the vertical pager while active. Page boxes are aspect-ratio-reserved
 * from the manifest so images load with no CLS.
 */
const SPREAD_MIN_WIDTH = 820 // px — at/above this, show the 2-up spread
const RTL = true // reading direction for keyboard paging

const { t, dir } = useI18n()
const { prevIcon, nextIcon } = usePagerIcons(dir)
const store = useMushafStore()
const router = useRouter()
const nav = useMushafPage(store, router)

// Recitation audio — lazy; the mushaf images are the standard 604 Madani/QPC pages,
// so audio sources against layout 'qpc'. In a 2-up spread `store.visible` is both
// pages, so the player naturally covers the whole spread (the user's requirement).
const audio = useAudioStore()
// onFail closes the mini-player trigger back to its resting state — without
// it, a failed load (offline) left `audio.open` stuck true with nothing
// rendered, so the headphone icon looked pressed/active but did nothing on
// a later tap too (see lazyComponent's doc comment). Guarded on `!isPlaying`:
// `audio.open` is a global flag Listen/Today's own (non-lazy) mini-player
// reads too — if a session is already playing from one of those, this
// Mushaf-local chunk failing must not reach out and close a working player
// elsewhere just because Mushaf's own copy of it failed to load.
const audioHostLoader = () => import('@/features/audio/AudioHost.vue')
const AudioHost = lazyComponent(audioHostLoader, () => {
  if (!audio.isPlaying) audio.open = false
})

// Record-your-recitation (7.6), mirroring the text reader's mic control — the
// page blurs while `recorder.active` so a recall test can't be read off the scan.
const recordOpen = ref(false)
const recordingPanelLoader = () => import('@/features/audio/RecordingPanel.vue')
const RecordingPanel = lazyComponent(recordingPanelLoader, () => (recordOpen.value = false))
const recorder = useRecorderStore()

// Warm both chunks during idle time so the first tap of either the headphone
// or mic icon doesn't pay their import waterfall live — see
// prefetchComponent's doc comment. AudioHost's graph is the deeper one (it
// pulls in the reciter picker, playlist builder, etc.), which is what made
// its delay noticeable next to the mic's much shallower one.
onMounted(() => {
  prefetchComponent(audioHostLoader)
  prefetchComponent(recordingPanelLoader)
})

const img = useMushafImages(store)
const zoom = useMushafZoom()
const vpagerEl = ref<HTMLElement>()
const { slots: vpagerSlots, onScroll: vpagerOnScroll } = useMushafVerticalPager(
  store,
  img,
  vpagerEl,
  () => zoom.zoomed.value,
)
const { jumpTo } = useMushafQuickJump(store)
const { juz, surahName } = useMushafLocation(store)

// Reading-time hasanah (mushaf pages are already the canonical 604 scheme).
const progressPersistence = useProgressPersistence()
useReadingReward(() => store.page, getPageHasanah)

const paletteOpen = ref(false)

// Indicator: "Page N" or "Pages R–L", plus juz · surah.
const pageLabel = computed(() => {
  const v = store.visible
  return v.length === 2
    ? t('common.pages', { start: v[0], end: v[1] })
    : t('common.page', { n: v[0] })
})

// —— Width-driven spread mode ————————————————————————————————
let mq: MediaQueryList | undefined
function applySpread(matches: boolean) {
  store.setSpread(matches)
}
onMounted(() => {
  if (typeof matchMedia === 'function') {
    mq = matchMedia(`(min-width: ${SPREAD_MIN_WIDTH}px)`)
    applySpread(mq.matches)
    mq.addEventListener('change', onMqChange)
  }
})
function onMqChange(e: MediaQueryListEvent) {
  applySpread(e.matches)
}

// —— Zoom gesture state (pinch / pan / double-tap) ————————————————
const viewport = ref<HTMLElement>()

// —— Pointer routing: pinch (2 fingers) / pan (zoomed) / tap (double-tap zoom) ——
const pointers = new Map<number, { x: number; y: number }>()
type Mode = 'none' | 'pan' | 'pinch' | 'tap'
let mode: Mode = 'none'
let lastX = 0
let lastY = 0
let pinchStartDist = 0
let pinchStartScale = 1
let lastTapT = 0
let lastTapX = 0
let lastTapY = 0

const rect = () => viewport.value!.getBoundingClientRect()
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)

function onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinchStartDist = dist(a, b) || 1
    pinchStartScale = zoom.scale.value
    mode = 'pinch'
    // A real gesture — capture so both fingers keep tracking off-element.
    viewport.value?.setPointerCapture(e.pointerId)
    return
  }
  lastX = e.clientX
  lastY = e.clientY
  mode = zoom.zoomed.value ? 'pan' : 'tap'
  // Capture only when a gesture is already committed (panning a zoomed page). A
  // plain tap must NOT capture, or the pointer is stolen from buttons layered on
  // the viewport (the "tap to retry" control never fired).
  if (mode === 'pan') viewport.value?.setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  const p = pointers.get(e.pointerId)
  if (!p) return
  p.x = e.clientX
  p.y = e.clientY

  if (mode === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()]
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    zoom.zoomTo((pinchStartScale * dist(a, b)) / pinchStartDist, mid.x, mid.y, rect())
    return
  }
  if (mode === 'pan') {
    zoom.panBy(e.clientX - lastX, e.clientY - lastY, rect())
    lastX = e.clientX
    lastY = e.clientY
  }
}

function onPointerUp(e: PointerEvent, canceled = false) {
  const p = pointers.get(e.pointerId)
  pointers.delete(e.pointerId)

  if (mode === 'pinch') {
    if (zoom.scale.value < 1.05) zoom.reset()
    // Fall back to pan with the remaining finger (no jump).
    const rest = [...pointers.values()][0]
    if (rest && zoom.zoomed.value) {
      mode = 'pan'
      lastX = rest.x
      lastY = rest.y
    } else {
      mode = 'none'
    }
    return
  }
  if (mode === 'pan') {
    mode = 'none'
    return
  }
  // A tap that never dragged: double-tap toggles zoom. A scroll the browser took
  // over (pointercancel) is not a tap, so it never triggers zoom.
  if (mode === 'tap' && p && !canceled) {
    const now = e.timeStamp
    if (now - lastTapT < 300 && dist({ x: e.clientX, y: e.clientY }, { x: lastTapX, y: lastTapY }) < 30) {
      zoom.toggleAt(e.clientX, e.clientY, rect())
      lastTapT = 0
    } else {
      lastTapT = now
      lastTapX = e.clientX
      lastTapY = e.clientY
    }
  }
  mode = 'none'
}

function step(delta: -1 | 1) {
  if (delta === 1) store.next()
  else store.prev()
}

// —— Keyboard paging (RTL-aware) + Escape to unzoom ————————————
function onKeydown(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const t = e.target as HTMLElement | null
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
  if (e.key === 'Escape' && zoom.zoomed.value) {
    e.preventDefault()
    zoom.reset()
    return
  }
  const delta = keyToPageDelta(e.key, RTL)
  if (delta === 0) return
  e.preventDefault()
  if (delta === 1 ? store.canNext : store.canPrev) step(delta)
}

// Reset zoom whenever the page changes.
watch(
  () => store.page,
  () => zoom.reset(),
)

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  void progressPersistence.hydrate() // load hasanah before reading rewards accrue
  await nav.hydrate() // saved last page first…
  nav.applyRoute() // …then a deep-linked /mushaf/:page wins
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  mq?.removeEventListener('change', onMqChange)
  nav.dispose()
  progressPersistence.dispose()
})

function backToReader() {
  void router.push({ name: 'home' })
}
</script>

<template>
  <main class="mushaf">
    <header class="topbar">
      <button class="icon-btn" :aria-label="t('common.backToReader')" @click="backToReader">
        <Icon :icon="ArrowLeft" :size="20" />
      </button>
      <button
        class="icon-btn"
        :disabled="!store.canPrev"
        :aria-label="t('reader.prevPage')"
        @click="store.canPrev && step(-1)"
      >
        <Icon :icon="prevIcon" :size="22" />
      </button>

      <button class="jump" :aria-label="t('reader.jump')" @click="paletteOpen = true">
        <Icon :icon="Search" :size="16" />
        <span class="indicator">
          <span class="page-n">{{ pageLabel }} / {{ store.pageCount }}</span>
          <span v-if="juz || surahName" class="page-meta">
            <template v-if="juz">{{ t('common.juz', { n: juz }) }}</template>
            <template v-if="juz && surahName"> · </template>
            <bdi v-if="surahName" lang="ar">{{ surahName }}</bdi>
          </span>
        </span>
      </button>

      <button
        class="icon-btn"
        :disabled="!store.canNext"
        :aria-label="t('reader.nextPage')"
        @click="store.canNext && step(1)"
      >
        <Icon :icon="nextIcon" :size="22" />
      </button>

      <button
        class="icon-btn"
        :aria-pressed="audio.open"
        :aria-label="t('reader.audio')"
        @click="audio.open = true"
      >
        <Icon :icon="Headphones" :size="20" />
      </button>

      <button
        class="icon-btn"
        :aria-pressed="recordOpen"
        :aria-label="t('reader.record')"
        @click="recordOpen = true"
      >
        <Icon :icon="Mic" :size="20" />
      </button>

      <button
        v-if="zoom.zoomed.value"
        class="icon-btn"
        :aria-label="t('reader.resetZoom')"
        @click="zoom.reset()"
      >
        <Icon :icon="ZoomOut" :size="20" />
      </button>
    </header>

    <div
      ref="viewport"
      class="viewport"
      :class="{ zoomed: zoom.zoomed.value, blurred: recorder.active }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp($event)"
      @pointercancel="onPointerUp($event, true)"
    >
      <!-- Mobile single-page mode: a 3-slot vertical scroll-snap pager (prev/
           current/next) so scrolling down/up turns the page. Disabled while
           zoomed via the `vscroll-locked` class (see useMushafVerticalPager). -->
      <div
        v-if="!store.spread"
        ref="vpagerEl"
        class="vscroll"
        :class="{ 'vscroll-locked': zoom.zoomed.value }"
        @scroll="vpagerOnScroll"
      >
        <div v-for="slot in vpagerSlots" :key="slot.key" class="vslot">
          <div
            v-if="slot.page"
            class="spread"
            :style="slot.key === 'cur' ? zoom.transformStyle.value : undefined"
          >
            <div class="page-box" :style="{ aspectRatio: String(img.aspectRatio.value) }">
              <img
                v-if="img.entry(slot.page)?.status === 'ready'"
                class="page-img"
                :src="img.entry(slot.page)!.url"
                :alt="t('reader.mushafPageAlt', { page: slot.page })"
                draggable="false"
                @error="img.markError(slot.page)"
              />
              <button
                v-else-if="img.entry(slot.page)?.status === 'error'"
                class="page-error"
                @click="img.retry(slot.page)"
              >
                {{ t('reader.pageError', { page: slot.page }) }}
              </button>
              <div
                v-else
                class="page-skel"
                role="status"
                :aria-label="t('reader.loadingPage', { page: slot.page })"
              >
                <Skeleton width="100%" height="100%" rounded="md" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Desktop 2-up spread: unchanged tap/keyboard-only paging. -->
      <div
        v-else
        class="spread"
        :class="{ 'is-spread': store.visible.length === 2, 'player-open': audio.open }"
        :style="zoom.transformStyle.value"
      >
        <div
          v-for="p in store.visible"
          :key="p"
          class="page-box"
          :style="{ aspectRatio: String(img.aspectRatio.value) }"
        >
          <img
            v-if="img.entry(p)?.status === 'ready'"
            class="page-img"
            :src="img.entry(p)!.url"
            :alt="t('reader.mushafPageAlt', { page: p })"
            draggable="false"
            @error="img.markError(p)"
          />
          <button
            v-else-if="img.entry(p)?.status === 'error'"
            class="page-error"
            @click="img.retry(p)"
          >
            {{ t('reader.pageError', { page: p }) }}
          </button>
          <div v-else class="page-skel" role="status" :aria-label="t('reader.loadingPage', { page: p })">
            <Skeleton width="100%" height="100%" rounded="md" />
          </div>
        </div>
      </div>
    </div>

    <CommandPalette v-model:open="paletteOpen" @select="jumpTo($event)" />

    <AudioHost
      v-if="audio.open"
      view="mushaf"
      layout="qpc"
      :pages="store.visible"
      @need-next-page="store.canNext && store.next()"
    />

    <RecordingPanel v-if="recordOpen" v-model:open="recordOpen" :page="store.page" />
  </main>
</template>

<style scoped>
.mushaf {
  display: flex;
  flex-direction: column;
  /* height:100% + overflow:hidden — NOT min-height:100%. The vertical
     scroll-snap pager (.vscroll) needs a real height anchor to resolve
     against; `min-height` never gave it one (App.vue's .app-content had no
     definite height of its own), so .vscroll's `height:100%` slots fell back
     to their natural (unconstrained) content size — three stacked
     full-height page images, ~3x taller than the viewport — and nothing
     clipped that, so it dragged the WHOLE document (every other route too,
     since they share .app-shell/.app-content) into an oversized, mostly-
     empty scroll area. `.app-shell`/`.app-content` (App.vue) now resolve to
     a real definite height that this correctly fills — not more, not less,
     so the shared bottom tab bar still gets its own space. `overflow:hidden`
     stops any residual overflow from leaking back into that shared
     calculation, keeping this fix scoped to the mushaf route. */
  height: 100%;
  overflow: hidden;
  background: var(--color-bg);
}
.topbar {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  padding-top: calc(0.5rem + env(safe-area-inset-top));
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2.25rem;
  width: 2.25rem;
  flex: 0 0 auto;
  border-radius: var(--radius-md);
  color: var(--color-text);
}
.icon-btn:hover:not(:disabled) {
  background: var(--color-elevated);
}
.icon-btn:disabled {
  opacity: 0.4;
}
.icon-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.jump {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
  height: 2.25rem;
  padding: 0 0.75rem;
  border-radius: var(--radius-md);
  background: var(--color-elevated);
  color: var(--color-text-muted);
}
.jump:hover {
  color: var(--color-text);
}
.jump:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.indicator {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  text-align: start;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
}
.page-n {
  font-size: var(--text-sm);
  color: var(--color-text);
  white-space: nowrap;
}
.page-meta {
  font-size: var(--text-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.viewport {
  flex: 1 0 auto;
  /* Flex items default to min-height:auto (never shrink below content's
     natural size) — without this override, .vscroll's unconstrained content
     height (see .mushaf above) would still force .viewport to grow past the
     space .mushaf actually has, defeating the fix above. */
  min-height: 0;
  overflow: hidden;
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 0.5rem;
  /* Vertical gesture space is reserved for the .vscroll pager below (mobile) or
     tall-page scroll; custom pinch/pan handles zoom. */
  touch-action: pan-y;
  filter: blur(0);
  transition: filter var(--duration-base) var(--ease-emphasized);
}
.viewport.zoomed {
  touch-action: none;
  cursor: grab;
}
.viewport.blurred {
  filter: blur(10px);
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .viewport {
    transition: none;
  }
}
/* Mobile single-page vertical pager: a 3-slot (prev/current/next) scroll-snap
   column. `overscroll-behavior-y: contain` stops the drag from chaining into
   the document (no accidental pull-to-refresh); `scroll-snap-stop: always` on
   the slots means a fast flick can never skip past a neighbour. */
.vscroll {
  align-self: stretch;
  width: 100%;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scroll-snap-type: y mandatory;
  touch-action: pan-y;
}
.vscroll.vscroll-locked {
  overflow-y: hidden;
  touch-action: none;
}
.vslot {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  height: 100%;
  scroll-snap-align: start;
  scroll-snap-stop: always;
}
.spread {
  display: flex;
  /* RTL: the first visible page (lower/odd) sits on the right, the next on the
     left — the source pairing (see core/mushaf/spread). */
  flex-direction: row-reverse;
  gap: 0.5rem;
  width: 100%;
  max-width: 44rem;
  justify-content: center;
  transform-origin: center;
}
.spread.is-spread {
  max-width: 72rem;
}
.page-box {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  max-height: calc(100dvh - 5rem);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-surface);
}
/* Desktop spread only (mobile pages live in .vslot .spread, not here — the
   vertical pager has its own scroll and isn't covered edge-to-edge the same
   way). The mini-player (AudioMiniPlayer.vue) is `position: fixed; bottom: 0`
   and floats above this view's flow, so without this the page image sizes
   itself against the raw viewport and the player hides its bottom rows.
   `--audio-player-h` is the player's own measured height (ResizeObserver,
   tracks the advanced tray expanding/collapsing); the fallback covers the
   first frame before that measurement lands. */
.spread.player-open .page-box {
  max-height: calc(100dvh - 5rem - var(--audio-player-h, 10rem));
}
.page-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  -webkit-user-drag: none;
  user-select: none;
}
.page-skel,
.page-error {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.page-error {
  display: grid;
  place-items: center;
  padding: 1rem;
  text-align: center;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  background: var(--color-elevated);
}
.page-error:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
</style>
