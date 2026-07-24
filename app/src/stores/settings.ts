import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPref, setPref } from '@/core/storage/prefs'

export type ThemeName = 'light' | 'dark' | 'sepia'

/** Prefs KV key — shared with the backup layer (see core/storage/exportImport). */
const THEME_PREF_KEY = 'theme'
export const THEMES: readonly ThemeName[] = ['light', 'dark', 'sepia']

/**
 * Global app settings. Today this owns the colour theme — the one preference
 * with no in-context home (reader/audio prefs live with their surfaces). The
 * theme is applied to `<html data-theme>` (design/tokens.css keys off it) and
 * persisted best-effort to the prefs KV so it survives a reload.
 */
export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<ThemeName>('light')

  /** Reflect the current theme onto the document root (no persistence). */
  function apply(name: ThemeName) {
    document.documentElement.setAttribute('data-theme', name)
  }

  /** User picks a theme: update state, paint the document, and remember it. */
  function setTheme(next: ThemeName) {
    theme.value = next
    apply(next)
    void setPref(THEME_PREF_KEY, next)
  }

  /** Load the saved theme (falling back to the default) and apply it on boot. */
  async function hydrate(): Promise<void> {
    const saved = await getPref<ThemeName>(THEME_PREF_KEY)
    theme.value = saved && THEMES.includes(saved) ? saved : theme.value
    apply(theme.value)
  }

  return { theme, setTheme, hydrate }
})
