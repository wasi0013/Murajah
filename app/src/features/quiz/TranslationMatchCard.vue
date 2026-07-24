<script setup lang="ts">
import QuizOption from './QuizOption.vue'
import type { TranslationQuestion } from '@/core/quiz/types'
import { useI18n } from '@/core/i18n'

/** Show a verse's Arabic; choose its meaning. */
defineProps<{
  question: TranslationQuestion
  fontFamily: string
  revealed: boolean
  chosenIndex: number | null
}>()
defineEmits<{ pick: [index: number] }>()

const { t } = useI18n()
</script>

<template>
  <div class="tm">
    <p class="prompt-label">{{ t('quiz.translationPrompt') }}</p>
    <p class="verse" dir="rtl" lang="ar" :style="{ fontFamily }">{{ question.arabic }}</p>

    <ul class="opts" role="list">
      <li v-for="(choice, i) in question.choices" :key="i">
        <QuizOption
          :is-correct="choice.isCorrect"
          :chosen="chosenIndex === i"
          :revealed="revealed"
          @pick="$emit('pick', i)"
        >
          {{ choice.text }}
        </QuizOption>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.tm {
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
</style>
