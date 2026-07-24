import { computed, type Ref } from 'vue'
import { useDayLogStore } from '@/stores/dayLog'
import { useLocalDay } from './useLocalDay'
import { calculateStreak, getTodayDate } from '@/core/memorization/streaks'

export interface UseStreakOptions {
  /** The clock. Defaults to the shared local-day clock; inject a ref in tests. */
  today?: Ref<Date>
}

/**
 * The completion streak — the reactive view-model behind Today's streak header.
 *
 * Reads the day log's `completed` flags (maintained by `useToday` as tasks are
 * finished) through {@link calculateStreak}, so completing the day's last task
 * extends the streak in the same tick, and a missed day breaks it on the next
 * rollover with no bookkeeping of its own.
 */
export function useStreak(opts: UseStreakOptions = {}) {
  const dayLog = useDayLogStore()
  const today = opts.today ?? useLocalDay()

  const date = computed(() => getTodayDate(today.value))
  const streak = computed(() => calculateStreak(dayLog.byDate, today.value))

  const currentStreak = computed(() => streak.value.currentStreak)
  const longestStreak = computed(() => streak.value.longestStreak)
  const lastCompletedDate = computed(() => streak.value.lastCompletedDate)

  const isTodayComplete = computed(() => dayLog.byDate.get(date.value)?.completed ?? false)

  /** A live streak whose day isn't done yet — the header's cue to nudge, not celebrate. */
  const isAtRisk = computed(() => currentStreak.value > 0 && !isTodayComplete.value)

  /** This run ties or beats the user's best — worth celebrating in the header. */
  const isPersonalBest = computed(
    () => currentStreak.value > 0 && currentStreak.value >= longestStreak.value,
  )

  return {
    date,
    currentStreak,
    longestStreak,
    lastCompletedDate,
    isTodayComplete,
    isAtRisk,
    isPersonalBest,
  }
}
