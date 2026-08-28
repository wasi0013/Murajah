<script setup lang="ts">
import { type JuzGroup } from '@/core/memorization/progressView'
import { effectiveRank, daysSince, bandByRank, type StrengthRank } from '@/core/memorization/strengthBands'
import type { ReviewSchedule } from '@/core/storage/userData'
import { useI18n } from '@/core/i18n'

const { t } = useI18n()

/**
 * Page-by-Page revision heatmap (9.2) — 30 juz boxes, each a grid of page dots
 * shaded by memorization band (see strengthBands.ts), effective/decay-capped so
 * a page neglected for years shows its true, lower band. Tap a dot → that page
 * in the reader.
 */
const props = defineProps<{
  groups: JuzGroup[]
  memorized: Set<number>
  strength: Map<number, number>
  reviewData: Map<number, ReviewSchedule>
}>()
const emit = defineEmits<{ select: [page: number] }>()

function level(page: number): StrengthRank {
  const days = daysSince(props.reviewData.get(page)?.lastReviewDate)
  return effectiveRank(props.memorized.has(page), props.strength.get(page) ?? 0, days)
}
function label(page: number, level: StrengthRank): string {
  if (level === 0) return t('heatmap.labelNotStarted', { page })
  return t('heatmap.labelBand', { page, band: t(`strengthBand.${bandByRank(level).labelKey}`) })
}

const ALL_RANKS: StrengthRank[] = [0, 1, 2, 3, 4, 5, 6]
</script>

<template>
  <div class="page-dots">
    <div class="boxes">
      <section v-for="g in groups" :key="g.juz" class="box">
        <h3 class="box-title">{{ t('common.juz', { n: g.juz }) }}</h3>
        <div class="dots">
          <button
            v-for="p in g.pages"
            :key="p"
            type="button"
            class="dot"
            :class="`band-${level(p)}`"
            :aria-label="label(p, level(p))"
            :title="label(p, level(p))"
            @click="emit('select', p)"
          ></button>
        </div>
      </section>
    </div>

    <p class="legend">
      <span v-for="band in ALL_RANKS" :key="band" class="leg">
        <span class="dot" :class="`band-${band}`" aria-hidden="true"></span>
        {{ band === 0 ? t('common.notStarted') : t(`strengthBand.${bandByRank(band).labelKey}`) }}
      </span>
    </p>
  </div>
</template>

<style scoped>
.boxes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
  gap: 0.6rem;
}
.box {
  padding: 0.55rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}
.box-title {
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--color-text-muted);
  margin-bottom: 0.4rem;
}
.dots {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(0.75rem, 1fr));
  gap: 3px;
}
.dot {
  aspect-ratio: 1;
  width: 100%;
  border-radius: var(--radius-full);
  border: 1px solid color-mix(in oklab, var(--color-text) 10%, transparent);
  cursor: pointer;
  padding: 0;
}
.dot:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
/* 7 memorization bands (see strengthBands.ts) — distinct hues, not a ramp. */
.band-0 {
  background: color-mix(in oklab, var(--color-text-muted) 28%, transparent);
}
.band-1 {
  background: var(--hl-amber);
}
.band-2 {
  background: var(--color-danger);
}
.band-3 {
  background: var(--hl-teal);
}
.band-4 {
  background: var(--hl-blue);
}
.band-5 {
  background: var(--color-success);
}
.band-6 {
  background: var(--color-mutqan-bg);
  border-color: var(--color-mutqan-border);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
  margin-top: 1rem;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.leg {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.legend .dot {
  width: 0.75rem;
  height: 0.75rem;
  aspect-ratio: auto;
  cursor: default;
}
</style>
