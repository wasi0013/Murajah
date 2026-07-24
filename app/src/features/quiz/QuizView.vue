<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { X, Flame, ArrowRight, Sparkles, RefreshCw } from 'lucide-vue-next'
import Icon from '@/components/Icon.vue'
import { useQuiz, type QuizModeChoice } from '@/composables/useQuiz'
import { usePlanPersistence } from '@/composables/usePlanPersistence'
import { useProgressPersistence } from '@/composables/useProgressPersistence'
import { useMistakesPersistence } from '@/composables/useMistakesPersistence'
import { useQuizPersistence } from '@/composables/useQuizPersistence'
import { usePlanStore } from '@/stores/plan'
import type { QuizScopeKind } from '@/core/quiz/scope'
import TranslationMatchCard from './TranslationMatchCard.vue'
import ContinuationCard from './ContinuationCard.vue'
import WordCompletionCard from './WordCompletionCard.vue'
import QuizScopePicker from './QuizScopePicker.vue'
import { useI18n } from '@/core/i18n'

/**
 * Quiz — a focused, one-question-at-a-time practice surface. Drills the pages in
 * your plan by default (weak pages weighted, ~25% strong interleaved), feeding
 * per-page accuracy back into weakness scoring. Built mobile-first: a single
 * question fills the screen, answers sit in the thumb zone, feedback is instant.
 */
const router = useRouter()
const plan = usePlanStore()
const quiz = useQuiz()
const { t } = useI18n()

// Weakness reads progress + mistakes + quiz history; the plan gives the default scope.
const planPersistence = usePlanPersistence()
const progressPersistence = useProgressPersistence()
const mistakesPersistence = useMistakesPersistence()
const quizPersistence = useQuizPersistence()

onMounted(() => {
  void mistakesPersistence.hydrate()
  void quizPersistence.hydrate()
  void progressPersistence.hydrate()
  void planPersistence.hydrate()
})
onBeforeUnmount(() => {
  planPersistence.dispose()
  progressPersistence.dispose()
  mistakesPersistence.dispose()
  quizPersistence.dispose()
  quiz.dispose()
})

const hasPlan = computed(() => plan.hasPlan)

const scopeKind = computed<QuizScopeKind>({
  get: () => quiz.scope.value.kind,
  set: (kind) => {
    quiz.scope.value = { kind, surahs: quiz.scope.value.surahs, juz: quiz.scope.value.juz }
  },
})

const scopeSources = computed<{ kind: QuizScopeKind; label: string }[]>(() => [
  { kind: 'plan', label: t('quiz.scope.plan') },
  { kind: 'surah', label: t('quiz.scope.surahs') },
  { kind: 'juz', label: t('quiz.scope.juz') },
  { kind: 'all', label: t('quiz.scope.all') },
])

const modes = computed<{ value: QuizModeChoice; label: string; hint: string }[]>(() => [
  { value: 'mixed', label: t('quiz.modes.mixed.label'), hint: t('quiz.modes.mixed.hint') },
  {
    value: 'translation',
    label: t('quiz.modes.translation.label'),
    hint: t('quiz.modes.translation.hint'),
  },
  {
    value: 'continuation',
    label: t('quiz.modes.continuation.label'),
    hint: t('quiz.modes.continuation.hint'),
  },
  {
    value: 'completion',
    label: t('quiz.modes.completion.label'),
    hint: t('quiz.modes.completion.hint'),
  },
])

const canStart = computed(() => {
  if (quiz.loading.value) return false
  const s = quiz.scope.value
  if (s.kind === 'surah') return !!s.surahs?.length
  if (s.kind === 'juz') return !!s.juz?.length
  return true
})

function leave(): void {
  if (window.history.length > 1) router.back()
  else void router.push({ name: 'today' })
}
</script>

