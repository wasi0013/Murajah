import { computed, type Ref } from 'vue'
import { useLocalDay } from './useLocalDay'
import { useProgressStore } from '@/stores/progress'
import { usePlanStore } from '@/stores/plan'
import { useMistakesStore } from '@/stores/mistakes'
import { useQuizStore } from '@/stores/quiz'
import { useDayLogStore, type DaySection } from '@/stores/dayLog'
import { useHabitVersesStore } from '@/stores/habitVerses'
import { generateDailyTasks } from '@/core/memorization/dailyTasks'
import { advanceMemorizationPage } from '@/core/memorization/planBuilder'
import { getHabit, getTodayDate, type HabitDef } from '@/core/memorization/streaks'
import type { ReviewRating } from '@/core/memorization/reviewScheduler'

/** The one habit whose checkbox also drives the habit-builder verse cursor. */
const RECITE_AYAHS_HABIT = 'recite-ayahs'

export interface UseTodayOptions {
  /** The clock. Defaults to the shared local-day clock; inject a ref in tests. */
  today?: Ref<Date>
}

/**
 * Today's practice loop — the reactive view-model behind TodayView.
 *
 * Derives the day's task set from `plan` + `progress` + `mistakes` via
 * {@link generateDailyTasks}, overlays what's already finished from the day log, and
 * exposes one completion path: {@link complete} routes through the progress store's
 * `recordReview` / `penalizeMistake`, so hasanah, memorization strength, the SM-2
 * schedule, weakness scoring and the streak all advance from a single action.
 */
export function useToday(opts: UseTodayOptions = {}) {
  const progress = useProgressStore()
  const plan = usePlanStore()
  const mistakes = useMistakesStore()
  const quiz = useQuizStore()
  const dayLog = useDayLogStore()
  const habitVerses = useHabitVersesStore()

  // Rolls at local midnight, shared with `useStreak` — so a session left open
  // overnight regenerates the queue for the new day instead of stalling on
  // yesterday's, and the streak header can't disagree about which day it is.
  const today = opts.today ?? useLocalDay()
  const date = computed(() => getTodayDate(today.value))

  /** What's already finished today — keeps the day's list stable as it's worked. */
  const record = computed(() => dayLog.byDate.get(date.value))

  const tasks = computed(() =>
    plan.config
      ? generateDailyTasks({
          scopePages: plan.scopePages,
          memorized: progress.memorized,
          reviewData: progress.reviewData,
          mistakes: mistakes.byPage,
          strength: progress.strength,
          quizScores: quiz.accuracyByPage,
          newFront: plan.newFront,
          pace: plan.config.pace,
          completedToday: {
            newMemorization: record.value?.newMemorization ?? [],
            revision: record.value?.revision ?? [],
            weak: record.value?.weak ?? [],
          },
          today: today.value,
        })
      : null,
  )

  const hasPlan = computed(() => plan.hasPlan)
  const isOffDay = computed(() => tasks.value?.metadata.isOffDay ?? false)
  const newMemorization = computed(() => tasks.value?.newMemorization ?? [])
  const revision = computed(() => tasks.value?.revision ?? [])
  const weakReinforcement = computed(() => tasks.value?.weakReinforcement ?? [])
  const habits = computed<HabitDef[]>(() =>
    (plan.config?.habits ?? []).map(getHabit).filter((h): h is HabitDef => !!h),
  )
  /** The habit builder's 10 verses for today — stable for the day, see `versesOfDay`. */
  const versesOfDay = computed(() => habitVerses.versesForDate(date.value))

  const isDone = (section: DaySection, page: number) => dayLog.isPageDone(date.value, section, page)
  const isHabitDone = (habitId: string) => dayLog.isHabitDone(date.value, habitId)

  const totalTasks = computed(
    () =>
      newMemorization.value.length +
      revision.value.length +
      weakReinforcement.value.length +
      habits.value.length,
  )

  /** Only *planned* work counts — pages finished before a pace cut don't inflate it. */
  const completedTasks = computed(
    () =>
      newMemorization.value.filter((p) => isDone('newMemorization', p)).length +
      revision.value.filter((p) => isDone('revision', p)).length +
      weakReinforcement.value.filter((p) => isDone('weak', p)).length +
      habits.value.filter((h) => isHabitDone(h.id)).length,
  )

  const completionPercentage = computed(() =>
    totalTasks.value === 0 ? 0 : Math.round((completedTasks.value / totalTasks.value) * 100),
  )

  /** Every planned task is finished. A day with nothing planned is not "done". */
  const allDone = computed(() => totalTasks.value > 0 && completedTasks.value === totalTasks.value)

  /** Pages already paid out this session — belt-and-braces against a double payout. */
  const rewarded = new Set<string>()
  const key = (section: DaySection, page: number) => `${date.value}:${section}:${page}`

  /** Recompute the day's `completed` flag — this is what the streak reads. */
  function syncCompleted(): void {
    dayLog.setCompleted(date.value, allDone.value)
  }

  /**
   * Finish a task. A clean recall (`perfect`/`good`) advances the schedule and pays
   * the reward; `needs_work` also docks strength and resets the interval, so the page
   * comes back tomorrow. New memorization additionally marks the page memorized and
   * walks the plan's front forward. Idempotent — completing twice never double-pays.
   */
  function complete(section: DaySection, page: number, rating: ReviewRating = 'perfect'): boolean {
    if (isDone(section, page)) return false

    if (!rewarded.has(key(section, page))) {
      if (rating === 'needs_work') progress.penalizeMistake(page)
      if (section === 'newMemorization') progress.setMemorized(page, true)
      progress.recordReview(page, rating, today.value)
      rewarded.add(key(section, page))

      if (section === 'newMemorization') {
        plan.update({ newFront: advanceMemorizationPage(plan.newFront, progress.memorized) })
      }
    }

    dayLog.setPageDone(date.value, section, page, true)
    syncCompleted()
    return true
  }

  /** Shorthand for the reader's "Mark mistake" action on a revision task. */
  const markMistake = (section: DaySection, page: number) => complete(section, page, 'needs_work')

  /**
   * Habits toggle freely — unlike a page task they carry no reward or schedule, so
   * un-checking one costs nothing. (Page tasks have no un-check: a recall is a real
   * event. The reward is paid, the SM-2 schedule has moved, and hasanah is monotonic
   * by design — so "undo" can't be honoured, only faked.)
   *
   * `recite-ayahs` is the one exception with a side effect: checking it advances
   * the habit-builder's verse cursor by today's 10 (so tomorrow picks up where
   * today left off); un-checking it the same day rolls that advance back — see
   * `core/quran/habitVerses`.
   */
  function toggleHabit(habitId: string, done = !isHabitDone(habitId)): boolean {
    const changed = dayLog.setHabitDone(date.value, habitId, done)
    if (changed && habitId === RECITE_AYAHS_HABIT) {
      if (done) habitVerses.advance(date.value)
      else habitVerses.rollback(date.value)
    }
    syncCompleted()
    return changed
  }

  return {
    date,
    tasks,
    hasPlan,
    isOffDay,
    newMemorization,
    revision,
    weakReinforcement,
    habits,
    versesOfDay,
    isDone,
    isHabitDone,
    totalTasks,
    completedTasks,
    completionPercentage,
    allDone,
    complete,
    markMistake,
    toggleHabit,
  }
}
