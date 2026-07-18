<script setup lang="ts">
import { strengthTier, type JuzGroup } from '@/core/memorization/progressView'

/**
 * Page-by-Page revision heatmap (9.2) — 30 juz boxes, each a grid of page dots
 * shaded by revision strength (ported from the legacy "Page by Page" tab). The
 * legacy hand-interpolated RGB ramp becomes seven token-based `color-mix` steps
 * (tier 0 = not started → tier 6 = mastered), theme-aware by construction. Tap a
 * dot → that page in the reader.
 */
defineProps<{ groups: JuzGroup[]; strength: Map<number, number> }>()
const emit = defineEmits<{ select: [page: number] }>()

function tier(page: number, strength: Map<number, number>): number {
  return strengthTier(strength.get(page) ?? 0)
}
function label(page: number, t: number): string {
  return t === 0 ? `Page ${page} — not started` : `Page ${page} — ${t} revision${t === 1 ? '' : 's'}`
}
</script>

<template>
  <div class="page-dots">
    <div class="boxes">
      <section v-for="g in groups" :key="g.juz" class="box">
        <h3 class="box-title">Juz {{ g.juz }}</h3>
        <div class="dots">
          <button
            v-for="p in g.pages"
            :key="p"
            type="button"
            class="dot"
            :class="`tier-${tier(p, strength)}`"
            :aria-label="label(p, tier(p, strength))"
            :title="label(p, tier(p, strength))"
            @click="emit('select', p)"
          ></button>
        </div>
      </section>
    </div>

    <p class="legend">
      <span class="leg"><span class="dot tier-0" aria-hidden="true"></span>Not started</span>
      <span class="leg"><span class="dot tier-1" aria-hidden="true"></span>1 revision</span>
      <span class="leg"><span class="dot tier-4" aria-hidden="true"></span>4+ revisions</span>
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
/* Seven-step ramp: tier 0 = not started (muted), 1→6 light→dark success. */
.tier-0 {
  background: color-mix(in oklab, var(--color-text-muted) 28%, transparent);
}
.tier-1 {
  background: color-mix(in oklab, var(--color-success) 40%, var(--color-surface));
}
.tier-2 {
  background: color-mix(in oklab, var(--color-success) 52%, var(--color-surface));
}
.tier-3 {
  background: color-mix(in oklab, var(--color-success) 64%, var(--color-surface));
}
.tier-4 {
  background: color-mix(in oklab, var(--color-success) 76%, var(--color-surface));
}
.tier-5 {
  background: color-mix(in oklab, var(--color-success) 88%, var(--color-surface));
}
.tier-6 {
  background: var(--color-success);
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
