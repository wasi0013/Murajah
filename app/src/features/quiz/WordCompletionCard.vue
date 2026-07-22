<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { CompletionQuestion } from '@/core/quiz/types'
import { useI18n } from '@/core/i18n'

/**
 * Fill the blanked words of a verse from a word bank. Slot-based throughout: a tap
 * fills the focused slot, and scoring (in the parent) matches each slot to its own
 * answer by id — so a repeated word never confuses which blank it belongs to.
 */
const props = defineProps<{
  question: CompletionQuestion
  fontFamily: string
  revealed: boolean
}>()
const emit = defineEmits<{ answer: [assignment: Record<number, number>] }>()

const { t } = useI18n()

/** slotId → bank word id. */
const fills = reactive<Record<number, number>>({})
const focused = ref<number | null>(null)

const slots = computed(() => props.question.tokens.filter((t) => t.blank))
const bankText = computed(() => new Map(props.question.bank.map((b) => [b.id, b.text])))
const usedBankIds = computed(() => new Set(Object.values(fills)))

function reset(): void {
  for (const k of Object.keys(fills)) delete fills[Number(k)]
  focused.value = slots.value[0]?.slotId ?? null
}
watch(() => props.question, reset, { immediate: true })

function firstEmptySlot(): number | null {
  return slots.value.find((s) => fills[s.slotId!] === undefined)?.slotId ?? null
}

function focusSlot(slotId: number): void {
  if (props.revealed) return
  focused.value = slotId
}

function placeWord(bankId: number): void {
  if (props.revealed || usedBankIds.value.has(bankId)) return
  const slot = focused.value ?? firstEmptySlot()
  if (slot === null) return
  fills[slot] = bankId
  focused.value = firstEmptySlot()
  // All slots filled → submit for scoring.
  if (slots.value.every((s) => fills[s.slotId!] !== undefined)) {
    emit('answer', { ...fills })
  }
}

function clearSlot(slotId: number): void {
  if (props.revealed || fills[slotId] === undefined) return
  delete fills[slotId]
  focused.value = slotId
}

function slotText(slotId: number): string {
  const id = fills[slotId]
  return id === undefined ? '' : (bankText.value.get(id) ?? '')
}

function slotCorrect(slotId: number): boolean {
  return slotText(slotId) === props.question.answers[slotId]
}

function slotClass(slotId: number): string {
  if (props.revealed) return slotCorrect(slotId) ? 'slot-correct' : 'slot-wrong'
  if (focused.value === slotId) return 'slot-focused'
  return fills[slotId] !== undefined ? 'slot-filled' : 'slot-empty'
}
</script>

<template>
  <div class="wc">
    <p class="prompt-label">{{ t('quiz.completionPrompt') }}</p>

    <p class="verse" dir="rtl" lang="ar" :style="{ fontFamily }">
      <template v-for="(tok, i) in question.tokens" :key="i">
        <button
          v-if="tok.blank"
          type="button"
          class="slot"
          :class="slotClass(tok.slotId!)"
          :disabled="revealed"
          :aria-label="
            t('quiz.blankAria', {
              i: slots.findIndex((s) => s.slotId === tok.slotId) + 1,
              n: slots.length,
            })
          "
          @click="fills[tok.slotId!] === undefined ? focusSlot(tok.slotId!) : clearSlot(tok.slotId!)"
        >
          <span v-if="slotText(tok.slotId!)">{{ slotText(tok.slotId!) }}</span>
          <span v-else class="slot-placeholder" aria-hidden="true">•••</span>
        </button>
        <span v-else class="word">{{ tok.text }}</span>
        {{ ' ' }}
      </template>
    </p>

    <div v-if="revealed" class="answer-note" aria-live="polite">
      <span v-if="slots.every((s) => slotCorrect(s.slotId!))" class="note-ok">{{ t('quiz.correct') }}</span>
      <span v-else class="note-no">
        {{ t('quiz.answerLabel') }}
        <span dir="rtl" lang="ar" :style="{ fontFamily }">{{
          slots.map((s) => question.answers[s.slotId!]).join(' ')
        }}</span>
      </span>
    </div>

    <div class="bank" role="group" :aria-label="t('quiz.wordBank')">
      <button
        v-for="w in question.bank"
        :key="w.id"
        type="button"
        class="chip"
        dir="rtl"
        lang="ar"
        :style="{ fontFamily }"
        :disabled="revealed || usedBankIds.has(w.id)"
        @click="placeWord(w.id)"
      >
        {{ w.text }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.wc {
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
  font-size: var(--reading-size-sm);
  line-height: 2.4;
  text-align: center;
  color: var(--color-text);
  padding: 0.25rem 0;
}
.word {
  white-space: nowrap;
}
.slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 3.25rem;
  min-height: 2.25rem;
  padding: 0 0.5rem;
  margin: 0 0.1rem;
  border: 1.5px dashed var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-elevated);
  color: var(--color-text);
  font: inherit;
  vertical-align: middle;
  cursor: pointer;
}
.slot-placeholder {
  color: var(--color-text-muted);
  letter-spacing: 0.1em;
}
.slot-focused {
  border-style: solid;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent);
}
.slot-filled {
  border-style: solid;
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 10%, var(--color-surface));
}
.slot-correct {
  border-style: solid;
  border-color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 14%, var(--color-surface));
}
.slot-wrong {
  border-style: solid;
  border-color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 14%, var(--color-surface));
}
.answer-note {
  text-align: center;
  font-size: var(--text-sm);
}
.note-ok {
  color: var(--color-success);
  font-weight: 600;
}
.note-no {
  color: var(--color-text-muted);
}
.note-no span {
  color: var(--color-text);
  font-size: var(--reading-size-sm);
}
.bank {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}
.chip {
  min-height: 2.75rem;
  padding: 0.4rem 0.9rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--reading-size-sm);
  line-height: 1.4;
  cursor: pointer;
  transition:
    opacity var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-standard);
}
.chip:not(:disabled):active {
  transform: scale(0.95);
}
.chip:disabled {
  opacity: 0.35;
  cursor: default;
}
.chip:focus-visible,
.slot:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .chip {
    transition: none;
  }
  .chip:not(:disabled):active {
    transform: none;
  }
}
</style>
