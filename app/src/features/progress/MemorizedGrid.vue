<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useMemorization } from '@/composables/useMemorization'
import { TOTAL_PAGES } from '@/stores/progress'
import { juzProgress, juzBandSegments, type JuzGroup, type PageCell } from '@/core/memorization/progressView'
import { STRENGTH_BANDS, bandByRank, type StrengthRank } from '@/core/memorization/strengthBands'
import { bandColorVars } from '@/core/memorization/bandColors'
import { useI18n } from '@/core/i18n'

const { t } = useI18n()

/**
 * The canonical 604-page memorization grid, grouped by juz. Each cell is colour-
 * coded by memorization strength (a token-based success ramp) with the page
 * number always shown and mistakes flagged by a dot — colour is never the only
 * cue. Tapping a cell asks the parent to open its per-page sheet.
 *
 * Keyboard: the cells form a single roving-tabindex group (one Tab stop; arrows
 * move focus — Left/Right by one page, Up/Down by a row, Home/End to the ends).
 * A juz-jump bar scrolls the grid to any juz.
 */
const { juzGroups, cell, progress } = useMemorization()
const emit = defineEmits<{ select: [page: number] }>()

const gridRoot = ref<HTMLElement>()
// The page whose cell holds the group's single tabindex=0 (roving tabindex).
const activePage = ref(1)

function select(page: number): void {
  activePage.value = page
  emit('select', page)
}

/** Columns in the responsive grid, read live from the focused cell's row. */
function columnsOf(cellEl: HTMLElement): number {
  const cells = cellEl.closest('.cells')
  if (!(cells instanceof HTMLElement)) return 1
  return Math.max(1, getComputedStyle(cells).gridTemplateColumns.split(' ').filter(Boolean).length)
}

function focusPage(page: number): void {
  const clamped = Math.max(1, Math.min(TOTAL_PAGES, page))
  activePage.value = clamped
  void nextTick(() => {
    gridRoot.value?.querySelector<HTMLButtonElement>(`[data-page="${clamped}"]`)?.focus()
  })
}

function onKeydown(e: KeyboardEvent): void {
  const target = e.target
  if (!(target instanceof HTMLElement) || !target.dataset.page) return
  const cur = Number(target.dataset.page)
  let next: number | null = null
  switch (e.key) {
    case 'ArrowRight': next = cur + 1; break
    case 'ArrowLeft': next = cur - 1; break
    case 'ArrowDown': next = cur + columnsOf(target); break
    case 'ArrowUp': next = cur - columnsOf(target); break
    case 'Home': next = 1; break
    case 'End': next = TOTAL_PAGES; break
    default: return
  }
  e.preventDefault()
  if (next !== null) focusPage(next)
}

/** Scroll the grid to a juz and arm its first page for the next Tab-in. */
function jumpToJuz(juz: number, startPage: number): void {
  const section = gridRoot.value?.querySelector(`[data-juz="${juz}"]`)
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  section?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  activePage.value = startPage
}

function cellStyle(c: PageCell): Record<string, string> {
  // Band 0 ("Not Memorized") renders as a plain, uncoloured cell even in the
  // rare memorized-but-strength-0 case (reachable via the sheet's Toggle
  // without ever setting a level) — there's no readable single text colour
  // for --color-border's very pale/very dark bg across every theme, and
  // "memorized + Not Memorized" would be a confusing label anyway.
  if (!c.memorized || c.level === 0) return {}
  const v = bandColorVars(c.level)
  return { background: v.bg, color: v.text, borderColor: v.border }
}

function bandLabel(level: StrengthRank): string {
  return t(`strengthBand.${bandByRank(level).labelKey}`)
}

function cellLabel(c: PageCell): string {
  const parts = [t('common.page', { n: c.page })]
  parts.push(c.memorized ? t('grid.cell.memorized') : t('grid.cell.notMemorized'))
  if (c.memorized && c.level > 0) parts.push(bandLabel(c.level))
  if (c.mistakes > 0) parts.push(t('grid.cell.mistakes', { n: c.mistakes }))
  return parts.join(', ')
}

/**
 * The juz header's mini progress bar, segmented by strength band instead of
 * one flat "% memorized" fill — so it reads consistently with the multi-
 * coloured cells directly beneath it (previously always plain green,
 * regardless of how strong/weak the memorized pages actually were).
 */
