<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  BookOpen,
  Brain,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Headphones,
  Home,
  ListOrdered,
  Menu,
  Mic,
  Palette,
  Search,
  SlidersHorizontal,
} from 'lucide-vue-next'
import { useAudioStore } from '@/stores/audio'
import { useReaderStore, READING_WIDTHS, type ReaderMode } from '@/stores/reader'
import type { Layout, WbwLang } from '@/core/data/types'
import { useReaderRouteSync } from '@/composables/useReaderRouteSync'
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
import { toast } from '@/composables/useToast'
import ReaderPager from './ReaderPager.vue'
import TafsirPanel from './TafsirPanel.vue'
import Slider from '@/components/Slider.vue'
import Icon from '@/components/Icon.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import Toggle from '@/components/Toggle.vue'
import Popover from '@/components/Popover.vue'
import TajweedLegend from '@/components/TajweedLegend.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import BottomTabBar from '@/components/BottomTabBar.vue'
import CommandPalette from '@/components/CommandPalette.vue'

/**
 * Reader shell: a top bar (quick-jump + settings), the paged reading surface,
 * an optional verse-study panel, and the primary bottom tab bar. All view
 * options live in a controls bottom sheet; quick-jump resolves through the nav
 * indexes. Reader state is bound to the URL + persisted prefs.
 */
const reader = useReaderStore()
const router = useRouter()

const sync = useReaderRouteSync(reader, router)
const persistence = useReaderPersistence(reader)
const progressPersistence = useProgressPersistence()
const { juz, surahName } = useReaderLocation(reader)
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

// Record-your-recitation (7.6) — lazy panel, opened from the mic control.
const recordOpen = ref(false)
const RecordingPanel = defineAsyncComponent(() => import('@/features/audio/RecordingPanel.vue'))

// Live recitation (7.7) — lazy YouTube-embed overlay, opened from settings.
const liveOpen = ref(false)
const LiveStreamPlayer = defineAsyncComponent(() => import('@/features/audio/LiveStreamPlayer.vue'))

const layoutOptions = [
  { value: 'qpc', label: 'Uthmani' },
  { value: 'indopak', label: 'Indopak' },
]
const wbwLangOptions = [
  { value: 'en', label: 'EN' },
  { value: 'bn', label: 'বাংলা' },
]
const modeOptions = [
  { value: 'read', label: 'Read' },
  { value: 'mark-mistake', label: 'Mark' },
]
// "Goals" and "Plans" are one surface now — Today (Phase 5).
const tabs = [
  { value: 'home', label: 'Home', icon: Home },
  { value: 'mushaf', label: 'Mushaf', icon: BookOpen },
  { value: 'surahs', label: 'Surahs', icon: ListOrdered },
  { value: 'today', label: 'Today', icon: CalendarCheck },
  { value: 'quiz', label: 'Quiz', icon: GraduationCap },
  { value: 'more', label: 'More', icon: Menu },
]

const sheetOpen = ref(false)
const paletteOpen = ref(false)
const legendOpen = ref(false)
const activeTab = ref('home')

// "Home" is this text reader; "Mushaf" opens the scan surface; "Today" the daily
// practice loop. The rest arrive in later phases — selecting a not-yet-built tab
// toasts and snaps back to Home.
watch(activeTab, (v) => {
  if (v === 'home') return
  if (v === 'mushaf') openMushaf()
  else if (v === 'today') void router.push({ name: 'today' })
  else if (v === 'quiz') void router.push({ name: 'quiz' })
  else toast('Coming in a later phase', { variant: 'info' })
  activeTab.value = 'home'
})

