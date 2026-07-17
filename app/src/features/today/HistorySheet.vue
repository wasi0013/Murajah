<script setup lang="ts">
import { computed, type Ref } from 'vue'
import { useDayLogStore } from '@/stores/dayLog'
import { useStreak } from '@/composables/useStreak'
import { useLocalDay } from '@/composables/useLocalDay'
import { buildHistory, type HistoryDay } from '@/core/memorization/streaks'
import BottomSheet from '@/components/BottomSheet.vue'

/**
 * Practice history — the last 90 days of the day log as a calendar, with the
 * current and longest streak. Weeks run down the page and weekdays across, so it
 * reads like a calendar rather than a chart.
 *
 * Each day is a real table cell with its own text, so the grid is navigable and
 * announced rather than being a decorative colour wash; state is carried by fill
 * *and* shape (filled / ringed / faint), never by colour alone.
 */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ today?: Ref<Date> }>()

const DAYS = 90
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const dayLog = useDayLogStore()
const today = props.today ?? useLocalDay()
const streak = useStreak({ today })

const days = computed(() => buildHistory(dayLog.byDate, DAYS, today.value))

/** Weeks of 7, padded at the start so each column is a single weekday. */
const weeks = computed<Array<Array<HistoryDay | null>>>(() => {
  const list = days.value
  const pad = new Date(`${list[0].date}T00:00:00`).getDay()
  const cells: Array<HistoryDay | null> = [...Array<null>(pad).fill(null), ...list]
  const out: Array<Array<HistoryDay | null>> = []
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7)
    while (week.length < 7) week.push(null)
    out.push(week)
  }
  return out
})

const completedCount = computed(() => days.value.filter((d) => d.state === 'completed').length)

const STATE_TEXT: Record<HistoryDay['state'], string> = {
  completed: 'completed',
  partial: 'partly done',
  none: 'nothing recorded',
}

const fmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
function label(d: HistoryDay): string {
  return `${fmt.format(new Date(`${d.date}T00:00:00`))}: ${STATE_TEXT[d.state]}`
}
</script>

<template>
  <BottomSheet v-model:open="open" label="Practice history">
    <div class="history">
      <h2 class="history-title">Practice history</h2>

      <div class="stats">
        <div class="stat">
          <span class="stat-n">{{ streak.currentStreak.value }}</span>
          <span class="stat-l">Current streak</span>
        </div>
        <div class="stat">
          <span class="stat-n">{{ streak.longestStreak.value }}</span>
          <span class="stat-l">Longest streak</span>
        </div>
        <div class="stat">
          <span class="stat-n">{{ completedCount }}</span>
          <span class="stat-l">Days completed</span>
        </div>
      </div>

      <div class="cal-wrap">
        <table class="cal">
          <caption class="sr-only">
            The last {{ DAYS }} days — {{ completedCount }} completed
          </caption>
          <thead>
            <tr>
              <th v-for="w in WEEKDAYS" :key="w" scope="col">
                <span aria-hidden="true">{{ w.charAt(0) }}</span>
                <span class="sr-only">{{ w }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(week, i) in weeks" :key="i">
              <td v-for="(d, j) in week" :key="j" :data-date="d?.date">
                <template v-if="d">
                  <span class="sr-only">{{ label(d) }}</span>
                  <span
                    class="cell"
                    :class="[`cell-${d.state}`, { 'cell-today': d.isToday }]"
                    aria-hidden="true"
                  />
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ul class="legend">
        <li><span class="cell cell-completed" aria-hidden="true" /> Completed</li>
        <li><span class="cell cell-partial" aria-hidden="true" /> Partly done</li>
        <li><span class="cell cell-none" aria-hidden="true" /> Nothing recorded</li>
      </ul>
    </div>
  </BottomSheet>
</template>

<style scoped>
.history {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-bottom: 0.5rem;
}
.history-title {
  font-size: var(--text-base);
  font-weight: 600;
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
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.6rem 0.75rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.stat-n {
  font-size: var(--text-xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-accent);
}
.stat-l {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.cal-wrap {
  overflow-x: auto;
}
.cal {
  border-collapse: separate;
  border-spacing: 0.25rem;
  margin-inline: auto;
}
.cal th {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  padding-bottom: 0.15rem;
}
.cell {
  display: block;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: var(--radius-sm);
  /* Shape carries the state as well as colour: filled / ringed / faint. */
  border: 1.5px solid transparent;
}
.cell-completed {
  background: var(--color-success);
}
.cell-partial {
  background: transparent;
  border-color: var(--color-success);
}
.cell-none {
  background: var(--color-elevated);
}
.cell-today {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.legend li {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
</style>
