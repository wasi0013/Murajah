<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ListOrdered } from 'lucide-vue-next'
import Icon from '@/components/Icon.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import SurahList from './SurahList.vue'
import JuzList from './JuzList.vue'
import PageList from './PageList.vue'
import { juzRows, surahRows, type JuzRow, type SurahRow } from '@/core/navigation/contents'
import { readerLink } from '@/core/navigation/readerLinks'
import { getDataClient } from '@/core/data'
import type { NavIndex } from '@/core/data/types'
import { useReaderStore } from '@/stores/reader'
import { useI18n } from '@/core/i18n'

/**
 * Contents browser (8.1) — the beginner-friendly index behind the "Surahs" tab.
 * Three lenses (Surah / Juz / Page) over the already-shipped nav data; tapping a
 * row opens the reader there. The command palette stays for typed jumps; this is
 * the discoverable path. Code-split → never in the reader's initial bundle.
 */
const router = useRouter()
const reader = useReaderStore()
const data = getDataClient()
const { t } = useI18n()

// Capture the layout once; navigation + page ranges use it (QPC vs Indopak page
// numbers differ), while juz opening-surahs come from the layout-independent QPC index.
const layout = reader.layout

const lens = ref<'surah' | 'juz' | 'page'>('surah')
const lensOptions = computed(() => [
  { value: 'surah', label: t('contents.tabs.surah') },
  { value: 'juz', label: t('contents.tabs.juz') },
  { value: 'page', label: t('contents.tabs.page') },
])

const surahs = ref<SurahRow[]>([])
const juzz = ref<JuzRow[]>([])
const pageCount = ref(reader.pageCount)
const loading = ref(true)
let nav: NavIndex | null = null

onMounted(async () => {
  await data.init()
  const [names, currentNav] = await Promise.all([data.getSurahNames(), data.getNavIndex(layout)])
  nav = currentNav
  surahs.value = surahRows(names)
  const qpcNav = layout === 'qpc' ? currentNav : await data.getNavIndex('qpc')
  juzz.value = juzRows(currentNav.juzToPage, qpcNav.juzToPage, pageCount.value)
  loading.value = false
})

function toPage(page: number) {
  void router.push(readerLink({ page }))
}
// Surahs get their friendly `/25` URL; the reader resolves it for the active layout.
function onSurah(surah: number) {
  void router.push(readerLink({ surah }))
}
function onJuz(juz: number) {
  const page = nav?.juzToPage[String(juz)]
  if (page) toPage(page)
}
function listenSurah(surah: number) {
  void router.push({ name: 'listen', query: { scope: 'surah', ref: String(surah) } })
}
function listenJuz(juz: number) {
  void router.push({ name: 'listen', query: { scope: 'juz', ref: String(juz) } })
}
</script>

<template>
  <main class="contents">
    <header class="topbar">
      <button class="icon-btn" :aria-label="t('common.backToReader')" @click="router.push({ name: 'home' })">
        <Icon :icon="ArrowLeft" :size="20" />
      </button>
      <div class="title-wrap">
        <Icon :icon="ListOrdered" :size="18" class="title-icon" />
        <h1 class="title">{{ t('contents.title') }}</h1>
      </div>
    </header>

    <div class="sticky-controls">
      <SegmentedControl v-model="lens" :options="lensOptions" :label="t('contents.browseBy')" class="segment" />
    </div>

    <div class="body">
      <p v-if="loading" class="hint">{{ t('common.loading') }}</p>
      <template v-else>
        <SurahList v-if="lens === 'surah'" :rows="surahs" show-listen @select="onSurah" @listen="listenSurah" />
        <JuzList v-else-if="lens === 'juz'" :rows="juzz" show-listen @select="onJuz" @listen="listenJuz" />
        <PageList v-else :page-count="pageCount" @select="toPage" />
      </template>
    </div>
  </main>
</template>

<style scoped>
.contents {
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
.icon-btn:hover {
  background: var(--color-elevated);
}
.icon-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.title-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.title-icon {
  color: var(--color-accent);
}
.title {
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--color-text);
}
.sticky-controls {
  position: sticky;
  top: calc(3.25rem + env(safe-area-inset-top));
  z-index: var(--z-sticky);
  display: flex;
  justify-content: center;
  padding: 0.6rem 0.75rem;
  /* Opaque so rows scrolling underneath never reduce the control's text contrast. */
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
}
.body {
  flex: 1 0 auto;
  width: 100%;
  max-width: 46rem;
  margin-inline: auto;
  padding: 0.5rem clamp(0.5rem, 3vw, 1rem) calc(2rem + env(safe-area-inset-bottom));
}
.hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-align: center;
  padding: 1.5rem 0;
}
</style>
