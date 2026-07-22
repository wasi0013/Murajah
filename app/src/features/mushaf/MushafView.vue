<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ChevronLeft, ChevronRight, Headphones, Search, ZoomOut } from 'lucide-vue-next'
import { useMushafStore } from '@/stores/mushaf'
import { useAudioStore } from '@/stores/audio'
import { useMushafPage } from '@/composables/useMushafPage'
import { useMushafImages } from '@/composables/useMushafImages'
import { useMushafZoom } from '@/composables/useMushafZoom'
import { useMushafQuickJump } from '@/composables/useMushafQuickJump'
import { useMushafLocation } from '@/composables/useMushafLocation'
import { useProgressPersistence } from '@/composables/useProgressPersistence'
import { useReadingReward } from '@/composables/useReadingReward'
import { getPageHasanah } from '@/core/memorization/pageHasanah.js'
import { pageStep, visiblePages } from '@/core/mushaf/spread'
import { keyToPageDelta } from '@/core/reader/keyboard'
import { resolveSwipe, dampenIfAtEdge } from '@/core/reader/swipe'
import Icon from '@/components/Icon.vue'
import Skeleton from '@/components/Skeleton.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import { useI18n } from '@/core/i18n'

/**
 * Standalone mushaf scan surface (code-split — never in the reader bundle). One
 * page on mobile, an RTL 2-up spread on desktop (composed from two adjacent
 * single-page images). RTL swipe + keyboard paging steps whole spreads on
 * desktop; pinch / double-tap zoom is available but not required to read. Page
 * boxes are aspect-ratio-reserved from the manifest so images load with no CLS.
 */
const SPREAD_MIN_WIDTH = 820 // px — at/above this, show the 2-up spread
const RTL = true
const OFFSETS = [1, 0, -1] as const // DOM order L→R: next, current, prev
const SLIDE_MS = 280

const { t } = useI18n()
const store = useMushafStore()
const router = useRouter()
const nav = useMushafPage(store, router)

// Recitation audio — lazy; the mushaf images are the standard 604 Madani/QPC pages,
// so audio sources against layout 'qpc'. In a 2-up spread `store.visible` is both
// pages, so the player naturally covers the whole spread (the user's requirement).
const audio = useAudioStore()
const AudioHost = defineAsyncComponent(() => import('@/features/audio/AudioHost.vue'))
const img = useMushafImages(store)
const zoom = useMushafZoom()
const { jumpTo } = useMushafQuickJump(store)
const { juz, surahName } = useMushafLocation(store)

// Reading-time hasanah (mushaf pages are already the canonical 604 scheme).
const progressPersistence = useProgressPersistence()
useReadingReward(() => store.page, getPageHasanah)

const reduceMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

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

// —— Carousel + gesture state ————————————————————————————————
const viewport = ref<HTMLElement>()
const centerIndex = ref(1)
const dragPx = ref(0)
const transition = ref(false)
const dragging = ref(false)

const trackStyle = computed(() => ({
  transform: `translateX(calc(${-centerIndex.value * 100}% + ${dragPx.value}px))`,
  transition: transition.value ? `transform ${SLIDE_MS}ms var(--ease-emphasized)` : 'none',
}))

/** Anchor page for a slide column; equals the current page at the edges. */
function anchorFor(offset: number): number {
  if (offset === 0) return store.page
  return pageStep(store.page, offset as 1 | -1, store.pageCount, store.spread)
}
/** A neighbour slide is real only when it moves off the current page. */
function hasSlide(offset: number): boolean {
  return offset === 0 || anchorFor(offset) !== store.page
}
function slidePages(offset: number): number[] {
  return visiblePages(anchorFor(offset), store.pageCount, store.spread)
}

