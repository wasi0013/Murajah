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
</style>
