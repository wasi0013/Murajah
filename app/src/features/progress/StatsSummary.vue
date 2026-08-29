<script setup lang="ts">
import { computed } from 'vue'
import { BookOpen, Clock, Headphones, FileWarning, Target } from 'lucide-vue-next'
import type { MemorizationStats } from '@/core/memorization/progressView'
import { formatReadingTime } from '@/core/memorization/progressView'
import { bandForStrength, bandByRank } from '@/core/memorization/strengthBands'
import { bandColorVars, bandColor } from '@/core/memorization/bandColors'
import { semicircleGaugeDash, semicircleLength } from '@/core/memorization/gauge'
import { useI18n } from '@/core/i18n'
import Icon from '@/components/Icon.vue'

const { t } = useI18n()

const props = defineProps<{ stats: MemorizationStats }>()

/**
 * The Progress overview's summary row (redesign: icon-badged cards instead
 * of a flat text grid). The reading/listening/mistakes cards each carry a
 * small decorative graphic (a growth curve, a waveform, an ascending bar
 * staircase) — at the user's explicit direction, these are FIXED, symbolic
 * ornament, not derived from `stats` in any way. This app has no honest
 * day-by-day history for those three metrics (only cumulative totals — see
 * `stores/progress.ts`), so the shapes below must stay hand-drawn constants;
 * do not wire them to real numbers without that history actually existing.
 * The two graphics that ARE bound to real values are the pages progress bar
 * and the average-strength gauge further down — both read `props.stats`
 * directly.
 */
const hasanahFmt = computed(() => props.stats.totalHasanah.toLocaleString('en-US'))
const readingTimeFmt = computed(() => formatReadingTime(props.stats.readingSeconds))
const listeningTimeFmt = computed(() => formatReadingTime(props.stats.listeningSeconds))

// Fixed, symbolic decoration for the three cards with no honest per-day
// history (see doc comment above) — never computed from `stats`.
const WAVE_BAR_HEIGHTS = [10, 16, 24, 32, 24, 34, 26, 18, 28, 20, 14, 22, 12]
const MISTAKE_BAR_HEIGHTS = [14, 22, 30, 38, 44]

// The average-strength gauge reuses the SAME 7-band system + colours as the
// page grid (strengthBands.ts / bandColors.ts) rather than inventing a
// parallel "Excellent/Good/Fair" vocabulary — one set of level names for the
// whole Progress view. `averageStrength` is a raw, unbounded per-page
// counter average (see MemorizationStats's doc comment) so the gauge visual
// clamps at 100 ("out of 100") while the printed number stays the honest,
// uncapped value.
const GAUGE_RADIUS = 52
const gaugeRank = computed(() => bandForStrength(props.stats.averageStrength).rank)
const gaugeVars = computed(() => bandColorVars(gaugeRank.value))
const gaugeAccent = computed(() => bandColor(gaugeRank.value))
const gaugeLabel = computed(() => t(`strengthBand.${bandByRank(gaugeRank.value).labelKey}`))
const gaugeTrackLength = semicircleLength(GAUGE_RADIUS)
const gaugeDash = computed(() => semicircleGaugeDash(props.stats.averageStrength, GAUGE_RADIUS))
</script>