// —— Pointer routing: pinch (2 fingers) / pan (zoomed) / paging (fit) ——
const pointers = new Map<number, { x: number; y: number }>()
type Mode = 'none' | 'paging' | 'pan' | 'pinch' | 'tap'
let mode: Mode = 'none'
// Reserve the screen edges for the browser's own back/forward swipe so paging
// never collides with the OS gesture; interior drags page as normal.
const EDGE_GUTTER = 24
let startX = 0
let startY = 0
let lastX = 0
let lastY = 0
let lastT = 0
let edgeStart = false
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
  viewport.value?.setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinchStartDist = dist(a, b) || 1
    pinchStartScale = zoom.scale.value
    mode = 'pinch'
    dragging.value = false
    dragPx.value = 0
    return
  }
  startX = lastX = e.clientX
  startY = lastY = e.clientY
  lastT = e.timeStamp
  transition.value = false
  const box = viewport.value?.getBoundingClientRect()
  const localX = box ? e.clientX - box.left : e.clientX
  const width = box?.width ?? window.innerWidth
  edgeStart = localX <= EDGE_GUTTER || localX >= width - EDGE_GUTTER
  mode = zoom.zoomed.value ? 'pan' : 'tap' // becomes 'paging' past the drag threshold
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
    return
  }
  // Potential paging drag (fit-width only).
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  if (mode === 'tap') {
    // Ignore edge-gutter starts (OS gesture) and vertical-dominant moves (scroll).
    if (edgeStart) return
    if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return
    mode = 'paging'
    dragging.value = true
  }
  lastX = e.clientX
  lastT = e.timeStamp
  const atEdge = dx > 0 ? !store.canNext : !store.canPrev
  dragPx.value = dampenIfAtEdge(dx, atEdge)
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
  if (mode === 'paging' && dragging.value) {
    dragging.value = false
    const deltaX = e.clientX - startX
    const dt = Math.max(1, e.timeStamp - lastT)
    const velocityX = (e.clientX - lastX) / dt
    const width = viewport.value?.clientWidth ?? window.innerWidth
    const delta = resolveSwipe({ deltaX, velocityX, width, rtl: RTL })
    if (delta > 0 && store.canNext) commit(1)
    else if (delta < 0 && store.canPrev) commit(-1)
    else snapBack()
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

/** Slide to the neighbour, then swap the page and re-centre silently. */
function commit(delta: -1 | 1) {
  if (reduceMotion) {
    dragPx.value = 0
    step(delta)
    return
  }
  const idx = OFFSETS.indexOf(delta)
  transition.value = true
  dragPx.value = 0
  centerIndex.value = idx
  window.setTimeout(() => {
    transition.value = false
    step(delta)
    centerIndex.value = 1
  }, SLIDE_MS)
}
function step(delta: -1 | 1) {
  if (delta === 1) store.next()
  else store.prev()
}
function snapBack() {
  if (reduceMotion) {
    dragPx.value = 0
    return
  }
  transition.value = true
  dragPx.value = 0
  centerIndex.value = 1
  window.setTimeout(() => (transition.value = false), SLIDE_MS)
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

// Reset zoom + any in-flight drag whenever the page changes.
watch(
  () => store.page,
  () => {
    zoom.reset()
    dragPx.value = 0
  },
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
        <Icon :icon="ChevronLeft" :size="22" />
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
        <Icon :icon="ChevronRight" :size="22" />
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
      :class="{ dragging, zoomed: zoom.zoomed.value }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp($event)"
      @pointercancel="onPointerUp($event, true)"
    >
      <div class="track" :style="trackStyle">
        <div v-for="offset in OFFSETS" :key="offset" class="slide" :aria-hidden="offset !== 0">
          <div
            v-if="hasSlide(offset)"
            class="spread"
            :class="{ 'is-spread': slidePages(offset).length === 2 }"
            :style="offset === 0 ? zoom.transformStyle.value : undefined"
          >
            <div
              v-for="p in slidePages(offset)"
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
      </div>
    </div>

    <CommandPalette v-model:open="paletteOpen" @select="jumpTo($event)" />

    <AudioHost v-if="audio.open" view="mushaf" layout="qpc" :pages="store.visible" />
  </main>
</template>

<style scoped>
.mushaf {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
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
  overflow: hidden;
  width: 100%;
  /* We own the horizontal axis for paging; allow vertical scroll otherwise. */
  touch-action: pan-y;
}
.viewport.dragging {
  user-select: none;
  cursor: grabbing;
}
.viewport.zoomed {
  touch-action: none;
  cursor: grab;
}
.track {
  display: flex;
  height: 100%;
  will-change: transform;
}
.slide {
  flex: 0 0 100%;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 0.5rem;
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
