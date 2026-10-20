import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { Layout } from '@/core/data/types'
import { recordVisit, sanitizeTrail, type TrailEntry } from '@/core/navigation/readingTrail'
import { getPref, setPref } from '@/core/storage/prefs'

const PREF_KEY = 'readingTrail'
const DEBOUNCE_MS = 300

/**
 * One trail per page-numbering scheme: `qpc` is shared by the reader's Uthmani
 * layout and the mushaf images (both Madani 604), so moving between them
 * continues the same trail; Indopak (610 pages) keeps its own.
 */
export type TrailScheme = Layout

/**
 * The reading trail (see `core/navigation/readingTrail`): recent reading spots per
 * scheme, persisted, plus the transient "back to" target offered right after a hop.
 */
export const useReadingTrailStore = defineStore('readingTrail', () => {
  const trails = ref<Record<TrailScheme, TrailEntry[]>>({ qpc: [], indopak: [] })
  /**
   * Where the "back" chip leads: set by a hop, cleared once the reader reads on
   * (or switches scheme / reopens the view). Never persisted.
   */
  const backTo = ref<{ scheme: TrailScheme; page: number } | null>(null)

  let hydrated: Promise<void> | null = null
  /**
   * Load the saved trails once per store (memoized — the reader and mushaf both
   * call it). Visits wait on this, so a first visit can neither be overwritten by
   * the load nor save a one-entry trail over the stored one.
   */
  function hydrate(): Promise<void> {
    hydrated ??= (async () => {
      const saved = await getPref<Partial<Record<TrailScheme, unknown>>>(PREF_KEY).catch(() => undefined)
      if (saved) {
        trails.value = { qpc: sanitizeTrail(saved.qpc), indopak: sanitizeTrail(saved.indopak) }
      }
      watch(
        trails,
        (value) => {
          clearTimeout(timer)
          timer = setTimeout(() => void setPref(PREF_KEY, structuredCloneable(value)), DEBOUNCE_MS)
        },
        { deep: true },
      )
    })()
    return hydrated
  }
  let timer: ReturnType<typeof setTimeout> | undefined

  function apply(scheme: TrailScheme, page: number) {
    const result = recordVisit(trails.value[scheme], page, Date.now())
    trails.value = { ...trails.value, [scheme]: result.trail }
    return result
  }

  /**
   * Record the page a view opened on (or switched scheme to) without treating it
   * as a hop — arriving isn't jumping, so no "back" chip.
   */
  function settle(scheme: TrailScheme, page: number) {
    apply(scheme, page)
    backTo.value = null
  }

  /** Record a page change within a view. */
  function visit(scheme: TrailScheme, page: number) {
    const { trail, kind } = apply(scheme, page)
    if (kind === 'hop' && trail[1]) backTo.value = { scheme, page: trail[1].page }
    else if (kind === 'moved') backTo.value = null
  }

  /** The spots to go back to — the trail minus where the reader is now. */
  function recent(scheme: TrailScheme): TrailEntry[] {
    return trails.value[scheme].slice(1)
  }

  return { trails, backTo, hydrate, settle, visit, recent }
})

/** Plain arrays for IndexedDB's structured clone (a reactive Proxy can fail silently). */
function structuredCloneable(value: Record<TrailScheme, TrailEntry[]>) {
  return {
    qpc: value.qpc.map((e) => ({ ...e })),
    indopak: value.indopak.map((e) => ({ ...e })),
  }
}
