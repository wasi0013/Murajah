<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from '@/core/i18n'
import { useStreak } from '@/composables/useStreak'
import { useJournalMonth } from '@/composables/useJournalMonth'
import { useDayLogPersistence } from '@/composables/useDayLogPersistence'
import { useRecordingsPersistence } from '@/composables/useRecordingsPersistence'
import { getTodayDate } from '@/core/memorization/streaks'
import { useLocalDay } from '@/composables/useLocalDay'
import JournalCalendar from './JournalCalendar.vue'
import JournalDaySheet from './JournalDaySheet.vue'

/**
 * The Journal segment (Phase 12.4.1/12.4.4) — orchestrates the month calendar
 * + day-detail sheet, and hosts the streak header that used to live on
 * `HistorySheet` (now retired; its job was a strict subset of this calendar).
 *
 * Hydrates `dayLog` and `recordings` itself, not just `progress`/`mistakes`/
 * `plan` the way `ProgressView` already does for its own tabs — a viewer can
 * land on `/progress?tab=journal` (Today's repointed entry point) without
 * ever having opened Today or the recording panel this session, and both
 * stores are otherwise only hydrated from those views.
 */
const { t } = useI18n()
const today = useLocalDay()
const todayDate = computed(() => getTodayDate(today.value))

const streak = useStreak({ today })
const { year, month, days, goToMonth, nextMonth, prevMonth } = useJournalMonth({ today })
const completedThisMonth = computed(() => days.value.filter((d) => d.dayState === 'completed').length)

const dayLogPersistence = useDayLogPersistence()
const recordingsPersistence = useRecordingsPersistence()
onMounted(() => {
  void dayLogPersistence.hydrate()
  void recordingsPersistence.hydrate()
})
onBeforeUnmount(() => {
  dayLogPersistence.dispose()
  recordingsPersistence.dispose()
})

const selectedDate = ref<string | null>(null)
const sheetOpen = computed({
  get: () => selectedDate.value !== null,
  set: (v: boolean) => {
    if (!v) selectedDate.value = null
  },
})
function openDay(date: string): void {
  selectedDate.value = date
}

defineExpose({ goToMonth })
</script>

<template>
  <div class="journal">
    <div class="streaks">
      <div class="stat">
        <span class="stat-n">{{ streak.currentStreak }}</span>
        <span class="stat-l">{{ t('journal.streakCurrent') }}</span>
      </div>
      <div class="stat">
        <span class="stat-n">{{ streak.longestStreak }}</span>
        <span class="stat-l">{{ t('journal.streakLongest') }}</span>
      </div>
      <div class="stat">
        <span class="stat-n">{{ completedThisMonth }}</span>
        <span class="stat-l">{{ t('history.daysDone') }}</span>
      </div>
    </div>

    <JournalCalendar
      :year="year"
      :month="month"
      :days="days"
      :selected-date="selectedDate"
      :today-date="todayDate"
      @select="openDay"
      @prev="prevMonth"
      @next="nextMonth"
    />

    <JournalDaySheet v-if="selectedDate" v-model:open="sheetOpen" :date="selectedDate" />
  </div>
</template>

<style scoped>
.journal {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.streaks {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.6rem;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.7rem 0.85rem;
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
</style>
