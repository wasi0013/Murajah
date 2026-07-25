<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronLeft, ChevronRight, Headphones, Mic, Palette, Search, SlidersHorizontal } from 'lucide-vue-next'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { useAudioStore } from '@/stores/audio'
import { useRecorderStore } from '@/stores/recorder'
import { useReaderStore, READING_WIDTHS, type ReaderMode } from '@/stores/reader'
import type { Layout, WbwLang } from '@/core/data/types'
import { resolveReaderTarget } from '@/core/navigation/readerRoute'
import { useReaderRouteSync, type FriendlyResolution } from '@/composables/useReaderRouteSync'
import { useReaderPersistence } from '@/composables/useReaderPersistence'
import { useProgressPersistence } from '@/composables/useProgressPersistence'
import { useReadingReward } from '@/composables/useReadingReward'
import { useMadaniPage } from '@/composables/useMadaniPage'
import { getPageHasanah } from '@/core/memorization/pageHasanah.js'
import { useReaderKeyboard } from '@/composables/useReaderKeyboard'
import { useReaderLocation } from '@/composables/useReaderLocation'
import { useLayoutSwitch } from '@/composables/useLayoutSwitch'
import { useVerseStudy } from '@/composables/useVerseStudy'
import { useQuickJump } from '@/composables/useQuickJump'
import ReaderPager from './ReaderPager.vue'
import TafsirPanel from './TafsirPanel.vue'
import RecordCountdown from './RecordCountdown.vue'
import Slider from '@/components/Slider.vue'
import Icon from '@/components/Icon.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import Toggle from '@/components/Toggle.vue'
import Popover from '@/components/Popover.vue'
import TajweedLegend from '@/components/TajweedLegend.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import { useI18n } from '@/core/i18n'

const { t } = useI18n()

/**
 * Reader shell: a top bar (quick-jump + settings), the paged reading surface,
 * and an optional verse-study panel. The primary tab bar and "More" menu live
 * in the app shell (App.vue), not here. All view options live in a controls
 * bottom sheet; quick-jump resolves through the nav indexes. Reader state is
 * bound to the URL + persisted prefs.
 */
const reader = useReaderStore()
const router = useRouter()

const persistence = useReaderPersistence(reader)
const progressPersistence = useProgressPersistence()
// `nav` (per active layout) resolves friendly URLs (/:surah, /page/:page, /:slug).
const { juz, surahName, nav } = useReaderLocation(reader)

const FRIENDLY_ROUTES = new Set(['read-surah', 'read-ayah', 'read-page', 'read-slug'])
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/** Resolve the current URL as a friendly reader route (used both directions by the sync). */
function resolveFriendly(r: RouteLocationNormalizedLoaded): FriendlyResolution {
  if (!FRIENDLY_ROUTES.has(String(r.name))) return undefined
  if (!nav.value) return 'pending'
  return resolveReaderTarget(
    {
      surah: first(r.params.surah),
      ayah: first(r.params.ayah),
      page: first(r.params.page),
      slug: first(r.params.slug),
    },
    nav.value,
  )
}

const sync = useReaderRouteSync(reader, router, { resolveFriendly })
// Re-apply once nav finishes loading, so a friendly deep-link that was 'pending' resolves.
watch(nav, () => sync.applyRoute())
const { switchTo } = useLayoutSwitch(reader)
const study = useVerseStudy(reader)
const { jumpTo } = useQuickJump(reader)
useReaderKeyboard(reader)

// Reading-time hasanah: accrue against the canonical Madani page (Indopak maps in).
const madaniPage = useMadaniPage(reader)
useReadingReward(madaniPage, getPageHasanah)

// Recitation audio — lazy, so its code stays out of the reader's initial bundle.
const audio = useAudioStore()
const AudioHost = defineAsyncComponent(() => import('@/features/audio/AudioHost.vue'))
const audioPages = computed(() => [reader.page])
// The recited ayah (verse grain), or a deep-linked ayah (/2/255) — highlighted +
// scrolled to in the tafsir surface.
const activeVerseKey = computed(() =>
  audio.activeVerse ? `${audio.activeVerse.surah}:${audio.activeVerse.ayah}` : reader.focusVerse,
)
// A non-audio jump (surah/juz/ayah deep-link) should always scroll, even if the
// user has turned off *audio* auto-scroll — that pref only governs following the
// reciter (mirrors ReaderPager.vue's `surfaceAutoScroll`).
const tafsirAutoScroll = computed(() => (audio.activeVerse ? audio.autoScroll : true))

// Record-your-recitation (7.6) — lazy panel, opened from the mic control. The
// reading surface blurs while `recorder.active`, so a recall test can't be read
// off the page while it's being recited into the mic.
const recordOpen = ref(false)
const recordAutoStart = ref(false)
const RecordingPanel = defineAsyncComponent(() => import('@/features/audio/RecordingPanel.vue'))
const recorder = useRecorderStore()

