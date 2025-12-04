const { reactive } = Vue;

const DEFAULT_LOCALE = 'bn';
const FALLBACK_LOCALE = 'en';
const LOCALE_FILES = {
  en: './resources/data/i18n/en.json',
  bn: './resources/data/i18n/bn.json'
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

const fetchLocale = async (locale) => {
  if (!LOCALE_FILES[locale]) {
    throw new Error(`Unsupported locale: ${locale}`);
  }
  if (i18nState.messages[locale]) {
    return i18nState.messages[locale];
  }
  i18nState.loading = true;
  try {
    const response = await fetch(LOCALE_FILES[locale], { cache: 'reload' });
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
  await fetchLocale(locale);
  i18nState.currentLocale = locale;
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
  await fetchLocale(FALLBACK_LOCALE);
  if (FALLBACK_LOCALE !== DEFAULT_LOCALE) {
    await fetchLocale(DEFAULT_LOCALE);
  }
  if (locale !== DEFAULT_LOCALE && locale !== FALLBACK_LOCALE) {
    await fetchLocale(locale);
  }
  i18nState.currentLocale = locale;
};

export { i18nState, SUPPORTED_LOCALES, setLocale, initLocale, t };
