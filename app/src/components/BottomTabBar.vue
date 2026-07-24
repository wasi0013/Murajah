<script setup lang="ts">
import type { Component } from 'vue'
import { Menu, MessageCircle, Store } from 'lucide-vue-next'
import Icon from './Icon.vue'
import { useI18n } from '@/core/i18n'
import { DISCORD_URL, PLAY_STORE_URL } from '@/core/links'

// Mobile/webview-first primary navigation. Presentational + accessible; the app
// shell wires `modelValue` to the router. Handles safe-area insets. On desktop
// (see the >=1024px rules below) this same nav reflows into a left rail: a
// brand mark up top, `moreTabs` unpacked as ordinary inline tabs (room enough
// in a vertical rail — no sheet needed), and community/store links pinned to
// the bottom. On the mobile bottom bar there's only room for the primary
// `tabs`, so `moreTabs` stay tucked behind the trigger button, which opens
// the "More" sheet in App.vue (that sheet also carries the community/store
// links on mobile, since `.nav-links` is desktop-only here).
interface TabDef {
  value: string
  label: string
  icon: Component
}

const model = defineModel<string>({ required: true })
defineProps<{ tabs: TabDef[]; moreTabs: TabDef[] }>()
const emit = defineEmits<{ more: [] }>()
const { t } = useI18n()
</script>

<template>
  <nav class="tabbar" :aria-label="t('common.primaryNav')">
    <div class="brand" aria-hidden="true">
      <img src="/pwa-icon-192.png" alt="" width="32" height="32" />
    </div>
    <div class="tabs">
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
      <button
        v-for="mt in moreTabs"
        :key="mt.value"
        type="button"
        class="tab tab-desktop-only"
        :class="{ 'tab-active': model === mt.value }"
        :aria-current="model === mt.value ? 'page' : undefined"
        @click="model = mt.value"
      >
        <Icon :icon="mt.icon" :size="22" />
        <span class="tab-label">{{ mt.label }}</span>
      </button>
      <button type="button" class="tab tab-mobile-only" @click="emit('more')">
        <Icon :icon="Menu" :size="22" />
        <span class="tab-label">{{ t('common.tabs.more') }}</span>
      </button>
    </div>
    <div class="nav-links">
      <a class="nav-link" :href="DISCORD_URL" target="_blank" rel="noopener noreferrer" :aria-label="t('common.discord')">
        <Icon :icon="MessageCircle" :size="20" />
      </a>
      <a class="nav-link" :href="PLAY_STORE_URL" target="_blank" rel="noopener noreferrer" :aria-label="t('common.playStore')">
        <Icon :icon="Store" :size="20" />
      </a>
    </div>
  </nav>
</template>

<style scoped>
.tabbar {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  padding-bottom: env(safe-area-inset-bottom);
}
.brand,
.nav-links {
  /* Bottom-bar layout has no room for these — desktop rail only, see below. */
  display: none;
}
.tabs {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
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
.tab-desktop-only {
  display: none;
}

/* Desktop: reflow into a persistent left rail instead of a bottom bar — the
   shell (App.vue) switches its own positioning at the same breakpoint. */
@media (min-width: 1024px) {
  .tab-desktop-only {
    display: flex;
  }
  .tab-mobile-only {
    display: none;
  }
  .tabbar {
    width: 4.75rem;
    height: 100%;
    padding: 0.75rem 0.5rem;
    border-top: none;
    border-inline-end: 1px solid var(--color-border);
  }
  .brand {
    display: flex;
    justify-content: center;
    padding-bottom: 1rem;
  }
  .brand img {
    width: 3rem;
    height: 3rem;
    border-radius: var(--radius-md);
  }
  .tabs {
    grid-auto-flow: row;
    grid-auto-columns: unset;
    grid-auto-rows: min-content;
    align-content: start;
    gap: 0.25rem;
    flex: 1 1 auto;
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
  .nav-links {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border);
  }
  .nav-link {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.6rem 0.25rem;
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    transition:
      color var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard);
  }
  .nav-link:hover,
  .nav-link:focus-visible {
    color: var(--color-text);
    background: var(--color-elevated);
  }
  .nav-link:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }
}
</style>
