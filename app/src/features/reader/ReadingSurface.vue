<script setup lang="ts">
import { computed } from 'vue'
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
  /** CSS font-size for the Arabic (from the text-size setting). */
  textSize?: string
  /** location (`s:a:w`) → state class suffix */
  wordStates?: Record<string, 'mistake' | 'morphology' | 'selected'>
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
</script>

<template>
  <div
    class="surface"
    dir="rtl"
    lang="ar"
    :style="{
      fontFamily,
      fontSize: textSize ?? 'var(--reading-size-md)',
      lineHeight: metrics.lineHeight,
      letterSpacing: metrics.letterSpacing,
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
          :class="[wordStates?.[w.location] ? `state-${wordStates[w.location]}` : '', { wbw }]"
          :data-loc="w.location"
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
  /* line-height + letter-spacing are set inline (per-layout metrics). */
}
.line {
  display: flex;
}
.line-ayah {
  justify-content: space-between;
  flex-wrap: nowrap;
}
/* WBW mode: glosses widen words, so lines wrap and centre instead of strict
   justification, keeping each word+gloss as an intact unit. */
.line-ayah.wbw {
  justify-content: center;
  flex-wrap: wrap;
  align-items: flex-start;
  row-gap: 0.5em;
  column-gap: 0.4em;
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
