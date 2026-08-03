import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setLocale, locale } from '@/core/i18n'
import { useOnboardingStore } from '@/stores/onboarding'
import { getPref, _resetPrefsDb } from '@/core/storage/prefs'
import { _resetUserDataDb } from '@/core/storage/userData'
import OnboardingModal from '@/components/OnboardingModal.vue'

let wrapper: VueWrapper | null = null

// The `ar`/`bn` catalogs load via a real dynamic import (module transform +
// eval), which can take a few real event-loop turns under vitest — more than
// a couple of microtask flushes reliably cover. Poll with real timers instead
// of guessing a flush count.
async function waitUntil(predicate: () => boolean, timeoutMs = 3000) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil: condition never became true')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

beforeEach(async () => {
  // Reset the i18n singleton first, against whatever DB is currently active —
  // its `setPref('locale', ...)` write is discarded next. Doing this *after*
  // swapping in the fresh IDBFactory below would instead seed it with a
  // `locale` pref, making onboarding's "does any pref already exist?" backfill
  // check see a false "returning user" signal for every test in this file.
  await setLocale('en')
  globalThis.indexedDB = new IDBFactory()
  _resetPrefsDb()
  _resetUserDataDb()
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  document.body.style.overflow = ''
})

async function openOnboarding() {
  const onboarding = useOnboardingStore()
  await onboarding.hydrate() // no saved flag -> active
  wrapper = mount(OnboardingModal)
  return onboarding
}

describe('OnboardingModal', () => {
  it('shows for a first-time visitor and hides once completed', async () => {
    await openOnboarding()
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('does not show once onboarding was already completed', async () => {
    await useOnboardingStore().hydrate() // nothing saved yet, but...
    const onboarding = useOnboardingStore()
    onboarding.complete()
    wrapper = mount(OnboardingModal)
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('cannot be dismissed via Escape or scrim click before a language is picked', async () => {
    await openOnboarding()
    const root = document.body.querySelector('.dlg-root')!
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()

    const scrim = document.body.querySelector('.dlg-scrim') as HTMLElement
    scrim.click()
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('picking a language applies it live and enables Continue; Continue completes onboarding', async () => {
    const onboarding = await openOnboarding()
    const options = document.body.querySelectorAll('[role="radio"]')
    expect(options).toHaveLength(3)

    const continueBtn = document.body.querySelector('.onboarding-continue') as HTMLButtonElement
    expect(continueBtn.disabled).toBe(true)

    const arabic = Array.from(options).find((o) => o.textContent?.includes('العربية')) as HTMLElement
    arabic.click()
    await waitUntil(() => locale.value === 'ar')

    expect(arabic.getAttribute('aria-checked')).toBe('true')
    expect(document.documentElement.getAttribute('dir')).toBe('rtl')
    expect(continueBtn.disabled).toBe(false)

    continueBtn.click()
    expect(onboarding.active).toBe(false)
    expect(await getPref('onboardingCompleted')).toBe(true)
    await wrapper!.vm.$nextTick()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })
})
