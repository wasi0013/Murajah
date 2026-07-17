import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { PlanConfig, PlanPace } from '@/core/storage/userData'
import { serializePlan } from '@/core/storage/userData'
import { getPagesForJuz, totalPagesForLayout } from '@/core/memorization/planBuilder'
import { useProgressStore } from './progress'

/**
 * The single unified plan (Phase 5): one editable config = **scope** (which pages
 * you maintain) + **pace** (daily budgets, off days) + an optional **new-memorization
 * front**. Replaces the legacy multi-plan / beginner-hafiz-mixed system. State +
 * derivations only; SM-2 scheduling and the reward loop live in `progress` /
 * `useToday`, and persistence in `usePlanPersistence`.
 *
 * `scopePages` is always resolved in the **canonical 604-page scheme** (memorization
 * is tracked there); juz scopes expand via the derived QPC nav index, injected as
 * `juzToPage` by the persistence layer so the store stays free of async data loads.
 */
export const usePlanStore = defineStore('plan', () => {
  const progress = useProgressStore()

  const config = ref<PlanConfig | null>(null)
  /** QPC nav juz-start map (canonical scheme); set once nav data is available. */
  const juzToPage = ref<Record<string, number>>({})

  const hasPlan = computed(() => config.value !== null)
  const newFront = computed(() => config.value?.newFront ?? null)
  const pace = computed(() => config.value?.pace ?? null)

  /** Pages in the plan's maintenance scope (sorted, canonical 604 scheme). */
  const scopePages = computed<number[]>(() => {
    const c = config.value
    if (!c) return []
    if (c.scope.kind === 'all-memorized') {
      return [...progress.memorized].sort((a, b) => a - b)
    }
    return getPagesForJuz(c.scope.juz, juzToPage.value, totalPagesForLayout('qpc'))
  })

  /** Install (or replace) the whole plan. */
  function create(cfg: PlanConfig): void {
    config.value = cfg
  }

  /** Merge a partial change into the current plan (no-op when there's no plan). */
  function update(partial: Partial<PlanConfig>): void {
    if (!config.value) return
    config.value = { ...config.value, ...partial }
  }

  /** Merge a partial pace change (no-op when there's no plan). */
  function updatePace(partial: Partial<PlanPace>): void {
    if (!config.value) return
    config.value = { ...config.value, pace: { ...config.value.pace, ...partial } }
  }

  /** Remove the plan entirely. */
  function clear(): void {
    config.value = null
  }

  /** Provide the derived QPC juz-start map used to expand juz scopes. */
  function setJuzToPage(map: Record<string, number>): void {
    juzToPage.value = map
  }

  /** Replace the plan wholesale (hydrate / migration). */
  function setAll(cfg: PlanConfig | null): void {
    config.value = cfg
  }

  /** A plain (proxy-free) copy for persistence + change detection. */
  function snapshot(): PlanConfig | null {
    return serializePlan(config.value)
  }

  return {
    config,
    juzToPage,
    hasPlan,
    newFront,
    pace,
    scopePages,
    create,
    update,
    updatePace,
    clear,
    setJuzToPage,
    setAll,
    snapshot,
  }
})
