<script setup lang="ts">
import { ref } from 'vue'
import { Radio, X } from 'lucide-vue-next'
import Icon from '@/components/Icon.vue'
import BottomSheet from '@/components/BottomSheet.vue'

/**
 * Live-stream embed (7.7). The legacy migrated off hls.js to YouTube live embeds
 * ("HLS.js removed: switching to YouTube embed") — so, per decision 5 (keep legacy
 * sources), this embeds the same two channels. The iframe is created only when a
 * channel is selected, so nothing loads until the user asks for a stream. Lazy-
 * imported, so it's absent from every initial bundle.
 */
const open = defineModel<boolean>('open', { default: false })

// Channel ids from the legacy live config (Makkah Haramain / Madinah Sunnah feeds).
const CHANNELS: { id: 'quran' | 'sunnah'; label: string; sub: string; youtubeChannel: string }[] = [
  { id: 'quran', label: 'Makkah Live', sub: 'Al-Masjid al-Ḥarām', youtubeChannel: 'UCos52azQNBgW63_9uDJoPDA' },
  { id: 'sunnah', label: 'Madinah Live', sub: 'Al-Masjid an-Nabawī', youtubeChannel: 'UCROKYPep-UuODNwyipe6JMw' },
]

const active = ref<'quran' | 'sunnah' | null>(null)

function embedUrl(channel: string) {
  return `https://www.youtube.com/embed/live_stream?channel=${channel}&autoplay=1`
}

function selectChannel(id: 'quran' | 'sunnah') {
  active.value = active.value === id ? null : id
}
</script>

<template>
  <BottomSheet v-model:open="open" label="Live recitation">
    <div class="live">
      <div class="head">
        <Icon :icon="Radio" :size="18" class="head-icon" />
        <h2 class="title">Live recitation</h2>
      </div>

      <div class="channels" role="group" aria-label="Live channels">
        <button
          v-for="c in CHANNELS"
          :key="c.id"
          type="button"
          class="channel"
          :class="{ on: active === c.id }"
          :aria-pressed="active === c.id"
          @click="selectChannel(c.id)"
        >
          <span class="channel-label">{{ c.label }}</span>
          <span class="channel-sub" dir="auto">{{ c.sub }}</span>
        </button>
      </div>

      <div v-if="active" class="frame">
        <iframe
          :key="active"
          :src="embedUrl(CHANNELS.find((c) => c.id === active)!.youtubeChannel)"
          title="Live recitation stream"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowfullscreen
          loading="lazy"
        />
        <button type="button" class="stop" @click="active = null">
          <Icon :icon="X" :size="16" />
          <span>Stop stream</span>
        </button>
      </div>
      <p v-else class="hint">Choose a masjid to start the live stream.</p>
    </div>
  </BottomSheet>
</template>

<style scoped>
.live {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding-bottom: env(safe-area-inset-bottom);
}
.head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.head-icon {
  color: var(--color-accent);
}
.title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text);
}
.channels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}
.channel {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.75rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--duration-fast), background var(--duration-fast);
}
.channel.on {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface));
}
.channel-label {
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--color-text);
}
.channel-sub {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.frame {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.frame iframe {
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 0;
  border-radius: var(--radius-md);
  background: #000;
}
.stop {
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2.5rem;
  padding: 0 1rem;
  border-radius: var(--radius-full);
  border: 1.5px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}
.hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-align: center;
  padding: 0.5rem 0;
}
</style>
