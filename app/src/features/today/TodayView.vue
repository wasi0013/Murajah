<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Brain, ChevronRight, Flame, Headphones, Settings, Shuffle, Sparkles } from 'lucide-vue-next'
import { useToday } from '@/composables/useToday'
import { useStreak } from '@/composables/useStreak'
import { usePlanStore } from '@/stores/plan'
import { useProgressStore } from '@/stores/progress'
import { useMistakesStore } from '@/stores/mistakes'
import { useAudioStore } from '@/stores/audio'
import { useRecorderStore } from '@/stores/recorder'
import { generateSmartPlan } from '@/core/memorization/planBuilder'
import { usePlanPersistence } from '@/composables/usePlanPersistence'
import { useProgressPersistence } from '@/composables/useProgressPersistence'
import { useMistakesPersistence } from '@/composables/useMistakesPersistence'
import { useDayLogPersistence } from '@/composables/useDayLogPersistence'
import { useQuizPersistence } from '@/composables/useQuizPersistence'
import { useHabitVersesPersistence } from '@/composables/useHabitVersesPersistence'
import { useMilestones } from '@/composables/useMilestones'
import { useMarkPage } from '@/composables/useMarkPage'
import { usePartialProgressPersistence } from '@/composables/usePartialProgressPersistence'
import { usePartialProgressStore } from '@/stores/partialProgress'
import { coveredLineCount } from '@/core/memorization/partialProgress'
import { juzForPage } from '@/core/navigation/juz'
import { readerLink } from '@/core/navigation/readerLinks'
import { toast } from '@/composables/useToast'
import { useI18n } from '@/core/i18n'
import Icon from '@/components/Icon.vue'
import Toggle from '@/components/Toggle.vue'
import TaskRow from './TaskRow.vue'
import PlanSetup from './PlanSetup.vue'
import TodayAudioPlayer from './TodayAudioPlayer.vue'

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
const progress = useProgressStore()
const mistakes = useMistakesStore()
const audio = useAudioStore()
const recorder = useRecorderStore()
const today = useToday()
const streak = useStreak()
const { t, locale } = useI18n()

const planPersistence = usePlanPersistence()
const progressPersistence = useProgressPersistence()
const mistakesPersistence = useMistakesPersistence()
const dayLogPersistence = useDayLogPersistence()
const quizPersistence = useQuizPersistence()
const habitVersesPersistence = useHabitVersesPersistence()
// The front-page line-fill visual below reads `partialProgress` directly —
// without hydrating it here, a cold load landing straight on Today (never
// having visited /memorize this session) always sees `page: null, marks: []`
// and the fill row silently never renders, even with real progress on disk.
const partialProgressPersistence = usePartialProgressPersistence()
const milestones = useMilestones()

onMounted(() => {
  void mistakesPersistence.hydrate() // mistakes feed weakness scoring
  void quizPersistence.hydrate() // quiz accuracy also feeds weakness scoring
  void dayLogPersistence.hydrate() // the streak and today's checked state
  void habitVersesPersistence.hydrate() // the habit builder's verse cursor
  void partialProgressPersistence.hydrate() // the front-page line-fill visual
  // Milestones celebrate what's crossed from here on, so they can only be armed once
  // the plan (with the nav index) and progress are in. Arming against a half-loaded
  // set of memorized pages would congratulate the user for the rest of them arriving.
  void Promise.all([planPersistence.hydrate(), progressPersistence.hydrate()]).then(() =>
    milestones.arm(),
  )
})
onBeforeUnmount(() => {
  planPersistence.dispose()
  progressPersistence.dispose()
  mistakesPersistence.dispose()
  dayLogPersistence.dispose()
  quizPersistence.dispose()
  habitVersesPersistence.dispose()
  partialProgressPersistence.dispose()
  milestones.dispose()
})

const dateLabel = computed(() =>
  new Date(`${today.date.value}T00:00:00`).toLocaleDateString(locale.value, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }),
)

/** Juz context for a page — omitted rather than guessed if nav hasn't loaded. */
function metaFor(page: number): string | undefined {
  const j = juzForPage(plan.juzToPage, page)
  return j ? t('common.juz', { n: j }) : undefined
}

function openInReader(page: number) {
  void router.push(readerLink({ page }))
}

/**
 * Partial-page tracking (see plans/partial-page-tracking.md): the
 * newMemorization row for the plan's front page specifically opens the
 * marking view (tap-to-mark verses) instead of the plain reader, and shows a
 * "N of total lines" fill visual next to it. Any *other* page in
 * `newMemorization` (only possible when `newPagesPerDay > 1`) keeps the
 * ordinary whole-page reader flow — marking is restricted to the front page
 * by design.
 */
