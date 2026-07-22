<script setup lang="ts">
import { computed } from 'vue'
import QuizOption from './QuizOption.vue'
import type { ContinuationQuestion } from '@/core/quiz/types'
import { useI18n } from '@/core/i18n'

/** Show a verse; choose the one that comes next / before it. */
const props = defineProps<{
  question: ContinuationQuestion
  fontFamily: string
  revealed: boolean
  chosenIndex: number | null
}>()
defineEmits<{ pick: [index: number] }>()

const { t } = useI18n()

const prompt = computed(() =>
  props.question.direction === 'next'
    ? t('quiz.continuationNext')
    : t('quiz.continuationPrev'),
)
</script>

<template>
  <div class="cont">
    <p class="prompt-label">{{ prompt }}</p>
    <p class="verse" dir="rtl" lang="ar" :style="{ fontFamily }">{{ question.arabic }}</p>

    <ul class="opts" role="list">
      <li v-for="(choice, i) in question.choices" :key="i">
        <QuizOption
          :is-correct="choice.isCorrect"
          :chosen="chosenIndex === i"
          :revealed="revealed"
          @pick="$emit('pick', i)"
        >
          <span class="opt-verse" dir="rtl" lang="ar" :style="{ fontFamily }">{{ choice.text }}</span>
        </QuizOption>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.cont {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.prompt-label {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-align: center;
}
.verse {
  font-size: var(--reading-size-md);
  line-height: var(--qpc-line-height);
  text-align: center;
  color: var(--color-text);
  padding: 0.5rem 0;
}
.opts {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}
.opt-verse {
  display: block;
  font-size: var(--reading-size-sm);
  line-height: var(--qpc-line-height);
}
</style>