<template>
  <main class="quiz">
    <!-- ————— Setup ————— -->
    <template v-if="quiz.phase.value === 'setup'">
      <header class="topbar">
        <h1 class="title">{{ t('quiz.title') }}</h1>
        <button class="icon-btn" :aria-label="t('quiz.close')" @click="leave">
          <Icon :icon="X" :size="20" />
        </button>
      </header>

      <div class="setup">
        <section class="block">
          <h2 class="block-title">{{ t('quiz.practiceFrom') }}</h2>
          <div class="chips" role="radiogroup" :aria-label="t('quiz.practiceFromAria')">
            <button
              v-for="s in scopeSources"
              :key="s.kind"
              type="button"
              role="radio"
              :aria-checked="scopeKind === s.kind"
              class="chip"
              :class="{ 'chip-on': scopeKind === s.kind }"
              :disabled="s.kind === 'plan' && !hasPlan"
              @click="scopeKind = s.kind"
            >
              {{ s.label }}
            </button>
          </div>
          <p v-if="!hasPlan && scopeKind === 'plan'" class="hint">
            {{ t('quiz.noPlanHint') }}
          </p>
          <QuizScopePicker
            v-if="scopeKind === 'surah' || scopeKind === 'juz'"
            :kind="scopeKind"
            v-model:surahs="quiz.scope.value.surahs"
            v-model:juz="quiz.scope.value.juz"
          />
        </section>

        <section class="block">
          <h2 class="block-title">{{ t('quiz.questionStyle') }}</h2>
          <div class="mode-grid" role="radiogroup" :aria-label="t('quiz.questionStyle')">
            <button
              v-for="m in modes"
              :key="m.value"
              type="button"
              role="radio"
              :aria-checked="quiz.mode.value === m.value"
              class="mode"
              :class="{ 'mode-on': quiz.mode.value === m.value }"
              @click="quiz.mode.value = m.value"
            >
              <span class="mode-label">{{ m.label }}</span>
              <span class="mode-hint">{{ m.hint }}</span>
            </button>
          </div>
        </section>
      </div>

      <div class="start-bar">
        <button class="start" type="button" :disabled="!canStart" @click="quiz.start()">
          <Icon :icon="Sparkles" :size="18" />
          {{ quiz.loading.value ? t('quiz.preparing') : t('quiz.startPractice') }}
        </button>
      </div>
    </template>

    <!-- ————— Empty ————— -->
    <template v-else-if="quiz.phase.value === 'empty'">
      <header class="topbar">
        <h1 class="title">{{ t('quiz.title') }}</h1>
        <button class="icon-btn" :aria-label="t('quiz.backToSetup')" @click="quiz.exit()">
          <Icon :icon="X" :size="20" />
        </button>
      </header>
      <section class="empty">
        <p class="empty-title">{{ t('quiz.emptyTitle') }}</p>
        <p class="empty-body">
          {{ t('quiz.emptyBody') }}
        </p>
        <button class="start start-ghost" type="button" @click="quiz.exit()">
          {{ t('quiz.changeSelection') }}
        </button>
      </section>
    </template>

    <!-- ————— Playing ————— -->
    <template v-else>
      <header class="topbar playbar">
        <button class="icon-btn" :aria-label="t('quiz.endSession')" @click="quiz.exit()">
          <Icon :icon="X" :size="20" />
        </button>
        <div class="stats" aria-live="off">
          <span class="stat">
            <Icon :icon="Flame" :size="15" :class="quiz.streak.value > 0 ? 'flame-on' : 'flame-off'" />
            <span class="stat-n">{{ quiz.streak.value }}</span>
          </span>
          <span class="stat stat-score">{{ quiz.correct.value }}/{{ quiz.answered.value }}</span>
        </div>
      </header>

      <div v-if="quiz.loading.value && !quiz.current.value" class="loading">
        <Icon :icon="RefreshCw" :size="22" class="spin" />
      </div>

      <div v-else-if="quiz.current.value" class="stage">
        <div class="card">
          <TranslationMatchCard
            v-if="quiz.current.value.mode === 'translation'"
            :question="quiz.current.value"
            :font-family="quiz.fontFamily.value"
            :revealed="quiz.answer.revealed"
            :chosen-index="quiz.answer.chosenIndex"
            @pick="quiz.answerChoice($event)"
          />
          <ContinuationCard
            v-else-if="quiz.current.value.mode === 'continuation'"
            :question="quiz.current.value"
            :font-family="quiz.fontFamily.value"
            :revealed="quiz.answer.revealed"
            :chosen-index="quiz.answer.chosenIndex"
            @pick="quiz.answerChoice($event)"
          />
          <WordCompletionCard
            v-else
            :question="quiz.current.value"
            :font-family="quiz.fontFamily.value"
            :revealed="quiz.answer.revealed"
            @answer="quiz.answerCompletion($event)"
          />
        </div>

        <div class="footer">
          <button
            v-if="quiz.answer.revealed"
            class="next"
            :class="quiz.answer.correct ? 'next-ok' : 'next-no'"
            type="button"
            @click="quiz.skip()"
          >
            {{ quiz.answer.correct ? t('quiz.correct') : t('quiz.next') }}
            <Icon :icon="ArrowRight" :size="18" />
          </button>
        </div>
      </div>
    </template>
  </main>
