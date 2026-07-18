<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { useSettingsStore, type ThemeName } from '@/stores/settings'
import Icon from '@/components/Icon.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'

/**
 * The app's settings surface, reached from the reader's "More" sheet. It owns
 * the preferences with no in-context home — today the colour theme (reader and
 * audio options live with their own surfaces). Data backup (export/import) joins
 * here in 9.4.3.
 */
const router = useRouter()
const settings = useSettingsStore()

const themeOptions: { value: ThemeName; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'sepia', label: 'Sepia' },
]

// SegmentedControl is a two-way string model; funnel writes through setTheme so
// the choice is applied to the document and persisted, not just held in the ref.
const theme = computed<string>({
  get: () => settings.theme,
  set: (v) => settings.setTheme(v as ThemeName),
})
</script>

<template>
  <main class="settings-view">
    <header class="topbar">
      <button class="icon-btn" type="button" aria-label="Back to reader" @click="router.push('/')">
        <Icon :icon="ArrowLeft" :size="20" />
      </button>
      <h1 class="title">Settings</h1>
    </header>

    <section class="section" aria-label="Appearance">
      <h2 class="section-title">Appearance</h2>
      <div class="row">
        <span class="row-label">Theme</span>
        <SegmentedControl v-model="theme" :options="themeOptions" label="Colour theme" />
      </div>
      <p class="hint">Sepia is easier on the eyes for long reading sessions.</p>
    </section>
  </main>
</template>

<style scoped>
.settings-view {
  min-height: 100dvh;
  background: var(--color-bg);
  color: var(--color-text);
  padding-bottom: 3rem;
}
.topbar {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: calc(0.6rem + env(safe-area-inset-top)) 1rem 0.6rem;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.title {
  font-size: var(--text-lg);
  font-weight: 600;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2.25rem;
  width: 2.25rem;
  border-radius: var(--radius-md);
  color: var(--color-text);
}
.icon-btn:hover {
  background: var(--color-elevated);
}
.icon-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.section {
  max-width: 46rem;
  margin: 1.25rem auto 0;
  padding: 0 1rem;
}
.section-title {
  font-size: var(--text-sm);
  font-weight: 600;
  margin-bottom: 0.75rem;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.row-label {
  font-size: var(--text-base);
}
.hint {
  margin-top: 0.6rem;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
</style>
