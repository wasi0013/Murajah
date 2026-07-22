<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Mic, Square, Play, Pause, Trash2 } from 'lucide-vue-next'
import Icon from '@/components/Icon.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import { AudioRecorder, toRecording } from '@/core/audio/recorder'
import { useRecordingsStore } from '@/stores/recordings'
import { useRecordingsPersistence } from '@/composables/useRecordingsPersistence'
import { useI18n } from '@/core/i18n'

/**
 * Record-a-page panel (7.6.3): a mic button to capture your own recitation of the
 * current page, and a playlist of saved recordings with playback + delete. Own
 * `<audio>` for playback (isolated from the Qari engine); blob URLs are created on
 * play and revoked on stop / switch / unmount.
 */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ page: number }>()

const store = useRecordingsStore()
const persistence = useRecordingsPersistence(store)
onMounted(() => void persistence.hydrate())
onBeforeUnmount(() => persistence.dispose())
const { t, locale } = useI18n()

const supported = AudioRecorder.isSupported()
const recorder = new AudioRecorder()
const recording = ref(false)
const busy = ref(false)
const error = ref('')

const audioEl = ref<HTMLAudioElement>()
const playingId = ref<string | null>(null)
let blobUrl: string | null = null

async function toggleRecord() {
  error.value = ''
  if (recording.value) {
    busy.value = true
    try {
      const result = await recorder.stop()
      store.add(toRecording(result, props.page))
    } finally {
      recording.value = false
      busy.value = false
    }
    return
  }
  try {
    await recorder.start()
    recording.value = true
  } catch {
    error.value = t('audio.micDenied')
  }
}

function stopPlayback() {
  audioEl.value?.pause()
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl)
    blobUrl = null
  }
  playingId.value = null
}

function play(id: string, blob: Blob) {
  const el = audioEl.value
  if (!el) return
  if (playingId.value === id) {
    stopPlayback()
    return
  }
  stopPlayback()
  blobUrl = URL.createObjectURL(blob)
  el.src = blobUrl
  playingId.value = id
  void el.play().catch(() => stopPlayback())
}

function remove(id: string) {
  if (playingId.value === id) stopPlayback()
  store.remove(id)
}

function fmt(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(locale.value, { month: 'short', day: 'numeric' })
}

const empty = computed(() => store.items.length === 0)

onBeforeUnmount(() => {
  stopPlayback()
  recorder.cancel()
})
</script>

<template>
  <BottomSheet v-model:open="open" :label="t('audio.recordRecitation')">
    <div class="panel">
      <div class="head">
        <h2 class="title">{{ t('audio.yourRecitation') }}</h2>
        <span class="page-tag">{{ t('common.page', { n: page }) }}</span>
      </div>

      <div v-if="!supported" class="notice">{{ t('audio.recordingUnsupported') }}</div>
      <template v-else>
        <button
          type="button"
          class="record"
          :class="{ on: recording }"
          :disabled="busy"
          :aria-pressed="recording"
          @click="toggleRecord"
        >
          <Icon :icon="recording ? Square : Mic" :size="22" />
          <span>{{ recording ? t('audio.stopRecording') : t('audio.recordPage', { n: page }) }}</span>
        </button>
        <p v-if="error" class="err" role="alert">{{ error }}</p>
      </template>

      <ul v-if="!empty" class="list">
        <li v-for="r in store.items" :key="r.id" class="item">
          <button
            type="button"
            class="play"
            :aria-label="playingId === r.id ? t('audio.pause') : t('audio.play')"
            @click="play(r.id, r.blob)"
          >
            <Icon :icon="playingId === r.id ? Pause : Play" :size="18" />
          </button>
          <div class="info">
            <span class="info-title">{{ t('common.page', { n: r.pageNumber }) }}</span>
            <span class="info-meta">{{ fmt(r.duration) }} · {{ fmtDate(r.recordedAt) }}</span>
          </div>
          <button type="button" class="del" :aria-label="t('audio.deleteRecording')" @click="remove(r.id)">
            <Icon :icon="Trash2" :size="18" />
          </button>
        </li>
      </ul>
      <p v-else-if="supported" class="empty">{{ t('audio.noRecordings') }}</p>

      <audio ref="audioEl" @ended="stopPlayback" playsinline />
    </div>
  </BottomSheet>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding-bottom: env(safe-area-inset-bottom);
  max-height: 72vh;
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}
.title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text);
}
.page-tag {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
}
.record {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 3rem;
  border-radius: var(--radius-full);
  border: 1.5px solid var(--color-accent);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: var(--text-base);
  font-weight: 700;
  cursor: pointer;
  transition: background var(--duration-fast);
}
.record.on {
  background: var(--color-danger);
  border-color: var(--color-danger);
  color: var(--color-on-status);
}
.record:disabled {
  opacity: 0.6;
  cursor: progress;
}
.notice,
.empty {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-align: center;
  padding: 0.5rem 0;
}
.err {
  font-size: var(--text-sm);
  color: var(--color-danger);
}
.list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  overflow-y: auto;
}
.item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.5rem;
  border-radius: var(--radius-md);
  background: var(--color-surface);
}
.play,
.del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-full);
  cursor: pointer;
  flex-shrink: 0;
}
.play {
  background: color-mix(in srgb, var(--color-accent) 14%, transparent);
  color: var(--color-accent);
}
.del {
  color: var(--color-text-muted);
}
.del:hover {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
}
.info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.info-title {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--color-text);
}
.info-meta {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
audio {
  display: none;
}
</style>
