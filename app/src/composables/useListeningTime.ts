import { onBeforeUnmount, onMounted } from 'vue'
import { useAudioStore } from '@/stores/audio'
import { useProgressStore } from '@/stores/progress'
import { useSettingsStore } from '@/stores/settings'

const TICK_MS = 1000
/**
 * How rarely accumulated seconds are pushed into the (persisted, watched)
 * progress store — see plans/performance-audit-2026-08.md's P0-1 finding.
 * Writing `listeningSeconds` to the reactive store every single second kept
 * `useProgressPersistence.ts`'s debounced IndexedDB watcher firing every
 * second too, for as long as audio played — contending with every other
 * feature that shares the same IndexedDB object store. A flush also fires
 * immediately on tab-hide, navigate-away, and unmount (see below), so
 * nothing beyond a true hard-kill is ever lost; this constant only trades
 * off write *frequency* in the common case — see the `settings.
 * trackListeningTime` gate below for the one case where *what* gets
 * credited is also affected (a narrow, low-stakes one, not "never" as an
 * earlier version of this comment overclaimed).
 */
const FLUSH_INTERVAL_S = 15

/**
 * Accumulates active listening time while audio is playing — one second per
 * interval tick, held locally and flushed into the progress store only every
 * `FLUSH_INTERVAL_S` seconds (or sooner, on backgrounding/navigation/unmount
 * — see `flush()` call sites below). Mounted in App (always alive) so it
 * persists across navigation. Audio can legitimately play in the
 * background, so no visibility check gates *accrual* — `pending` still
 * increments every tick regardless of tab visibility; only *when* it's
 * flushed to the (persisted) store is affected by visibility.
 *
 * `pending` only accumulates while `settings.trackListeningTime` is on,
 * matching `progress.addListeningSeconds`'s own gate (stores/progress.ts) at
 * the same 1s granularity the old (unbatched) per-tick call had — this is
 * what stops turning tracking ON mid-window from over-crediting seconds
 * accrued while it was off. The store's gate is re-checked again at flush
 * time using whatever the *current* setting is then, so the opposite
 * direction (tracking turned OFF between an already-legitimately-accrued
 * tick and the next flush, up to `FLUSH_INTERVAL_S` seconds later) can still
 * drop that small remainder rather than crediting it — accepted, since
 * `listeningSeconds` is a best-effort cumulative stat, not the memorization
 * record, and the miscount is bounded to at most one flush window.
 */
export function useListeningTime() {
  const audio = useAudioStore()
  const progress = useProgressStore()
  const settings = useSettingsStore()
  let tickTimer: ReturnType<typeof setInterval> | undefined
  let flushTimer: ReturnType<typeof setInterval> | undefined
  let pending = 0

  function flush(): void {
    if (pending > 0) {
      progress.addListeningSeconds(pending)
      pending = 0
    }
  }

  function onVisibilityChange(): void {
    if (document.hidden) flush()
  }

  onMounted(() => {
    tickTimer = setInterval(() => {
      if (audio.isPlaying && settings.trackListeningTime) pending += 1
    }, TICK_MS)
    flushTimer = setInterval(flush, FLUSH_INTERVAL_S * 1000)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange)
    if (typeof window !== 'undefined') window.addEventListener('pagehide', flush)
  })
  onBeforeUnmount(() => {
    clearInterval(tickTimer)
    clearInterval(flushTimer)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange)
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', flush)
    // App.vue never actually unmounts in normal operation, but a still-
    // pending partial interval must not be silently dropped if this ever
    // does tear down (e.g. a future refactor, or a test's own lifecycle).
    flush()
  })
}
