// The reactive i18n runtime: a singleton locale + loaded catalog, a reactive
// `t()` for templates, and locale switching that paints <html lang/dir> and
// persists the choice. English ships in the initial bundle; ar/bn lazy-load on
// first use. Mirrors the singleton pattern of useToast — import `t` anywhere.

import { computed, ref } from 'vue'
import { getPref, setPref } from '@/core/storage/prefs'
import { resolveMessage, interpolate } from './translate'
import en from './catalogs/en'
import {
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  type Locale,
  type Messages,
  type TranslateParams,
} from './types'

const LOCALE_PREF_KEY = 'locale'

// Lazy loaders per non-default locale; `en` is already imported statically.
const loaders: Record<Exclude<Locale, 'en'>, () => Promise<Messages>> = {
  ar: () => import('./catalogs/ar').then((m) => m.default),
  bn: () => import('./catalogs/bn').then((m) => m.default),
}

const locale = ref<Locale>(DEFAULT_LOCALE)
const messages = ref<Messages>(en)

/** Text direction for the active locale (`rtl` for Arabic, else `ltr`). */
const dir = computed(() => LOCALES[locale.value].dir)

function apply(loc: Locale): void {
  const html = document.documentElement
  html.setAttribute('lang', loc)
  html.setAttribute('dir', LOCALES[loc].dir)
}

async function loadCatalog(loc: Locale): Promise<Messages> {
  return loc === 'en' ? en : loaders[loc]()
}

/**
 * Translate `key`, filling any `{name}` placeholders from `params`. Reads the
 * reactive catalog, so calls inside a template re-render on locale change. Falls
 * back to the English catalog, then to the raw key, so UI never shows blanks.
 */
function t(key: string, params?: TranslateParams): string {
  const raw = resolveMessage(messages.value, key) ?? resolveMessage(en, key) ?? key
  return params ? interpolate(raw, params) : raw
}

/** Switch locale: load its catalog, paint the document, and persist the choice. */
async function setLocale(next: Locale): Promise<void> {
  messages.value = await loadCatalog(next)
  locale.value = next
  apply(next)
  void setPref(LOCALE_PREF_KEY, next)
}

/** Apply the saved locale (or the default) on boot. Safe to await once at start. */
async function hydrateLocale(): Promise<void> {
  const saved = await getPref<string>(LOCALE_PREF_KEY)
  const loc = isLocale(saved) ? saved : DEFAULT_LOCALE
  messages.value = await loadCatalog(loc)
  locale.value = loc
  apply(loc)
}

export function useI18n() {
  return { locale, dir, t, setLocale }
}

export { t, setLocale, hydrateLocale, locale, dir }
