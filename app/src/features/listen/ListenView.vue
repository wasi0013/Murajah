<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Headphones, Play } from 'lucide-vue-next'
import Icon from '@/components/Icon.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import SurahList from '@/features/contents/SurahList.vue'
import JuzList from '@/features/contents/JuzList.vue'
import AudioMiniPlayer from '@/features/audio/AudioMiniPlayer.vue'
import ReciterPicker from '@/features/audio/ReciterPicker.vue'
import { juzRows, surahRows, type JuzRow, type SurahRow } from '@/core/navigation/contents'
import { PAGE_COUNT_QPC } from '@/core/quran/surahPages'
import { CURATED_LISTEN_RECITERS, listenReciter } from '@/core/audio/reciters'
import { getDataClient } from '@/core/data'
import { useAudioEngine } from '@/composables/useAudioEngine'
import { useAudioPersistence } from '@/composables/useAudioPersistence'
import { useListenPlayer } from '@/composables/useListenPlayer'
import { useAudioStore } from '@/stores/audio'
import { useI18n } from '@/core/i18n'

/**
 * Listen (8.2) — audio-only, whole-scope playback. Pick a surah, a juz, or the
 * whole Quran and it plays end-to-end through the shared audio engine (page-first,
 * decision 5). Reuses the Contents lists as scope pickers and the reader's
 * mini-player (grain toggle hidden — Listen is page-only). A `?scope=&ref=` query
 * pre-selects and auto-plays, powering the browse → listen cross-link.
 */
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const data = getDataClient()
const store = useAudioStore()
const engine = useAudioEngine()
const listen = useListenPlayer()
const prefs = useAudioPersistence(store)

const scope = ref<'surah' | 'juz' | 'quran'>('surah')
const scopeOptions = computed(() => [
  { value: 'surah', label: t('listen.scopeSurah') },
  { value: 'juz', label: t('listen.scopeJuz') },
  { value: 'quran', label: t('listen.scopeQuran') },
])
const leadText = computed(() => {
  if (scope.value === 'quran') return t('listen.leadQuran')
  return scope.value === 'surah' ? t('listen.leadSurah') : t('listen.leadJuz')
})

const surahs = ref<SurahRow[]>([])
const juzz = ref<JuzRow[]>([])
const loading = ref(true)
const pickerOpen = ref(false)

const curatedIds = CURATED_LISTEN_RECITERS.map((r) => r.id)
const reciterName = computed(() => listenReciter(store.pageReciterId).name)

// "Continue listening" (redesign 2026 P3.1) — a bookmark of the last scope
// played, shown only while nothing is currently playing (once the mini-player
// is open it already shows what's on, so the card would just be noise).
const continueLabel = computed(() => {
  const s = store.lastListenScope
  if (!s) return ''
  if (s.kind === 'surah') return surahs.value.find((r) => r.surah === s.surah)?.translit ?? ''
  if (s.kind === 'juz') return t('common.juz', { n: s.juz })
  return t('listen.scopeQuran')
})
function playContinue() {
  if (store.lastListenScope) void listen.play(store.lastListenScope)
}

onMounted(async () => {
  await prefs.hydrate()
  await data.init()
  // Listen is page-first, so it always resolves through the QPC nav index.
  const [names, qpcNav] = await Promise.all([data.getSurahNames(), data.getNavIndex('qpc')])
  surahs.value = surahRows(names)
  juzz.value = juzRows(qpcNav.juzToPage, qpcNav.juzToPage, PAGE_COUNT_QPC)
  loading.value = false

  // Cross-link deep-link: ?scope=surah&ref=25 (or scope=quran) → auto-play.
  const q = route.query.scope
  const ref = Number(route.query.ref)
  if (q === 'surah' && ref) {
    scope.value = 'surah'
    void listen.play({ kind: 'surah', surah: ref })
  } else if (q === 'juz' && ref) {
    scope.value = 'juz'
    void listen.play({ kind: 'juz', juz: ref })
  } else if (q === 'quran') {
    scope.value = 'quran'
    void listen.play({ kind: 'quran' })
  }
})

