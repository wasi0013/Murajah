<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Layout, PageChunk, Word } from '@/core/data/types'

/**
 * Static styled mushaf page — the visual core the Phase 3 reader wraps with
 * virtualization + interaction. Renders a PageChunk line-by-line: centered
 * surah/basmallah lines and justified ayah lines whose words carry state
 * classes (mistake / morphology-active / selected).
 */
const props = defineProps<{
  page: PageChunk
  /** Resolved font-family from FontLoader (`qpc-p{n}` uthmani or `tj-p{n}` tajweed). */
  fontFamily: string
  /** Reading script — selects per-surface line-height / tracking metrics. */
  layout?: Layout
  surahNames?: Record<string, string>
  /** Mushaf page-column width (from the text-size setting); lines scale to fill it. */
  pageWidth?: string
  /** location (`s:a:w`) → state class suffix */
  wordStates?: Record<string, 'mistake' | 'morphology' | 'selected'>
  /** word ids currently marked as mistakes (global, layout-independent). */
  mistakeIds?: Set<number>
  /** Word-by-word: show a per-word gloss beneath each word. */
  wbw?: boolean
  /** location → gloss text (for the active WBW language). */
  translations?: Record<string, string>
  /** WBW gloss language (for the `lang` attribute; en/bn are both LTR). */
  wbwLang?: string
}>()

// Indopak Nastaleeq needs more line-height and tighter tracking than QPC.
const metrics = computed(() =>
  props.layout === 'indopak'
    ? { lineHeight: 'var(--indopak-line-height)', letterSpacing: 'var(--indopak-tracking)' }
    : { lineHeight: 'var(--qpc-line-height)', letterSpacing: 'var(--qpc-tracking)' },
)

interface RenderLine {
  type: string
  centered: boolean
  surah?: number | ''
  words: Word[]
}

const lines = computed<RenderLine[]>(() => {
  const byId = new Map(props.page.words.map((w) => [w.id, w]))
  return props.page.layout.map((line) => {
    const words: Word[] = []
    if (line.first_word_id !== '' && line.last_word_id !== '') {
      for (let id = +line.first_word_id; id <= +line.last_word_id; id++) {
        const w = byId.get(id)
        if (w) words.push(w)
      }
    }
    return {
      type: line.line_type,
      centered: Boolean(line.is_centered),
      surah: line.surah_number,
      words,
    }
  })
})

/**
 * Fit each of the 15 mushaf lines to fill the page column with the font's
 * *natural* word spacing (not stretched). Both scripts need this: QPC per-page
 * fonts render a line narrower than a wide column (so `space-between` would
 * stretch it) yet wider than a phone (so it would clip); Indopak's single
 * Nastaleeq font varies more still. We measure each line's natural width (with
 * justification momentarily off), then scale that line's font-size so it fills
 * the column — justified edge-to-edge like a printed mushaf, exactly 15 lines,
 * no stretch, no clip. The clamp keeps an outlier line near its neighbours'
 * size. WBW is allowed to wrap, so it's left alone.
 */
const surfaceEl = ref<HTMLElement>()

function fitLines() {
  const root = surfaceEl.value
  if (!root || props.wbw) return
  const rows = Array.from(root.querySelectorAll<HTMLElement>('.line-ayah'))
  // Reset size + drop justification so the measured width is the natural one.
  for (const row of rows) {
    row.style.fontSize = ''
    row.style.justifyContent = 'flex-start'
  }
  for (const row of rows) {
    const avail = row.clientWidth
    const words = row.children
    if (avail <= 0 || words.length === 0) {
      row.style.justifyContent = ''
      continue
    }
    let min = Infinity
    let max = -Infinity
    for (const w of words) {
      const r = w.getBoundingClientRect()
      if (r.left < min) min = r.left
      if (r.right > max) max = r.right
    }
    const content = max - min
    if (content > 0) {
      const base = parseFloat(getComputedStyle(row).fontSize)
      const factor = Math.min(Math.max(avail / content, 0.35), 1.6)
      row.style.fontSize = `${base * factor}px`
    }
    row.style.justifyContent = '' // restore space-between (absorbs sub-pixel residual)
  }
}

const scheduleFit = () => nextTick(fitLines)

let ro: ResizeObserver | undefined
onMounted(() => {
  scheduleFit()
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => fitLines())
    if (surfaceEl.value) ro.observe(surfaceEl.value)
  }
})
onBeforeUnmount(() => ro?.disconnect())
// Re-fit when the page, script, column width, font, or WBW state changes.
watch(
  () => [props.page, props.layout, props.pageWidth, props.fontFamily, props.wbw],
  scheduleFit,
)
</script>

