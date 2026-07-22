<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useReaderStore } from '@/stores/reader'
import { useReaderPages } from '@/composables/useReaderPages'
import { useMorphology } from '@/composables/useMorphology'
import { useMistakes } from '@/composables/useMistakes'
import { useAudioStore } from '@/stores/audio'
import { getDataClient } from '@/core/data'
import type { SurahNames } from '@/core/data/types'
import { resolveSwipe, dampenIfAtEdge } from '@/core/reader/swipe'
import ReadingSurface from './ReadingSurface.vue'
import Skeleton from '@/components/Skeleton.vue'

// Code-split: the popup + its data stay out of the initial reader bundle.
const MorphologyPopup = defineAsyncComponent(() => import('./MorphologyPopup.vue'))

/**
 * Paged reader host: mounts only the current page and its two neighbours in a
 * track (the rest virtual), so a long surah never mounts more than three
 * surfaces. Horizontal pointer drags turn pages — RTL-aware (rightward = next,
 * like an Arabic book) with a distance/velocity threshold and edge rubber-band —
 * and the slide animation is skipped under prefers-reduced-motion.
 */
const reader = useReaderStore()
const pages = useReaderPages(reader)

const {
  open: morphOpen,
  location: morphLocation,
  anchor: morphAnchor,
  content: morphContent,
  loading: morphLoading,
  openFor: openMorphology,
  close: closeMorphology,
} = useMorphology()

// The active word gets the morphology-active highlight on its surface.
const wordStates = computed<Record<string, 'morphology'>>(() =>
  morphLocation.value ? { [morphLocation.value]: 'morphology' } : {},
)

const mistakes = useMistakes(reader)
onMounted(() => void mistakes.hydrate())
onBeforeUnmount(() => mistakes.dispose())

// The verse to highlight/scroll: the recited ayah (verse grain) when audio is
// playing, otherwise a deep-linked ayah (/2/255 → reader.focusVerse, Phase 9.1).
const audio = useAudioStore()
const activeVerseKey = computed(() =>
  audio.activeVerse ? `${audio.activeVerse.surah}:${audio.activeVerse.ayah}` : reader.focusVerse,
)
// A deep-link should scroll into view even if the user turned audio auto-scroll off.
const surfaceAutoScroll = computed(() => (audio.activeVerse ? audio.autoScroll : true))

// Paging or switching layout dismisses an open analysis.
watch(
  () => [reader.page, reader.layout],
  () => closeMorphology(),
)

// Both mushaf surfaces read right-to-left, so paging is mirrored vs an LTR
// carousel. Column DOM order left→right: [next, current, prev].
const RTL = true
const OFFSETS = [1, 0, -1] as const

const surahNames = ref<SurahNames>({})
onMounted(async () => {
  try {
    const data = getDataClient()
    await data.init()
    surahNames.value = await data.getSurahNames()
  } catch {
    /* names are non-critical chrome */
  }
})

const reduceMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Track transform: translateX(calc(-centerIndex*100% + dragPx)). centerIndex is
// normally 1 (middle column); it animates to a neighbour on commit.
const root = ref<HTMLElement>()
const centerIndex = ref(1)
const dragPx = ref(0)
const transition = ref(false)
const dragging = ref(false)
const SLIDE_MS = 280

const trackStyle = computed(() => ({
  transform: `translateX(calc(${-centerIndex.value * 100}% + ${dragPx.value}px))`,
  transition: transition.value ? `transform ${SLIDE_MS}ms var(--ease-emphasized)` : 'none',
}))

// A drag only becomes a page-turn past this horizontal threshold; a press that
// stays within TAP_SLOP (in *either* axis) is a tap. EDGE_GUTTER reserves the
// screen edges for the browser's own back/forward swipe so paging never fights it.
const DRAG_THRESHOLD = 8
const TAP_SLOP = 10
const EDGE_GUTTER = 24

let startX = 0
let startY = 0
let lastX = 0
let lastT = 0
let active = false
let moved = false // left the tap slop (in any direction) — no longer a tap
let edgeStart = false // began in the OS edge gutter — don't page, let the OS act

function onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  active = true
  dragging.value = false
  moved = false
  transition.value = false
  startX = lastX = e.clientX
  startY = e.clientY
  lastT = e.timeStamp
  const box = root.value?.getBoundingClientRect()
  const localX = box ? e.clientX - box.left : e.clientX
  const width = box?.width ?? window.innerWidth
  edgeStart = localX <= EDGE_GUTTER || localX >= width - EDGE_GUTTER
}