const partialProgress = usePartialProgressStore()
const frontPage = computed(() => plan.newFront?.nextPage)
const { chunk: frontChunk } = useMarkPage(frontPage)

function isFrontPage(page: number): boolean {
  return frontPage.value === page
}

const frontLineCoverage = computed(() => {
  const c = frontChunk.value
  if (!c || partialProgress.page !== frontPage.value) return null
  return coveredLineCount(partialProgress.marks, c.layout, c.words)
})

function openNewMemorization(page: number) {
  if (isFrontPage(page)) void router.push({ name: 'memorize' })
  else openInReader(page)
}

/** Today is a standalone route reached from the reader; the top bar returns there. */
function back() {
  void router.push({ name: 'home' })
}

const streakLabel = computed(() => {
  const n = streak.currentStreak.value
  if (n === 0) return t('today.streak.none')
  return n === 1 ? t('today.streak.dayOne') : t('today.streak.dayOther', { n })
})

/** The ring's `r` makes its circumference exactly 100, so the dash *is* the percent. */
const RING_R = 15.9155

function onHabit(id: string, done: boolean) {
  today.toggleHabit(id, done)
}

/**
 * Quick test: pick a random memorized page and jump to it, handing the reader
 * the target via `recorder.pendingPage` — it runs the countdown-then-record flow
 * once it lands there (see ReaderView's watcher on `reader.page`).
 */
function startQuickTest() {
  const pages = [...progress.memorized]
  if (pages.length === 0) {
    toast(t('today.quickTest.empty'), { variant: 'info' })
    return
  }
  const page = pages[Math.floor(Math.random() * pages.length)]!
  recorder.pendingPage = page
  void router.push(readerLink({ page }))
}

const showVersesOfDay = computed(() => plan.config?.habits.includes('recite-ayahs') ?? false)
const audioPlayerRef = ref<InstanceType<typeof TodayAudioPlayer> | null>(null)

