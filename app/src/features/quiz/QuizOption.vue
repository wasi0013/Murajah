<script setup lang="ts">
import { computed } from 'vue'
import { Check, X } from 'lucide-vue-next'
import Icon from '@/components/Icon.vue'

/**
 * One answer option — a large, thumb-friendly target. Before the answer is
 * revealed it's a plain pressable; after, it self-colours: the correct option goes
 * green (always, so the right answer is taught even on a miss), the chosen-wrong one
 * red, the rest recede. Colour is never the only signal — a check / cross icon
 * carries the same meaning for colour-blind users.
 */
const props = defineProps<{
  isCorrect: boolean
  chosen: boolean
  revealed: boolean
}>()
defineEmits<{ pick: [] }>()

const state = computed(() => {
  if (!props.revealed) return 'idle'
  if (props.isCorrect) return 'correct'
  if (props.chosen) return 'wrong'
  return 'muted'
})
</script>

<template>
  <button
    type="button"
    class="opt"
    :class="`opt-${state}`"
    :disabled="revealed"
    @click="$emit('pick')"
  >
    <span class="opt-body"><slot /></span>
    <span v-if="state === 'correct'" class="opt-mark opt-mark-ok" aria-hidden="true">
      <Icon :icon="Check" :size="18" />
    </span>
    <span v-else-if="state === 'wrong'" class="opt-mark opt-mark-no" aria-hidden="true">
      <Icon :icon="X" :size="18" />
    </span>
  </button>
</template>

<style scoped>
.opt {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  min-height: 3.5rem;
  padding: 0.875rem 1rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  text-align: start;
  font: inherit;
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-standard),
    opacity var(--duration-fast) var(--ease-standard);
}
.opt:disabled {
  cursor: default;
}
.opt:not(:disabled):active {
  transform: scale(0.985);
}
.opt:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.opt-body {
  flex: 1;
  min-width: 0;
}
.opt-mark {
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  color: var(--color-on-status);
}
.opt-mark-ok {
  background: var(--color-success);
}
.opt-mark-no {
  background: var(--color-danger);
}

.opt-correct {
  border-color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 12%, var(--color-surface));
}
.opt-wrong {
  border-color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 12%, var(--color-surface));
}
.opt-muted {
  opacity: 0.55;
}

@media (prefers-reduced-motion: reduce) {
  .opt {
    transition: none;
  }
  .opt:not(:disabled):active {
    transform: none;
  }
}
</style>
