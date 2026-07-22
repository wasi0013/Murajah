<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useReaderStore } from '@/stores/reader'
import { useReaderPages } from '@/composables/useReaderPages'
import { useMorphology } from '@/composables/useMorphology'
import { useMistakes } from '@/composables/useMistakes'
import { useAudioStore } from '@/stores/audio'
import { getDataClient } from '@/core/data'
import type { SurahNames } from '@/core/data/types'
import ReadingSurface from './ReadingSurface.vue'
import Skeleton from '@/components/Skeleton.vue'

// Code-split: the popup + its data stay out of the initial reader bundle.
const MorphologyPopup = defineAsyncComponent(() => import('./MorphologyPopup.vue'))

/**
 * Reader host: renders the current page as a single reading surface. Paging is
 * driven by the top-bar arrows, the keyboard, and quick-jump — there is no swipe
 * carousel (it was clumsy on touch and, under fast paging, could leave pages
 * overlapping). Neighbour pages are still prefetched (useReaderPages), so a page
 * turn shows without a fetch. A tap opens word morphology (read mode) or toggles
 * a mistake (mark mode); a scroll is never mistaken for a tap.
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

const current = computed(() => pages.entry(reader.page))

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

// —— Tap vs scroll ————————————————————————————————————————————————
// A stationary press is a word tap; any movement past the slop — or a scroll the
// browser takes over (pointercancel) — is not, so scrolling never opens
// morphology or marks a mistake.
const TAP_SLOP = 10
let startX = 0
let startY = 0
let active = false
let moved = false

function onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  active = true
  moved = false
  startX = e.clientX
  startY = e.clientY
}

function onPointerMove(e: PointerEvent) {
  if (!active || moved) return
  if (Math.abs(e.clientX - startX) > TAP_SLOP || Math.abs(e.clientY - startY) > TAP_SLOP) {
    moved = true
  }
}

function onPointerUp(e: PointerEvent, canceled = false) {
  if (!active) return
  active = false
  if (!canceled && !moved) handleTap(e)
}

/** A stationary tap: morphology (read) or mistake toggle (mark). */
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
</script>

<template>
  <div
    class="pager"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp($event)"
    @pointercancel="onPointerUp($event, true)"
  >
    <!-- Keyed by page so each turn mounts a fresh surface — no stale per-line
         fit styles can carry over and overlap during fast navigation. -->
    <ReadingSurface
      v-if="current?.status === 'ready'"
      :key="reader.page"
      :page="current.chunk!"
      :font-family="current.family!"
      :layout="reader.layout"
      :surah-names="surahNames"
      :page-width="reader.readingWidth"
      :wbw="reader.wbw"
      :translations="current.translations"
      :wbw-lang="reader.wbwLang"
      :word-states="wordStates"
      :mistake-ids="mistakes.store.mistakeIds"
      :active-verse="activeVerseKey"
      :auto-scroll="surfaceAutoScroll"
    />
    <div v-else class="page-skeleton" role="status" aria-label="Loading page">
      <Skeleton v-for="n in 12" :key="n" height="1.6em" :width="`${70 + ((n * 7) % 28)}%`" />
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
  width: 100%;
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
