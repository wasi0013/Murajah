<script setup lang="ts">
import type { SurahRow } from '@/core/navigation/contents'

// Presentational surah index. Emits the chosen surah number; the view resolves it
// to a page and navigates (keeps navigation in one place, and lets Listen reuse
// the same selection).
defineProps<{ rows: SurahRow[] }>()
defineEmits<{ select: [surah: number] }>()
</script>

<template>
  <ul class="list" role="list">
    <li v-for="r in rows" :key="r.surah">
      <button type="button" class="row" @click="$emit('select', r.surah)">
        <span class="num" aria-hidden="true">{{ r.surah }}</span>
        <span class="main">
          <span class="translit">{{ r.translit }}</span>
          <span class="meta">
            {{ r.ayahs }} {{ r.ayahs === 1 ? 'ayah' : 'ayahs' }}
            <span class="dot" aria-hidden="true">·</span>
            <span class="place" :class="r.place">{{ r.place === 'makki' ? 'Makki' : 'Madani' }}</span>
          </span>
        </span>
        <span class="arabic" dir="rtl">{{ r.arabic }}</span>
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
  flex: 1 1 auto;
}
.translit {
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
}
.place.madani {
  color: color-mix(in oklab, var(--color-success) 85%, var(--color-text-muted));
}
.arabic {
  flex: 0 0 auto;
  font-size: var(--text-lg);
  color: var(--color-text);
  font-family: var(--font-arabic, serif);
}
</style>
