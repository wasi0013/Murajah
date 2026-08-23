import { computed, ref, watch, type Ref } from 'vue'
import { useDayLogStore } from '@/stores/dayLog'
import { useJournalStore } from '@/stores/journal'
import { useLocalDay } from './useLocalDay'
import { hasWork, type DayState } from '@/core/memorization/streaks'

export interface JournalDaySummary {
  date: string
  dayState: DayState
  hasNote: boolean
  eventCount: number
}

export interface UseJournalMonthOptions {
  /** The clock anchoring the initial month. Defaults to the shared local-day clock. */
  today?: Ref<Date>
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Calendar-cell summaries for one visible month (Phase 12.3.1) — cheap by
 * construction: a per-day boolean/count read off `dayLog` (already fully
 * hydrated app-wide) and the windowed `journal` store, never a weakness
 * computation or a recordings load. The full day-detail view (`useJournalDay`,
 * 12.3.2) is a deliberately separate, heavier composable computed only when a
 * day is actually opened — this one has to stay cheap for up to 31 cells at once.
 */
export function useJournalMonth(
  opts: UseJournalMonthOptions = {},
  dayLog = useDayLogStore(),
  journal = useJournalStore(),
) {
  const today = opts.today ?? useLocalDay()
  const year = ref(today.value.getFullYear())
  const month = ref(today.value.getMonth() + 1) // 1–12, matching journal.loadMonth's convention

  function goToMonth(y: number, m: number): void {
    year.value = y
    month.value = m
  }

  /** Roll to the next calendar month, carrying the year over at December. */
  function nextMonth(): void {
    if (month.value === 12) goToMonth(year.value + 1, 1)
    else goToMonth(year.value, month.value + 1)
  }

  /** Roll to the previous calendar month, carrying the year back at January. */
  function prevMonth(): void {
    if (month.value === 1) goToMonth(year.value - 1, 12)
    else goToMonth(year.value, month.value - 1)
  }

  const days = computed<JournalDaySummary[]>(() => {
    const y = year.value
    const m = month.value
    const lastDay = new Date(y, m, 0).getDate() // day 0 of next month = last day of this one
    const out: JournalDaySummary[] = []
    for (let d = 1; d <= lastDay; d++) {
      const date = `${y}-${pad2(m)}-${pad2(d)}`
      const rec = dayLog.get(date)
      const dayState: DayState = rec?.completed ? 'completed' : rec && hasWork(rec) ? 'partial' : 'none'
      const entry = journal.get(date)
      out.push({ date, dayState, hasNote: !!entry?.note, eventCount: entry?.events.length ?? 0 })
    }
    return out
  })

  const loading = ref(false)

  async function load(): Promise<void> {
    loading.value = true
    try {
      await journal.loadMonth(year.value, month.value)
    } finally {
      loading.value = false
    }
  }

  watch([year, month], load, { immediate: true })

  return { year, month, days, loading, goToMonth, nextMonth, prevMonth }
}
