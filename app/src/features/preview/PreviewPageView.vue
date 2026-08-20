<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, AlertTriangle, Share2 } from 'lucide-vue-next'
import { getDataClient } from '@/core/data'
import type { SurahNames } from '@/core/data/types'
import { readerLink } from '@/core/navigation/readerLinks'
import {
  parsePreviewPage,
  parsePageHighlightParams,
  resolvePageWordStates,
  togglePageWordHighlight,
  pageSpecsByColorToQuery,
  type PreviewHighlightQuery,
  type HighlightColor,
} from '@/core/navigation/previewRoute'
import { surahsOnPage } from '@/core/quran/surahPages'
import { usePreviewPage } from '@/composables/usePreviewPage'
import ReadingSurface from '@/features/reader/ReadingSurface.vue'
import Skeleton from '@/components/Skeleton.vue'
import Icon from '@/components/Icon.vue'
import ShareSheet from '@/components/ShareSheet.vue'
import PreviewColorBar from '@/features/preview/PreviewColorBar.vue'
import { useI18n } from '@/core/i18n'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const parsed = computed(() => parsePreviewPage(route.params.page))
const pageNum = computed(() => (parsed.value.ok ? parsed.value.value : undefined))
const highlightSpecs = computed(() => parsePageHighlightParams(route.query as PreviewHighlightQuery))

const shareOpen = ref(false)
const shareUrl = computed(() => window.location.origin + route.fullPath)

const fallbackLink = computed(() =>
  pageNum.value != null ? readerLink({ page: pageNum.value }) : { name: 'home' },
)

const surahNames = ref<SurahNames>({})
onMounted(async () => {
  try {
    const data = getDataClient()
    await data.init()
    surahNames.value = await data.getSurahNames()
  } catch {
    /* surah names are chrome-only, non-critical */
  }
})

const surahsLabel = computed(() => {
  const p = pageNum.value
  if (p == null) return ''
  const surahs = surahsOnPage(p)
  const names = surahs.map((s) => surahNames.value[String(s)]).filter(Boolean)
  return names.length ? names.join(' · ') : ''
})

const { loading, error, chunk, family, retry } = usePreviewPage(pageNum)

const wordStates = computed(() => {
  const c = chunk.value
  if (!c) return {}
  return resolvePageWordStates(highlightSpecs.value, c.words)
})

const allLoadedWords = computed(() => chunk.value?.words ?? [])

const activeColor = ref<HighlightColor>('red')

function onWordTap(e: PointerEvent) {
  const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-loc]')
  const loc = el?.dataset.loc
  if (!loc) return
  const [surahStr, ayahStr, wordStr] = loc.split(':')
  const surah = Number(surahStr)
  const ayah = Number(ayahStr)
  const word = Number(wordStr)
  if (!Number.isFinite(surah) || !Number.isFinite(ayah) || !Number.isFinite(word)) return
  const next = togglePageWordHighlight(highlightSpecs.value, { surah, ayah, word }, activeColor.value, allLoadedWords.value)
  void router.replace({
    query: { ...route.query, ...pageSpecsByColorToQuery(next), hl: undefined },
  })
}

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
  <main class="preview">
    <header class="preview-header">
      <RouterLink :to="fallbackLink" class="back-link icon-btn" :aria-label="t('preview.back')">
        <Icon :icon="ArrowLeft" :size="20" />
      </RouterLink>
      <div class="preview-title">
        <span class="preview-title-text">
          <span class="preview-surah">{{ surahsLabel }}</span>
          <span class="preview-range">{{ parsed.ok ? t('preview.page', { page: parsed.value }) : '' }}</span>
        </span>
      </div>

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
      <p>{{ t('preview.invalidPage') }}</p>
      <RouterLink :to="fallbackLink" class="preview-error-link">{{ t('preview.openInReader') }}</RouterLink>
    </div>
    <div v-else-if="error" class="preview-error" role="alert">
      <Icon :icon="AlertTriangle" :size="28" class="preview-error-icon" />
      <p>{{ t('reader.pageError', { page: pageNum ?? 0 }) }}</p>
      <button type="button" class="preview-error-link" @click="retry()">{{ t('preview.openInReader') }}</button>
    </div>
    <div v-else-if="loading" class="page-skeleton" role="status" aria-label="Loading">
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
      <ReadingSurface
        v-if="chunk && family"
        :page="chunk"
        :font-family="family"
        layout="qpc"
        :surah-names="surahNames"
        :word-states="wordStates"
        :active-verse="null"
        :auto-scroll="false"
      />
    </div>

    <ShareSheet
      v-model:open="shareOpen"
      :url="shareUrl"
      :title="parsed.ok ? `${surahsLabel} ${t('preview.page', { page: parsed.value })}`.trim() : ''"
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
.preview-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.preview-title-text {
  display: flex;
  flex-direction: column;
  gap: 0.1em;
  min-width: 0;
}
.preview-surah {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preview-range {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.preview-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}
.logo-img {
  border-radius: var(--radius-sm);
}
.preview-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem 1.5rem;
  text-align: center;
  color: var(--color-text-muted);
}
.preview-error-icon {
  color: var(--color-warning);
}
.preview-error-link {
  color: var(--color-accent);
  text-decoration: none;
  border: none;
  background: none;
  cursor: pointer;
  font-size: inherit;
  padding: 0;
}
.preview-error-link:hover {
  text-decoration: underline;
}
.page-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 2rem 1.5rem;
  align-items: flex-end;
}
.preview-pages {
  padding: 1rem 0;
}
</style>
