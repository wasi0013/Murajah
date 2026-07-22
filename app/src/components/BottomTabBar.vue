<script setup lang="ts">
import type { Component } from 'vue'
import Icon from './Icon.vue'
import { useI18n } from '@/core/i18n'

// Mobile/webview-first primary navigation. Presentational + accessible; the app
// shell wires `modelValue` to the router. Handles safe-area insets.
interface TabDef {
  value: string
  label: string
  icon: Component
}

const model = defineModel<string>({ required: true })
defineProps<{ tabs: TabDef[] }>()
const { t } = useI18n()
</script>

<template>
  <nav class="tabbar" :aria-label="t('common.primaryNav')">
    <button
      v-for="t in tabs"
      :key="t.value"
      type="button"
      class="tab"
      :class="{ 'tab-active': model === t.value }"
      :aria-current="model === t.value ? 'page' : undefined"
      @click="model = t.value"
    >
      <Icon :icon="t.icon" :size="22" />
      <span class="tab-label">{{ t.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.tabbar {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  padding-bottom: env(safe-area-inset-bottom);
}
.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 0.5rem 0.25rem;
  border: none;
  background: none;
  color: var(--color-text-muted);
  transition: color var(--duration-fast) var(--ease-standard);
  cursor: pointer;
}
.tab-active {
  color: var(--color-accent);
}
.tab-label {
  font-size: var(--text-xs);
  line-height: 1;
}
.tab:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -3px;
  border-radius: var(--radius-sm);
}

/* Desktop: reflow into a persistent left rail instead of a bottom bar — the
   shell (App.vue) switches its own positioning at the same breakpoint. */
@media (min-width: 1024px) {
  .tabbar {
    grid-auto-flow: row;
    grid-auto-columns: unset;
    grid-auto-rows: min-content;
    align-content: start;
    gap: 0.25rem;
    width: 4.75rem;
    height: 100%;
    padding: 0.75rem 0.5rem;
    border-top: none;
    border-inline-end: 1px solid var(--color-border);
  }
  .tab {
    padding: 0.6rem 0.25rem;
    border-radius: var(--radius-md);
    transition:
      color var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard);
  }
  .tab-active {
    background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  }
}
</style>
