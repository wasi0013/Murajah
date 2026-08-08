import { computed, ref } from 'vue'
import type { SurahNames } from '@/core/data/types'
import { ayahCount } from '@/core/quran/surahMeta'

/**
 * Shared surah/from-ayah/to-ayah `<select>` state for the two `/preview`
 * range pickers — `PreviewJumpSheet` (editing an already-open link in place)
 * and `PreviewLandingView` (building a fresh one from scratch). Same
 * cross-field rules in both places: picking a new surah resets the range to
 * its first ayah (a range from the old surah likely doesn't exist in the
 * new one, e.g. ayah 20 of a 7-ayah surah), and moving `start` past the
 * current `end` drags `end` along with it rather than leaving an inverted
 * range on screen.
 */
export function usePreviewRangeFields(initial: { surah: number; start: number; end: number }) {
  const surah = ref(initial.surah)
  const start = ref(initial.start)
  const end = ref(initial.end)

  const startOptions = computed(() => Array.from({ length: ayahCount(surah.value) }, (_, i) => i + 1))
  const endOptions = computed(() =>
    Array.from({ length: ayahCount(surah.value) - start.value + 1 }, (_, i) => i + start.value),
  )

  function onSurahChange() {
    start.value = 1
    end.value = 1
  }
  function onStartChange() {
    if (end.value < start.value) end.value = start.value
  }

  return { surah, start, end, startOptions, endOptions, onSurahChange, onStartChange }
}

/** `"12. Yusuf"` when the surah's name has loaded, else just `"12"` — the
 * name lookup is chrome-only (see both callers' `getSurahNames()` fetch), so
 * this degrades gracefully before/without it rather than showing nothing. */
export function surahOptionLabel(surahNames: SurahNames, n: number): string {
  const name = surahNames[String(n)]
  return name ? `${n}. ${name}` : String(n)
}
