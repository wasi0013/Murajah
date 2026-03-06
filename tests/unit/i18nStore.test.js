/**
 * Unit tests for i18nStore
 *
 * Tests the translation functions (t, interpolation, key resolution) and the
 * initLocaleFromStorage function that syncs locale from localStorage.
 *
 * Note: i18nStore.js uses `const { reactive } = Vue` (CDN global).
 * The global.Vue mock is set in tests/setup.js before this file is loaded.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { i18nState, t, initLocaleFromStorage, setLocale, SUPPORTED_LOCALES } from
  '../../source/resources/js/stores/i18nStore.js';

// ─── Minimal locale fixtures ─────────────────────────────────────────────────

const EN_FIXTURE = {
  quiz: {
    tabs: {
      lightningRound: 'Lightning Round',
      verseCompletion: 'Verse Completion',
      settings: 'Settings'
    },
    status: {
      settingsSaved: 'Settings saved successfully!'
    },
    completion: {
      surahVerse: 'Surah {surah}, Verse {verse}'
    }
  }
};

const BN_FIXTURE = {
  quiz: {
    tabs: {
      lightningRound: 'বজ্রপাত রাউন্ড',
      verseCompletion: 'আয়াত পূর্ণ করুন',
      settings: 'সেটিংস'
    },
    status: {
      settingsSaved: 'সেটিংস সফলভাবে সংরক্ষিত হয়েছে!'
    },
    completion: {
      surahVerse: 'সূরা {surah}, আয়াত {verse}'
    }
  }
};

const AR_FIXTURE = {
  quiz: {
    tabs: {
      lightningRound: 'جولة سريعة',
      verseCompletion: 'إكمال الآية',
      settings: 'الإعدادات'
    }
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Reset i18nState between tests to avoid cross-test contamination.
 * Since `reactive` is mocked as identity, i18nState is a plain object.
 */
function resetI18nState() {
  i18nState.currentLocale = 'en';
  i18nState.messages = {};
  i18nState.loading = false;
}

/**
 * Create a fetch mock that returns the given locale data.
 */
function mockFetch(localeMap) {
  return vi.fn().mockImplementation((url) => {
    for (const [locale, data] of Object.entries(localeMap)) {
      if (url.includes(`/${locale}.json`)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(data)
        });
      }
    }
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({})
    });
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('i18nStore – SUPPORTED_LOCALES', () => {
  it('includes en, bn, and ar', () => {
    expect(SUPPORTED_LOCALES).toContain('en');
    expect(SUPPORTED_LOCALES).toContain('bn');
    expect(SUPPORTED_LOCALES).toContain('ar');
  });
});

describe('i18nStore – t() translation function', () => {
  beforeEach(() => {
    resetI18nState();
    // Seed messages directly (bypasses fetch)
    i18nState.messages['en'] = EN_FIXTURE;
    i18nState.messages['bn'] = BN_FIXTURE;
    i18nState.currentLocale = 'en';
  });

  afterEach(() => {
    resetI18nState();
  });

  it('returns the correct English translation', () => {
    expect(t('quiz.tabs.lightningRound')).toBe('Lightning Round');
  });

  it('returns the correct Bangla translation when locale is bn', () => {
    i18nState.currentLocale = 'bn';
    expect(t('quiz.tabs.lightningRound')).toBe('বজ্রপাত রাউন্ড');
  });

  it('falls back to the fallback locale when key is missing in current locale', () => {
    // Add a key only to bn (fallback), not to en
    i18nState.messages['bn'] = {
      ...BN_FIXTURE,
      quiz: { ...BN_FIXTURE.quiz, onlyInFallback: 'শুধু ফলব্যাক এ' }
    };
    i18nState.currentLocale = 'en';
    // The fallback locale in i18nStore is 'bn'
    expect(t('quiz.onlyInFallback')).toBe('শুধু ফলব্যাক এ');
  });

  it('returns the key string when translation is missing in all locales', () => {
    expect(t('quiz.nonexistent.key')).toBe('quiz.nonexistent.key');
  });

  it('interpolates {param} placeholders correctly', () => {
    expect(t('quiz.completion.surahVerse', { surah: 'Al-Baqarah', verse: '255' }))
      .toBe('Surah Al-Baqarah, Verse 255');
  });

  it('interpolates numeric parameters correctly', () => {
    expect(t('quiz.completion.surahVerse', { surah: 2, verse: 255 }))
      .toBe('Surah 2, Verse 255');
  });

  it('leaves unresolved placeholders in place when param is missing', () => {
    expect(t('quiz.completion.surahVerse', {}))
      .toBe('Surah {surah}, Verse {verse}');
  });

  it('resolves deeply nested keys', () => {
    expect(t('quiz.status.settingsSaved')).toBe('Settings saved successfully!');
  });
});

