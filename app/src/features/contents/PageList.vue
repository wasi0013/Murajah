<script setup lang="ts">
import { useI18n } from '@/core/i18n'

// Presentational page jumper: a scannable grid of page-number chips. Emits the
// chosen page. Static DOM (no per-chip reactivity), so the full 604-chip grid
// renders without jank.
const props = defineProps<{ pageCount: number }>()
defineEmits<{ select: [page: number] }>()

const { t } = useI18n()
const pages = Array.from({ length: props.pageCount }, (_, i) => i + 1)
</script>

<template>
  <div class="grid" role="group" :aria-label="t('contents.tabs.page')">
    <button
      v-for="p in pages"
      :key="p"
      type="button"
      class="chip"
      :aria-label="t('common.page', { n: p })"
      @click="$emit('select', p)"
    >
      {{ p }}
    </button>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(3rem, 1fr));
  gap: 0.4rem;
}
.chip {
  min-height: 2.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: border-color var(--duration-fast), background var(--duration-fast);
}
.chip:hover {
  border-color: var(--color-accent);
  background: var(--color-elevated);
}
.chip:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
</style>
