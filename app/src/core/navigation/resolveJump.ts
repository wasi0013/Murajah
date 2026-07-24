import type { NavIndex } from '@/core/data/types'
import type { Jump } from './parseJump'
import { findSurahByName } from './surahNames'

/**
 * Resolve a parsed quick-jump target to a page for a layout, using its nav index
 * (ayah/surah/juz → page). Returns `undefined` when the target doesn't exist
 * (e.g. an out-of-range ayah, or an unrecognised name), so the caller shows no
 * bogus navigation.
 */
export function resolveJump(nav: NavIndex, jump: Jump): number | undefined {
  switch (jump.type) {
    case 'page':
      return jump.page
    case 'ayah':
      return nav.ayahToPage[`${jump.surah}:${jump.ayah}`]
    case 'juz':
      return nav.juzToPage[String(jump.juz)]
    case 'surah':
      return nav.surahToPage[String(jump.surah)]
    case 'name': {
      const surah = findSurahByName(jump.query)
      return surah !== undefined ? nav.surahToPage[String(surah)] : undefined
    }
  }
}
