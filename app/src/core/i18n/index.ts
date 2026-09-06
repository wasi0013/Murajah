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
  // An explicit choice always supersedes a route's `?lang=` override (see
  // setLocaleOverride) — without this, leaving an overridden route would
  // still restore the *old* saved preference, silently reverting the
  // change just made.
  overrideActive = false
  void setPref(LOCALE_PREF_KEY, next)
}

// Whether the active locale is currently a route's `?lang=` override rather
// than the user's own saved preference — see setLocaleOverride's doc comment.
let overrideActive = false

/** Loads and applies whatever locale is actually saved (or the default) —
 * the shared core of `hydrateLocale` and `clearLocaleOverride`. Checked
 * against `overrideActive` immediately before writing, not just on entry:
 * this runs concurrently with `setLocaleOverride` on a cold boot into an
 * overridden route (App.vue's boot-time hydrate vs. the router's afterEach),
 * and awaiting prefs + a catalog import is enough of a gap for the override
 * to have already landed by the time this is ready to write — so re-check
 * right before, and yield to it instead of clobbering it. */
async function applyPersisted(): Promise<void> {
  const saved = await getPref<string>(LOCALE_PREF_KEY)
  const loc = isLocale(saved) ? saved : DEFAULT_LOCALE
  const msgs = await loadCatalog(loc)
  if (overrideActive) return
  messages.value = msgs
  locale.value = loc
  apply(loc)
}

/** Apply the saved locale (or the default) on boot. Safe to await more than
 * once — each call re-reads prefs, so a locale saved after an earlier call
 * (e.g. in a test) is picked up rather than replayed from a cache. */
function hydrateLocale(): Promise<void> {
  return applyPersisted()
}

/**
 * Temporary, unpersisted locale override for shareable links — /download and
 * /preview (see router/index.ts's LANG_OVERRIDE_ROUTES) take a `?lang=`
 * query param so a link can open in a chosen language for whoever follows
 * it (e.g. sharing an Arabic /preview link with someone whose own device/app
 * is set to English), without touching that visitor's actual saved
 * preference. Applies immediately and unconditionally — `applyPersisted`'s
 * own late-write guard (above) is what keeps a concurrent boot-time hydrate
 * from winning the race and clobbering this instead.
 */
async function setLocaleOverride(next: Locale): Promise<void> {
  messages.value = await loadCatalog(next)
  locale.value = next
  apply(next)
  overrideActive = true
}

/** Leaving a route whose `?lang=` was overriding the locale (or the param no
 * longer names one): restore the user's own saved preference. A no-op when
 * nothing is currently overridden, so the router can call this unconditionally
 * on every navigation that isn't itself applying an override. */
async function clearLocaleOverride(): Promise<void> {
  if (!overrideActive) return
  overrideActive = false
  await applyPersisted()
}

export function useI18n() {
  return { locale, dir, t, setLocale }
}

export { t, setLocale, hydrateLocale, setLocaleOverride, clearLocaleOverride, locale, dir }
