/**
 * Default reciter ids, split out from `reciters.ts` so the audio *store* can name
 * its defaults without importing the full URL tables. The store is referenced by
 * the reader (for the verse-highlight), so keeping this dependency tiny stops the
 * reciter tables from leaking into the reader's initial bundle.
 */
export const DEFAULT_VERSE_RECITER = 'shuraim'
export const DEFAULT_PAGE_RECITER = 'alafasy'
