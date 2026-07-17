<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Flame, GraduationCap, SlidersHorizontal, Sparkles } from 'lucide-vue-next'
import { useToday } from '@/composables/useToday'
import { useStreak } from '@/composables/useStreak'
import { usePlanStore } from '@/stores/plan'
import { usePlanPersistence } from '@/composables/usePlanPersistence'
import { useProgressPersistence } from '@/composables/useProgressPersistence'
import { useMistakesPersistence } from '@/composables/useMistakesPersistence'
import { useDayLogPersistence } from '@/composables/useDayLogPersistence'
import { juzForPage } from '@/core/navigation/juz'
import { toast } from '@/composables/useToast'
import Icon from '@/components/Icon.vue'
import Toggle from '@/components/Toggle.vue'
import TaskRow from './TaskRow.vue'

/**
 * Today — the merged practice loop and the app's primary surface. One adaptive
 * queue (new memorization · revision · weak reinforcement · standing habits) with
 * a single completion path: every action routes through `useToday.complete`, so
 * reward, strength, the SM-2 schedule and the streak advance from one tap.
 *
 * Owns its own hydrate/persist (like ProgressView) — Today is reachable directly.
 */
const router = useRouter()
const plan = usePlanStore()
const today = useToday()
const streak = useStreak()

const planPersistence = usePlanPersistence()
const progressPersistence = useProgressPersistence()
const mistakesPersistence = useMistakesPersistence()
const dayLogPersistence = useDayLogPersistence()

onMounted(() => {
  void planPersistence.hydrate()
  void progressPersistence.hydrate()
  void mistakesPersistence.hydrate() // mistakes feed weakness scoring
  void dayLogPersistence.hydrate() // the streak and today's checked state
})
onBeforeUnmount(() => {
  planPersistence.dispose()
  progressPersistence.dispose()
  mistakesPersistence.dispose()
  dayLogPersistence.dispose()
})