function juzSegments(g: JuzGroup) {
  return juzBandSegments(g, progress.memorized, progress.strength, progress.reviewData)
}

/**
 * The bar's aria-label: `aria-valuenow`/`aria-valuemax` alone still describe
 * only "X of Y memorized", same as before this bar had a colour breakdown at
 * all — the band composition, the whole point of the change, would otherwise
 * be colour-only information. Appends each segment as "{percent}% {band}",
 * same list-building pattern as `cellLabel` above.
 */
function juzBarLabel(g: JuzGroup): string {
  const parts = [t('grid.juzMemorized', { n: g.juz })]
  for (const seg of juzSegments(g)) {
    parts.push(t('grid.juzBandShare', { percent: Math.round(seg.percent), band: bandLabel(seg.rank) }))
  }
  return parts.join(', ')
}
</script>

<template>
  <div ref="gridRoot" class="grid-root" @keydown="onKeydown">
    <nav class="juz-jump" :aria-label="t('grid.jumpAria')">
      <button
        v-for="g in juzGroups"
        :key="g.juz"
        type="button"
        class="juz-chip"
        :aria-label="t('grid.jumpTo', { n: g.juz })"
        @click="jumpToJuz(g.juz, g.startPage)"
      >
        {{ g.juz }}
      </button>
    </nav>

    <div class="legend" aria-hidden="true">
      <span class="legend-item">
        <span class="swatch swatch-empty" />
        {{ t('common.notStarted') }}
      </span>
      <span v-for="band in STRENGTH_BANDS.slice(1)" :key="band.rank" class="legend-item">
        <span class="swatch" :style="{ background: bandColorVars(band.rank).bg, borderColor: bandColorVars(band.rank).border }" />
        {{ bandLabel(band.rank) }}
      </span>
      <span class="legend-item">
        <span class="swatch swatch-mistake"><span class="dot" /></span>
        {{ t('grid.legendMistakes') }}
      </span>
    </div>

    <section
      v-for="g in juzGroups"
      :key="g.juz"
      class="juz"
      :data-juz="g.juz"
      :aria-label="t('common.juz', { n: g.juz })"
    >
      <header class="juz-head">
        <span class="juz-name">{{ t('common.juz', { n: g.juz }) }}</span>
        <span class="juz-count">
          {{ juzProgress(g, progress.memorized).memorized }}/{{ g.pages.length }}
        </span>
        <span
          class="juz-bar"
          role="progressbar"
          :aria-label="juzBarLabel(g)"
          :aria-valuemin="0"
          :aria-valuenow="juzProgress(g, progress.memorized).memorized"
          :aria-valuemax="g.pages.length"
        >
          <span
            v-for="seg in juzSegments(g)"
            :key="seg.rank"
            class="juz-fill"
            :style="{ width: `${seg.percent}%`, background: bandColorVars(seg.rank).bg }"
          />
        </span>
      </header>
      <div class="cells">
        <button
          v-for="page in g.pages"
          :key="page"
          type="button"
          class="cell"
          :data-page="page"
          :tabindex="page === activePage ? 0 : -1"
          :class="{ mistake: cell(page).mistakes > 0 }"
          :style="cellStyle(cell(page))"
          :aria-label="cellLabel(cell(page))"
          @click="select(page)"
          @focus="activePage = page"
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
.juz-jump {
  display: flex;
  gap: 0.3rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
  scrollbar-width: thin;
}
.juz-chip {
  flex: 0 0 auto;
  min-width: 1.9rem;
  height: 1.9rem;
  padding: 0 0.35rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  cursor: pointer;
}
.juz-chip:hover {
  border-color: var(--color-accent);
  color: var(--color-text);
}
.juz-chip:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
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
  border: 1px solid transparent;
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
  display: flex;
  height: 0.35rem;
  border-radius: var(--radius-full);
  background: var(--color-elevated);
  overflow: hidden;
}
/* One stretch per strength band present in the juz (see juzSegments) — inline
   `background` per segment, sorted strongest-first by the view-model so the
   bar reads left-to-right exactly like the legend above it. The unfilled
   remainder is just the bar's own background showing through; Not Memorized
   never gets a segment of its own. */
.juz-fill {
  display: block;
  height: 100%;
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
