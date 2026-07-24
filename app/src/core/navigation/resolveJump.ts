import type { NavIndex } from '@/core/data/types'
import type { Jump } from './parseJump'
import { findSurahByName } from './surahNames'

/** A resolved quick-jump target: the page to show, and (when known) the exact verse to scroll to. */
export interface JumpTarget {
  page: number
  /** The `"s:a"` verse to focus, when the jump names one precisely (not a bare page). */
  ayah?: string
}

/**
 * Resolve a parsed quick-jump target to a page (+ verse to focus, where knowable)
 * for a layout, using its nav index (ayah/surah/juz → page). Returns `undefined`
 * when the target doesn't exist (e.g. an out-of-range ayah, or an unrecognised
 * name), so the caller shows no bogus navigation.
 */
export function resolveJump(nav: NavIndex, jump: Jump): JumpTarget | undefined {
  switch (jump.type) {
    case 'page':
      return { page: jump.page }
    case 'ayah': {
      const ayah = `${jump.surah}:${jump.ayah}`
      const page = nav.ayahToPage[ayah]
      return page !== undefined ? { page, ayah } : undefined
    }
    case 'juz': {
      const page = nav.juzToPage[String(jump.juz)]
      const ayah = nav.juzToVerse[String(jump.juz)]
      return page !== undefined ? { page, ayah } : undefined
    }
    case 'surah': {
      const page = nav.surahToPage[String(jump.surah)]
      return page !== undefined ? { page, ayah: `${jump.surah}:1` } : undefined
    }
    case 'name': {
      const surah = findSurahByName(jump.query)
      if (surah === undefined) return undefined
      const page = nav.surahToPage[String(surah)]
      return page !== undefined ? { page, ayah: `${surah}:1` } : undefined
    }
  }
}
