import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPref, hasAnyPref, setPref } from '@/core/storage/prefs'
import { hasAnyUserData } from '@/core/storage/userData'

/** Prefs KV key. Lives in `murajah-prefs`, so `resetApp()` clears it along with
 * everything else — a full reset boots exactly like a first-ever install and
 * onboarding runs again. */
const ONBOARDING_PREF_KEY = 'onboardingCompleted'

/**
 * Gates the first-run onboarding flow (currently: the language-picker modal).
 * `active` starts `false` and flips true only once `hydrate()` confirms no
 * prior run is recorded, so returning users never see a flash of it.
 */
export const useOnboardingStore = defineStore('onboarding', () => {
  const active = ref(false)

  /**
   * Check the saved flag and show onboarding if it's never been completed.
   * This flag didn't exist before onboarding shipped, so on its own it can't
   * tell "never onboarded" apart from "used the app for months, pre-dates
   * this feature" — every existing user would fail the check the same way a
   * first-time visitor does. Backfill it: if any other pref or user data is
   * already on disk, that's evidence of a prior visit, so treat onboarding as
   * already done (and record it, so this check is one-time).
   */
  async function hydrate(): Promise<void> {
    const done = await getPref<boolean>(ONBOARDING_PREF_KEY)
    if (done) {
      active.value = false
      return
    }
    const returning = (await hasAnyPref()) || (await hasAnyUserData())
    if (returning) {
      active.value = false
      void setPref(ONBOARDING_PREF_KEY, true)
      return
    }
    active.value = true
  }

  /** User finished onboarding: hide it and remember not to show it again. */
  function complete(): void {
    active.value = false
    void setPref(ONBOARDING_PREF_KEY, true)
  }

  return { active, hydrate, complete }
})
