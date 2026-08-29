import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPref, setPref } from '@/core/storage/prefs'

export type ThemeName = 'light' | 'dark' | 'sepia'

/** Prefs KV key — shared with the backup layer (see core/storage/exportImport). */
const THEME_PREF_KEY = 'theme'
export const THEMES: readonly ThemeName[] = ['light', 'dark', 'sepia']

// Prefs KV keys for the progress-tracking toggles — also shared with the
// backup layer. Each gates a single metric's accrual in stores/progress.ts;
// see that file's awardHasanah/addReadingSeconds/addListeningSeconds.
const TRACK_HASANAH_KEY = 'trackHasanah'
const TRACK_READING_TIME_KEY = 'trackReadingTime'
const TRACK_LISTENING_TIME_KEY = 'trackListeningTime'

/**
 * Global app settings. Owns the colour theme and the three progress-tracking
 * toggles — preferences with no in-context home (reader/audio prefs live
 * with their surfaces). The theme is applied to `<html data-theme>`
 * (design/tokens.css keys off it); everything here is persisted best-effort
 * to the prefs KV so it survives a reload.
 */
export const useSettingsStore = defineStore('settings', () => {
  // Sepia is the default for a new/never-configured install; hydrate() below
  // overrides this from the saved pref for anyone who already picked a theme.
  const theme = ref<ThemeName>('sepia')

  // Default ON for all three — turning one off is an explicit opt-out (see
  // SettingsView.vue's "Progress tracking" section and its hint copy).
  const trackHasanah = ref(true)
  const trackReadingTime = ref(true)
  const trackListeningTime = ref(true)

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

  function setTrackHasanah(next: boolean) {
    trackHasanah.value = next
    void setPref(TRACK_HASANAH_KEY, next)
  }
  function setTrackReadingTime(next: boolean) {
    trackReadingTime.value = next
    void setPref(TRACK_READING_TIME_KEY, next)
  }
  function setTrackListeningTime(next: boolean) {
    trackListeningTime.value = next
    void setPref(TRACK_LISTENING_TIME_KEY, next)
  }

  /** Load saved settings (falling back to defaults) and apply the theme on boot. */
  async function hydrate(): Promise<void> {
    const [savedTheme, savedHasanah, savedReadingTime, savedListeningTime] = await Promise.all([
      getPref<ThemeName>(THEME_PREF_KEY),
      getPref<boolean>(TRACK_HASANAH_KEY),
      getPref<boolean>(TRACK_READING_TIME_KEY),
      getPref<boolean>(TRACK_LISTENING_TIME_KEY),
    ])
    theme.value = savedTheme && THEMES.includes(savedTheme) ? savedTheme : theme.value
    apply(theme.value)
    // Booleans: `typeof saved === 'boolean'`, never truthiness — a saved
    // `false` is a real, meaningful value here, unlike a themeless string.
    if (typeof savedHasanah === 'boolean') trackHasanah.value = savedHasanah
    if (typeof savedReadingTime === 'boolean') trackReadingTime.value = savedReadingTime
    if (typeof savedListeningTime === 'boolean') trackListeningTime.value = savedListeningTime
  }

  return {
    theme,
    setTheme,
    trackHasanah,
    trackReadingTime,
    trackListeningTime,
    setTrackHasanah,
    setTrackReadingTime,
    setTrackListeningTime,
    hydrate,
  }
})
