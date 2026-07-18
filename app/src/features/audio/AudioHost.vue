<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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

const store = useAudioStore()
const engine = useAudioEngine()
const player = useQariPlayer()
const prefs = useAudioPersistence(store)

onMounted(() => void prefs.hydrate())
onBeforeUnmount(() => prefs.dispose())

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
