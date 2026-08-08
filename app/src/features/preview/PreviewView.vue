<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { RouteLocationRaw } from 'vue-router'
import { ArrowLeft, AlertTriangle } from 'lucide-vue-next'
import { getDataClient } from '@/core/data'
import type { SurahNames } from '@/core/data/types'
import { readerLink } from '@/core/navigation/readerLinks'
import {
  parsePreviewRange,
  parseHighlightParams,
  resolveWordStates,
  type PreviewRouteParams,
  type PreviewHighlightQuery,
} from '@/core/navigation/previewRoute'
import { usePreviewPages } from '@/composables/usePreviewPages'
import ReadingSurface from '@/features/reader/ReadingSurface.vue'
import Skeleton from '@/components/Skeleton.vue'
import Icon from '@/components/Icon.vue'
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

const parsed = computed(() => parsePreviewRange(route.params as PreviewRouteParams))
const range = computed(() => (parsed.value.ok ? parsed.value.value : undefined))
const highlightSpecs = computed(() => parseHighlightParams(route.query as PreviewHighlightQuery))

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

/** location → highlight state for one loaded page's own words (Task 6). Not
 * memoized — cheap for a ≤12-page, single-surah range, and re-evaluates
 * correctly as each page's chunk streams in since `entry()` reads the
 * composable's reactive cache. */
function wordStatesForPage(page: number) {
  const chunk = entry(page)?.chunk
  return chunk ? resolveWordStates(highlightSpecs.value, chunk.words) : {}
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
</script>

<template>
  <main class="preview">
    <header class="preview-header">
      <RouterLink :to="fallbackLink" class="back-link" :aria-label="t('preview.back')">
        <Icon :icon="ArrowLeft" :size="20" />
      </RouterLink>
      <div class="preview-title">
        <span class="preview-surah">{{ surahName }}</span>
        <span class="preview-range">{{ rangeLabel }}</span>
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
    <div v-else class="preview-pages">
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
          :interactive="false"
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
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  background: var(--color-bg);
  z-index: var(--z-sticky);
}
.back-link {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--radius-md);
  color: var(--color-text);
  flex: 0 0 auto;
}
.back-link:hover,
.back-link:focus-visible {
  background: var(--color-elevated);
}
.back-link:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
.preview-title {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}
.preview-surah {
  font-size: var(--text-base);
  font-weight: 600;
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
.preview-error-link:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
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
.page-error:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