function playSurah(surah: number) {
  void listen.play({ kind: 'surah', surah })
}
function playJuz(juz: number) {
  void listen.play({ kind: 'juz', juz })
}
function playQuran() {
  void listen.play({ kind: 'quran' })
}

function onRebuild() {
  void listen.restart()
}
function onClose() {
  engine.stop()
  store.open = false
}

onBeforeUnmount(() => prefs.dispose())
</script>

<template>
  <main class="listen">
    <header class="topbar">
      <button class="icon-btn" :aria-label="t('common.back')" @click="router.push({ name: 'home' })">
        <Icon :icon="ArrowLeft" :size="20" />
      </button>
      <div class="title-wrap">
        <Icon :icon="Headphones" :size="18" class="title-icon" />
        <h1 class="title">{{ t('listen.title') }}</h1>
      </div>
    </header>

    <div class="sticky-controls">
      <SegmentedControl v-model="scope" :options="scopeOptions" :label="t('listen.scopeAria')" class="segment" />
    </div>

    <div class="body" :class="{ docked: store.open }">
      <p v-if="loading" class="hint">{{ t('common.loading') }}</p>
      <template v-else>
        <button
          v-if="continueLabel && !store.open"
          type="button"
          class="continue-card"
          @click="playContinue"
        >
          <Icon :icon="Play" :size="18" class="continue-icon" />
          <span class="continue-text">
            <span class="continue-title">{{ t('listen.continueTitle') }}</span>
            <span class="continue-scope">{{ continueLabel }}</span>
          </span>
        </button>

        <p class="lead">{{ leadText }}</p>
        <SurahList v-if="scope === 'surah'" :rows="surahs" @select="playSurah" />
        <JuzList v-else-if="scope === 'juz'" :rows="juzz" @select="playJuz" />
        <button v-else type="button" class="play-quran" @click="playQuran">
          <Icon :icon="Play" :size="22" />
          <span>{{ t('listen.playQuran') }}</span>
        </button>
      </template>
    </div>

    <AudioMiniPlayer
      v-if="store.open"
      :page-available="true"
      effective-grain="page"
      :reciter-name="reciterName"
      :show-grain="false"
      @start="onRebuild"
      @rebuild="onRebuild"
      @open-picker="pickerOpen = true"
      @close="onClose"
    />
    <ReciterPicker
      v-model:open="pickerOpen"
      grain="page"
      :reciter-ids="curatedIds"
      @change="onRebuild"
    />
  </main>
</template>

<style scoped>
.listen {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: var(--color-bg);
}
@media (min-width: 1024px) {
  .listen {
    max-width: 42rem;
    margin-inline: auto;
  }
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
/* Keep the last rows clear of the docked mini-player. */
.body.docked {
  padding-bottom: 14rem;
}
.lead {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  padding: 0.25rem 0.5rem 0.75rem;
}
.continue-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 0.9rem;
  margin-bottom: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  text-align: start;
  cursor: pointer;
  transition: background var(--duration-fast), border-color var(--duration-fast);
}
.continue-card:hover {
  background: var(--color-elevated);
  border-color: var(--color-accent);
}
.continue-card:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.continue-icon {
  flex: none;
  color: var(--color-accent);
}
.continue-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}
.continue-title {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.continue-scope {
  font-size: var(--text-sm);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-align: center;
  padding: 1.5rem 0;
}
.play-quran {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  width: 100%;
  min-height: 3.5rem;
  margin-top: 0.5rem;
  border-radius: var(--radius-lg);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: var(--text-base);
  font-weight: 700;
  cursor: pointer;
  transition: transform var(--duration-fast);
}
.play-quran:active {
  transform: scale(0.98);
}
.play-quran:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .play-quran:active {
    transform: none;
  }
}
</style>
