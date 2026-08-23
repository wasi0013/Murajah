import { computed, ref, watch, type Ref } from 'vue'
import { useDayLogStore } from '@/stores/dayLog'
import { useJournalStore } from '@/stores/journal'
import { useRecordingsStore } from '@/stores/recordings'
import { getHabit, type HabitDef } from '@/core/memorization/streaks'
import type { JournalEvent } from '@/core/storage/userData'
import type { Recording } from '@/core/audio/recorder'

export interface JournalDaySections {
  newMemorization: number[]
  revision: number[]
  weak: number[]
  habits: HabitDef[]
}

export interface JournalDayDetail {
  date: string
  sections: JournalDaySections
  note: string
  noteUpdatedAt: string | null
  events: JournalEvent[]
  eventsOverflow: number
  recordings: Recording[]
}

/** Local calendar date (`YYYY-MM-DD`) an ISO instant falls on, using **local**
 * date components — not a substring of the (UTC) ISO string, which would give
 * the wrong day for any viewer not at UTC+0 near midnight. */
function localDateOf(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * The expanded day-detail view (Phase 12.3.2) — computed only for the one date
 * actually opened (the caller passes a `Ref<string>`; a tap-to-expand UI swaps
 * it, it does not mount one instance per calendar cell). Assembles:
 *
 * - `dayLog`'s per-section page lists + resolved habit definitions (unknown
 *   habit ids, e.g. from a disabled/removed habit, are dropped rather than
 *   surfaced as raw strings).
 * - The journal entry's note + events (12.1/12.2).
 * - Recordings for the date, filtered from the **already-hydrated**
 *   `recordings` store (Phase 12.3.3) — never a fresh `loadRecordings()`,
 *   which would pull every recording's full audio blob into memory just to
 *   answer "what happened on this one day".
 *
 * Deliberately does not touch `calculateAllWeaknesses` or any other
 * page-set-wide computation — this is one day's worth of already-computed
 * facts, not a fresh analysis.
 */
export function useJournalDay(
  date: Ref<string>,
  dayLog = useDayLogStore(),
  journal = useJournalStore(),
  recordings = useRecordingsStore(),
) {
  const loading = ref(false)

  watch(
    date,
    async (d) => {
      loading.value = true
      try {
        await journal.loadOne(d)
      } finally {
        loading.value = false
      }
    },
    { immediate: true },
  )

  const detail = computed<JournalDayDetail>(() => {
    const d = date.value
    const rec = dayLog.get(d)
    const entry = journal.get(d)
    return {
      date: d,
      sections: {
        newMemorization: rec?.newMemorization ?? [],
        revision: rec?.revision ?? [],
        weak: rec?.weak ?? [],
        habits: (rec?.habits ?? []).map(getHabit).filter((h): h is HabitDef => !!h),
      },
      note: entry?.note ?? '',
      noteUpdatedAt: entry?.noteUpdatedAt ?? null,
      events: entry?.events ?? [],
      eventsOverflow: entry?.eventsOverflow ?? 0,
      recordings: recordings.items.filter((r) => localDateOf(r.recordedAt) === d),
    }
  })

  return { detail, loading }
}