onMounted(async () => {
  void progressPersistence.hydrate() // load memorization/hasanah before rewards accrue
  await persistence.hydrate() // saved prefs first…
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

/**
 * Open the standalone mushaf scan surface. QPC pages share the mushaf's 604-page
 * scheme, so hand off the current page; from Indopak (a different page count) the
 * mushaf restores its own last page instead of landing on a mismatched one.
 */
function openMushaf() {
  void router.push({
    name: 'mushaf',
    params: reader.layout === 'qpc' ? { page: String(reader.page) } : {},
  })
}
</script>

<template>
  <main class="reader">
    <header class="topbar">
      <button
        class="icon-btn"
        :disabled="!canPrev"
        aria-label="Previous page"
        @click="reader.prevPage()"
      >
        <Icon :icon="ChevronLeft" :size="22" />
      </button>

      <button class="jump" aria-label="Go to page, ayah or surah" @click="paletteOpen = true">
        <Icon :icon="Search" :size="16" />
        <span class="indicator">
          <span class="page-n">Page {{ reader.page }} / {{ reader.pageCount }}</span>
          <span v-if="juz || surahName" class="page-meta">
            <template v-if="juz">Juz {{ juz }}</template>
            <template v-if="juz && surahName"> · </template>
            <bdi v-if="surahName" lang="ar">{{ surahName }}</bdi>
          </span>
        </span>
      </button>

      <button
        class="icon-btn"
        :disabled="!canNext"
        aria-label="Next page"
        @click="reader.nextPage()"
      >
        <Icon :icon="ChevronRight" :size="22" />
      </button>

      <button
        class="icon-btn"
        aria-label="Memorization progress"
        @click="router.push('/progress')"
      >
        <Icon :icon="Brain" :size="20" />
      </button>

      <button
        class="icon-btn"
        :aria-pressed="audio.open"
        aria-label="Recitation audio"
        @click="audio.open = true"
      >
        <Icon :icon="Headphones" :size="20" />
      </button>

      <button
        class="icon-btn"
        :aria-pressed="recordOpen"
        aria-label="Record your recitation"
        @click="recordOpen = true"
      >
        <Icon :icon="Mic" :size="20" />
      </button>

      <button class="icon-btn" aria-label="Reader settings" @click="sheetOpen = true">
        <Icon :icon="SlidersHorizontal" :size="20" />
      </button>
    </header>

    <ReaderPager class="reader-surface" />

    <TafsirPanel
      v-if="reader.tafsir"
      :entries="study.entries.value"
      :font-family="study.fontFamily.value"
      :tafsir="study.tafsir.value"
      :loading="study.loading.value"
      @expand="study.expandTafsir($event)"
    />

    <BottomTabBar v-model="activeTab" :tabs="tabs" class="tabbar" />

    <CommandPalette v-model:open="paletteOpen" @select="jumpTo($event)" />

    <AudioHost v-if="audio.open" view="text" :layout="reader.layout" :pages="audioPages" />

    <RecordingPanel v-if="recordOpen" v-model:open="recordOpen" :page="reader.page" />

    <LiveStreamPlayer v-if="liveOpen" v-model:open="liveOpen" />

    <BottomSheet v-model:open="sheetOpen" label="Reader settings">
      <div class="settings">
        <h2 class="settings-title">Reader settings</h2>

        <div class="row">
          <span class="row-label">Live recitation</span>
          <button class="live-btn" type="button" @click="sheetOpen = false; liveOpen = true">
            Listen live
          </button>
        </div>

        <div class="row">
          <span class="row-label">Reading script</span>
          <SegmentedControl
            :model-value="reader.layout"
            :options="layoutOptions"
            label="Reading script"
            @update:model-value="switchTo($event as Layout)"
          />
        </div>

        <div class="row">
          <label class="row-label" for="size-slider">Page width</label>
          <Slider
            id="size-slider"
            :model-value="reader.textSizeStep"
            :min="0"
            :max="maxStep"
            :step="1"
            label="Page width"
            @update:model-value="reader.setTextSizeStep($event)"
          />
        </div>

        <div v-if="reader.layout === 'qpc'" class="row">
          <span class="row-label">Tajweed colours</span>
          <div class="row-end">
            <Popover v-if="reader.tajweedActive" v-model:open="legendOpen" label="Tajweed legend">
              <template #trigger>
                <button type="button" class="legend-btn" aria-label="Tajweed legend">
                  <Icon :icon="Palette" :size="16" />
                </button>
              </template>
              <TajweedLegend />
            </Popover>
            <Toggle
              :model-value="reader.tajweed"
              label="Tajweed colours"
              @update:model-value="reader.toggleTajweed()"
            />
          </div>
        </div>

        <div class="row">
          <span class="row-label">Word-by-word</span>
          <div class="row-end">
            <SegmentedControl
              v-if="reader.wbw"
              :model-value="reader.wbwLang"
              :options="wbwLangOptions"
              label="Translation language"
              @update:model-value="reader.setWbwLang($event as WbwLang)"
            />
            <Toggle
              :model-value="reader.wbw"
              label="Word-by-word translation"
              @update:model-value="reader.toggleWbw()"
            />
          </div>
        </div>

        <div class="row">
          <span class="row-label">Tafsir &amp; translations</span>
          <Toggle
            :model-value="reader.tafsir"
            label="Tafsir and translations"
            @update:model-value="reader.toggleTafsir()"
          />
        </div>

        <div class="row">
          <span class="row-label">Tap mode</span>
          <SegmentedControl
            :model-value="reader.mode"
            :options="modeOptions"
            label="Tap mode"
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
  min-height: 100dvh;
  background: var(--color-bg);
}
.reader-surface {
  flex: 1 0 auto;
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
.tabbar {
  position: sticky;
  bottom: 0;
  z-index: var(--z-sticky);
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
.live-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.25rem;
  padding: 0 0.9rem;
  border-radius: var(--radius-full);
  border: 1.5px solid var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  color: var(--color-accent);
  font-size: var(--text-sm);
  font-weight: 700;
  cursor: pointer;
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
