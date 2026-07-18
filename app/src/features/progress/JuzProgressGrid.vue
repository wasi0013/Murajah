<script setup lang="ts">
import { computed } from 'vue'
import { juzProgress, type JuzGroup } from '@/core/memorization/progressView'

/**
 * Juz Progress (9.2) — 30 cells, one per juz, showing how much of each is
 * memorized (ported from the legacy analytics "Juz Progress" tab). Colour lives
 * in a status dot + progress fill over a neutral surface — never text on a
 * coloured field — so labels stay AA-legible in every theme. Tap → the juz's
 * first page.
 */
const props = defineProps<{ groups: JuzGroup[]; memorized: Set<number> }>()
const emit = defineEmits<{ select: [page: number] }>()

type Status = 'complete' | 'partial' | 'empty'
interface Cell {
  juz: number
  startPage: number
  done: number
  total: number
  percent: number
  status: Status
}

const cells = computed<Cell[]>(() =>
  props.groups.map((g) => {
    const { memorized, total } = juzProgress(g, props.memorized)
    const status: Status = memorized === 0 ? 'empty' : memorized >= total ? 'complete' : 'partial'
    return {
      juz: g.juz,
      startPage: g.startPage,
      done: memorized,
      total,
      percent: total > 0 ? Math.round((memorized / total) * 100) : 0,
      status,
    }
  }),
)
</script>

<template>
  <div class="juz-progress">
    <ul class="grid" role="list">
      <li v-for="c in cells" :key="c.juz">
        <button
          type="button"
          class="cell"
          :class="`is-${c.status}`"
          :aria-label="`Juz ${c.juz}: ${c.done} of ${c.total} pages memorized`"
          @click="emit('select', c.startPage)"
        >
          <span class="head">
            <span class="dot" aria-hidden="true"></span>
            <span class="juz-n">Juz {{ c.juz }}</span>
          </span>
          <span class="track" aria-hidden="true">
            <span class="fill" :style="{ width: `${c.percent}%` }"></span>
          </span>
          <span class="count">{{ c.done }}/{{ c.total }}</span>
        </button>
      </li>
    </ul>

    <p class="legend">
      <span class="leg"><span class="dot is-complete" aria-hidden="true"></span>Completed</span>
      <span class="leg"><span class="dot is-partial" aria-hidden="true"></span>Partial</span>
      <span class="leg"><span class="dot is-empty" aria-hidden="true"></span>Not started</span>
    </p>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(6rem, 1fr));
  gap: 0.5rem;
}
.cell {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
  padding: 0.55rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard);
}
.cell:hover {
  background: var(--color-elevated);
}
.cell:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.head {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.juz-n {
  font-size: var(--text-xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.dot {
  flex: 0 0 auto;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: var(--radius-full);
  background: var(--color-border);
}
/* Status colour lives only in the dot + fill, never behind the text. */
.is-complete .dot,
.dot.is-complete {
  background: var(--color-success);
}
.is-partial .dot,
.dot.is-partial {
  background: var(--color-warn);
}
.is-empty .dot,
.dot.is-empty {
  background: color-mix(in oklab, var(--color-text-muted) 45%, transparent);
}
.track {
  height: 0.35rem;
  border-radius: var(--radius-full);
  background: var(--color-elevated);
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-success);
}
.is-partial .fill {
  background: var(--color-warn);
}
.count {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
  margin-top: 1rem;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.leg {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
</style>