// Today's quick-test habit sends a random memorized page here (recorder.pendingPage)
// and pushes the URL; once the reader actually lands on that page, run the
// countdown then open the panel pre-armed to start recording itself.
const quickTestCountdown = ref(false)
watch(
  () => reader.page,
  (page) => {
    if (recorder.consumePending(page)) quickTestCountdown.value = true
  },
  { immediate: true },
)
function onQuickTestCountdownDone() {
  quickTestCountdown.value = false
  recordAutoStart.value = true
  recordOpen.value = true
}
function openRecordManually() {
  recordAutoStart.value = false
  recordOpen.value = true
}

const layoutOptions = computed(() => [
  { value: 'qpc', label: t('reader.uthmani') },
  { value: 'indopak', label: t('reader.indopak') },
])
// Word-by-word target languages carry their own endonyms, not UI copy — left literal.
const wbwLangOptions = [
  { value: 'en', label: 'EN' },
  { value: 'bn', label: 'বাংলা' },
]
const modeOptions = computed(() => [
  { value: 'read', label: t('reader.read') },
  { value: 'mark-mistake', label: t('reader.mark') },
])

const sheetOpen = ref(false)
const paletteOpen = ref(false)
const legendOpen = ref(false)

onMounted(async () => {
  void progressPersistence.hydrate() // load memorization/hasanah before rewards accrue
  // The bare reader home (`/`) reopens on the last-read page; every other reader
  // route names a location in the URL, so restore prefs but let the URL own the
  // page (otherwise the saved page clobbers a deep-link — /78 snapped to page 50).
  const urlNamesPage = String(router.currentRoute.value.name) !== 'home'
  await persistence.hydrate({ skipPage: urlNamesPage }) // saved prefs first…
  sync.applyRoute() // …then the URL wins for layout/page/toggles it specifies
})
onBeforeUnmount(() => {
  sync.dispose()
  persistence.dispose()
  progressPersistence.dispose()
})

const maxStep = READING_WIDTHS.length - 1
const canPrev = computed(() => reader.page > 1)
const canNext = computed(() => reader.page < reader.pageCount)

// A page turn (next/prev — see reader.nextPage/prevPage) should land the reader
// back at the top, since a page can be taller than the viewport and the next
// page's own top is what's relevant, not wherever the previous page happened to
// be scrolled to. `.app-content` (App.vue) is the actual scroll container, not
// this component, so we reach for it directly. Skipped when a verse deep-link
// is driving the page (reader.focusVerse) — that already scrolls itself to the
// verse, and resetting to top first would just fight it.
const rootEl = ref<HTMLElement>()
watch(
  () => reader.page,
  (_page, prevPage) => {
    if (prevPage === undefined) return // initial load — nothing to reset yet
    if (reader.focusVerse) return
    rootEl.value?.closest<HTMLElement>('.app-content')?.scrollTo({ top: 0 })
  },
)
</script>

