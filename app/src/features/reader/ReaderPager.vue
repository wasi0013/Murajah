<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useReaderStore } from '@/stores/reader'
import { useReaderPages } from '@/composables/useReaderPages'
import { useMorphology } from '@/composables/useMorphology'
import { useMistakes } from '@/composables/useMistakes'
import { useAudioStore } from '@/stores/audio'
import { getDataClient } from '@/core/data'
import { mushafLink } from '@/core/navigation/readerLinks'
import { lazyComponent } from '@/composables/lazyComponent'
import type { SurahNames } from '@/core/data/types'
import ReadingSurface from './ReadingSurface.vue'
import Skeleton from '@/components/Skeleton.vue'
import Icon from '@/components/Icon.vue'
import { useI18n } from '@/core/i18n'

/**
 * Reader host: renders the current page as a single reading surface. Paging is
 * driven by the top-bar arrows, the keyboard, and quick-jump — there is no swipe
 * carousel (it was clumsy on touch and, under fast paging, could leave pages
 * overlapping). Neighbour pages are still prefetched (useReaderPages), so a page
 * turn shows without a fetch. A tap opens word morphology (read mode) or toggles
 * a mistake (mark mode); a scroll is never mistaken for a tap.
 */
const props = defineProps<{
  /** See useReaderPages' `readyGate` doc comment — ReaderView.vue passes one
   * that resolves once the last-read page (persisted prefs) is restored, so
   * the very first page load targets the real page instead of the store's
   * default. Every other mount point (e.g. the gallery) leaves it unset. */
  readyGate?: Promise<void>
}>()

const { t } = useI18n()
const reader = useReaderStore()
const pages = useReaderPages(reader, { readyGate: props.readyGate })

// Mirrors the top-bar prev/next (ReaderView.vue) — a second, larger pair at the
// foot of the page, for reaching a page turn without scrolling back to the top.
const canPrev = computed(() => reader.page > 1)
const canNext = computed(() => reader.page < reader.pageCount)

const {
  open: morphOpen,
  location: morphLocation,
  anchor: morphAnchor,
  content: morphContent,
  loading: morphLoading,
  openFor: openMorphology,
  close: closeMorphology,
} = useMorphology()

// Code-split: the popup + its data stay out of the initial reader bundle.
// onFail closes it back to resting state — without it, a failed load
// (offline) left `morphOpen` stuck true with nothing rendered (see
// lazyComponent's doc comment).
const MorphologyPopup = lazyComponent(() => import('./MorphologyPopup.vue'), () => closeMorphology())

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
    <div v-else-if="current?.status === 'error'" class="page-error-state" role="alert">
      <button type="button" class="page-error" @click="pages.retry(reader.page)">
        {{ t('reader.pageError', { page: reader.page }) }}
      </button>
      <!-- A font-load failure is the common cause (offline + not downloaded);
           the mushaf image view renders the same page from a scanned image,
           needing no font — an offline-safe fallback when it's cached. -->
      <RouterLink v-if="reader.layout === 'qpc'" :to="mushafLink(reader.page)" class="page-error-alt">
        {{ t('reader.viewAsImage') }}
      </RouterLink>
    </div>
    <div v-else class="page-skeleton" role="status" aria-label="Loading page">
      <!-- 15 lines, not 12: every mushaf page (QPC or Indopak) sets exactly 15
           ayah lines per page — matching the real count keeps the skeleton's
           height in the neighbourhood of the real surface's, so the swap to
           ReadingSurface moves `.page-nav` below it as little as possible.
           It can't be exact (fitLines' per-page [0.35, 1.6] scale factor
           means the real, fitted line height varies by page/device), but
           matching the *count* removes the single biggest, structural part
           of the mismatch. -->
      <Skeleton v-for="n in 15" :key="n" height="1.6em" :width="`${70 + ((n * 7) % 28)}%`" />
    </div>

    <nav class="page-nav" :aria-label="t('reader.pageNavAria')">
      <button
        type="button"
        class="page-nav-btn"
        :disabled="!canPrev"
        @click="reader.prevPage()"
      >
        <Icon :icon="ChevronLeft" :size="20" />
        <span>{{ t('reader.goToPrevPage') }}</span>
      </button>
      <button
        type="button"
        class="page-nav-btn"
        :disabled="!canNext"
        @click="reader.nextPage()"
      >
        <span>{{ t('reader.goToNextPage') }}</span>
        <Icon :icon="ChevronRight" :size="20" />
      </button>
    </nav>

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
.page-error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 3rem 1.5rem;
  text-align: center;
}
.page-error {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  max-width: 32ch;
}
.page-error:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.page-error-alt {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-accent);
}
.page-error-alt:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.page-nav {
  display: flex;
  gap: 0.75rem;
  max-width: 43rem;
  margin-inline: auto;
  padding: 0.5rem 1rem 1.5rem;
}
.page-nav-btn {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 3.25rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: 600;
  transition: background var(--duration-fast), border-color var(--duration-fast);
}
.page-nav-btn:hover:not(:disabled) {
  background: var(--color-elevated);
  border-color: var(--color-accent);
}
.page-nav-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.page-nav-btn:disabled {
  opacity: 0.4;
}
</style>
