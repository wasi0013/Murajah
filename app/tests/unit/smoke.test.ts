import { describe, it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '@/stores/settings'

describe('foundation smoke', () => {
  it('resolves @/ alias and boots a Pinia store', () => {
    setActivePinia(createPinia())
    const settings = useSettingsStore()
    expect(settings.theme).toBe('light')
    settings.setTheme('dark')
    expect(settings.theme).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('has a working IndexedDB shim', () => {
    expect(typeof indexedDB).toBe('object')
    expect(indexedDB).toBeTruthy()
  })
})
