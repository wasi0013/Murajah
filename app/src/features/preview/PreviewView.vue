<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import { ArrowLeft, AlertTriangle, ChevronDown, Share2 } from 'lucide-vue-next'
import { getDataClient } from '@/core/data'
import type { SurahNames } from '@/core/data/types'
import { readerLink } from '@/core/navigation/readerLinks'
import {
  parsePreviewRange,
  parseHighlightParams,
  resolveWordStates,
  toggleWordHighlight,
  specsByColorToQuery,
  type PreviewRouteParams,
  type PreviewHighlightQuery,
  type HighlightColor,
} from '@/core/navigation/previewRoute'
import { usePreviewPages } from '@/composables/usePreviewPages'
import ReadingSurface from '@/features/reader/ReadingSurface.vue'
import Skeleton from '@/components/Skeleton.vue'
import Icon from '@/components/Icon.vue'
import ShareSheet from '@/components/ShareSheet.vue'
import PreviewJumpSheet from '@/features/preview/PreviewJumpSheet.vue'
import PreviewColorBar from '@/features/preview/PreviewColorBar.vue'
import { useI18n } from '@/core/i18n'

/**
 * Shareable, read-only verse-range preview (`/preview/:surah/:ayah(-:endAyah)?`)
 * — a link's complete state, always Uthmani tajweed, independent of the
 * visitor's own reader prefs (see tasks/plan.md). Deliberately does NOT import
 * `@/stores/reader` anywhere in this file — that's the actual guarantee that
 * this view ignores the visitor's saved layout/tajweed/mistake-mark state, not
 * just a claim in a comment.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const parsed = computed(() => parsePreviewRange(route.params as PreviewRouteParams))
const range = computed(() => (parsed.value.ok ? parsed.value.value : undefined))
const highlightSpecs = computed(() => parseHighlightParams(route.query as PreviewHighlightQuery))

// The whole point of this link is that it's self-contained — `route.fullPath`
// (reactive) carries the highlight query params verbatim, so sharing always
// hands out exactly what's on screen, not a reconstructed/simplified version.
const shareOpen = ref(false)
const shareUrl = computed(() => window.location.origin + route.fullPath)

// Route params already guarantee 1-3 digits for :surah; a 'range' parse error
// still leaves a syntactically valid (if semantically out-of-range) surah to
// build an "open in reader" link from — parsePreviewRange only reports
// 'range' once the surah itself has already passed validation.
const rawSurah = computed(() => {
  const s = route.params.surah
  return Number(Array.isArray(s) ? s[0] : s)
})

const surahNames = ref<SurahNames>({})
onMounted(async () => {
  try {
    const data = getDataClient()
    await data.init()
    surahNames.value = await data.getSurahNames()
  } catch {
    /* surah name is chrome-only, non-critical */
  }
})
const surahName = computed(() => surahNames.value[String(range.value?.surah ?? rawSurah.value)] ?? '')

const rangeLabel = computed(() => {
  const r = range.value
  if (!r) return ''
  return r.startAyah === r.endAyah
    ? t('preview.ayah', { surah: r.surah, ayah: r.startAyah })
    : t('preview.range', { surah: r.surah, start: r.startAyah, end: r.endAyah })
})

/** Where "open in reader"/back links land: the range's start verse when known,
 * otherwise the surah page, otherwise home (no valid surah at all). */
const fallbackLink = computed<RouteLocationRaw>(() => {
  if (range.value) return readerLink({ surah: range.value.surah, ayah: range.value.startAyah })
  // An invalid *range* still leaves a valid surah (parsePreviewRange checks
  // surah first) — land on its first ayah rather than the bare surah page.
  if (rawSurah.value >= 1 && rawSurah.value <= 114) return readerLink({ surah: rawSurah.value, ayah: 1 })
  return { name: 'home' }
})

const { resolving, rangeTooLarge, navError, pages, entry, retry } = usePreviewPages(range)

const firstVerse = computed(() => (range.value ? `${range.value.surah}:${range.value.startAyah}` : null))

// In-page range picker (surah + from/to ayah), so a visitor doesn't have to
// hand-edit the URL to look at a different passage.
const jumpOpen = ref(false)
function onGoTo({ surah, start, end }: { surah: number; start: number; end: number }) {
  // A fresh range's highlight query params belong to the *old* range's words
  // — carrying them over would point at the wrong verses, so navigating via
  // the picker always lands on a clean URL rather than a stale/misleading one.
  void router.push(
    end > start
      ? { name: 'preview-range', params: { surah: String(surah), ayah: String(start), endAyah: String(end) } }
      : { name: 'preview', params: { surah: String(surah), ayah: String(start) } },
  )
}

