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

  it('hydrate falls back to the default when nothing is saved', async () => {
    const s = useSettingsStore()
    await s.hydrate()
    expect(s.theme).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('hydrate ignores a stored value that is not a known theme', async () => {
    await setPref('theme', 'neon')
    const s = useSettingsStore()
    await s.hydrate()
    expect(s.theme).toBe('light')
  })
})
