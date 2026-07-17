<script setup lang="ts">
import { Check, ChevronRight } from 'lucide-vue-next'
import Icon from '@/components/Icon.vue'

/**
 * One page task in Today's queue: open it in the reader, then record how it went.
 *
 * There's no un-check — a recall is a real event, so once recorded the row settles
 * into a done state (see `useToday.complete`). Done is marked by a check glyph and
 * the word "Done" as well as colour, never colour alone.
 */
defineProps<{
  page: number
  done: boolean
  /** Juz / surah context, e.g. "Juz 30". */
  meta?: string
  /**
   * Whether the recall is graded. Revision and weak pages are recited from memory,
   * so they carry Clean / Shaky; a new page is simply memorized or not yet.
   */
  gradable?: boolean
  /** Label for the plain completion action on a non-gradable row. */
  doneLabel?: string
}>()

defineEmits<{ open: []; clean: []; mistake: [] }>()
</script>

<template>
  <li class="row" :class="{ 'row-done': done }">
    <button class="open" type="button" :aria-label="`Open page ${page} in the reader`" @click="$emit('open')">
      <span class="page">
        <span class="page-n">Page {{ page }}</span>
        <span v-if="meta" class="page-meta">{{ meta }}</span>
      </span>
      <Icon :icon="ChevronRight" :size="16" class="open-chevron" />
    </button>

    <div v-if="done" class="state">
      <Icon :icon="Check" :size="14" />
      <span>Done</span>
    </div>

    <div v-else class="actions">
      <template v-if="gradable">
        <button class="act act-clean" type="button" :aria-label="`Page ${page} recited cleanly`" @click="$emit('clean')">
          Clean
        </button>
        <button class="act act-shaky" type="button" :aria-label="`Page ${page} needed work`" @click="$emit('mistake')">
          Shaky
        </button>
      </template>
      <button v-else class="act act-clean" type="button" :aria-label="`Mark page ${page} ${doneLabel ?? 'done'}`" @click="$emit('clean')">
        {{ doneLabel ?? 'Done' }}
      </button>
    </div>
  </li>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.5rem 0.5rem 0.75rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.row-done {
  background: var(--color-elevated);
  border-color: transparent;
}
.open {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex: 1;
  min-width: 0;
  padding: 0.25rem 0;
  background: none;
  border: none;
  color: inherit;
  text-align: start;
  cursor: pointer;
}
.page {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}
.page-n {
  font-size: var(--text-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.row-done .page-n {
  color: var(--color-text-muted);
  text-decoration: line-through;
}
.page-meta {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.open-chevron {
  color: var(--color-text-muted);
  flex: none;
}
.actions {
  display: flex;
  gap: 0.35rem;
  flex: none;
}
.act {
  height: 2rem;
  padding: 0 0.7rem;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
}
.act-clean {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}
.act-clean:hover {
  background: var(--color-accent-hover);
}
.act-shaky {
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text-muted);
}
.act-shaky:hover {
  color: var(--color-danger);
  border-color: var(--color-danger);
}
.state {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  flex: none;
  padding: 0 0.6rem 0 0.4rem;
  height: 2rem;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-success);
}
.open:focus-visible,
.act:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  border-radius: var(--radius-md);
}
</style>
