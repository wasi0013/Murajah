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

function cellStyle(c: PageCell): Record<string, string> {
  if (!c.memorized) return {}
  const pct = 22 + c.tier * 12 // 22% (tier 0) … 94% (tier 6)
  return {
    background: `color-mix(in oklab, var(--color-success) ${pct}%, var(--color-surface))`,
    color: c.tier >= 3 ? 'var(--color-on-status)' : 'var(--color-text)',
    borderColor: 'transparent',
  }
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
    <section v-for="g in juzGroups" :key="g.juz" class="juz" :aria-label="`Juz ${g.juz}`">
      <header class="juz-head">
        <span class="juz-name">Juz {{ g.juz }}</span>
        <span class="juz-count">
          {{ juzProgress(g, progress.memorized).memorized }}/{{ g.pages.length }}
        </span>
        <span
          class="juz-bar"
          role="progressbar"
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
