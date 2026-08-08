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
  /** location (`s:a:w`) → state class suffix. `hl-*` are the /preview route's
   * multi-color highlighter washes (core/navigation/previewRoute.ts); `mistake`
   * doubles as that route's default/red highlight, reusing the same class the
   * real mistake-marking feature uses. */
  wordStates?: Record<
    string,
    'mistake' | 'morphology' | 'selected' | 'hl-amber' | 'hl-blue' | 'hl-green' | 'hl-purple' | 'hl-teal'
  >
  /** word ids currently marked as mistakes (global, layout-independent). */
  mistakeIds?: Set<number>
  /** Word-by-word: show a per-word gloss beneath each word. */
  wbw?: boolean
  /** location → gloss text (for the active WBW language). */
  translations?: Record<string, string>
  /** WBW gloss language (for the `lang` attribute; en/bn are both LTR). */
  wbwLang?: string
  /** The ayah currently being recited, as `"surah:ayah"` — highlighted + scrolled to. */
  activeVerse?: string | null
  /** Follow the recited ayah by scrolling it into view (audio player preference). */
  autoScroll?: boolean
  /** Whether words look tappable (pointer cursor). Default `true`, matching every
   * existing consumer; the /preview route sets this `false` since it wires no tap
   * handler at all and shouldn't imply one. Purely visual — this component never
   * handles taps itself either way, callers do. */
  interactive?: boolean
  /** Override the measured font-scale factor from `fitLines()` below with this
   * value instead (still clamped to the same [0.35, 1.6] range). Unset by every
   * existing consumer, so their behavior is unchanged; the /preview route uses
   * this to keep several stacked pages at one shared size — see the `fit` emit. */
  fitFactor?: number
}>()

const emit = defineEmits<{
  /** Fires on every `fitLines()` run (mount + ResizeObserver refit) with the
   * factor *this* surface's own widest line measured — always the measured
   * value, never `fitFactor` echoed back, so a parent computing a shared
   * minimum across several mounted surfaces never feeds back a shrinking
   * loop. */
  fit: [factor: number]
}>()

// Indopak Nastaleeq needs more line-height and tighter tracking than QPC.
const metrics = computed(() =>
  props.layout === 'indopak'
    ? { lineHeight: 'var(--indopak-line-height)', letterSpacing: 'var(--indopak-tracking)' }
    : { lineHeight: 'var(--qpc-line-height)', letterSpacing: 'var(--qpc-tracking)' },
)

// The tajweed glyph font resolves to family `tj-p{n}` (vs. plain `qpc-p{n}`) —
// see core/fonts/fontPaths.ts. Its base ink is a COLR/CPAL-baked colour, not
// `currentColor`, so it needs the dark-theme correction (design/tokens.css
// `--tajweed-glyph-filter`); the ordinary glyph fonts already track `color`.
const isTajweedFont = computed(() => props.fontFamily.startsWith('tj-'))

/**
 * Legacy-parity surah header: the "SurahNames" font (design/tokens.css) maps
 * this exact zero-padded "NNNsurah" sequence — via the browser's default
 * `liga` OpenType feature — to one of 114 bespoke calligraphic header glyphs.
 * It isn't literal text a reader could select/copy, so the visible span is
 * `aria-hidden` and paired with the real name for assistive tech below.
 */
