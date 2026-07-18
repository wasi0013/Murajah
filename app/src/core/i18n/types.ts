// The i18n vocabulary: the locales the app ships, their display metadata, and
// the shapes the runtime and catalogs are typed against. Kept dependency-free so
// both the pure translate helpers and the reactive runtime can import it.

export type Locale = 'en' | 'ar' | 'bn'
export type Dir = 'ltr' | 'rtl'

export interface LocaleMeta {
  /** English name, for documentation and fallbacks. */
  label: string
  /** Endonym shown in the language picker (a language names itself best). */
  native: string
  dir: Dir
}

// Bengali script is left-to-right; only Arabic flips the document to RTL.
export const LOCALES: Record<Locale, LocaleMeta> = {
  en: { label: 'English', native: 'English', dir: 'ltr' },
  ar: { label: 'Arabic', native: 'العربية', dir: 'rtl' },
  bn: { label: 'Bengali', native: 'বাংলা', dir: 'ltr' },
}

export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_LIST = Object.keys(LOCALES) as Locale[]

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && value in LOCALES
}

/** Values substituted into `{name}` placeholders in a message. */
export type TranslateParams = Record<string, string | number>

/** A message catalog: a tree of dot-addressable strings. */
export interface Messages {
  [key: string]: string | Messages
}
