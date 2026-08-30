import { watch } from 'vue'
import { useAudioStore } from '@/stores/audio'
import { loadAudioPrefs, saveAudioPrefs, type StoredAudioPrefs } from '@/core/storage/userData'
import { PAGE_RECITERS, VERSE_RECITERS } from '@/core/audio/reciters'
import type { AudioGrain } from '@/core/audio/types'

const DEBOUNCE_MS = 300
const SPEEDS = new Set([0.5, 0.75, 1, 1.25, 1.5, 2])

/**
 * Every view that can show the player's settings tray (Today, Listen, and the
 * reader/mushaf's `AudioHost`) mounts its own `useAudioPersistence` instance —
 * there's no single app-level owner. Guards `hydrate()` against re-applying
 * storage on a second mount within the same session: the store is a singleton
 * that outlives any one view, so a later remount (e.g. reopening the mini-player
 * on Reader after changing a toggle on Today) must never overwrite the live,
 * already-correct in-memory prefs with what was last written to disk. Keyed off
 * the store instance, not the module, so tests that spin up a fresh pinia still
 * get a real hydrate.
 */
const hydratedStores = new WeakSet<object>()

/**
 * Binds the audio store's **preference** slice to IndexedDB (7.3): grain, the two
 * reciters, speed, repeat-count/spaced-drill, and the autoplay-next/loop-playlist
 * toggles. Transient playback (playlist, cursor, time) is deliberately never
 * persisted — a fresh session starts clean. Hydration validates stored ids against
 * the current registries so a removed reciter falls back to the default.
 * Best-effort; storage errors never surface.
 */
export function useAudioPersistence(store = useAudioStore()) {
  async function hydrate(): Promise<void> {
    // Set before the await: two mounts racing (rare, but a route transition can
    // briefly overlap old/new views) must not both apply storage.
    if (hydratedStores.has(store)) return
    hydratedStores.add(store)
    const prefs = await loadAudioPrefs()
    if (prefs.grain === 'verse' || prefs.grain === 'page') store.grain = prefs.grain as AudioGrain
    if (prefs.verseReciterId && VERSE_RECITERS.some((r) => r.id === prefs.verseReciterId)) {
      store.verseReciterId = prefs.verseReciterId
    }
    if (prefs.pageReciterId && PAGE_RECITERS.some((r) => r.id === prefs.pageReciterId)) {
      store.pageReciterId = prefs.pageReciterId
    }
    if (typeof prefs.speed === 'number' && SPEEDS.has(prefs.speed)) store.speed = prefs.speed
    if (typeof prefs.repeatCount === 'number' && prefs.repeatCount >= 1 && prefs.repeatCount <= 9) {
      store.repeatCount = prefs.repeatCount
    }
    if (typeof prefs.spaced === 'boolean') store.spaced = prefs.spaced
    if (typeof prefs.autoNext === 'boolean') store.autoNext = prefs.autoNext
    if (typeof prefs.loopPlaylist === 'boolean') store.loopPlaylist = prefs.loopPlaylist
    if (typeof prefs.autoScroll === 'boolean') store.autoScroll = prefs.autoScroll
    if (prefs.lastListenScope) store.lastListenScope = prefs.lastListenScope
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  // The latest not-yet-written snapshot, so `dispose()` can flush it — see below.
  let pending: StoredAudioPrefs | null = null
  const stop = watch(
    () =>
      [
        store.grain,
        store.verseReciterId,
        store.pageReciterId,
        store.speed,
        store.repeatCount,
        store.spaced,
        store.autoNext,
        store.loopPlaylist,
        store.autoScroll,
        store.lastListenScope,
      ] as const,
    ([
      grain,
      verseReciterId,
      pageReciterId,
      speed,
      repeatCount,
      spaced,
      autoNext,
      loopPlaylist,
      autoScroll,
      lastListenScope,
    ]) => {
      pending = {
        grain,
        verseReciterId,
        pageReciterId,
        speed,
        repeatCount,
        spaced,
        autoNext,
        loopPlaylist,
        autoScroll,
        // Spread to a plain object — like the wrapper itself, proxy-safe for
        // structured clone (IndexedDB can choke silently on a reactive Proxy).
        lastListenScope: lastListenScope ? { ...lastListenScope } : undefined,
      }
      clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        const snapshot = pending
        pending = null
        if (snapshot) void saveAudioPrefs(snapshot)
      }, DEBOUNCE_MS)
    },
  )

  function dispose(): void {
    clearTimeout(timer)
    timer = undefined
    // Flush a still-debounced change instead of dropping it: closing the
    // mini-player (unmounting AudioHost) or navigating away right after
    // toggling a setting — e.g. Loop list — would otherwise silently discard it.
    if (pending) {
      void saveAudioPrefs(pending)
      pending = null
    }
    stop()
  }

  return { hydrate, dispose }
}
