<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { BookOpen, ChevronLeft, ChevronRight, Copy } from 'lucide-vue-next'
import Icon from '@/components/Icon.vue'
import { toast } from '@/composables/useToast'
import type { VerseStudy } from '@/composables/useVerseStudy'
import type { SurahNames } from '@/core/data/types'
import { getDataClient } from '@/core/data'
import { useReaderStore } from '@/stores/reader'
import { useI18n } from '@/core/i18n'

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

const { t } = useI18n()

// tj-p{n} is the COLR/CPAL tajweed font (baked-in colour, not `currentColor`);
// see ReadingSurface.vue for the fuller explanation of the dark-theme fix.
const isTajweedFont = computed(() => props.fontFamily.startsWith('tj-'))

// Same foot-of-page prev/next as the mushaf/WBW surface (ReaderPager.vue) —
// tafsir replaces that surface, so it needs its own page-turn controls too.
const reader = useReaderStore()
const canPrev = computed(() => reader.page > 1)
const canNext = computed(() => reader.page < reader.pageCount)

// Surah name + Bismillah header, shown ahead of each surah's first verse —
// mirrors the mushaf's own surah_name/basmallah lines (ReadingSurface.vue) so
// the study panel doesn't lose that orientation when it replaces the mushaf.
const surahNames = ref<SurahNames>({})
onMounted(() => {
  getDataClient()
    .getSurahNames()
    .then((n) => (surahNames.value = n))
    .catch(() => {})
})

const surahOf = (verse: string): number => Number(verse.split(':')[0])
const ayahOf = (verse: string): number => Number(verse.split(':')[1])
/** Same "SurahNames" glyph-font ligature as ReadingSurface.vue's surah header. */
function surahNameGlyph(surah: number): string {
  return `${String(surah).padStart(3, '0')}surah`
}
// Al-Fatihah's ayah 1 *is* the Bismillah text (no separate basmallah line in the
// mushaf data either); At-Tawbah has none. Every other surah gets the glyph.
const showBasmala = (surah: number): boolean => surah !== 1 && surah !== 9

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

    <template v-for="e in entries" :key="e.verse">
      <div v-if="ayahOf(e.verse) === 1" class="line line-surah">
        <span class="surah-name-glyph" aria-hidden="true">{{ surahNameGlyph(surahOf(e.verse)) }}</span>
        <span class="sr-only">{{ surahNames[String(surahOf(e.verse))] ?? '' }}</span>
      </div>
      <div v-if="ayahOf(e.verse) === 1 && showBasmala(surahOf(e.verse))" class="line line-basmala">﷽</div>

    <article
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

      <p
        class="arabic"
        :class="{ 'tajweed-glyphs': isTajweedFont }"
        dir="rtl"
        lang="ar"
        :style="{ fontFamily: `'${fontFamily}', serif` }"
      >
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
    </template>

    <nav v-if="entries.length > 0" class="page-nav" :aria-label="t('reader.pageNavAria')">
      <button
        type="button"
        class="page-nav-btn"
        :disabled="!canPrev"
        @click="reader.prevPage()"
      >
        <Icon :icon="ChevronLeft" :size="20" />
        <span>{{ t('reader.goToPrevPage') }}</span>
      </button>
      <button
        type="button"
        class="page-nav-btn"
        :disabled="!canNext"
        @click="reader.nextPage()"
      >
        <span>{{ t('reader.goToNextPage') }}</span>
        <Icon :icon="ChevronRight" :size="20" />
      </button>
    </nav>
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
/* Surah name + Bismillah — identical markup/styling to ReadingSurface.vue's
   mushaf header, so the study panel doesn't look like a different app. */
.line {
  display: flex;
}
.line-surah {
  justify-content: center;
  padding: 0.75rem 0;
}
.surah-name-glyph {
  color: var(--color-accent);
  font-size: 1.7em;
  font-family: 'SurahNames', var(--font-arabic);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.line-basmala {
  justify-content: center;
  color: var(--color-accent);
  font-size: 1.7em;
  padding: 0.25rem 0 0.75rem;
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
.arabic.tajweed-glyphs {
  filter: var(--tajweed-glyph-filter, none);
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
.page-nav {
  display: flex;
  gap: 0.75rem;
  padding: 1.5rem 0 0.5rem;
}
.page-nav-btn {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 3.25rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: 600;
  transition: background var(--duration-fast), border-color var(--duration-fast);
}
.page-nav-btn:hover:not(:disabled) {
  background: var(--color-elevated);
  border-color: var(--color-accent);
}
.page-nav-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.page-nav-btn:disabled {
  opacity: 0.4;
}
</style>
