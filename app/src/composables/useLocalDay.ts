import { ref, type Ref } from 'vue'
import { getTodayDate } from '@/core/memorization/streaks'

/**
 * The shared local-day clock (Phase 5.3.2).
 *
 * One `Ref<Date>` for the whole app, rolling over at **local midnight** — so Today's
 * task set and the streak header can never disagree about what day it is, and a
 * session left open overnight wakes up on the new day instead of staying stuck on
 * yesterday's queue.
 *
 * It's a module singleton on purpose: two independent timers would drift apart
 * across a rollover, and the clock is meant to live as long as the page does.
 */

let clock: Ref<Date> | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let onVisible: (() => void) | undefined

/** Milliseconds from `now` to the next local midnight. DST-aware; never 0. */
function msUntilMidnight(now: Date): number {
  const next = new Date(now)
  next.setHours(24, 0, 0, 0)
  return Math.max(1, next.getTime() - now.getTime())
}

/** Adopt wall-clock now, but only once the calendar date has actually moved on. */
function tick(): void {
  const now = new Date()
  if (clock && getTodayDate(now) !== getTodayDate(clock.value)) clock.value = now
}

function schedule(): void {
  clearTimeout(timer)
  timer = setTimeout(() => {
    tick()
    schedule()
  }, msUntilMidnight(new Date()))
}

/**
 * The shared clock. Reads as an ordinary `Ref<Date>`; treat it as read-only — pass
 * your own ref to `useToday` / `useStreak` instead of writing to this one.
 */
export function useLocalDay(): Ref<Date> {
  if (!clock) {
    clock = ref(new Date())
    schedule()
    // A backgrounded webview has its timers throttled or suspended outright, so the
    // midnight timeout alone can't be trusted on Android: coming back to the
    // foreground is the reliable rollover signal, and re-arms the drifted timer.
    onVisible = () => {
      if (!document.hidden) {
        tick()
        schedule()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
  }
  return clock
}

/** Tear the shared clock down (app teardown / tests). */
export function stopLocalDay(): void {
  clearTimeout(timer)
  timer = undefined
  if (onVisible) document.removeEventListener('visibilitychange', onVisible)
  onVisible = undefined
  clock = null
}
