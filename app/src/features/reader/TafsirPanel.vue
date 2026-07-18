<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { BookOpen, Copy } from 'lucide-vue-next'
import Icon from '@/components/Icon.vue'
import { toast } from '@/composables/useToast'
import type { VerseStudy } from '@/composables/useVerseStudy'

/**
 * Verse-study surface — one card per ayah with the Arabic, the English (Saheeh)
 * and Bengali (Zakaria) translations with attributions, and an expandable Arabic
 * tafsir (loaded on demand). When tafsir is on this replaces the mushaf as the
 * reading surface. The recited ayah is highlighted and (when auto-scroll is on)
 * scrolled into view, mirroring the mushaf reader. Tafsir HTML is trusted
 * build-time data.
 */
const props = defineProps<{
  entries: VerseStudy[]
  fontFamily: string
  tafsir: Record<string, string>
  loading: boolean
  /** The ayah currently being recited, as `"surah:ayah"` — highlighted + scrolled to. */
  activeVerse?: string | null
  /** Follow the recited ayah by scrolling it into view (audio player preference). */
  autoScroll?: boolean
}>()
const emit = defineEmits<{ expand: [verse: string] }>()

// Auto-scroll the recited ayah into view. Only when it's offscreen, so we never
// fight the reader's own scroll; honours reduced-motion and the auto-scroll pref.
const rootEl = ref<HTMLElement>()
watch(
  () => props.activeVerse,
  (verse) => {
    if (!verse || props.autoScroll === false) return
    void nextTick(() => {
      const el = rootEl.value?.querySelector<HTMLElement>(`.verse[data-verse="${verse}"]`)
      if (!el) return
      const rect = el.getBoundingClientRect()
      const offscreen = rect.top < 0 || rect.bottom > window.innerHeight
      if (!offscreen) return
      const reduce =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    })
  },
)

function onToggle(verse: string, e: Event) {
  if ((e.target as HTMLDetailsElement).open) emit('expand', verse)
}

async function copy(v: VerseStudy) {
  const text = [v.verse, v.arabic, v.en, v.bn].filter(Boolean).join('\n')
  try {
    await navigator.clipboard.writeText(text)
    toast('Verse copied', { variant: 'success' })
  } catch {
    toast('Could not copy', { variant: 'error' })
  }
}
</script>

<template>
  <section ref="rootEl" class="study" aria-label="Verse study">
    <p v-if="loading && entries.length === 0" class="state">Loading…</p>
    <p v-else-if="entries.length === 0" class="state">No verses for this page.</p>

    <article
      v-for="e in entries"
      :key="e.verse"
      class="verse"
      :class="{ 'is-playing': activeVerse === e.verse }"
      :data-verse="e.verse"
    >
      <header class="vhead">
        <span class="badge">{{ e.verse }}</span>
        <button class="icon-btn" :aria-label="`Copy verse ${e.verse}`" @click="copy(e)">
          <Icon :icon="Copy" :size="15" />
        </button>
      </header>

      <p class="arabic" dir="rtl" lang="ar" :style="{ fontFamily: `'${fontFamily}', serif` }">
        {{ e.arabic }}
      </p>

      <div v-if="e.en" class="tr">
        <p class="tr-text">{{ e.en }}</p>
        <p class="tr-src">— Saheeh International</p>
      </div>
      <div v-if="e.bn" class="tr">
        <p class="tr-text" lang="bn">{{ e.bn }}</p>
        <p class="tr-src">— Dr. Abu Bakr Muhammad Zakaria</p>
      </div>

      <details class="tafsir-sec" @toggle="onToggle(e.verse, $event)">
        <summary class="tafsir-summary">
          <Icon :icon="BookOpen" :size="15" />
          <span>Tafsir</span>
        </summary>
        <div class="tafsir-body">
          <p v-if="tafsir[e.verse] === undefined" class="state">Loading tafsir…</p>
          <div
            v-else-if="tafsir[e.verse]"
            class="tafsir-html"
            dir="rtl"
            lang="ar"
            v-html="tafsir[e.verse]"
          />
          <p v-else class="state">No tafsir available for this verse.</p>
        </div>
      </details>
    </article>
  </section>
</template>

<style scoped>
.study {
  max-width: 46rem;
  margin-inline: auto;
  width: 100%;
  padding: 0.75rem clamp(0.75rem, 4vw, 1.5rem) 2rem;
  background: var(--color-bg);
}
.state {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  padding: 0.5rem 0;
}
.verse {
  padding: 1.25rem 0;
  border-bottom: 1px solid color-mix(in oklab, var(--color-border) 60%, transparent);
  scroll-margin-block: 4rem;
}
.verse:last-child {
  border-bottom: none;
}
/* The ayah being recited: a soft accent wash with a hairline start-edge rule —
   subtle, and not carried by colour alone. Bled slightly past the text column. */
.verse.is-playing {
  background: color-mix(in oklab, var(--color-accent) 7%, transparent);
  box-shadow: inset 3px 0 0 0 color-mix(in oklab, var(--color-accent) 55%, transparent);
  border-radius: var(--radius-md);
  padding-inline: clamp(0.5rem, 3vw, 1rem);
  margin-inline: clamp(-1rem, -3vw, -0.5rem);
}
.vhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.badge {
  font-size: var(--text-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: var(--color-accent);
}
.icon-btn {
  display: inline-flex;
  padding: 0.35rem;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
}
.icon-btn:hover {
  background: var(--color-elevated);
  color: var(--color-text);
}
.icon-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.arabic {
  font-size: 1.75rem;
  line-height: 2.1;
  text-align: right;
  color: var(--color-text);
  margin-bottom: 1rem;
}
.tr {
  margin-top: 0.85rem;
}
.tr-text {
  font-size: var(--text-base);
  line-height: 1.65;
  color: var(--color-text);
}
.tr-src {
  margin-top: 0.15rem;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.tafsir-sec {
  margin-top: 1rem;
}
.tafsir-summary {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  list-style: none;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-muted);
  padding: 0.35rem 0;
}
.tafsir-summary:hover {
  color: var(--color-text);
}
.tafsir-summary::-webkit-details-marker {
  display: none;
}
.tafsir-body {
  padding-top: 0.5rem;
}
.tafsir-html {
  font-family: var(--font-arabic);
  line-height: 2;
  font-size: var(--text-base);
  color: var(--color-text);
}
.tafsir-html :deep(.text-rtl) {
  direction: rtl;
}
</style>