/** location → highlight state for one loaded page's own words (Task 6). Not
 * memoized — cheap for a ≤12-page, single-surah range, and re-evaluates
 * correctly as each page's chunk streams in since `entry()` reads the
 * composable's reactive cache. */
function wordStatesForPage(page: number) {
  const chunk = entry(page)?.chunk
  return chunk ? resolveWordStates(highlightSpecs.value, chunk.words) : {}
}

// —— Tap-to-paint editing ————————————————————————————————————————
// /preview's highlights are pure URL state — there's no store to write to.
// Tapping a word edits the current route's query params directly (via
// `toggleWordHighlight`/`specsByColorToQuery`), so the on-screen render, the
// address bar, and the Share sheet's URL all stay the same single source of
// truth with zero extra plumbing.
const activeColor = ref<HighlightColor>('red')

// Every loaded page's words, not just the tapped word's own page — a whole-
// ayah spec being edited down to one word needs that ayah's *complete* word
// list to expand correctly, and on the rare page-spanning ayah that list
// isn't all on one page.
const allLoadedWords = computed(() => pages.value.flatMap((p) => entry(p)?.chunk?.words ?? []))

function onWordTap(e: PointerEvent) {
  const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-loc]')
  const loc = el?.dataset.loc
  if (!loc) return
  const [, ayahStr, wordStr] = loc.split(':')
  const ayah = Number(ayahStr)
  const word = Number(wordStr)
  if (!Number.isFinite(ayah) || !Number.isFinite(word)) return

  const next = toggleWordHighlight(highlightSpecs.value, { ayah, word }, activeColor.value, allLoadedWords.value)
  void router.replace({
    query: { ...route.query, ...specsByColorToQuery(next), hl: undefined },
  })
}

// Same tap-vs-scroll distinction the reader uses: a stationary press is a
// tap, any movement past the slop — or a scroll the browser takes over
// (pointercancel) — is not, so scrolling a long multi-page stack never
// mistakenly paints a word.
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

// Cross-instance font-scale coordination (task 9): each mounted surface
// reports the factor *it* measured; the shared minimum is fed back to all of
// them so a multi-page stack reads at one consistent size instead of each
// page's widest line picking its own.
const fitFactors = reactive(new Map<number, number>())
function onFit(page: number, factor: number) {
  fitFactors.set(page, factor)
}
const sharedFitFactor = computed(() => {
  const values = [...fitFactors.values()]
  return values.length ? Math.min(...values) : undefined
})
// The jump picker (or any other route-param change) swaps in a whole new set
// of page numbers — old entries would otherwise linger forever and drag the
// shared minimum down using a page that's no longer even on screen.
watch(range, () => fitFactors.clear())
</script>

