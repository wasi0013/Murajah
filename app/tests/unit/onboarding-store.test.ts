import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { useOnboardingStore } from '@/stores/onboarding'
import { getPref, setPref, _resetPrefsDb } from '@/core/storage/prefs'
import { saveMistakes, _resetUserDataDb } from '@/core/storage/userData'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetPrefsDb()
  _resetUserDataDb()
  setActivePinia(createPinia())
})

describe('onboarding store', () => {
  it('hydrate shows onboarding when nothing is saved (first visit)', async () => {
    const s = useOnboardingStore()
    expect(s.active).toBe(false) // no flash before hydrate resolves
    await s.hydrate()
    expect(s.active).toBe(true)
  })

  it('hydrate hides onboarding once it has been completed before', async () => {
    await setPref('onboardingCompleted', true)
    const s = useOnboardingStore()
    await s.hydrate()
    expect(s.active).toBe(false)
  })

  it('complete hides onboarding and persists the flag', async () => {
    const s = useOnboardingStore()
    await s.hydrate()
    expect(s.active).toBe(true)
    s.complete()
    expect(s.active).toBe(false)
    expect(await getPref('onboardingCompleted')).toBe(true)
  })

  it('a fresh hydrate after the pref is cleared (e.g. a full app reset) shows it again', async () => {
    await setPref('onboardingCompleted', true)
    const s = useOnboardingStore()
    await s.hydrate()
    expect(s.active).toBe(false)

    // Simulate resetApp() wiping the murajah-prefs store, then the next boot's hydrate.
    globalThis.indexedDB = new IDBFactory()
    _resetPrefsDb()
    await s.hydrate()
    expect(s.active).toBe(true)
  })

  // Regression coverage for the migration problem: the flag didn't exist before
  // onboarding shipped, so every existing user's very first hydrate() after the
  // upgrade would otherwise look identical to a first-ever visit.
  describe('backfill for users who predate onboarding', () => {
    it('does not show onboarding to a user with an existing pref (e.g. a changed theme)', async () => {
      await setPref('theme', 'dark') // no onboardingCompleted saved — pre-dates the feature
      const s = useOnboardingStore()
      await s.hydrate()
      expect(s.active).toBe(false)
      expect(await getPref('onboardingCompleted')).toBe(true) // backfilled, so it's one-time
    })

    it('does not show onboarding to a user with existing user data but no prefs', async () => {
      await saveMistakes(new Map([[12, new Set([3])]])) // murajah-userdata, not murajah-prefs
      const s = useOnboardingStore()
      await s.hydrate()
      expect(s.active).toBe(false)
      expect(await getPref('onboardingCompleted')).toBe(true)
    })

    it('still shows onboarding when both stores are genuinely empty', async () => {
      const s = useOnboardingStore()
      await s.hydrate()
      expect(s.active).toBe(true)
      expect(await getPref('onboardingCompleted')).toBeUndefined()
    })
  })
})