<template>
  <section class="stats" :aria-label="t('progress.summaryAria')">
    <div class="row hero-row">
      <div class="stat stat--pages">
        <div class="stat-head">
          <span class="badge badge-accent"><Icon :icon="BookOpen" :size="18" /></span>
          <span class="stat-label">{{ t('progress.stats.pagesLabel') }}</span>
        </div>
        <span class="stat-n">{{ stats.memorizedCount }}<span class="stat-of">/{{ stats.totalPages }}</span></span>
        <div
          class="bar"
          role="progressbar"
          :aria-label="t('progress.stats.pagesLabel')"
          :aria-valuemin="0"
          :aria-valuenow="stats.memorizedCount"
          :aria-valuemax="stats.totalPages"
        >
          <span class="bar-fill" :style="{ width: `${stats.percent}%` }" />
        </div>
        <span class="stat-l">{{ t('progress.stats.pagesPercent', { percent: stats.percent }) }}</span>
      </div>

      <div class="stat stat--hasanah">
        <!-- A soft mosque-skyline silhouette (three arches + a finial) —
             pure decoration, echoes the reward's spiritual context without
             competing with the number. Plain arcs, no freehand curves. -->
        <svg class="skyline" viewBox="0 0 150 90" aria-hidden="true">
          <path d="M8 88 L8 50 A11 11 0 0 1 30 50 L30 88" />
          <path d="M60 88 L60 30 A20 20 0 0 1 100 30 L100 88" />
          <path d="M118 88 L118 55 A11 11 0 0 1 140 55 L140 88" />
          <circle cx="80" cy="24" r="3" />
        </svg>
        <div class="stat-head">
          <span class="badge badge-amber">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
              <!-- The Islamic 8-point star (Rub el Hizb/khatam) — two squares
                   overlaid 45° apart, the classic construction seen across
                   Quranic manuscripts and tilework — with a small rosette
                   centre. Plain primitives, inherits currentColor like every
                   lucide icon elsewhere in this app. -->
              <rect x="5" y="5" width="14" height="14" rx="1" />
              <rect x="5" y="5" width="14" height="14" rx="1" transform="rotate(45 12 12)" />
              <circle cx="12" cy="12" r="2.6" />
            </svg>
          </span>
          <span class="stat-label">{{ t('progress.stats.hasanah') }}</span>
        </div>
        <span class="stat-n stat-n--amber">{{ hasanahFmt }}</span>
      </div>
    </div>

    <div class="row mid-row">
      <div class="stat stat--reading">
        <span class="badge badge-teal"><Icon :icon="Clock" :size="18" /></span>
        <span class="stat-n">{{ readingTimeFmt }}</span>
        <span class="stat-l">{{ t('progress.stats.readingTime') }}</span>
        <!-- Symbolic growth curve — fixed shape, not plotted from data (see
             doc comment above). Sits in normal flow so it can never be
             clipped by the card's rounded corners at any width. -->
        <svg class="decor decor-line" viewBox="0 0 160 44" preserveAspectRatio="none" aria-hidden="true">
          <path class="decor-fill" d="M0,36 C18,38 32,22 50,25 C68,28 80,10 100,13 C118,16 136,5 156,6 L160,6 L160,44 L0,44 Z" />
          <path class="decor-line-stroke" d="M0,36 C18,38 32,22 50,25 C68,28 80,10 100,13 C118,16 136,5 156,6" />
          <circle class="decor-dot" cx="156" cy="6" r="3" />
        </svg>
      </div>

      <div class="stat stat--listening">
        <span class="badge badge-blue"><Icon :icon="Headphones" :size="18" /></span>
        <span class="stat-n">{{ listeningTimeFmt }}</span>
        <span class="stat-l">{{ t('progress.stats.listeningTime') }}</span>
        <!-- Symbolic waveform — fixed bar heights, not derived from actual
             listening data (see doc comment above). -->
        <svg class="decor decor-wave" viewBox="0 0 160 44" preserveAspectRatio="none" aria-hidden="true">
          <rect
            v-for="(h, i) in WAVE_BAR_HEIGHTS"
            :key="i"
            :x="i * 12 + 2"
            :y="(44 - h) / 2"
            width="5"
            :height="h"
            rx="2.5"
          />
        </svg>
      </div>

      <div class="stat stat--mistakes">
        <span class="badge badge-danger"><Icon :icon="FileWarning" :size="18" /></span>
        <span class="stat-n">{{ stats.mistakePages }}</span>
        <span class="stat-l">{{ t('progress.stats.mistakePages') }}</span>
        <!-- Symbolic ascending staircase — fixed heights, purely a "needs
             attention" motif, not a real severity chart (see doc comment
             above). Right/bottom-anchored so it reads as sitting on a
             baseline at any card width. -->
        <svg class="decor decor-bars" viewBox="0 0 160 44" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">
          <rect
            v-for="(h, i) in MISTAKE_BAR_HEIGHTS"
            :key="i"
            :x="70 + i * 18"
            :y="44 - h"
            width="10"
            :height="h"
            rx="2.5"
            :style="{ opacity: 0.3 + i * 0.1 }"
          />
        </svg>
      </div>
    </div>

    <div class="row strength-row">
      <div class="stat stat--strength">
        <div class="stat-head">
          <span class="badge" :style="{ background: `color-mix(in oklab, ${gaugeAccent} 16%, var(--color-surface))`, color: gaugeAccent }">
            <Icon :icon="Target" :size="18" />
          </span>
          <span class="stat-label">{{ t('progress.stats.avgStrength') }}</span>
          <span class="pill" :style="{ background: gaugeVars.bg, color: gaugeVars.text }">{{ gaugeLabel }}</span>
        </div>
        <div class="gauge-row">
          <span class="stat-n">{{ stats.averageStrength }}</span>
          <svg
            class="gauge"
            viewBox="0 0 120 66"
            role="img"
            :aria-label="t('progress.stats.avgStrengthAria', { value: stats.averageStrength, band: gaugeLabel })"
          >
            <path class="gauge-track" d="M8 60 A52 52 0 0 1 112 60" />
            <path
              class="gauge-fill"
              d="M8 60 A52 52 0 0 1 112 60"
              :style="{
                stroke: gaugeAccent,
                strokeDasharray: gaugeTrackLength,
                strokeDashoffset: gaugeDash.dashoffset,
              }"
            />
          </svg>
        </div>
        <span class="stat-l gauge-caption">{{ t('progress.stats.avgStrengthScale') }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.stats {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 46rem;
  margin: 1rem auto 0;
  padding: 0 1rem;
}
.row {
  display: grid;
  gap: 0.75rem;
}
.hero-row {
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
}
.mid-row {
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
}
/* The strength card has far less content per pixel than the others (a badge
   row + one number + a gauge) — stretching it across the full 46rem row
   like the hero/mid cards left a wide dead gap between the number and the
   gauge. Cap it and let it sit at the row's start (both directions) instead
   of stretching to fill. */
.strength-row {
  display: block;
}
.stat--strength {
  max-width: 22rem;
}
.stat {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1rem 1.1rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.stat-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.15rem;
}
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--radius-full);
}
.badge-accent { background: color-mix(in oklab, var(--color-accent) 14%, var(--color-surface)); color: var(--color-accent); }
.badge-amber { background: color-mix(in oklab, var(--hl-amber) 20%, var(--color-surface)); color: var(--hl-amber); }
.badge-teal { background: color-mix(in oklab, var(--hl-teal) 16%, var(--color-surface)); color: var(--hl-teal); }
.badge-blue { background: color-mix(in oklab, var(--hl-blue) 16%, var(--color-surface)); color: var(--hl-blue); }
.badge-danger { background: color-mix(in oklab, var(--color-danger) 14%, var(--color-surface)); color: var(--color-danger); }
.stat-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}
.stat-n {
  font-size: var(--text-2xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-accent);
  line-height: 1.1;
}
.stat-n--amber {
  color: var(--hl-amber);
}
.stat-of {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  font-weight: 500;
}
.stat-l {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.bar {
  height: 0.5rem;
  border-radius: var(--radius-full);
  background: var(--color-elevated);
  overflow: hidden;
}
.bar-fill {
  display: block;
  height: 100%;
  background: var(--color-accent);
  border-radius: inherit;
}

/* Decorative graphics for the mid-row cards — fixed, symbolic shapes (see
   the doc comment in <script setup>), never data. Sits in normal flow
   (rather than absolutely positioned over a negative offset) and is pushed
   to the card's bottom edge with `margin-top: auto`, so at any card width —
   down to the narrowest mobile column — it stays fully inside the card's
   padding and is never clipped by the rounded corners. */
.decor {
  display: block;
  width: 100%;
  height: 2.5rem;
  margin-top: auto;
  pointer-events: none;
}
.decor-fill {
  fill: var(--hl-teal);
  opacity: 0.14;
}
.decor-line-stroke {
  fill: none;
  stroke: var(--hl-teal);
  stroke-width: 2;
  stroke-linecap: round;
  opacity: 0.55;
}
.decor-dot {
  fill: var(--hl-teal);
}
.decor-wave rect {
  fill: var(--hl-blue);
  opacity: 0.45;
}
.decor-bars rect {
  fill: var(--color-danger);
}

.skyline {
  position: absolute;
  inset-inline-end: 0.5rem;
  top: 0.5rem;
  width: 6.5rem;
  height: auto;
  fill: none;
  stroke: var(--hl-amber);
  stroke-width: 1.5;
  opacity: 0.18;
  pointer-events: none;
}
.skyline circle {
  fill: var(--hl-amber);
  stroke: none;
}

.gauge-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.gauge {
  width: 6.5rem;
  height: auto;
  flex: 0 0 auto;
  margin-inline-start: auto;
}
.gauge-track {
  fill: none;
  stroke: var(--color-elevated);
  stroke-width: 8;
  stroke-linecap: round;
}
.gauge-fill {
  fill: none;
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dashoffset var(--duration-slow) var(--ease-standard);
}
.gauge-caption {
  text-align: end;
}
.pill {
  margin-inline-start: auto;
  padding: 0.15rem 0.6rem;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: 600;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .gauge-fill {
    transition: none;
  }
}
</style>