function surahNameGlyph(surah: number | '' | undefined): string {
  return surah ? `${String(surah).padStart(3, '0')}surah` : ''
}

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
 * Fit the 15 mushaf lines to fill the page column at a *single, uniform* size —
 * every line the same font-size, like a printed mushaf page. We measure each
 * line's natural width (justification momentarily off), then pick one scale
 * factor for the whole page: the largest that keeps the *widest* line within the
 * column (so nothing clips). That factor is applied to every line, and the
 * inherited `space-between` justification absorbs the residual on narrower lines
 * — no per-line size jumps (the earlier per-line scaling made some lines large
 * and others small, most visibly on phones). WBW is allowed to wrap, so it's
 * left alone.
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
  // Measure every line, then take the tightest fit as the shared page factor.
  const measured: { row: HTMLElement; base: number }[] = []
  let factor = Infinity
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
      measured.push({ row, base: parseFloat(getComputedStyle(row).fontSize) })
      factor = Math.min(factor, avail / content)
    } else {
      row.style.justifyContent = ''
    }
  }
  if (!measured.length || !Number.isFinite(factor)) {
    for (const { row } of measured) row.style.justifyContent = ''
    return
  }
  factor = Math.min(Math.max(factor, 0.35), 1.6)
  emit('fit', factor)
  // A parent coordinating several stacked surfaces (the /preview route) can
  // override the applied size with a shared minimum; every other consumer
  // leaves `fitFactor` unset, so `applied` is just `factor` and behavior is
  // identical to before this prop existed.
  const applied = props.fitFactor != null ? Math.min(Math.max(props.fitFactor, 0.35), 1.6) : factor
  for (const { row, base } of measured) {
    row.style.fontSize = `${base * applied}px` // identical size on every line
    row.style.justifyContent = '' // restore space-between to absorb the residual
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
// Re-fit when the page, script, column width, font, WBW state, or a parent's
// coordinated fitFactor override changes.
watch(
  () => [props.page, props.layout, props.pageWidth, props.fontFamily, props.wbw, props.fitFactor],
  scheduleFit,
)

// Auto-scroll the recited ayah into view (7.4). Only when it's offscreen, so we
// never fight the reader's own scroll; honours reduced-motion. `immediate` so a
// deep-link/surah/juz jump — which remounts this surface (`:key="reader.page"`
// in ReaderPager.vue) with `activeVerse` already set — still scrolls: a
// non-immediate watch only fires on a later *change*, and there isn't one here.
//
// Also re-checks on `fitFactor` (the /preview route's cross-page size
// coordination — see the `fit` emit above): that value can still be settling
// for a few beats after mount as slower sibling pages report in, rescaling
// *this* surface's own line heights and moving the target verse — a single
// page's own reader usage never sets `fitFactor`, so this is a no-op there.
watch(
  () => [props.activeVerse, props.fitFactor] as const,
  ([key]) => {
    if (!key || props.autoScroll === false) return
    void nextTick(() => {
      const root = surfaceEl.value
      const el = root?.querySelector<HTMLElement>(`.word[data-verse="${key}"]`)
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
  { immediate: true },
)
</script>

<template>
  <div
    ref="surfaceEl"
    class="surface"
    :class="{ 'surface-indopak': layout === 'indopak', 'surface-inert': interactive === false }"
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
        <span class="surah-name-glyph" aria-hidden="true">{{ surahNameGlyph(line.surah) }}</span>
        <span class="sr-only">{{ surahNames?.[String(line.surah)] ?? '' }}</span>
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
            { wbw, 'state-playing': activeVerse && `${w.surah}:${w.ayah}` === activeVerse },
          ]"
          :data-loc="w.location"
          :data-id="w.id"
          :data-verse="`${w.surah}:${w.ayah}`"
        >
          <span class="arabic" :class="{ 'tajweed-glyphs': isTajweedFont }">{{ w.text }}</span>
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
  padding: 0.25rem 0 0.75rem;
}
.word {
  padding: 0 0.06em;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard);
}
/* interactive=false (e.g. the /preview route, which wires no tap handler at
   all): words shouldn't look tappable. */
.surface-inert .word {
  cursor: default;
}
/* Some Indopak tokens carry a trailing waqf mark after a space (e.g. "عَلَیْهَا ؕ").
   Keep the word + its mark on one line so the mark never wraps into the gap. */
.arabic {
  white-space: nowrap;
}
.arabic.tajweed-glyphs {
  filter: var(--tajweed-glyph-filter, none);
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
/* The ayah being recited (7.4): a soft accent wash plus a hairline baseline rule,
   so the cue is subtle yet not carried by colour alone. */
.state-playing {
  background: color-mix(in oklab, var(--color-accent) 9%, transparent);
  box-shadow: inset 0 -1.5px 0 0 color-mix(in oklab, var(--color-accent) 45%, transparent);
  border-radius: var(--radius-sm);
}
/* /preview route's multi-color highlighter washes (core/navigation/previewRoute.ts).
   Same technique as `.state-mistake` above (colour + wavy underline), not a
   background — so every highlight colour, red included, reads as one visual
   language. `color` is a no-op under the tajweed glyph font (its ink is baked-in
   COLR/CPAL — see the isTajweedFont note above) exactly like it already is for
   `.state-mistake`; the underline is what actually carries the colour there,
   same as it always has for mistakes. The default/red highlight has no rule
   here — it reuses `.state-mistake` above verbatim. */
.state-hl-amber {
  color: var(--hl-amber);
  text-decoration: underline wavy var(--hl-amber);
  text-underline-offset: 0.35em;
}
.state-hl-blue {
  color: var(--hl-blue);
  text-decoration: underline wavy var(--hl-blue);
  text-underline-offset: 0.35em;
}
.state-hl-green {
  color: var(--hl-green);
  text-decoration: underline wavy var(--hl-green);
  text-underline-offset: 0.35em;
}
.state-hl-purple {
  color: var(--hl-purple);
  text-decoration: underline wavy var(--hl-purple);
  text-underline-offset: 0.35em;
}
.state-hl-teal {
  color: var(--hl-teal);
  text-decoration: underline wavy var(--hl-teal);
  text-underline-offset: 0.35em;
}
</style>
