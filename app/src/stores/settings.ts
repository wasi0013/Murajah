import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ThemeName = 'light' | 'dark' | 'sepia'
export type ReadingLayout = 'qpc' | 'indopak'

/**
 * Global app settings. Placeholder store for Phase 0 — grows in later phases
 * (persisted to IndexedDB via the storage layer once it exists).
 */
export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<ThemeName>('light')
  const layout = ref<ReadingLayout>('qpc')

  function setTheme(next: ThemeName) {
    theme.value = next
    document.documentElement.setAttribute('data-theme', next)
  }

  return { theme, layout, setTheme }
})
