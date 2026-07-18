/**
 * Static surah reference data (Phase 8).
 *
 * Immutable, standard-mushaf facts: how many ayahs each surah has, and whether it
 * was revealed in Makkah or Madinah. Used by the Contents browser (row labels +
 * badge) and by the Listen scope builder (enumerating a surah's verses for the
 * partial-page audio at its edges — see `core/audio/scope`). Reference data on the
 * order of `SURAH_NAMES`, not pipeline output.
 */

/** Ayah count per surah, index 0 = surah 1. Hafs numbering; totals 6236. */
export const AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111,
  110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45,
  83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55,
  78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56,
  40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8,
  8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
] as const

/** The 28 Madinan surahs (by number); every other surah is Makkan. */
const MADANI_SURAHS = new Set([
  2, 3, 4, 5, 8, 9, 13, 22, 24, 33, 47, 48, 49, 55, 57, 58, 59, 60, 61, 62, 63,
  64, 65, 66, 76, 98, 99, 110,
])

/** Place of revelation per surah, index 0 = surah 1. */
export const MAKKI_MADANI: readonly ('makki' | 'madani')[] = Array.from(
  { length: 114 },
  (_, i) => (MADANI_SURAHS.has(i + 1) ? 'madani' : 'makki'),
)

/** Number of ayahs in a surah (1–114). */
export function ayahCount(surah: number): number {
  return AYAH_COUNTS[surah - 1] ?? 0
}

/** A surah's verses as `{ surah, ayah }`, ayah 1…count, in order. */
export function versesInSurah(surah: number): { surah: number; ayah: number }[] {
  const n = ayahCount(surah)
  return Array.from({ length: n }, (_, i) => ({ surah, ayah: i + 1 }))
}
