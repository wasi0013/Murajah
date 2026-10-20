<script setup lang="ts">
import { Undo2 } from 'lucide-vue-next'
import Icon from './Icon.vue'
import { useI18n } from '@/core/i18n'

/**
 * "Back to page N", offered only right after a hop (a quick-jump, a surah from the
 * contents, a deep link) and gone as soon as the reader reads on — so it costs no
 * permanent space. Tapping it hops back, which offers the way forward again: two
 * spots can be flipped between. Hangs just under the reading views' sticky top bar
 * (the parent header is its containing block); the full trail lives in the
 * quick-jump palette.
 */
defineProps<{ page: number | null }>()
const emit = defineEmits<{ back: [page: number] }>()
const { t } = useI18n()
</script>

<template>
  <Transition name="trail-chip">
    <button
      v-if="page !== null"
      type="button"
      class="trail-chip"
      :aria-label="t('reader.backToPage', { n: page })"
      @click="emit('back', page)"
    >
      <Icon :icon="Undo2" :size="14" class="trail-icon" />
      <span>{{ t('common.page', { n: page }) }}</span>
    </button>
  </Transition>
</template>

<style scoped>
.trail-chip {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: 2rem;
  padding: 0 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
  color: var(--color-text);
  font-size: var(--text-sm);
  white-space: nowrap;
}
.trail-chip:hover {
  background: var(--color-elevated);
}
.trail-chip:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.trail-icon {
  color: var(--color-accent);
}
/* "Back" points the way the reader came from: right, in a right-to-left UI. */
.trail-chip:dir(rtl) .trail-icon {
  transform: scaleX(-1);
}
.trail-chip-enter-active,
.trail-chip-leave-active {
  transition:
    opacity var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-standard);
}
.trail-chip-enter-from,
.trail-chip-leave-to {
  opacity: 0;
  transform: translate(-50%, -0.375rem);
}
@media (prefers-reduced-motion: reduce) {
  .trail-chip-enter-active,
  .trail-chip-leave-active {
    transition: none;
  }
}
</style>
