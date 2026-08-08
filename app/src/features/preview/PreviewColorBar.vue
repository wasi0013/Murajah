<script setup lang="ts">
import { HIGHLIGHT_COLORS, type HighlightColor } from '@/core/navigation/previewRoute'
import { useI18n } from '@/core/i18n'

/**
 * The active paint color for /preview's own tap-to-highlight editor: six
 * small dots inline in the header, next to the surah/range button, red
 * selected by default. Tapping an unmarked word (see PreviewView's
 * `onWordTap`) paints it with whichever dot is active; an already-highlighted
 * word just clears, regardless of this selection — no per-word popup,
 * switching color is one tap on a dot.
 *
 * Compact by design — no label row of its own, just the dots — so the header
 * stays a single line instead of growing a second bar underneath it.
 * Swatches carry no visible text label, though each still has an accessible
 * name for screen readers.
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
  <div class="dots" role="radiogroup" :aria-label="t('preview.colorGroup')">
    <button
      v-for="(color, i) in HIGHLIGHT_COLORS"
      :key="color"
      type="button"
      role="radio"
      class="dot"
      :class="{ 'dot-on': model === color }"
      :aria-checked="model === color"
      :aria-label="t(`preview.color.${color}`)"
      :tabindex="model === color ? 0 : -1"
      :style="{ '--dot-color': SWATCH_VAR[color] }"
      @click="model = color"
      @keydown="onKey($event, i)"
    />
  </div>
</template>

<style scoped>
.dots {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex: 0 0 auto;
}
.dot {
  flex: 0 0 auto;
  width: 1.05rem;
  height: 1.05rem;
  border-radius: var(--radius-full);
  background: var(--dot-color);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--dot-color) 60%, black 20%);
}
.dot-on {
  box-shadow:
    0 0 0 2px var(--color-bg),
    0 0 0 3.5px var(--dot-color);
}
.dot:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