</template>

<style scoped>
.quiz {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: var(--color-bg);
  color: var(--color-text);
}
@media (min-width: 1024px) {
  .quiz {
    max-width: 42rem;
    margin-inline: auto;
  }
}

/* Topbar */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  padding-top: calc(1rem + env(safe-area-inset-top));
}
.title {
  font-size: var(--text-2xl);
  font-weight: 700;
  letter-spacing: var(--tracking-tight);
}
.icon-btn {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}
.icon-btn:active {
  background: var(--color-elevated);
}
.icon-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Setup */
.setup {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding: 0.5rem 1.25rem 1.5rem;
  overflow-y: auto;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}
.block-title {
  font-size: var(--text-sm);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--color-text-muted);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.chip {
  min-height: 2.75rem;
  padding: 0.5rem 1rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-standard);
}
.chip-on {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}
.chip:disabled {
  opacity: 0.4;
  cursor: default;
}
.chip:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.mode-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.625rem;
}
.mode {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.875rem 1rem;
  min-height: 4.25rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  text-align: start;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-standard);
}
.mode-on {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 10%, var(--color-surface));
}
.mode:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.mode-label {
  font-weight: 600;
}
.mode-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

/* Start bar — pinned to the thumb zone */
.start-bar {
  position: sticky;
  bottom: 0;
  padding: 1rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom));
  background: linear-gradient(to top, var(--color-bg) 70%, transparent);
}
.start {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  min-height: 3.5rem;
  border: none;
  border-radius: var(--radius-lg);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font: inherit;
  font-size: var(--text-lg);
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-md);
  transition: transform var(--duration-fast) var(--ease-standard);
}
.start:not(:disabled):active {
  transform: scale(0.98);
}
.start:disabled {
  opacity: 0.5;
  cursor: default;
  box-shadow: none;
}
.start:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.start-ghost {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1.5px solid var(--color-border);
  box-shadow: none;
}

/* Empty */
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.875rem;
  padding: 2rem 1.75rem;
  text-align: center;
}
.empty-title {
  font-size: var(--text-xl);
  font-weight: 600;
}
.empty-body {
  color: var(--color-text-muted);
  max-width: 22rem;
}

/* Playing */
.playbar {
  padding-bottom: 0.5rem;
}
.stats {
  display: flex;
  align-items: center;
  gap: 0.875rem;
}
.stat {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-weight: 600;
}
.flame-on {
  color: var(--color-accent);
}
.flame-off {
  color: var(--color-text-muted);
}
.stat-score {
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0.5rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom));
}
.card {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 1rem 0;
}
.footer {
  min-height: 3.75rem;
  display: flex;
  align-items: center;
}
.next {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  min-height: 3.25rem;
  border: none;
  border-radius: var(--radius-lg);
  font: inherit;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-on-status);
  cursor: pointer;
}
.next-ok {
  background: var(--color-success);
}
.next-no {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}
.next:focus-visible {
  outline: 2px solid var(--color-text);
  outline-offset: 2px;
}
.loading {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
}
.spin {
  animation: spin 900ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
  .start:not(:disabled):active {
    transform: none;
  }
}
</style>
