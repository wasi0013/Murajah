import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { router } from '@/router'
import { locale, setLocale } from '@/core/i18n'
import { getPref, _resetPrefsDb } from '@/core/storage/prefs'

/**
 * `?lang=` override on the shareable, outside-link surfaces (/download,
 * /preview and its sub-routes) — see router/index.ts's LANG_OVERRIDE_ROUTES
 * and core/i18n's setLocaleOverride/clearLocaleOverride doc comments.
 */
describe('lang override route wiring', () => {
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    _resetPrefsDb()
    await setLocale('en')
    globalThis.indexedDB = new IDBFactory()
    _resetPrefsDb()
    localStorage.setItem('murajah:reader', 'on')
  })
  afterEach(() => {
    localStorage.removeItem('murajah:reader')
  })

  it('applies ?lang= on /download without persisting it', async () => {
    await router.push('/download?lang=ar')
    await router.isReady()
    await vi.waitFor(() => expect(locale.value).toBe('ar'))
    expect(document.documentElement.getAttribute('lang')).toBe('ar')
    // Unlike setLocale, an override must never write to prefs — leaving
    // this route should restore whatever the user actually saved (here,
    // nothing — the default), not the URL's language.
    expect(await getPref('locale')).toBeUndefined()
  })

  it('applies ?lang= on a /preview sub-route', async () => {
    await router.push('/preview/2/255?lang=bn')
    await router.isReady()
    await vi.waitFor(() => expect(locale.value).toBe('bn'))
  })

  it('restores the saved preference on leaving an overridden route', async () => {
    await setLocale('en')
    await router.push('/download?lang=ar')
    await router.isReady()
    await vi.waitFor(() => expect(locale.value).toBe('ar'))

    await router.push('/settings')
    await router.isReady()
    await vi.waitFor(() => expect(locale.value).toBe('en'))
  })

  it('ignores an unknown lang value', async () => {
    await router.push('/download?lang=fr')
    await router.isReady()
    expect(locale.value).toBe('en')
  })

  it('does not override on a route outside the shareable set', async () => {
    await router.push('/settings?lang=ar')
    await router.isReady()
    expect(locale.value).toBe('en')
  })

  it('an explicit setLocale call while overridden persists and wins', async () => {
    await router.push('/download?lang=ar')
    await router.isReady()
    await vi.waitFor(() => expect(locale.value).toBe('ar'))

    await setLocale('bn')
    expect(locale.value).toBe('bn')
    expect(await getPref('locale')).toBe('bn')
  })
})