function openAudioVerses() {
  audioPlayerRef.value?.selectTab('versesOfDay')
  audioPlayerRef.value?.$el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// —— First run ————————————————————————————————————
// A juz scope is expanded through the nav index, so a smart plan built before nav
// lands would scope to an empty juz 30 and show an empty queue. Gate on it.
const navReady = computed(() => Object.keys(plan.juzToPage).length > 0)

/**
 * What one tap would create, previewed live from the user's own data — so the CTA
 * can state what it's about to do rather than asking for blind trust.
 */
const smart = computed(() =>
  navReady.value
    ? generateSmartPlan({
        memorized: progress.memorized,
        strength: progress.strength,
        mistakes: mistakes.byPage,
        reviewData: progress.reviewData,
        juzToPage: plan.juzToPage,
      })
    : null,
)

const smartSummary = computed(() => {
  const s = smart.value
  if (!s) return ''
  const { pace } = s.config
  const parts: string[] = []
  if (s.config.scope.kind === 'juz') parts.push(t('today.smart.startJuz30'))
  else parts.push(t('today.smart.maintain', { n: s.analysis.totalMemorized }))
  if (pace.revisionPagesPerDay > 0) parts.push(t('today.smart.revise', { n: pace.revisionPagesPerDay }))
  if (pace.newPagesPerDay > 0) parts.push(t('today.smart.memorize', { n: pace.newPagesPerDay }))
  return `${parts.join(' · ')}.`
})

function createSmartPlan() {
  if (!smart.value) return
  plan.create(smart.value.config)
  toast(t('today.planReady'), { variant: 'success' })
}

const setupOpen = ref(false)

/** The streak button used to open `HistorySheet` (retired, Phase 12.4.4/12.8.2
 * — its streak numbers + heatmap are a strict subset of the Journal calendar
 * now). Routes straight to Journal instead of a generic Overview landing. */
function openJournal(): void {
  void router.push({ path: '/progress', query: { tab: 'journal' } })
}
</script>

<template>
  <main class="today" :class="{ 'audio-docked': audio.open }">
    <header class="topbar">
      <button class="icon-btn" type="button" :aria-label="t('common.backToReader')" @click="back">
        <Icon :icon="ArrowLeft" :size="20" />
      </button>
      <div class="head">
        <h1 class="title">{{ t('today.title') }}</h1>
        <p class="date">{{ dateLabel }}</p>
      </div>
    </header>

    <section v-if="!today.hasPlan.value" class="empty">
      <Icon :icon="Sparkles" :size="28" class="empty-icon" />
      <h2 class="empty-title">{{ t('today.empty.title') }}</h2>
      <p class="empty-body">{{ t('today.empty.body') }}</p>
      <p v-if="smartSummary" class="empty-summary">{{ smartSummary }}</p>
      <div class="empty-actions">
        <button class="cta" type="button" :disabled="!smart" @click="createSmartPlan">
          {{ smart ? t('today.empty.create') : t('today.empty.preparing') }}
        </button>
        <button class="cta cta-ghost" type="button" @click="setupOpen = true">
          {{ t('today.empty.manual') }}
        </button>
      </div>
    </section>

    <template v-else>
      <section class="section" :aria-label="t('today.title')">
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
              {{
                t('today.tasksSr', {
                  done: today.completedTasks.value,
                  total: today.totalTasks.value,
                  percent: today.completionPercentage.value,
                })
              }}
            </span>
          </div>

          <button
            class="streak"
            type="button"
            :class="{ 'streak-lit': streak.isTodayComplete.value }"
            :aria-label="t('today.viewHistory')"
            @click="openJournal"
          >
            <Icon :icon="Flame" :size="18" class="streak-icon" />
            <span class="streak-n">{{ streakLabel }}</span>
            <!-- Nudge before celebration: a run that's about to break needs the
                 day finishing, not congratulating. -->
            <span class="streak-sub">
              <template v-if="streak.isAtRisk.value">{{ t('today.streak.atRisk') }}</template>
              <template v-else-if="streak.isPersonalBest.value">{{ t('today.streak.best') }}</template>
              <template v-else-if="streak.longestStreak.value > 0">
                {{ t('today.streak.bestN', { n: streak.longestStreak.value }) }}
              </template>
              <template v-else>{{ t('today.streak.start') }}</template>
            </span>
          </button>

          <button
            class="settings-gear"
            type="button"
            :aria-label="t('today.editPlan')"
            @click="setupOpen = true"
          >
            <Icon :icon="Settings" :size="20" />
          </button>
        </div>
      </section>

      <RouterLink to="/progress" class="progress-link">
        <Icon :icon="Brain" :size="16" />
        <span class="progress-link-label">{{ t('today.viewProgress') }}</span>
        <Icon :icon="ChevronRight" :size="16" class="progress-link-chevron" />
      </RouterLink>

      <p v-if="today.isOffDay.value" class="notice">{{ t('today.offDay') }}</p>

      <p v-else-if="today.tasks.value?.metadata.pausedNewMemorization" class="notice">
        {{ t('today.paused') }}
      </p>

      <section
        v-if="
          today.newMemorization.value.length ||
          today.revision.value.length ||
          today.weakReinforcement.value.length ||
          showVersesOfDay
        "
        class="section"
      >
        <TodayAudioPlayer
          ref="audioPlayerRef"
          :new-pages="today.newMemorization.value"
          :revision-pages="today.revision.value"
          :weak-pages="today.weakReinforcement.value"
          :show-verses-of-day="showVersesOfDay"
          :verses-of-day="today.versesOfDay.value"
        />
      </section>

      <section v-if="today.newMemorization.value.length" class="section" aria-labelledby="s-new">
        <h2 id="s-new" class="section-title">{{ t('today.sections.new') }}</h2>
        <ul class="rows">
          <template v-for="p in today.newMemorization.value" :key="p">
            <li v-if="isFrontPage(p) && frontLineCoverage" class="line-fill-row">
              <span :id="`line-fill-label-${p}`" class="line-fill-label">
                {{ t('markPage.linesProgress', { covered: frontLineCoverage.covered, total: frontLineCoverage.total }) }}
              </span>
              <span
                class="line-fill-bar"
                role="progressbar"
                :aria-labelledby="`line-fill-label-${p}`"
                :aria-valuenow="frontLineCoverage.covered"
                :aria-valuemin="0"
                :aria-valuemax="frontLineCoverage.total"
              >
                <span
                  class="line-fill-bar-inner"
                  :style="{ width: `${frontLineCoverage.total > 0 ? (frontLineCoverage.covered / frontLineCoverage.total) * 100 : 0}%` }"
                ></span>
              </span>
            </li>
            <TaskRow
              :page="p"
              :meta="metaFor(p)"
              :done="today.isDone('newMemorization', p)"
              :done-label="t('task.memorized')"
              :open-label="isFrontPage(p) ? t('task.openMemorize', { page: p }) : undefined"
              @open="openNewMemorization(p)"
              @clean="today.complete('newMemorization', p)"
            />
          </template>
        </ul>
      </section>

      <section v-if="today.revision.value.length" class="section" aria-labelledby="s-rev">
        <h2 id="s-rev" class="section-title">{{ t('today.sections.revision') }}</h2>
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
        <h2 id="s-weak" class="section-title">{{ t('today.sections.weak') }}</h2>
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
        <h2 id="s-habits" class="section-title">{{ t('today.sections.habits') }}</h2>
        <ul class="rows">
          <li v-for="h in today.habits.value" :key="h.id" class="habit">
            <span class="habit-text">
              <span class="habit-name">{{ t(h.nameKey) }}</span>
              <span class="habit-desc">{{ t(h.descriptionKey) }}</span>
            </span>
            <button
              v-if="h.wiresTo === 'record'"
              class="habit-link"
              type="button"
              :aria-label="t('today.quickTest.openAria')"
              @click="startQuickTest"
            >
              <Icon :icon="Shuffle" :size="16" />
            </button>
            <button
              v-else-if="h.wiresTo === 'audio'"
              class="habit-link"
              type="button"
              :aria-label="t('today.listen.openAria')"
              @click="openAudioVerses"
            >
              <Icon :icon="Headphones" :size="16" />
            </button>
            <Toggle
              :model-value="today.isHabitDone(h.id)"
              :label="t(h.nameKey)"
              @update:model-value="onHabit(h.id, $event)"
            />
          </li>
        </ul>
      </section>

      <p v-if="today.totalTasks.value === 0" class="notice">{{ t('today.nothing') }}</p>

      <p v-else-if="today.allDone.value" class="done-note">{{ t('today.allDone') }}</p>
    </template>

    <PlanSetup v-model:open="setupOpen" />
  </main>
</template>

<style scoped>
.today {
  min-height: 100%;
  background: var(--color-bg);
  color: var(--color-text);
  padding-bottom: 3rem;
}
@media (min-width: 1024px) {
  .today {
    max-width: 42rem;
    margin-inline: auto;
  }
}
/* Keep the last rows clear of the docked mini-player. */
.today.audio-docked {
  padding-bottom: 12rem;
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
  gap: 0.5rem;
  padding: calc(0.6rem + env(safe-area-inset-top)) 1rem 0.6rem;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2.25rem;
  width: 2.25rem;
  flex: none;
  border-radius: var(--radius-md);
  color: var(--color-text);
  cursor: pointer;
}
.icon-btn:hover {
  background: var(--color-elevated);
}
.icon-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.title {
  font-size: var(--text-lg);
  font-weight: 600;
}
.date {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.settings-gear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2.5rem;
  width: 2.5rem;
  flex: 0 0 auto;
  margin-inline-start: auto;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  cursor: pointer;
}
.settings-gear:hover {
  background: var(--color-elevated);
  color: var(--color-text);
}
.settings-gear:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.progress-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 46rem;
  margin: 0.75rem auto 0;
  padding: 0.6rem 1rem;
  color: var(--color-text-muted);
  text-decoration: none;
}
.progress-link:hover {
  color: var(--color-text);
}
.progress-link:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
  border-radius: var(--radius-sm);
}
.progress-link-label {
  font-size: var(--text-sm);
  font-weight: 500;
}
.progress-link-chevron {
  margin-inline-start: auto;
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
  padding: 0.25rem 0.4rem;
  margin-inline-start: -0.4rem;
  border: none;
  border-radius: var(--radius-md);
  background: none;
  color: inherit;
  text-align: start;
  cursor: pointer;
}
.streak:hover {
  background: var(--color-elevated);
}
.streak:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
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
.line-fill-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0 0.25rem;
}
.line-fill-label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.line-fill-bar {
  display: block;
  height: 0.375rem;
  border-radius: var(--radius-full);
  background: var(--color-border);
  overflow: hidden;
}
.line-fill-bar-inner {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-accent);
  transition: width 0.2s ease;
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
.empty-summary {
  font-size: var(--text-sm);
  font-weight: 600;
  max-width: 26rem;
  padding: 0.6rem 0.9rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.cta {
  height: 2.5rem;
  padding: 0 1.1rem;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}
.cta:hover:not(:disabled) {
  background: var(--color-accent-hover);
}
.cta:disabled {
  opacity: 0.6;
  cursor: default;
}
.cta-ghost {
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text);
}
.cta-ghost:hover {
  background: var(--color-elevated);
}
.cta:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .ring-fill {
    transition: none;
  }
}
</style>
