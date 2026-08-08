import { defineStore } from 'pinia'
import { reactive } from 'vue'
import type { HighlightColor } from '@/core/navigation/previewRoute'

/**
 * Which color a marked word was painted with — a thin, purely cosmetic layer
 * *alongside* `stores/mistakes.ts`, not a replacement for it. `mistakes.ts`
 * stays exactly what it always was (`Map<qpcPage, Set<wordId>>`, "is this word
 * a mistake" — the legacy-exact shape `weaknessScorer`/export/import depend
 * on); this store only answers "which of the 6 colors did the user pick",
 * and only for word ids that are *also* in `mistakes.mistakeIds`. Un-marking a
 * word (see `useMistakes.markWord`) deletes its entry here too, so a stale
 * color never survives to a future re-mark.
 *
 * Keyed by word id alone, not by page — word ids are location-stable across
 * QPC/Indopak (see mistakes.ts's own comment), so one flat map is enough.
 */
export const useMistakeColorsStore = defineStore('mistakeColors', () => {
  const byWord = reactive(new Map<number, HighlightColor>())

  function set(wordId: number, color: HighlightColor): void {
    byWord.set(wordId, color)
  }
  function clear(wordId: number): void {
    byWord.delete(wordId)
  }
  /** Replace all colors (e.g. after hydrating from storage). */
  function setAll(map: Map<number, HighlightColor>): void {
    byWord.clear()
    for (const [id, color] of map) byWord.set(id, color)
  }
  /** A plain (non-reactive) copy for persistence. */
  function snapshot(): Map<number, HighlightColor> {
    return new Map(byWord)
  }

  return { byWord, set, clear, setAll, snapshot }
})
