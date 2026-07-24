<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import AudioMiniPlayer from '@/features/audio/AudioMiniPlayer.vue'
import ReciterPicker from '@/features/audio/ReciterPicker.vue'
import { pageReciter, verseReciter } from '@/core/audio/reciters'
import { useAudioEngine } from '@/composables/useAudioEngine'
import { useAudioStore } from '@/stores/audio'
import { useTodayPlayer, type TodaySource } from '@/composables/useTodayPlayer'
import type { AbsoluteVerseRef } from '@/core/quran/habitVerses'
import { useI18n } from '@/core/i18n'

/**
 * Listen along with Today's queue (9.6-ish) — a tab per non-empty list (new /
 * revision / weak-reinforcement, always page grain — the daily task queue is
 * page-scoped) plus, when the "Recite 10 verses" habit is enabled, a 4th tab for
 * the habit builder's verses of the day (always verse grain — inherently
 * verse-scoped, may cross page/surah boundaries). A tab that has nothing to
 * play simply doesn't appear. Selecting a tab loads and plays it immediately,
 * same as picking a surah/juz in Listen.
 */
type TabId = 'new' | 'revision' | 'weak' | 'versesOfDay'

const props = defineProps<{
  newPages: number[]
  revisionPages: number[]
  weakPages: number[]
  showVersesOfDay: boolean
  versesOfDay: AbsoluteVerseRef[]
}>()

const { t } = useI18n()
const store = useAudioStore()
const engine = useAudioEngine()
const player = useTodayPlayer()

const pickerOpen = ref(false)
// The v-model-bound string the SegmentedControl actually reads/writes ('' when
// there's no selection yet — SegmentedControl's model is a plain non-null string).
const activeTab = ref<TabId | ''>('')

const tabs = computed(() => {
  const list: { id: TabId; label: string }[] = []
  if (props.newPages.length) list.push({ id: 'new', label: t('today.listen.tabNew') })
  if (props.revisionPages.length) list.push({ id: 'revision', label: t('today.listen.tabRevision') })
  if (props.weakPages.length) list.push({ id: 'weak', label: t('today.listen.tabWeak') })
  if (props.showVersesOfDay) list.push({ id: 'versesOfDay', label: t('today.listen.tabVersesOfDay') })
  return list
})
const options = computed(() => tabs.value.map((tab) => ({ value: tab.id, label: tab.label })))

function sourceFor(id: TabId): TodaySource {
  if (id === 'new') return { kind: 'pages', pages: props.newPages }
  if (id === 'revision') return { kind: 'pages', pages: props.revisionPages }
  if (id === 'weak') return { kind: 'pages', pages: props.weakPages }
  return { kind: 'verses', verses: props.versesOfDay }
}

// Keep the selection valid as the day's lists change (plan edits, midnight
// rollover) — this only ever assigns `activeTab`, never plays, so it can't
// start audio on the user's behalf.
watch(
  tabs,
  (list) => {
    if (!list.some((tab) => tab.id === activeTab.value)) activeTab.value = list[0]?.id ?? ''
  },
  { immediate: true },
)

/** A real pick — including re-tapping the already-active tab — loads and plays. */
function selectTab(id: TabId) {
  activeTab.value = id
  void player.play(sourceFor(id))
}

const effectiveGrain = computed(() => (activeTab.value === 'versesOfDay' ? 'verse' : 'page'))
const reciterName = computed(() =>
  effectiveGrain.value === 'verse'
    ? verseReciter(store.verseReciterId).name
    : pageReciter(store.pageReciterId).name,
)

function onRebuild() {
  void player.restart()
}
function onClose() {
  engine.stop()
  store.open = false
}

defineExpose({ selectTab })
</script>

<template>
  <section v-if="tabs.length" class="today-audio" :aria-label="t('today.listen.title')">
    <h2 class="title">{{ t('today.listen.title') }}</h2>
    <SegmentedControl
      v-model="activeTab"
      :options="options"
      :label="t('today.listen.tabsAria')"
      @select="selectTab($event as TabId)"
    />

    <AudioMiniPlayer
      v-if="store.open"
      :page-available="true"
      :effective-grain="effectiveGrain"
      :reciter-name="reciterName"
      :show-grain="false"
      @start="onRebuild"
      @rebuild="onRebuild"
      @open-picker="pickerOpen = true"
      @close="onClose"
    />
    <ReciterPicker v-model:open="pickerOpen" :grain="effectiveGrain" @change="onRebuild" />
  </section>
</template>

<style scoped>
.today-audio {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.6rem;
}
.title {
  font-size: var(--text-sm);
  font-weight: 600;
}
</style>
