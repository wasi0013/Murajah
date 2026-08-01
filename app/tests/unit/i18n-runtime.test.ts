import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { t, setLocale, hydrateLocale, locale, dir } from '@/core/i18n'
import { getPref, setPref, _resetPrefsDb } from '@/core/storage/prefs'

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  _resetPrefsDb()
  // Reset the module singleton to the default between tests.
  await setLocale('en')
  globalThis.indexedDB = new IDBFactory()
  _resetPrefsDb()
})

describe('i18n runtime', () => {
  it('translates from the active catalog and defaults to English', () => {
    expect(locale.value).toBe('en')
    expect(t('settings.title')).toBe('Settings')
    expect(dir.value).toBe('ltr')
  })

  it('setLocale loads the catalog, paints <html>, and persists', async () => {
    await setLocale('ar')
    expect(locale.value).toBe('ar')
    expect(t('settings.title')).toBe('الإعدادات')
    expect(dir.value).toBe('rtl')
    expect(document.documentElement.getAttribute('dir')).toBe('rtl')
    expect(document.documentElement.getAttribute('lang')).toBe('ar')
    expect(await getPref('locale')).toBe('ar')
  })

  it('keeps Bengali left-to-right', async () => {
    await setLocale('bn')
    expect(dir.value).toBe('ltr')
    expect(document.documentElement.getAttribute('dir')).toBe('ltr')
    expect(t('settings.title')).toBe('সেটিংস')
  })

  it('falls back to the raw key for an unknown message', () => {
    expect(t('nope.not.here')).toBe('nope.not.here')
  })

  // A rarely-reached UI branch (the surah/juz picker's "nav index still loading"
  // state) has no e2e coverage — this is the cheap guard against a typo'd key
  // silently rendering as a literal dot-path instead of throwing.
  it('resolves the juz-picker loading message (a rarely-hit UI branch)', () => {
    expect(t('progress.pick.juzLoading')).not.toBe('progress.pick.juzLoading')
  })

  // The picker's per-kind hints render on every open but nothing asserts their
  // text (e2e only checks visible page counts) — same cheap guard as above.
  it('resolves the surah/juz picker hints', () => {
    expect(t('progress.pick.hintJuz')).not.toBe('progress.pick.hintJuz')
    expect(t('progress.pick.hintSurah')).not.toBe('progress.pick.hintSurah')
  })

  it('interpolates params', () => {
    // en has no param strings in this surface; verify passthrough on a real key.
    expect(t('common.cancel', { unused: 1 })).toBe('Cancel')
  })

  it('hydrateLocale applies a saved locale', async () => {
    await setPref('locale', 'ar')
    await hydrateLocale()
    expect(locale.value).toBe('ar')
    expect(dir.value).toBe('rtl')
  })

  it('hydrateLocale ignores an unknown stored value', async () => {
    await setPref('locale', 'fr')
    await hydrateLocale()
    expect(locale.value).toBe('en')
  })
})
