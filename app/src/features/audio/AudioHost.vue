<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AudioMiniPlayer from './AudioMiniPlayer.vue'
import ReciterPicker from './ReciterPicker.vue'
import type { AudioView } from '@/core/audio/pages'
import type { Layout } from '@/core/data/types'
import { effectiveGrain as resolveGrain, pageAudioAvailable } from '@/core/audio/pageMode'
import { pageReciter, verseReciter } from '@/core/audio/reciters'
import { useAudioEngine } from '@/composables/useAudioEngine'
import { useAudioPersistence } from '@/composables/useAudioPersistence'
import { useQariPlayer } from '@/composables/useQariPlayer'
import { useAudioStore } from '@/stores/audio'

/**
 * Mounts the mini-player + reciter picker for a view and wires them to the engine.
 * The view passes the *reactive* context (which surface, layout, and page(s) are
 * showing); the host turns player intents (start / rebuild / pick) into engine work.
 * Rendered only when the player is open, so it and its deps stay lazy.
 */
const props = defineProps<{ view: AudioView; layout: Layout; pages: number[] }>()
const emit = defineEmits<{ 'need-next-page': [] }>()

const store = useAudioStore()
const engine = useAudioEngine()
const player = useQariPlayer()
const prefs = useAudioPersistence(store)

onMounted(() => {
  void prefs.hydrate()
  // Autoplay-next ran off the end of "the page(s) in view"'s playlist: ask the
  // parent (which owns page navigation) to turn the page, then — only if it
  // actually could (there's more Quran left) — start playing there. Detecting the
  // change here, rather than reusing the "follow the reader" watcher below, avoids
  // a race: `store.isPlaying` is already false by the time this fires (see
  // `useAudioEngine`'s 'exhausted' handling), so that watcher's guard wouldn't run.
  engine.setOnExhausted(() => {
    const before = props.pages.join(',')
    emit('need-next-page')
    void nextTick(() => {
      if (props.pages.join(',') !== before) void player.start(ctx())
    })
  })
})
onBeforeUnmount(() => {
  prefs.dispose()
  engine.setOnExhausted(null)
})

const pickerOpen = ref(false)

const pageAvailable = computed(() => pageAudioAvailable(props.layout))
// What actually plays / is shown selected — page grain degrades to verse where
// unavailable, so the toggle never claims a grain the engine won't use.
const effectiveGrain = computed(() => resolveGrain(store.grain, props.layout))
const reciterName = computed(() =>
  effectiveGrain.value === 'page'
    ? pageReciter(store.pageReciterId).name
    : verseReciter(store.verseReciterId).name,
)

function ctx() {
  return { view: props.view, layout: props.layout, pages: props.pages }
}

// Follow the reader: when the visible page(s) change while audio is playing, stop
// the old page and immediately start the new one (verse or page grain alike). Only
// while playing — merely opening the player or pausing never yanks the page along.
watch(
  () => props.pages.join(','),
  () => {
    if (store.isPlaying) void player.start(ctx())
  },
)

function onStart() {
  void player.start(ctx())
}
function onRebuild() {
  void player.restart()
}
function onClose() {
  engine.stop()
  store.open = false
}
</script>

<template>
  <AudioMiniPlayer
    v-if="store.open"
    :page-available="pageAvailable"
    :effective-grain="effectiveGrain"
    :reciter-name="reciterName"
    @start="onStart"
    @rebuild="onRebuild"
    @open-picker="pickerOpen = true"
    @close="onClose"
  />
  <ReciterPicker v-model:open="pickerOpen" :grain="effectiveGrain" @change="onRebuild" />
</template>
