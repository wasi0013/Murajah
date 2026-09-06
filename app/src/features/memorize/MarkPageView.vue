<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowLeft, AlertTriangle } from 'lucide-vue-next'
import { usePlanStore } from '@/stores/plan'
import { usePartialProgressStore } from '@/stores/partialProgress'
import { useToday } from '@/composables/useToday'
import { useMarkPage } from '@/composables/useMarkPage'
import { usePlanPersistence } from '@/composables/usePlanPersistence'
import { useProgressPersistence } from '@/composables/useProgressPersistence'
import { usePartialProgressPersistence } from '@/composables/usePartialProgressPersistence'
import { useDayLogPersistence } from '@/composables/useDayLogPersistence'
import { coveredLineCount } from '@/core/memorization/partialProgress'
import ReadingSurface from '@/features/reader/ReadingSurface.vue'
import Skeleton from '@/components/Skeleton.vue'
import Icon from '@/components/Icon.vue'
import { useI18n } from '@/core/i18n'

/**
 * Mark memorized verses directly on the plan's current new-memorization front
 * page (Phase: partial-page tracking — see plans/partial-page-tracking.md).
 * No route param: it always resolves `plan.newFront?.nextPage`, so marking is
 * restricted to that one page by construction — there's no way to navigate
 * this view to any other page.
 *
 * Tap gesture (pointerdown/move/up, tap-vs-drag via TAP_SLOP) mirrors
 * PreviewPageView.vue's, but resolves `data-verse` (surah:ayah) rather than
 * `data-loc` (surah:ayah:word) — MVP only ever toggles a whole ayah, never a
 * word range (see the design doc's "Not Doing"). Marked words get
 * `ReadingSurface`'s own `memorized` word state — a subtle green background
 * wash, not the `/preview` share feature's `hl-green` (colour + wavy
 * underline): this page forces the tajweed glyph font, whose baked-in ink
 * makes plain `color` a no-op and would've left only a stray underline
 * "scribble" as the visible cue (see `.state-memorized`'s doc comment).
 *
 * Once a page's marks cover every word, `useToday.markPartialProgress`
 * itself advances `plan.newFront` — this view's `pageNum` is reactive to
 * that, so it just flows to the next front page automatically, no explicit
 * redirect needed.
 */
const { t } = useI18n()
const plan = usePlanStore()
const partialProgress = usePartialProgressStore()
const today = useToday()

/**
 * Owns its own hydrate/persist, like `TodayView.vue`/`ProgressView.vue` —
 * `/memorize` is directly reachable (a deep link, a reload, browser back/
 * forward), not only ever entered from an already-hydrated Today. Without
 * this, a fresh visit sees `plan.newFront` as null (the empty state) even
 * with a real plan on disk, since nothing else on this route loads it.
 * Journal needs no hydration here: `journal.addEvent` writes through to disk
 * regardless of whether the date is "resident" in the store (see
 * `journalStorage.ts`'s own doc comment) — this view never reads journal
 * state back, only writes it via `markPartialProgress`.
 */
const planPersistence = usePlanPersistence()
const progressPersistence = useProgressPersistence()
const partialProgressPersistence = usePartialProgressPersistence()
const dayLogPersistence = useDayLogPersistence()

/**
 * A tap before every hydrate() above resolves would mutate the live
 * `partialProgress` store, then `partialProgressPersistence`'s own
 * `setAll(diskState)` — resolving after the tap — would silently overwrite
 * it (on a first-ever mark this is `setAll(null)`, wiping the tap out
 * entirely, and the debounced save watcher then persists that clobbered
 * empty state). This is a real window, not a theoretical one: `TodayView`'s
 * own `useMarkPage(frontPage)` (for its line-fill visual) pre-warms the page
 * chunk/font fetch this view also uses, so the tappable surface can render
 * well before the independent `partialProgress` IndexedDB read completes.
 */
const storesReady = ref(false)
onMounted(() => {
  void Promise.all([
    planPersistence.hydrate(),
    progressPersistence.hydrate(),
    partialProgressPersistence.hydrate(),
    dayLogPersistence.hydrate(),
  ]).then(() => {
    storesReady.value = true
  })
})
onBeforeUnmount(() => {
  planPersistence.dispose()
  progressPersistence.dispose()
  partialProgressPersistence.dispose()
  dayLogPersistence.dispose()
})

const pageNum = computed(() => plan.newFront?.nextPage)
const { loading, error, chunk, family, retry } = useMarkPage(pageNum)

const lineCoverage = computed(() => {
  const c = chunk.value
  if (!c || partialProgress.page !== pageNum.value) return { covered: 0, total: 0 }
  return coveredLineCount(partialProgress.marks, c.layout, c.words)
})

const wordStates = computed(() => {
  const c = chunk.value
  const states: Record<string, 'memorized'> = {}
  if (!c || partialProgress.page !== pageNum.value) return states
  for (const w of c.words) {
    const wSurah = Number(w.surah)
    const wAyah = Number(w.ayah)
    const marked = partialProgress.marks.some((m) => m.surah === wSurah && m.ayah === wAyah)
    if (marked) states[w.location] = 'memorized'
  }
  return states
})