const dateLabel = computed(() =>
  new Date(`${today.date.value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }),
)

/** Juz context for a page — omitted rather than guessed if nav hasn't loaded. */
function metaFor(page: number): string | undefined {
  const j = juzForPage(plan.juzToPage, page)
  return j ? `Juz ${j}` : undefined
}

function openInReader(page: number) {
  void router.push({ name: 'reader', params: { layout: 'qpc', page: String(page) } })
}

const streakLabel = computed(() => {
  const n = streak.currentStreak.value
  if (n === 0) return 'No streak yet'
  return `${n} day${n === 1 ? '' : 's'}`
})

/** The ring's `r` makes its circumference exactly 100, so the dash *is* the percent. */
const RING_R = 15.9155

function onHabit(id: string, done: boolean) {
  today.toggleHabit(id, done)
}

function openQuiz() {
  toast('Quiz arrives in a later phase', { variant: 'info' })
}
</script>

<template>
  <main class="today">
    <header class="topbar">
      <div class="head">
        <h1 class="title">Today</h1>
        <p class="date">{{ dateLabel }}</p>
      </div>
      <button
        v-if="today.hasPlan.value"
        class="icon-btn"
        aria-label="Edit your plan"
        @click="toast('Plan setup arrives in 5.5', { variant: 'info' })"
      >
        <Icon :icon="SlidersHorizontal" :size="20" />
      </button>
    </header>

    <!-- No plan yet — 5.4.2 replaces this with the smart-plan call to action. -->
    <section v-if="!today.hasPlan.value" class="empty">
      <Icon :icon="Sparkles" :size="28" class="empty-icon" />
      <h2 class="empty-title">Set up your practice</h2>
      <p class="empty-body">
        Choose what you're maintaining and how much you want to do each day, and Today will
        build the queue for you.
      </p>
    </section>

    <template v-else>
      <section class="section" aria-label="Today's progress">
        <div class="summary">
          <div class="ring-wrap">
            <svg class="ring" viewBox="0 0 36 36" aria-hidden="true">
              <circle class="ring-track" cx="18" cy="18" :r="RING_R" />
              <circle
                class="ring-fill"
                cx="18"
                cy="18"
                :r="RING_R"
                :stroke-dasharray="`${today.completionPercentage.value} 100`"
              />
            </svg>
            <span class="ring-text" aria-hidden="true">
              {{ today.completedTasks.value
              }}<span class="ring-of">/{{ today.totalTasks.value }}</span>
            </span>
            <span class="sr-only">
              {{ today.completedTasks.value }} of {{ today.totalTasks.value }} tasks done —
              {{ today.completionPercentage.value }}%
            </span>
          </div>

          <div class="streak" :class="{ 'streak-lit': streak.isTodayComplete.value }">
            <Icon :icon="Flame" :size="18" class="streak-icon" />
            <span class="streak-n">{{ streakLabel }}</span>
            <span class="streak-sub">
              <template v-if="streak.isPersonalBest.value && streak.currentStreak.value > 1">
                Your best run yet
              </template>
              <template v-else-if="streak.isAtRisk.value">Finish today to keep it</template>
              <template v-else-if="streak.longestStreak.value > 0">
                Best: {{ streak.longestStreak.value }}
              </template>
              <template v-else>Finish a day to start one</template>
            </span>
          </div>
        </div>
      </section>

      <p v-if="today.isOffDay.value" class="notice">
        Rest day — no new memorization. Revision still keeps what you have.
      </p>

      <p v-else-if="today.tasks.value?.metadata.pausedNewMemorization" class="notice">
        New memorization is paused while you clear the revision backlog.
      </p>

      <section v-if="today.newMemorization.value.length" class="section" aria-labelledby="s-new">
        <h2 id="s-new" class="section-title">New memorization</h2>
        <ul class="rows">
          <TaskRow
            v-for="p in today.newMemorization.value"
            :key="p"
            :page="p"
            :meta="metaFor(p)"
            :done="today.isDone('newMemorization', p)"
            done-label="Memorized"
            @open="openInReader(p)"
            @clean="today.complete('newMemorization', p)"
          />
        </ul>
      </section>

      <section v-if="today.revision.value.length" class="section" aria-labelledby="s-rev">
        <h2 id="s-rev" class="section-title">Revision</h2>
        <ul class="rows">
          <TaskRow
            v-for="p in today.revision.value"
            :key="p"
            :page="p"
            :meta="metaFor(p)"
            :done="today.isDone('revision', p)"
            gradable
            @open="openInReader(p)"
            @clean="today.complete('revision', p)"
            @mistake="today.markMistake('revision', p)"
          />
        </ul>
      </section>

      <section v-if="today.weakReinforcement.value.length" class="section" aria-labelledby="s-weak">
        <h2 id="s-weak" class="section-title">Needs reinforcement</h2>
        <ul class="rows">
          <TaskRow
            v-for="p in today.weakReinforcement.value"
            :key="p"
            :page="p"
            :meta="metaFor(p)"
            :done="today.isDone('weak', p)"
            gradable
            @open="openInReader(p)"
            @clean="today.complete('weak', p)"
            @mistake="today.markMistake('weak', p)"
          />
        </ul>
      </section>

      <section v-if="today.habits.value.length" class="section" aria-labelledby="s-habits">
        <h2 id="s-habits" class="section-title">Habits</h2>
        <ul class="rows">
          <li v-for="h in today.habits.value" :key="h.id" class="habit">
            <span class="habit-text">
              <span class="habit-name">{{ h.name }}</span>
              <span class="habit-desc">{{ h.description }}</span>
            </span>
            <button
              v-if="h.wiresTo === 'quiz'"
              class="habit-link"
              type="button"
              aria-label="Open the quiz"
              @click="openQuiz"
            >
              <Icon :icon="GraduationCap" :size="16" />
            </button>
            <Toggle
              :model-value="today.isHabitDone(h.id)"
              :label="h.name"
              @update:model-value="onHabit(h.id, $event)"
            />
          </li>
        </ul>
      </section>

      <p v-if="today.totalTasks.value === 0" class="notice">
        Nothing scheduled today. Mark pages memorized to build your revision queue.
      </p>

      <p v-else-if="today.allDone.value" class="done-note">
        Today is complete. May Allah accept it from you.
      </p>
    </template>
  </main>
</template>

<style scoped>
.today {
  min-height: 100dvh;
  background: var(--color-bg);
  color: var(--color-text);
  padding-bottom: 3rem;
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
.topbar {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: calc(0.6rem + env(safe-area-inset-top)) 1rem 0.6rem;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.title {
  font-size: var(--text-lg);
  font-weight: 600;
}
.date {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2.25rem;
  width: 2.25rem;
  border-radius: var(--radius-md);
  color: var(--color-text);
}
.icon-btn:hover {
  background: var(--color-elevated);
}
.icon-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.summary {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.ring-wrap {
  position: relative;
  display: grid;
  place-items: center;
  width: 4.5rem;
  height: 4.5rem;
  flex: none;
}
.ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.ring-track,
.ring-fill {
  fill: none;
  stroke-width: 3;
}
.ring-track {
  stroke: var(--color-border);
}
.ring-fill {
  stroke: var(--color-accent);
  stroke-linecap: round;
  transition: stroke-dasharray var(--duration-slow) var(--ease-emphasized);
}
.ring-text {
  position: absolute;
  font-size: var(--text-base);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.ring-of {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-weight: 500;
}
.streak {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0 0.4rem;
  min-width: 0;
}
.streak-icon {
  grid-row: span 2;
  color: var(--color-text-muted);
}
.streak-lit .streak-icon {
  color: var(--color-warn);
}
.streak-n {
  font-size: var(--text-base);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.streak-sub {
  grid-column: 2;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.section,
.notice,
.done-note,
.empty {
  max-width: 46rem;
  margin: 1.25rem auto 0;
  padding-inline: 1rem;
}
.section-title {
  font-size: var(--text-sm);
  font-weight: 600;
  margin-bottom: 0.5rem;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  list-style: none;
  padding: 0;
  margin: 0;
}
.habit {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.habit-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  flex: 1;
  min-width: 0;
}
.habit-name {
  font-size: var(--text-sm);
  font-weight: 600;
}
.habit-desc {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.habit-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2rem;
  width: 2rem;
  flex: none;
  border-radius: var(--radius-md);
  background: var(--color-elevated);
  color: var(--color-text-muted);
}
.habit-link:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.notice {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.done-note {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-success);
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.5rem;
  margin-top: 4rem;
}
.empty-icon {
  color: var(--color-accent);
}
.empty-title {
  font-size: var(--text-lg);
  font-weight: 600;
}
.empty-body {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  max-width: 26rem;
}
@media (prefers-reduced-motion: reduce) {
  .ring-fill {
    transition: none;
  }
}
</style>