<template>
  <div
    ref="surfaceEl"
    class="surface"
    :class="{ 'surface-indopak': layout === 'indopak' }"
    dir="rtl"
    lang="ar"
    :style="{
      fontFamily,
      fontSize: 'var(--reading-size-md)',
      lineHeight: metrics.lineHeight,
      letterSpacing: metrics.letterSpacing,
      maxWidth: pageWidth ? `min(${pageWidth}, 100%)` : undefined,
    }"
  >
    <template v-for="(line, i) in lines" :key="i">
      <div v-if="line.type === 'surah_name'" class="line line-surah">
        {{ surahNames?.[String(line.surah)] ?? 'سورة' }}
      </div>
      <div v-else-if="line.type === 'basmallah'" class="line line-basmala">﷽</div>
      <div v-else class="line line-ayah" :class="{ wbw }">
        <span
          v-for="w in line.words"
          :key="w.id"
          class="word"
          :class="[
            mistakeIds?.has(w.id) ? 'state-mistake' : '',
            wordStates?.[w.location] ? `state-${wordStates[w.location]}` : '',
            { wbw },
          ]"
          :data-loc="w.location"
          :data-id="w.id"
        >
          <span class="arabic">{{ w.text }}</span>
          <span v-if="wbw" class="gloss" dir="ltr" :lang="wbwLang">{{
            translations?.[w.location] ?? ''
          }}</span>
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.surface {
  color: var(--color-text);
  padding: 1rem 0.5rem;
  /* Constrain to a mushaf-page column and centre it, so space-between line
     justification reads naturally on wide desktops instead of stretching
     full-bleed. Phones (narrower than this) are unaffected. */
  max-width: 43rem;
  margin-inline: auto;
  /* line-height + letter-spacing are set inline (per-layout metrics). */
}
.line {
  display: flex;
}
.line-ayah {
  justify-content: space-between;
  flex-wrap: nowrap;
  /* Subtle per-line rule in every mode, so the 15 mushaf lines are always
     distinct (consistent with WBW) — an aid for line-by-line hifz. */
  padding-bottom: 0.3em;
  border-bottom: 1px solid color-mix(in oklab, var(--color-border) 32%, transparent);
}
/* Indopak (single font): each non-WBW line is scaled to fill the column in
   script (fitIndopakLines), then space-between (inherited) justifies the tiny
   residual — mushaf-style edge-to-edge justification, exactly 15 lines. */
/* WBW mode: glosses widen words, so lines wrap and centre instead of strict
   justification, keeping each word+gloss as an intact unit. The per-line rule
   (above) keeps the 15 mushaf lines perceivable even when one wraps. */
.line-ayah.wbw {
  justify-content: center;
  flex-wrap: wrap;
  align-items: flex-start;
  row-gap: 0.5em;
  column-gap: 0.4em;
  padding-bottom: 0.55em;
}
.line-surah {
  justify-content: center;
  color: var(--color-accent);
  font-size: 0.7em;
  padding: 0.75rem 0;
  font-family: var(--font-arabic);
}
.line-basmala {
  justify-content: center;
  color: var(--color-accent);
  padding: 0.25rem 0 0.75rem;
}
.word {
  padding: 0 0.06em;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard);
}
/* Some Indopak tokens carry a trailing waqf mark after a space (e.g. "عَلَیْهَا ؕ").
   Keep the word + its mark on one line so the mark never wraps into the gap. */
.arabic {
  white-space: nowrap;
}
.word.wbw {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  vertical-align: top;
}
.gloss {
  display: block;
  font-family: var(--font-sans);
  font-size: 0.4em;
  line-height: 1.25;
  letter-spacing: normal;
  color: var(--color-text-muted);
  text-align: center;
  /* Reserve ~one line so streamed translations don't shift layout. */
  min-height: 1.25em;
  max-width: 10em;
  margin-top: 0.35em;
}
/* Word states (token-driven, distinguishable in every theme) */
.state-mistake {
  color: var(--color-danger);
  text-decoration: underline wavy var(--color-danger);
  text-underline-offset: 0.35em;
}
.state-morphology {
  background: color-mix(in oklab, var(--color-accent) 22%, transparent);
}
.state-selected {
  background: var(--color-elevated);
  box-shadow: 0 0 0 1px var(--color-border);
}
</style>
