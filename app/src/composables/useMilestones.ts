import { computed, ref, watch } from 'vue'
import { useProgressStore } from '@/stores/progress'
import { usePlanStore } from '@/stores/plan'
import { detectMilestones, type Milestone } from '@/core/memorization/milestones'
import { toast } from './useToast'

export interface UseMilestonesOptions {
  /** Announce a milestone. Defaults to a success toast; injected in tests. */
  announce?: (m: Milestone) => void
}

/**
 * Celebrates milestones as they're crossed (Phase 5.5.2).
 *
 * The rule is **only celebrate what happens while you're watching**: {@link arm}
 * adopts everything already true, and from then on a milestone that becomes true
 * gets announced. Nothing is persisted, because nothing needs to be — achievement is
 * always derived from the real records (see `detectMilestones`), and re-adopting it
 * silently at load reaches the same place a stored announced-set would.
 *
 * That rule is doing real work rather than being a simplification. Milestones are
 * derived from stores that hydrate asynchronously, so *any* design that announces
 * what it finds at startup will mistake loading for achieving: a returning hafiz
 * whose 30 juz arrive from disk, or a user restoring a legacy backup, would be
 * congratulated 30 times for work they did years ago. Real practice crosses one
 * milestone at a time, by tapping a button — which is exactly what this catches.
 *
 * Scoped to Today, so a page memorized elsewhere (e.g. Progress) is adopted quietly
 * the next time Today loads rather than celebrated.
 *
 * The boundary that keeps this honest: while armed, the only thing that changes
 * `memorized` is the user tapping a task, which can cross at most a juz and a cycle.
 * Bulk arrivals (a legacy import, a restored backup) can't reach an armed watcher —
 * they happen on another route, so Today has unmounted and re-arms against the new
 * data. **If import ever lands somewhere Today stays mounted, re-arm after it.**
 */
export function useMilestones(opts: UseMilestonesOptions = {}) {
  const progress = useProgressStore()
  const plan = usePlanStore()

  const announce =
    opts.announce ?? ((m: Milestone) => toast(m.message, { variant: 'success', duration: 5000 }))

  /** Ids already announced, or adopted at arming. Session-scoped by design. */
  const announced = new Set<string>()
  const armed = ref(false)

  /** Juz can't resolve until the nav index is in; without it nothing is detectable. */
  const ready = computed(() => Object.keys(plan.juzToPage).length > 0)

  const achieved = computed<Milestone[]>(() =>
    ready.value
      ? detectMilestones({
          memorized: progress.memorized,
          juzToPage: plan.juzToPage,
          scopePages: plan.scopePages,
          reviewData: progress.reviewData,
        })
      : [],
  )

  const stop = watch(achieved, (list) => {
    if (!armed.value) return
    const fresh = list.filter((m) => !announced.has(m.id))
    for (const m of fresh) announced.add(m.id)
    for (const m of fresh) announce(m)
  })

  /**
   * Adopt what's already true, then start celebrating. Call once the stores this
   * reads are hydrated — arming early would read a half-loaded set of memorized
   * pages and celebrate the rest of them as they arrive.
   */
  function arm(): void {
    for (const m of achieved.value) announced.add(m.id)
    armed.value = true
  }

  return { arm, dispose: stop, achieved, announced }
}
