<script setup lang="ts">
import type { JuzRow } from '@/core/navigation/contents'

// Presentational juz index. Emits the chosen juz number.
defineProps<{ rows: JuzRow[] }>()
defineEmits<{ select: [juz: number] }>()
</script>

<template>
  <ul class="list" role="list">
    <li v-for="r in rows" :key="r.juz">
      <button type="button" class="row" @click="$emit('select', r.juz)">
        <span class="num" aria-hidden="true">{{ r.juz }}</span>
        <span class="main">
          <span class="name">Juz {{ r.juz }}</span>
          <span class="meta">
            {{ r.startSurahName }}
            <span class="dot" aria-hidden="true">·</span>
            pages {{ r.startPage }}–{{ r.endPage }}
          </span>
        </span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  padding: 0.6rem 0.5rem;
  border-radius: var(--radius-md);
  background: none;
  text-align: left;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard);
}
.row:hover {
  background: var(--color-elevated);
}
.row:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
.num {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-full);
  background: color-mix(in oklab, var(--color-accent) 12%, transparent);
  color: var(--color-accent);
  font-size: var(--text-xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.name {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text);
}
.meta {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