function onWordTap(e: PointerEvent) {
  if (!storesReady.value) return // see the hydrate/tap race note above
  const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-verse]')
  const verse = el?.dataset.verse
  const page = pageNum.value
  if (!verse || !chunk.value || page == null) return
  // `pageNum` and `chunk` update independently — page graduation advances
  // `plan.newFront` synchronously inside `complete()`, but `useMarkPage`'s
  // own reload of `chunk`/`family` for the new page is async. A tap landing
  // in that gap would otherwise mark the new page number against the old
  // page's still-rendered words.
  if (chunk.value.page !== page) return
  const [surahStr, ayahStr] = verse.split(':')
  const surah = Number(surahStr)
  const ayah = Number(ayahStr)
  if (!Number.isFinite(surah) || !Number.isFinite(ayah)) return
  today.markPartialProgress(page, surah, ayah, chunk.value.words)
}

// Tap-vs-drag distinction, copied from PreviewPageView.vue's own pointer
// handling so a text-selection drag never fires a mark toggle.
const TAP_SLOP = 10
let startX = 0
let startY = 0
let pointerActive = false
let pointerMoved = false

function onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  pointerActive = true
  pointerMoved = false
  startX = e.clientX
  startY = e.clientY
}
function onPointerMove(e: PointerEvent) {
  if (!pointerActive || pointerMoved) return
  if (Math.abs(e.clientX - startX) > TAP_SLOP || Math.abs(e.clientY - startY) > TAP_SLOP) pointerMoved = true
}
function onPointerUp(e: PointerEvent, canceled = false) {
  if (!pointerActive) return
  pointerActive = false
  if (!canceled && !pointerMoved) onWordTap(e)
}
</script>

<template>
  <main class="mark-page">
    <header class="mark-header">
      <RouterLink :to="{ name: 'today' }" class="back-link icon-btn" :aria-label="t('markPage.back')">
        <Icon :icon="ArrowLeft" :size="20" />
      </RouterLink>
      <div class="mark-title">
        <span class="mark-title-text">{{ pageNum != null ? t('preview.page', { page: pageNum }) : '' }}</span>
        <span v-if="lineCoverage.total > 0" class="mark-progress">
          {{ t('markPage.linesProgress', { covered: lineCoverage.covered, total: lineCoverage.total }) }}
        </span>
      </div>
    </header>

    <div v-if="!plan.hasPlan || pageNum == null" class="mark-empty">
      <p>{{ t('markPage.noFront') }}</p>
      <RouterLink :to="{ name: 'today' }" class="mark-empty-link">{{ t('markPage.back') }}</RouterLink>
    </div>
    <div v-else-if="error" class="mark-error" role="alert">
      <Icon :icon="AlertTriangle" :size="28" class="mark-error-icon" />
      <p>{{ t('reader.pageError', { page: pageNum }) }}</p>
      <button type="button" class="mark-error-link" @click="retry()">{{ t('markPage.retry') }}</button>
    </div>
    <div v-else-if="loading" class="page-skeleton" role="status" aria-label="Loading">
      <Skeleton v-for="n in 8" :key="n" height="1.6em" :width="`${70 + ((n * 7) % 28)}%`" />
    </div>
    <div
      v-else
      class="mark-surface"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp($event)"
      @pointercancel="onPointerUp($event, true)"
    >
      <ReadingSurface
        v-if="chunk && family"
        :page="chunk"
        :font-family="family"
        layout="qpc"
        :word-states="wordStates"
        :active-verse="null"
        :auto-scroll="false"
      />
      <p class="mark-hint">{{ t('markPage.hint') }}</p>
    </div>
  </main>
</template>

<style scoped>
.mark-page {
  min-height: 100dvh;
  background: var(--color-bg);
  color: var(--color-text);
}
.mark-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  background: var(--color-bg);
  z-index: var(--z-sticky);
}
.icon-btn {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  text-decoration: none;
  border: none;
  background: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}
.icon-btn:hover {
  background: var(--color-hover);
  color: var(--color-text);
}
.icon-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.mark-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.1em;
}
.mark-title-text {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
}
.mark-progress {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.mark-empty,
.mark-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem 1.5rem;
  text-align: center;
  color: var(--color-text-muted);
}
.mark-error-icon {
  color: var(--color-warning);
}
.mark-empty-link,
.mark-error-link {
  color: var(--color-accent);
  text-decoration: none;
  border: none;
  background: none;
  cursor: pointer;
  font-size: inherit;
  padding: 0;
}
.mark-empty-link:hover,
.mark-error-link:hover {
  text-decoration: underline;
}
.page-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 2rem 1.5rem;
  align-items: flex-end;
}
.mark-surface {
  padding: 1rem 0;
}
.mark-hint {
  text-align: center;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  padding: 0.5rem 1.5rem 1.5rem;
}
</style>
