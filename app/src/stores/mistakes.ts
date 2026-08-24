import { defineStore } from 'pinia'
import { computed, reactive } from 'vue'

/**
 * Word-level mistake marks, in the **legacy-exact** canonical shape
 * `Map<qpcPage, Set<wordId>>` (see plans/archive/legacy-schema.md) — so migrated data
 * loads unchanged, `weaknessScorer` reads it directly, and export round-trips
 * losslessly. This is the single store Phase 4 (weakness/hasanah) also consumes;
 * no parallel schema.
 *
 * Word ids are location-stable across QPC and Indopak (verified: all 83,668
 * locations share one id), so membership is global: a word is a mistake iff its
 * id is in `mistakeIds` — which is why marks made under one script show under
 * the other regardless of that layout's page numbering.
 */
export const useMistakesStore = defineStore('mistakes', () => {
  const byPage = reactive(new Map<number, Set<number>>())

  /** Flattened set of every mistake word id — page-agnostic membership. */
  const mistakeIds = computed(() => {
    const ids = new Set<number>()
    for (const set of byPage.values()) for (const id of set) ids.add(id)
    return ids
  })

  /** Toggle a word's mistake mark under a QPC page. Returns the new state. */
  function toggle(qpcPage: number, wordId: number): boolean {
    if (!byPage.has(qpcPage)) byPage.set(qpcPage, new Set())
    const set = byPage.get(qpcPage)! // reactive proxy — mutations are tracked
    if (set.has(wordId)) {
      set.delete(wordId)
      if (set.size === 0) byPage.delete(qpcPage)
      return false
    }
    set.add(wordId)
    return true
  }

  /** Replace all marks (e.g. after importing a legacy backup). */
  function setAll(map: Map<number, Set<number>>): void {
    byPage.clear()
    for (const [page, set] of map) byPage.set(page, new Set(set))
  }

  /** A plain (non-reactive) copy for persistence / weaknessScorer. */
  function snapshot(): Map<number, Set<number>> {
    const copy = new Map<number, Set<number>>()
    for (const [page, set] of byPage) copy.set(page, new Set(set))
    return copy
  }

  return { byPage, mistakeIds, toggle, setAll, snapshot }
})
