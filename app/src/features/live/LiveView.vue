<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Radio, X } from 'lucide-vue-next'
import Icon from '@/components/Icon.vue'
import { loadLivePrefs, saveLivePrefs } from '@/core/storage/userData'
import { useI18n } from '@/core/i18n'

const { t } = useI18n()

/**
 * Live-recitation full view (7.7) — a standalone route (like the mushaf), reached
 * from the "More" tab rather than buried in a settings drawer. The legacy migrated
 * off hls.js to YouTube live embeds ("HLS.js removed: switching to YouTube embed"),
 * so per decision 5 (keep legacy sources) this embeds the same two channels. The
 * iframe is created only once a channel is selected, so nothing loads until asked.
 * Code-split → never in any initial bundle.
 */
const router = useRouter()

// Channel ids from the legacy live config (Makkah Haramain / Madinah Sunnah feeds).
// Labels resolve through the catalog; only the stable youtube channel id lives here.
const CHANNELS: { id: 'quran' | 'sunnah'; labelKey: string; subKey: string; youtubeChannel: string }[] = [
  { id: 'quran', labelKey: 'live.makkah', subKey: 'live.makkahSub', youtubeChannel: 'UCos52azQNBgW63_9uDJoPDA' },
  { id: 'sunnah', labelKey: 'live.madinah', subKey: 'live.madinahSub', youtubeChannel: 'UCROKYPep-UuODNwyipe6JMw' },
]

const active = ref<'quran' | 'sunnah' | null>(null)
// Remembered from a past visit (redesign 2026 P3.1) — offers a one-tap resume
// instead of always opening as a blank picker. Never auto-plays: the iframe
// still only appears once a channel is actually selected.
const lastChannel = ref<'quran' | 'sunnah' | null>(null)
const lastChannelLabel = computed(() => {
  const c = CHANNELS.find((c) => c.id === lastChannel.value)
  return c ? t(c.labelKey) : ''
})

onMounted(async () => {
  const prefs = await loadLivePrefs()
  if (prefs.lastChannel) lastChannel.value = prefs.lastChannel
})

function embedUrl(channel: string) {
  return `https://www.youtube.com/embed/live_stream?channel=${channel}&autoplay=1`
}

function selectChannel(id: 'quran' | 'sunnah') {
  active.value = active.value === id ? null : id
  if (active.value) {
    lastChannel.value = id
    void saveLivePrefs({ lastChannel: id })
  }
}

function back() {
  void router.push({ name: 'home' })
}
</script>

<template>
  <main class="live">
    <header class="topbar">
      <button class="icon-btn" :aria-label="t('common.backToReader')" @click="back">
        <Icon :icon="ArrowLeft" :size="20" />
      </button>
      <div class="title-wrap">
        <Icon :icon="Radio" :size="18" class="title-icon" />
        <h1 class="title">{{ t('live.title') }}</h1>
      </div>
    </header>

    <div class="body">
      <button
        v-if="!active && lastChannel"
        type="button"
        class="continue-card"
        @click="selectChannel(lastChannel)"
      >
        <Icon :icon="Radio" :size="18" class="continue-icon" />
        <span class="continue-text">
          <span class="continue-title">{{ t('live.resumeTitle') }}</span>
          <span class="continue-scope">{{ lastChannelLabel }}</span>
        </span>
      </button>

      <div class="channels" role="group" :aria-label="t('live.channelsAria')">
        <button
          v-for="c in CHANNELS"
          :key="c.id"
          type="button"
          class="channel"
          :class="{ on: active === c.id }"
          :aria-pressed="active === c.id"
          @click="selectChannel(c.id)"
        >
          <span class="channel-label">{{ t(c.labelKey) }}</span>
          <span class="channel-sub" dir="auto">{{ t(c.subKey) }}</span>
        </button>
      </div>

      <div v-if="active" class="frame">
        <iframe
          :key="active"
          :src="embedUrl(CHANNELS.find((c) => c.id === active)!.youtubeChannel)"
          :title="t('live.streamTitle')"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowfullscreen
          loading="lazy"
        />
        <button type="button" class="stop" @click="active = null">
          <Icon :icon="X" :size="16" />
          <span>{{ t('live.stop') }}</span>
        </button>
      </div>
      <p v-else class="hint">{{ t('live.choose') }}</p>
    </div>
  </main>
</template>

<style scoped>
.live {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: var(--color-bg);
}
@media (min-width: 1024px) {
  .live {
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
.body {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 46rem;
  margin-inline: auto;
  padding: 1rem clamp(0.75rem, 4vw, 1.5rem) calc(1.5rem + env(safe-area-inset-bottom));
}
.continue-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 0.9rem;
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
.channels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}
.channel {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.85rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  text-align: start;
  cursor: pointer;
  transition: border-color var(--duration-fast), background var(--duration-fast);
}
.channel.on {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface));
}
.channel:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
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
  gap: 0.6rem;
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
