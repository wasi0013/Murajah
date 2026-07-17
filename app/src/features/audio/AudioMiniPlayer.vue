<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-vue-next'
import Icon from '@/components/Icon.vue'
import AudioControlsTray from './AudioControlsTray.vue'
import { useAudioEngine } from '@/composables/useAudioEngine'
import { useAudioStore } from '@/stores/audio'
import { PAGE_MODE_UNAVAILABLE_HINT } from '@/core/audio/pageMode'

/**
 * The mini-player (7.2.1) — the always-simple surface: transport, a slim seekable
 * progress bar, the grain toggle, and the reciter name. Advanced controls live in
 * the expandable tray below. Docks above the bottom nav, thumb-zone actions, safe-
 * area aware. Reads playback state from the store; drives the engine directly.
 */
const props = defineProps<{ pageAvailable: boolean; reciterName: string }>()
const emit = defineEmits<{ start: []; rebuild: []; openPicker: []; close: [] }>()

const store = useAudioStore()
const engine = useAudioEngine()

const trayOpen = ref(false)

const empty = computed(() => store.playlist.length === 0)
const progressPct = computed(() => `${(store.progress * 100).toFixed(2)}%`)
const regionStyle = computed(() => {
  const r = store.region
  if (!r || store.duration <= 0) return null
  return {
    left: `${(r.start / store.duration) * 100}%`,
    width: `${((r.end - r.start) / store.duration) * 100}%`,
  }
})

const nowLabel = computed(() => {
  const c = store.current
  if (!c) return 'Ready to play'
  return c.kind === 'verse' && c.verse ? `Ayah ${c.verse.surah}:${c.verse.ayah}` : c.label
})

function onPlay() {
  if (empty.value) emit('start')
  else engine.toggle()
}

function setGrain(grain: 'verse' | 'page') {
  if (grain === 'page' && !props.pageAvailable) return
  if (store.grain === grain) return
  store.grain = grain
  emit('rebuild')
}

function seek(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  engine.seekToFraction((e.clientX - rect.left) / rect.width)
}

function fmt(s: number) {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
</script>

<template>
  <section class="player" :class="{ expanded: trayOpen }" aria-label="Recitation player">
    <div class="top">
      <div class="meta">
        <span class="now">{{ nowLabel }}</span>
        <button type="button" class="reciter" @click="emit('openPicker')">
          {{ reciterName }}
        </button>
      </div>

      <div class="grain" role="radiogroup" aria-label="Playback grain">
        <button
          type="button"
          role="radio"
          class="grain-btn"
          :class="{ on: store.grain === 'verse' }"
          :aria-checked="store.grain === 'verse'"
          @click="setGrain('verse')"
        >
          Verse
        </button>
        <button
          type="button"
          role="radio"
          class="grain-btn"
          :class="{ on: store.grain === 'page' }"
          :aria-checked="store.grain === 'page'"
          :disabled="!pageAvailable"
          :title="pageAvailable ? undefined : PAGE_MODE_UNAVAILABLE_HINT"
          @click="setGrain('page')"
        >
          Page
        </button>
      </div>

      <button type="button" class="icon-btn close" aria-label="Close player" @click="emit('close')">
        <Icon :icon="X" :size="18" />
      </button>
    </div>

    <button
      type="button"
      class="bar"
      aria-label="Seek"
      @click="seek"
    >
      <span class="bar-track">
        <span class="bar-fill" :style="{ width: progressPct }" />
        <span v-if="regionStyle" class="bar-region" :style="regionStyle" />
      </span>
    </button>
    <div class="times">
      <span>{{ fmt(store.currentTime) }}</span>
      <span>{{ fmt(store.duration) }}</span>
    </div>

    <div class="controls">
      <button
        type="button"
        class="icon-btn"
        aria-label="Previous"
        :disabled="!store.hasPrev"
        @click="engine.prev()"
      >
        <Icon :icon="SkipBack" :size="22" />
      </button>

      <button type="button" class="play" :aria-label="store.isPlaying ? 'Pause' : 'Play'" @click="onPlay">
        <Icon v-if="store.loading" :icon="Loader2" :size="26" class="spin" />
        <Icon v-else :icon="store.isPlaying ? Pause : Play" :size="26" />
      </button>

      <button
        type="button"
        class="icon-btn"
        aria-label="Next"
        :disabled="!store.hasNext"
        @click="engine.next()"
      >
        <Icon :icon="SkipForward" :size="22" />
      </button>

      <button
        type="button"
        class="icon-btn more"
        :aria-expanded="trayOpen"
        aria-label="More controls"
        @click="trayOpen = !trayOpen"
      >
        <Icon :icon="trayOpen ? ChevronDown : ChevronUp" :size="20" />
      </button>
    </div>

    <AudioControlsTray v-if="trayOpen" @rebuild="emit('rebuild')" />
  </section>
</template>

<style scoped>
.player {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.6rem 0.9rem calc(0.6rem + env(safe-area-inset-bottom));
  background: var(--color-elevated);
  border-top: 1px solid var(--color-border);
  box-shadow: 0 -8px 24px -12px rgb(0 0 0 / 0.28);
}
.top {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.now {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.reciter {
  font-size: var(--text-xs);
  color: var(--color-accent);
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.grain {
  display: inline-flex;
  gap: 0.2rem;
  padding: 0.2rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
}
.grain-btn {
  min-height: 1.9rem;
  padding: 0 0.7rem;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background var(--duration-fast), color var(--duration-fast);
}
.grain-btn.on {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}
.grain-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.bar {
  padding: 0.4rem 0;
  cursor: pointer;
}
.bar-track {
  position: relative;
  display: block;
  height: 5px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
  overflow: hidden;
}
.bar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--color-accent);
  border-radius: var(--radius-full);
}
.bar-region {
  position: absolute;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--color-warn) 55%, transparent);
}
.times {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  margin-top: -0.2rem;
}
.controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--radius-full);
  color: var(--color-text);
  cursor: pointer;
  transition: background var(--duration-fast);
}
.icon-btn:hover {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
}
.icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.close {
  width: 2.25rem;
  height: 2.25rem;
  color: var(--color-text-muted);
}
.more {
  margin-left: 0.5rem;
}
.play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3.4rem;
  height: 3.4rem;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  cursor: pointer;
  transition: transform var(--duration-fast);
}
.play:active {
  transform: scale(0.94);
}
.spin {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spin {
    animation-duration: 2s;
  }
  .play:active {
    transform: none;
  }
}
</style>
