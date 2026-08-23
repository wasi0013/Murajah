<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useI18n } from '@/core/i18n'
import type { JournalDaySummary } from '@/composables/useJournalMonth'
import Icon from '@/components/Icon.vue'

/**
 * The journal's month grid (Phase 12.4.2) — a real interactive calendar (every
 * day is a tappable `<button>`, not the read-only decorative cells
 * `HistorySheet` used for its rolling 90-day heatmap). State is carried by
 * shape *and* fill, never colour alone, matching `HistorySheet`'s own
 * accessibility principle. RTL correctness comes for free from the page's own
 * `direction: rtl` (inherited, not set here) mirroring the grid — no
 * JS-level weekday reordering, the same approach `HistorySheet` already
 * proved out.
 */
const props = defineProps<{
  year: number
  month: number // 1–12
  days: JournalDaySummary[]
  /** True while `useJournalMonth` is fetching the visible month — surfaced as
   * a subtle `aria-live` hint, not a blocking overlay, since the grid itself
   * still renders correctly from whatever `days` already holds (a prior
   * month's stale reactive value briefly, not a broken/empty one). */
  loading?: boolean
  selectedDate?: string | null
  todayDate: string
}>()

const emit = defineEmits<{ select: [date: string]; prev: []; next: [] }>()

const { t, locale } = useI18n()

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const weekdays = computed(() => WEEKDAY_KEYS.map((key) => t(`common.weekdays.${key}`)))

const monthFmt = computed(() => new Intl.DateTimeFormat(locale.value, { month: 'long', year: 'numeric' }))
const monthLabel = computed(() => monthFmt.value.format(new Date(props.year, props.month - 1, 1)))

const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
function dayLabel(d: JournalDaySummary): string {
  let label = t('journal.dayAria', {
    date: dayFmt.format(new Date(`${d.date}T00:00:00`)),
    state: t(`history.state.${d.dayState}`),
  })
  if (d.hasNote) label += t('journal.dayHasNote')
  if (d.eventCount > 0) {
    label += t(d.eventCount === 1 ? 'journal.dayHasChanges' : 'journal.dayHasChangesOther', { n: d.eventCount })
  }
  return label
}

/** Weeks of 7, padded at the start so each column is a single weekday
 * (matching `HistorySheet`'s own padding approach). */
const weeks = computed<Array<Array<JournalDaySummary | null>>>(() => {
  const list = props.days
  if (!list.length) return []
  const pad = new Date(`${list[0].date}T00:00:00`).getDay()
  const cells: Array<JournalDaySummary | null> = [...Array<null>(pad).fill(null), ...list]
  const out: Array<Array<JournalDaySummary | null>> = []
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7)
    while (week.length < 7) week.push(null)
    out.push(week)
  }
  return out
})
</script>

<template>
  <div class="calendar">
    <div class="nav">
      <button class="nav-btn" type="button" :aria-label="t('journal.prevMonth')" @click="emit('prev')">
        <Icon :icon="ChevronLeft" :size="18" />
      </button>
      <h2 class="month-label" aria-live="polite">{{ monthLabel }}</h2>
      <button class="nav-btn" type="button" :aria-label="t('journal.nextMonth')" @click="emit('next')">
        <Icon :icon="ChevronRight" :size="18" />
      </button>
    </div>
    <p v-if="loading" class="loading-hint" aria-live="polite">{{ t('common.loading') }}</p>

    <!-- `cal-grid`, not `grid` — Tailwind ships a utility class literally
         named `.grid` (`display: grid`), which collided with (and beat) the
         scoped `.grid` rule below, quietly overriding this <table>'s display
         to CSS Grid. Once that happens, <thead>/<tbody>/<tr>/<td> stop being
         table parts, and the columns collapse to content size instead of
         distributing evenly — that was the actual cause of the cramped
         layout, not a table/flexbox width interaction (verified via computed
         styles in a real browser before landing this fix). -->
    <table class="cal-grid" :aria-label="t('journal.weeksAria', { month: monthLabel, year })">
      <thead>
        <tr>
          <th v-for="w in weekdays" :key="w" scope="col">
            <span aria-hidden="true">{{ w.charAt(0) }}</span>
            <span class="sr-only">{{ w }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(week, i) in weeks" :key="i">
          <td v-for="(d, j) in week" :key="j" :data-date="d?.date">
            <button
              v-if="d"
              type="button"
              class="cell"
              :class="[`cell-${d.dayState}`, { 'cell-today': d.date === todayDate, 'cell-selected': d.date === selectedDate }]"
              :aria-current="d.date === todayDate ? 'date' : undefined"
              :aria-pressed="d.date === selectedDate"
              @click="emit('select', d.date)"
            >
              <span class="cell-n" aria-hidden="true">{{ Number(d.date.slice(-2)) }}</span>
              <span class="sr-only">{{ dayLabel(d) }}</span>
              <span class="cell-dots" aria-hidden="true">
                <span v-if="d.hasNote" class="dot dot-note" />
                <span v-if="d.eventCount > 0" class="dot dot-change" />
              </span>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.calendar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.loading-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  text-align: center;
  margin: -0.25rem 0 0;
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
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.month-label {
  font-size: var(--text-base);
  font-weight: 600;
  text-align: center;
  flex: 1;
}
.nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2.25rem;
  width: 2.25rem;
  border-radius: var(--radius-md);
  color: var(--color-text);
}
.nav-btn:hover {
  background: var(--color-elevated);
}
.nav-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.cal-grid {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0.2rem;
  table-layout: fixed;
}
.cal-grid th {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  padding-bottom: 0.3rem;
}
.cal-grid td {
  padding: 0;
}
.cell {
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  border-radius: var(--radius-md);
  border: 1.5px solid transparent;
  color: var(--color-text);
  background: var(--color-elevated);
}
.cell-n {
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
}
.cell-completed {
  background: color-mix(in oklab, var(--color-success) 22%, var(--color-elevated));
}
.cell-partial {
  background: transparent;
  border-color: var(--color-success);
}
.cell-today {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
.cell-selected {
  border-color: var(--color-accent);
}
.cell:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
.cell-dots {
  display: flex;
  gap: 0.15rem;
  height: 0.35rem;
}
.dot {
  width: 0.3rem;
  height: 0.3rem;
  border-radius: 50%;
}
.dot-note {
  background: var(--color-accent);
}
.dot-change {
  background: var(--color-warn, var(--color-accent));
}
</style>
