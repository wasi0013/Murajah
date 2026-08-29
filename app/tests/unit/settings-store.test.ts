import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '@/stores/settings'
import { getPref, setPref, _resetPrefsDb } from '@/core/storage/prefs'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetPrefsDb()
  setActivePinia(createPinia())
  document.documentElement.removeAttribute('data-theme')
})

describe('settings store theme', () => {
  it('setTheme updates state, paints the document, and persists', async () => {
    const s = useSettingsStore()
    s.setTheme('dark')
    expect(s.theme).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(await getPref('theme')).toBe('dark')
  })

  it('hydrate applies a saved theme onto a fresh store', async () => {
    await setPref('theme', 'sepia')
    const s = useSettingsStore()
    await s.hydrate()
    expect(s.theme).toBe('sepia')
    expect(document.documentElement.getAttribute('data-theme')).toBe('sepia')
  })

  it('hydrate falls back to the default (sepia) when nothing is saved', async () => {
    const s = useSettingsStore()
    await s.hydrate()
    expect(s.theme).toBe('sepia')
    expect(document.documentElement.getAttribute('data-theme')).toBe('sepia')
  })

  it('hydrate ignores a stored value that is not a known theme', async () => {
    await setPref('theme', 'neon')
    const s = useSettingsStore()
    await s.hydrate()
    expect(s.theme).toBe('sepia')
  })
})

describe('settings store progress-tracking toggles', () => {
  it('are on by default', () => {
    const s = useSettingsStore()
    expect(s.trackHasanah).toBe(true)
    expect(s.trackReadingTime).toBe(true)
    expect(s.trackListeningTime).toBe(true)
  })

  it('each setter updates state and persists, independently of the others', async () => {
    const s = useSettingsStore()
    s.setTrackHasanah(false)
    expect(s.trackHasanah).toBe(false)
    expect(s.trackReadingTime).toBe(true)
    expect(s.trackListeningTime).toBe(true)
    expect(await getPref('trackHasanah')).toBe(false)
    expect(await getPref('trackReadingTime')).toBeUndefined()
  })

  it('hydrate restores a saved false onto a fresh store (the core persistence requirement)', async () => {
    await setPref('trackReadingTime', false)
    const s = useSettingsStore()
    await s.hydrate()
    expect(s.trackReadingTime).toBe(false)
    // Untouched toggles keep their default.
    expect(s.trackHasanah).toBe(true)
    expect(s.trackListeningTime).toBe(true)
  })

  it('hydrate restores a saved true just as well as a saved false', async () => {
    await setPref('trackHasanah', false)
    await setPref('trackHasanah', true) // flipped back on
    const s = useSettingsStore()
    await s.hydrate()
    expect(s.trackHasanah).toBe(true)
  })

  it('hydrate defaults to true (on) when nothing is saved', async () => {
    const s = useSettingsStore()
    await s.hydrate()
    expect(s.trackHasanah).toBe(true)
    expect(s.trackReadingTime).toBe(true)
    expect(s.trackListeningTime).toBe(true)
  })

  it('hydrate ignores a stored value that is not a boolean', async () => {
    await setPref('trackListeningTime', 'nope')
    const s = useSettingsStore()
    await s.hydrate()
    expect(s.trackListeningTime).toBe(true)
  })
})