<template>
  <main ref="rootEl" class="reader">
    <header class="topbar">
      <button
        class="icon-btn"
        :disabled="!canPrev"
        :aria-label="t('reader.prevPage')"
        @click="reader.prevPage()"
      >
        <Icon :icon="ChevronLeft" :size="22" />
      </button>

      <button class="jump" :aria-label="t('reader.jump')" @click="paletteOpen = true">
        <Icon :icon="Search" :size="16" />
        <span class="indicator">
          <span class="page-n">{{ t('common.page', { n: reader.page }) }} / {{ reader.pageCount }}</span>
          <span v-if="juz || surahName" class="page-meta">
            <template v-if="juz">{{ t('common.juz', { n: juz }) }}</template>
            <template v-if="juz && surahName"> · </template>
            <bdi v-if="surahName" lang="ar">{{ surahName }}</bdi>
          </span>
        </span>
      </button>

      <button
        class="icon-btn"
        :disabled="!canNext"
        :aria-label="t('reader.nextPage')"
        @click="reader.nextPage()"
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
        class="icon-btn"
        :aria-pressed="recordOpen"
        :aria-label="t('reader.record')"
        @click="openRecordManually"
      >
        <Icon :icon="Mic" :size="20" />
      </button>

      <button class="icon-btn" :aria-label="t('reader.settings')" @click="sheetOpen = true">
        <Icon :icon="SlidersHorizontal" :size="20" />
      </button>
    </header>

    <!-- Tafsir & translations replaces the mushaf as the reading surface; turning
         it off brings the normal layout (and its options) back. -->
    <ReaderPager v-if="!reader.tafsir" class="reader-surface" :class="{ blurred: recorder.active }" />

    <TafsirPanel
      v-else
      class="reader-surface"
      :class="{ blurred: recorder.active }"
      :entries="study.entries.value"
      :font-family="study.fontFamily.value"
      :tafsir="study.tafsir.value"
      :loading="study.loading.value"
      :active-verse="activeVerseKey"
      :auto-scroll="tafsirAutoScroll"
      @expand="study.expandTafsir($event)"
    />

    <CommandPalette v-model:open="paletteOpen" @select="jumpTo($event)" />

    <AudioHost
      v-if="audio.open"
      view="text"
      :layout="reader.layout"
      :pages="audioPages"
      @need-next-page="reader.nextPage()"
    />

    <RecordingPanel
      v-if="recordOpen"
      v-model:open="recordOpen"
      :page="reader.page"
      :auto-start="recordAutoStart"
    />

    <RecordCountdown v-if="quickTestCountdown" :seconds="5" @done="onQuickTestCountdownDone" />

    <BottomSheet v-model:open="sheetOpen" :label="t('reader.settings')">
      <div class="settings">
        <h2 class="settings-title">{{ t('reader.settings') }}</h2>

        <div class="row">
          <span class="row-label">{{ t('reader.script') }}</span>
          <SegmentedControl
            :model-value="reader.layout"
            :options="layoutOptions"
            :label="t('reader.script')"
            @update:model-value="switchTo($event as Layout)"
          />
        </div>

        <div v-if="!reader.tafsir" class="row">
          <label class="row-label" for="size-slider">{{ t('reader.width') }}</label>
          <Slider
            id="size-slider"
            :model-value="reader.textSizeStep"
            :min="0"
            :max="maxStep"
            :step="1"
            :label="t('reader.width')"
            @update:model-value="reader.setTextSizeStep($event)"
          />
        </div>

        <div v-if="!reader.tafsir && reader.layout === 'qpc'" class="row">
          <span class="row-label">{{ t('reader.tajweed') }}</span>
          <div class="row-end">
            <Popover v-if="reader.tajweedActive" v-model:open="legendOpen" :label="t('reader.tajweedLegend')">
              <template #trigger>
                <button type="button" class="legend-btn" :aria-label="t('reader.tajweedLegend')">
                  <Icon :icon="Palette" :size="16" />
                </button>
              </template>
              <TajweedLegend />
            </Popover>
            <Toggle
              :model-value="reader.tajweed"
              :label="t('reader.tajweed')"
              @update:model-value="reader.toggleTajweed()"
            />
          </div>
        </div>

        <div v-if="!reader.tafsir" class="row">
          <span class="row-label">{{ t('reader.wbw') }}</span>
          <div class="row-end">
            <SegmentedControl
              v-if="reader.wbw"
              :model-value="reader.wbwLang"
              :options="wbwLangOptions"
              :label="t('reader.wbwLang')"
              @update:model-value="reader.setWbwLang($event as WbwLang)"
            />
            <Toggle
              :model-value="reader.wbw"
              :label="t('reader.wbwToggle')"
              @update:model-value="reader.toggleWbw()"
            />
          </div>
        </div>

        <div class="row">
          <span class="row-label">{{ t('reader.tafsir') }}</span>
          <Toggle
            :model-value="reader.tafsir"
            :label="t('reader.tafsirToggle')"
            @update:model-value="reader.toggleTafsir()"
          />
        </div>

        <div v-if="!reader.tafsir" class="row">
          <span class="row-label">{{ t('reader.tapMode') }}</span>
          <SegmentedControl
            :model-value="reader.mode"
            :options="modeOptions"
            :label="t('reader.tapMode')"
            @update:model-value="reader.setMode($event as ReaderMode)"
          />
        </div>
      </div>
    </BottomSheet>
  </main>
</template>

<style scoped>
.reader {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: var(--color-bg);
}
.reader-surface {
  flex: 1 0 auto;
  filter: blur(0);
  transition: filter var(--duration-base) var(--ease-emphasized);
}
.reader-surface.blurred {
  filter: blur(10px);
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .reader-surface {
    transition: none;
  }
}
.topbar {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem calc(0.5rem);
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
.settings {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  padding-bottom: 0.5rem;
}
.settings-title {
  font-size: var(--text-base);
  font-weight: 600;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.row-label {
  font-size: var(--text-sm);
  color: var(--color-text);
}
.row-end {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.legend-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2rem;
  width: 2rem;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
}
.legend-btn:hover {
  background: var(--color-elevated);
  color: var(--color-text);
}
.legend-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
/* The page-width slider shouldn't stretch full-width in the row. */
.row :deep(.murajah-slider) {
  width: 12rem;
}
</style>