describe('i18nStore – initLocaleFromStorage()', () => {
  let originalFetch;

  beforeEach(() => {
    resetI18nState();
    localStorage.clear();
    originalFetch = global.fetch;
    global.fetch = mockFetch({ en: EN_FIXTURE, bn: BN_FIXTURE, ar: AR_FIXTURE });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    resetI18nState();
    localStorage.clear();
  });

  it('defaults to "en" when localStorage has no language setting', async () => {
    await initLocaleFromStorage();
    expect(i18nState.currentLocale).toBe('en');
  });

  it('reads "bn" locale from localStorage and sets currentLocale', async () => {
    localStorage.setItem('murajah-language', 'bn');
    await initLocaleFromStorage();
    expect(i18nState.currentLocale).toBe('bn');
  });

  it('reads "ar" locale from localStorage and sets currentLocale', async () => {
    localStorage.setItem('murajah-language', 'ar');
    await initLocaleFromStorage();
    expect(i18nState.currentLocale).toBe('ar');
  });

  it('ignores an unsupported locale and falls back to "en"', async () => {
    localStorage.setItem('murajah-language', 'fr');
    await initLocaleFromStorage();
    expect(i18nState.currentLocale).toBe('en');
  });

  it('fetches and caches the fallback locale (bn)', async () => {
    await initLocaleFromStorage();
    // bn is the FALLBACK_LOCALE, should always be loaded
    expect(i18nState.messages['bn']).toBeDefined();
  });

  it('fetches and caches the en locale', async () => {
    await initLocaleFromStorage();
    expect(i18nState.messages['en']).toBeDefined();
  });

  it('fetches the ar locale when localStorage is set to ar', async () => {
    localStorage.setItem('murajah-language', 'ar');
    await initLocaleFromStorage();
    expect(i18nState.messages['ar']).toBeDefined();
  });

  it('t() resolves the correct locale after initLocaleFromStorage', async () => {
    localStorage.setItem('murajah-language', 'bn');
    await initLocaleFromStorage();
    expect(t('quiz.tabs.lightningRound')).toBe('বজ্রপাত রাউন্ড');
  });

  it('does not re-fetch a locale already in the cache', async () => {
    // Pre-populate cache
    i18nState.messages['bn'] = BN_FIXTURE;
    await initLocaleFromStorage();
    // fetch should only be used for en and any new locale
    const allUrls = global.fetch.mock.calls.map(([url]) => url);
    const bnFetches = allUrls.filter(u => u.includes('/bn.json'));
    expect(bnFetches).toHaveLength(0); // bn was already cached
  });
});

describe('i18nStore – setLocale()', () => {
  let originalFetch;

  beforeEach(() => {
    resetI18nState();
    localStorage.clear();
    originalFetch = global.fetch;
    global.fetch = mockFetch({ en: EN_FIXTURE, bn: BN_FIXTURE, ar: AR_FIXTURE });
    // Seed en as already loaded
    i18nState.messages['en'] = EN_FIXTURE;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    resetI18nState();
    localStorage.clear();
  });

  it('updates currentLocale after setLocale', async () => {
    await setLocale('bn');
    expect(i18nState.currentLocale).toBe('bn');
  });

  it('writes the locale to localStorage', async () => {
    await setLocale('bn');
    expect(localStorage.getItem('murajah-language')).toBe('bn');
  });

  it('does nothing for an unsupported locale', async () => {
    await setLocale('fr');
    expect(i18nState.currentLocale).toBe('en'); // unchanged
  });

  it('setLocale to ar allows t() to resolve Arabic strings', async () => {
    await setLocale('ar');
    // en is in messages already, ar was just fetched, bn is fallback
    i18nState.messages['bn'] = BN_FIXTURE; // ensure fallback loaded
    expect(t('quiz.tabs.lightningRound')).toBe('جولة سريعة');
  });
});
