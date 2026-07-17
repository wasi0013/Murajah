<script setup lang="ts">
import { useMemorization } from '@/composables/useMemorization'
import { juzProgress, type PageCell } from '@/core/memorization/progressView'

/**
 * The canonical 604-page memorization grid, grouped by juz. Each cell is colour-
 * coded by memorization strength (a token-based success ramp) with the page
 * number always shown and mistakes flagged by a dot — colour is never the only
 * cue. Tapping a cell asks the parent to open its per-page sheet.
 */
const { juzGroups, cell, progress } = useMemorization()
const emit = defineEmits<{ select: [page: number] }>()

/** Success-ramp background for a strength tier (0…6): 22% → 94% mix. */
function tierBg(tier: number): string {
  return `color-mix(in oklab, var(--color-success) ${22 + tier * 12}%, var(--color-surface))`
}

function cellStyle(c: PageCell): Record<string, string> {
  if (!c.memorized) return {}
  return {
    background: tierBg(c.tier),
    color: c.tier >= 3 ? 'var(--color-on-status)' : 'var(--color-text)',
    borderColor: 'transparent',
  }
}

function rampStyle(tier: number): Record<string, string> {
  return { background: tierBg(tier) }
}

function cellLabel(c: PageCell): string {
  const parts = [`Page ${c.page}`]
  if (c.memorized) parts.push('memorized')
  else parts.push('not memorized')
  if (c.strength > 0) parts.push(`strength ${c.strength}`)
  if (c.mistakes > 0) parts.push(`${c.mistakes} mistakes`)
  return parts.join(', ')
}
</script>

<template>
  <div class="grid-root">
    <div class="legend" aria-hidden="true">
      <span class="legend-item">
        <span class="swatch swatch-empty" />
        Not started
      </span>
      <span class="legend-item">
        <span class="ramp">
          <span v-for="t in 7" :key="t" class="ramp-step" :style="rampStyle(t - 1)" />
        </span>
        Weaker → stronger
      </span>
      <span class="legend-item">
        <span class="swatch swatch-mistake"><span class="dot" /></span>
        Has mistakes
      </span>
    </div>

    <section v-for="g in juzGroups" :key="g.juz" class="juz" :aria-label="`Juz ${g.juz}`">
      <header class="juz-head">
        <span class="juz-name">Juz {{ g.juz }}</span>
        <span class="juz-count">
          {{ juzProgress(g, progress.memorized).memorized }}/{{ g.pages.length }}
        </span>
        <span
          class="juz-bar"
          role="progressbar"
          :aria-label="`Juz ${g.juz} memorized`"
          :aria-valuemin="0"
          :aria-valuenow="juzProgress(g, progress.memorized).memorized"
          :aria-valuemax="g.pages.length"
        >
          <span
            class="juz-fill"
            :style="{
              width: `${(juzProgress(g, progress.memorized).memorized / g.pages.length) * 100}%`,
            }"
          />
        </span>
      </header>
      <div class="cells">
        <button
          v-for="page in g.pages"
          :key="page"
          type="button"
          class="cell"
          :class="{ mistake: cell(page).mistakes > 0 }"
          :style="cellStyle(cell(page))"
          :aria-label="cellLabel(cell(page))"
          @click="emit('select', page)"
        >
          {{ page }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.grid-root {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.swatch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  border-radius: var(--radius-sm);
  position: relative;
}
.swatch-empty {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}
.swatch-mistake {
  background: color-mix(in oklab, var(--color-success) 46%, var(--color-surface));
}
.swatch-mistake .dot {
  position: absolute;
  top: 1px;
  inset-inline-end: 1px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--color-danger);
}
.ramp {
  display: inline-flex;
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.ramp-step {
  width: 0.6rem;
  height: 1rem;
}
.juz {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.juz-head {
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: center;
  gap: 0.6rem;
}
.juz-name {
  font-size: var(--text-sm);
  font-weight: 600;
}
.juz-count {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
.juz-bar {
  height: 0.35rem;
  border-radius: var(--radius-full);
  background: var(--color-elevated);
  overflow: hidden;
}
.juz-fill {
  display: block;
  height: 100%;
  background: var(--color-success);
  border-radius: var(--radius-full);
}
.cells {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(2.1rem, 1fr));
  gap: 0.3rem;
}
.cell {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  position: relative;
}
.cell:hover {
  border-color: var(--color-accent);
}
.cell:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
/* Mistakes: a danger dot — a status cue independent of the fill colour. */
.cell.mistake::after {
  content: '';
  position: absolute;
  top: 2px;
  inset-inline-end: 2px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-danger);
}
</style>