<template>
  <main class="preview">
    <header class="preview-header">
      <RouterLink :to="fallbackLink" class="back-link icon-btn" :aria-label="t('preview.back')">
        <Icon :icon="ArrowLeft" :size="20" />
      </RouterLink>
      <button type="button" class="preview-title" :aria-label="t('preview.jumpButton')" @click="jumpOpen = true">
        <span class="preview-title-text">
          <span class="preview-surah">{{ surahName }}</span>
          <span class="preview-range">{{ rangeLabel }}</span>
        </span>
        <Icon :icon="ChevronDown" :size="16" class="preview-title-chevron" />
      </button>

      <PreviewColorBar v-if="parsed.ok" v-model="activeColor" />

      <div class="preview-actions">
        <button type="button" class="icon-btn" :aria-label="t('share.button')" @click="shareOpen = true">
          <Icon :icon="Share2" :size="24" />
        </button>
        <RouterLink :to="{ name: 'download' }" class="icon-btn logo-link" :aria-label="t('pwa.installTitle')">
          <img src="/pwa-icon-192.png" alt="" width="28" height="28" class="logo-img" />
        </RouterLink>
      </div>
    </header>

    <div v-if="!parsed.ok" class="preview-error" role="alert">
      <Icon :icon="AlertTriangle" :size="28" class="preview-error-icon" />
      <p>{{ parsed.error === 'surah' ? t('preview.invalidSurah') : t('preview.invalidRange') }}</p>
      <RouterLink :to="fallbackLink" class="preview-error-link">{{ t('preview.openInReader') }}</RouterLink>
    </div>
    <div v-else-if="rangeTooLarge" class="preview-error" role="alert">
      <Icon :icon="AlertTriangle" :size="28" class="preview-error-icon" />
      <p>{{ t('preview.rangeTooLarge') }}</p>
      <RouterLink :to="fallbackLink" class="preview-error-link">{{ t('preview.openInReader') }}</RouterLink>
    </div>
    <div v-else-if="navError" class="preview-error" role="alert">
      <Icon :icon="AlertTriangle" :size="28" class="preview-error-icon" />
      <p>{{ t('preview.invalidRange') }}</p>
      <RouterLink :to="fallbackLink" class="preview-error-link">{{ t('preview.openInReader') }}</RouterLink>
    </div>
    <div v-else-if="resolving && pages.length === 0" class="page-skeleton" role="status" aria-label="Loading">
      <Skeleton v-for="n in 8" :key="n" height="1.6em" :width="`${70 + ((n * 7) % 28)}%`" />
    </div>
    <div
      v-else
      class="preview-pages"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp($event)"
      @pointercancel="onPointerUp($event, true)"
    >
      <template v-for="(page, i) in pages" :key="page">
        <div v-if="i > 0" class="page-divider" role="separator" :aria-label="t('reader.mushafPageAlt', { page })">
          <span class="page-divider-label">{{ t('reader.mushafPageAlt', { page }) }}</span>
        </div>
        <ReadingSurface
          v-if="entry(page)?.status === 'ready'"
          :page="entry(page)!.chunk!"
          :font-family="entry(page)!.family!"
          layout="qpc"
          :surah-names="surahNames"
          :word-states="wordStatesForPage(page)"
          :active-verse="i === 0 ? firstVerse : null"
          :auto-scroll="true"
          :fit-factor="sharedFitFactor"
          @fit="(f: number) => onFit(page, f)"
        />
        <div v-else-if="entry(page)?.status === 'error'" class="page-error-state" role="alert">
          <button type="button" class="page-error" @click="retry(page)">
            {{ t('reader.pageError', { page }) }}
          </button>
        </div>
        <div v-else class="page-skeleton" role="status" :aria-label="`Loading page ${page}`">
          <Skeleton v-for="n in 12" :key="n" height="1.6em" :width="`${70 + ((n * 7) % 28)}%`" />
        </div>
      </template>
    </div>

    <ShareSheet v-model:open="shareOpen" :url="shareUrl" :title="`${surahName} ${rangeLabel}`.trim()" />
    <PreviewJumpSheet
      v-model:open="jumpOpen"
      :surah-names="surahNames"
      :surah="range?.surah ?? rawSurah"
      :start="range?.startAyah"
      :end="range?.endAyah"
      @go="onGoTo"
    />
  </main>
</template>

<style scoped>
.preview {
  min-height: 100dvh;
  background: var(--color-bg);
  color: var(--color-text);
}
.preview-header {
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
/* .back-link reuses .icon-btn's own box/hover/focus rules verbatim (see the
   template — it carries both classes) rather than redeclaring them. */
.icon-btn {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--radius-md);
  color: var(--color-text);
  flex: 0 0 auto;
}
.preview-title {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  flex: 1 1 auto;
  padding: 0.25rem 0.4rem;
  border-radius: var(--radius-md);
  text-align: start;
}
.icon-btn:hover,
.icon-btn:focus-visible,
.preview-title:hover,
.preview-title:focus-visible {
  background: var(--color-elevated);
}
.icon-btn:focus-visible,
.preview-title:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
.preview-title-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}
.preview-title-chevron {
  flex: 0 0 auto;
  color: var(--color-text-muted);
}
.preview-surah {
  font-size: var(--text-base);
  font-weight: 600;
}
.preview-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex: 0 0 auto;
}
.logo-img {
  border-radius: var(--radius-sm);
}
.preview-range {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.preview-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 3rem 1.5rem;
  text-align: center;
}
.preview-error-icon {
  color: var(--color-danger);
}
.preview-error-link {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-accent);
}
.preview-pages {
  padding-bottom: 2rem;
}
.page-divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 1.5rem auto;
  padding: 0 1rem;
  max-width: 43rem;
}
.page-divider::before,
.page-divider::after {
  content: '';
  flex: 1 1 auto;
  height: 1px;
  background: var(--color-border);
}
.page-divider-label {
  flex: 0 0 auto;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
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
  justify-content: center;
  padding: 3rem 1.5rem;
  text-align: center;
}
.page-error {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  max-width: 32ch;
}
.preview-error-link:focus-visible,
.page-error:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
