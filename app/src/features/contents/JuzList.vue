<script setup lang="ts">
import { Headphones } from 'lucide-vue-next'
import Icon from '@/components/Icon.vue'
import type { JuzRow } from '@/core/navigation/contents'
import { useI18n } from '@/core/i18n'

const { t } = useI18n()

// Presentational juz index. Emits the chosen juz number. With `showListen`, each
// row also offers a headphones shortcut that deep-links into Listen (emits `listen`).
defineProps<{ rows: JuzRow[]; showListen?: boolean }>()
defineEmits<{ select: [juz: number]; listen: [juz: number] }>()
</script>

<template>
  <ul class="list" role="list">
    <li v-for="r in rows" :key="r.juz" class="row-wrap">
      <button type="button" class="row" @click="$emit('select', r.juz)">
        <span class="num" aria-hidden="true">{{ r.juz }}</span>
        <span class="main">
          <span class="name">{{ t('common.juz', { n: r.juz }) }}</span>
          <span class="meta">
            {{ r.startSurahName }}
            <span class="dot" aria-hidden="true">·</span>
            {{ t('juzList.pages', { start: r.startPage, end: r.endPage }) }}
          </span>
        </span>
      </button>
      <button
        v-if="showListen"
        type="button"
        class="listen-btn"
        :aria-label="t('juzList.listen', { n: r.juz })"
        @click="$emit('listen', r.juz)"
      >
        <Icon :icon="Headphones" :size="18" />
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
.row-wrap {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.6rem 0.5rem;
  border-radius: var(--radius-md);
  background: none;
  text-align: start;
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
.listen-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-full);
  color: var(--color-accent);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard);
}
.listen-btn:hover {
  background: color-mix(in oklab, var(--color-accent) 12%, transparent);
}
.listen-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
</style>
