<script setup lang="ts">
import { HIGHLIGHT_COLORS, type HighlightColor } from '@/core/navigation/previewRoute'
import { useI18n } from '@/core/i18n'

/**
 * The active paint color for mark-mistake mode — a persistent strip of the
 * same 6 colors `/preview` highlights use, always visible while marking so
 * switching color is one tap instead of a per-word popup (see ReaderPager's
 * `handleTap`: a tap on an unmarked word paints it with whichever swatch is
 * selected here; an already-marked word just un-marks, regardless of this
 * selection). Red is first/default (reader store's `markColor` starts there).
 *
 * Swatches carry no visible text label by design — just the color itself —
 * though each still has an accessible name for screen readers.
 */
const model = defineModel<HighlightColor>({ required: true })
const { t } = useI18n()

const SWATCH_VAR: Record<HighlightColor, string> = {
  red: 'var(--color-danger)',
  amber: 'var(--hl-amber)',
  blue: 'var(--hl-blue)',
  green: 'var(--hl-green)',
  purple: 'var(--hl-purple)',
  teal: 'var(--hl-teal)',
}

function onKey(e: KeyboardEvent, index: number) {
  const n = HIGHLIGHT_COLORS.length
  let next: number
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % n
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + n) % n
  else return
  e.preventDefault()
  model.value = HIGHLIGHT_COLORS[next]
}
</script>

<template>
  <div class="color-bar" role="radiogroup" :aria-label="t('reader.markColorGroup')">
    <button
      v-for="(color, i) in HIGHLIGHT_COLORS"
      :key="color"
      type="button"
      role="radio"
      class="swatch"
      :class="{ 'swatch-on': model === color }"
      :aria-checked="model === color"
      :aria-label="t(`reader.color.${color}`)"
      :tabindex="model === color ? 0 : -1"
      :style="{ '--swatch-color': SWATCH_VAR[color] }"
      @click="model = color"
      @keydown="onKey($event, i)"
    />
  </div>
</template>

<style scoped>
.color-bar {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg);
  overflow-x: auto;
}
.swatch {
  flex: 0 0 auto;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: var(--radius-full);
  background: var(--swatch-color);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--swatch-color) 60%, black 20%);
}
.swatch-on {
  box-shadow:
    0 0 0 2px var(--color-bg),
    0 0 0 4px var(--swatch-color);
}
.swatch:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