function onPointerMove(e: PointerEvent) {
  if (!active) return
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  if (!moved && (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP)) moved = true
  if (!dragging.value) {
    // Only hijack for a clearly-horizontal drag that didn't start at the edge;
    // a vertical-dominant move stays a scroll (the browser owns the pan-y axis).
    if (edgeStart) return
    if (Math.abs(dx) < DRAG_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return
    dragging.value = true
    root.value?.setPointerCapture(e.pointerId)
  }
  lastX = e.clientX
  lastT = e.timeStamp
  // dx > 0 reveals the left column (next in RTL); dx < 0 the right (prev).
  const atEdge = dx > 0 ? reader.page >= reader.pageCount : reader.page <= 1
  dragPx.value = dampenIfAtEdge(dx, atEdge)
}

function onPointerUp(e: PointerEvent, canceled = false) {
  if (!active) return
  active = false
  if (!dragging.value) {
    // A stationary press is a tap; a scroll the browser took over (pointercancel)
    // or any drag past the slop is not — so scrolling never marks/opens a word.
    if (!canceled && !moved) handleTap(e)
    return
  }
  dragging.value = false

  const deltaX = e.clientX - startX
  const dt = Math.max(1, e.timeStamp - lastT)
  const velocityX = (e.clientX - lastX) / dt
  const width = root.value?.clientWidth ?? window.innerWidth
  const delta = resolveSwipe({ deltaX, velocityX, width, rtl: RTL })
  const target = reader.page + delta

  if (delta !== 0 && target >= 1 && target <= reader.pageCount) {
    commit(delta)
  } else {
    snapBack()
  }
}

/** A tap that never became a drag: morphology (read) or mistake toggle (mark). */
function handleTap(e: PointerEvent) {
  const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-loc]')
  const loc = el?.dataset.loc
  if (!el || !loc) return
  if (reader.mode === 'mark-mistake') {
    const id = Number(el.dataset.id)
    if (Number.isFinite(id)) void mistakes.markWord(loc, id)
  } else {
    void openMorphology(loc, el)
  }
}

/** Animate to the target neighbour, then swap the page and re-centre silently. */
function commit(delta: -1 | 1) {
  if (reduceMotion) {
    dragPx.value = 0
    reader.goToPage(reader.page + delta)
    return
  }
  const idx = OFFSETS.indexOf(delta)
  transition.value = true
  dragPx.value = 0
  centerIndex.value = idx
  window.setTimeout(() => {
    transition.value = false
    reader.goToPage(reader.page + delta)
    centerIndex.value = 1
  }, SLIDE_MS)
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
</script>

<template>
  <div
    ref="root"
    class="pager"
    :class="{ dragging }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp($event)"
    @pointercancel="onPointerUp($event, true)"
  >
    <div class="track" :style="trackStyle">
      <div v-for="offset in OFFSETS" :key="offset" class="col" :aria-hidden="offset !== 0">
        <template v-if="reader.page + offset >= 1 && reader.page + offset <= reader.pageCount">
          <ReadingSurface
            v-if="pages.entry(reader.page + offset)?.status === 'ready'"
            :page="pages.entry(reader.page + offset)!.chunk!"
            :font-family="pages.entry(reader.page + offset)!.family!"
            :layout="reader.layout"
            :surah-names="surahNames"
            :page-width="reader.readingWidth"
            :wbw="reader.wbw"
            :translations="pages.entry(reader.page + offset)?.translations"
            :wbw-lang="reader.wbwLang"
            :word-states="offset === 0 ? wordStates : undefined"
            :mistake-ids="mistakes.store.mistakeIds"
            :active-verse="offset === 0 ? activeVerseKey : null"
            :auto-scroll="surfaceAutoScroll"
          />
          <div v-else class="page-skeleton" role="status" aria-label="Loading page">
            <Skeleton v-for="n in 12" :key="n" height="1.6em" :width="`${70 + ((n * 7) % 28)}%`" />
          </div>
        </template>
      </div>
    </div>

    <MorphologyPopup
      v-if="morphOpen"
      :anchor="morphAnchor"
      :location="morphLocation!"
      :content="morphContent"
      :loading="morphLoading"
      @close="closeMorphology()"
    />
  </div>
</template>

<style scoped>
.pager {
  overflow: hidden;
  width: 100%;
  /* Let vertical scroll through; we own the horizontal axis for paging. */
  touch-action: pan-y;
}
.pager.dragging {
  user-select: none;
  cursor: grabbing;
}
.track {
  display: flex;
  will-change: transform;
}
.col {
  flex: 0 0 100%;
  min-width: 0;
}
.page-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1.5rem 1rem;
  align-items: center;
}
.page-skeleton > * {
  max-width: 40ch;
}
</style>
