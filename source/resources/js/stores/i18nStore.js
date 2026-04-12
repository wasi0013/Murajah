const { reactive } = Vue;

const DEFAULT_LOCALE = 'en';
const FALLBACK_LOCALE = 'bn';
const LOCALE_FILES = {
  en: './resources/data/i18n/en.json',
  bn: './resources/data/i18n/bn.json',
  ar: './resources/data/i18n/ar.json'
};

const i18nState = reactive({
  currentLocale: DEFAULT_LOCALE,
  fallbackLocale: FALLBACK_LOCALE,
  loading: false,
  messages: {}
});

const SUPPORTED_LOCALES = Object.keys(LOCALE_FILES);

const interpolate = (template, params = {}) => {
  if (typeof template !== 'string') return template;
  return template.replace(/\{(\w+)\}/g, (match, token) => {
    return params[token] !== undefined ? params[token] : match;
  });
};

const resolveMessage = (messages, key) => {
  if (!messages) return undefined;
  return key.split('.').reduce((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return current[segment];
  }, messages);
};

const t = (key, params = {}) => {
  const current = resolveMessage(i18nState.messages[i18nState.currentLocale], key);
  const fallback = resolveMessage(i18nState.messages[i18nState.fallbackLocale], key);
  const template = current ?? fallback;
  if (!template) {
    console.warn(`[Murajah][i18n] Missing translation for "${key}"`);
    return key;
  }
  return interpolate(template, params);
};

const I18N_FETCH_TIMEOUT_MS = 5000;

const fetchLocale = async (locale) => {
  if (!LOCALE_FILES[locale]) {
    throw new Error(`Unsupported locale: ${locale}`);
  }
  if (i18nState.messages[locale]) {
    return i18nState.messages[locale];
  }
  i18nState.loading = true;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), I18N_FETCH_TIMEOUT_MS);
    
    const response = await fetch(LOCALE_FILES[locale], { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) {
      throw new Error(`Failed to load locale ${locale}: ${response.status}`);
    }
    const data = await response.json();
    i18nState.messages[locale] = data;
    return data;
  } finally {
    i18nState.loading = false;
  }
};

const setLocale = async (locale, murajahDB) => {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    console.warn(`[Murajah][i18n] Unsupported locale ${locale}`);
    return;
  }
  try {
    await fetchLocale(locale);
  } catch (error) {
    console.error(`[Murajah][i18n] Failed to fetch locale ${locale}, keeping current locale:`, error);
    return;
  }
  i18nState.currentLocale = locale;
  // Sync to localStorage so quiz.html (separate page) can read the preference
  try { localStorage.setItem('murajah-language', locale); } catch(e) { /* private mode */ }
  if (murajahDB && typeof murajahDB.saveLanguage === 'function') {
    try {
      await murajahDB.saveLanguage(locale);
    } catch (error) {
      console.warn('[Murajah][i18n] Failed to persist locale:', error);
    }
  }
};

const initLocale = async (murajahDB) => {
  let locale = DEFAULT_LOCALE;
  if (murajahDB && typeof murajahDB.loadLanguage === 'function') {
    try {
      const saved = await murajahDB.loadLanguage(DEFAULT_LOCALE);
      if (saved && SUPPORTED_LOCALES.includes(saved)) {
        locale = saved;
      }
    } catch (error) {
      console.warn('[Murajah][i18n] Failed to load stored locale:', error);
    }
  }
  // Fetch with graceful fallback — never block app boot
  try {
    await fetchLocale(FALLBACK_LOCALE);
  } catch(e) { console.warn('[i18n] Failed to load fallback locale:', e.message); }
  try {
    if (FALLBACK_LOCALE !== DEFAULT_LOCALE) await fetchLocale(DEFAULT_LOCALE);
  } catch(e) { console.warn('[i18n] Failed to load default locale:', e.message); }
  try {
    if (locale !== DEFAULT_LOCALE && locale !== FALLBACK_LOCALE) await fetchLocale(locale);
  } catch(e) { console.warn('[i18n] Failed to load user locale:', e.message); }
  i18nState.currentLocale = locale;
};

/**
 * Initialises the locale from localStorage only — no IndexedDB required.
 * Used by pages (e.g. quiz.html) that don't have access to MurajahDB but
 * need to honour the user's language preference set on the main app.
 */
const initLocaleFromStorage = async () => {
  let locale = DEFAULT_LOCALE;
  try {
    const stored = localStorage.getItem('murajah-language');
    if (stored && SUPPORTED_LOCALES.includes(stored)) locale = stored;
  } catch(e) { /* localStorage blocked */ }
  // Fetch all required locale files in parallel — never block app boot.
  // Previously these were sequential (up to 10 s total on slow iOS networks).
  const needed = [...new Set([FALLBACK_LOCALE, DEFAULT_LOCALE, locale])];
  await Promise.all(
    needed.map(l => fetchLocale(l).catch(e => console.warn(`[i18n] Failed to load locale ${l}:`, e.message)))
  );
  i18nState.currentLocale = locale;
};

export { i18nState, SUPPORTED_LOCALES, setLocale, initLocale, initLocaleFromStorage, t };
