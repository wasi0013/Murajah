import { watch } from 'vue'
import { useAudioStore } from '@/stores/audio'
import { loadAudioPrefs, saveAudioPrefs } from '@/core/storage/userData'
import { PAGE_RECITERS, VERSE_RECITERS } from '@/core/audio/reciters'
import type { AudioGrain } from '@/core/audio/types'

const DEBOUNCE_MS = 300
const SPEEDS = new Set([0.5, 0.75, 1, 1.25, 1.5, 2])

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
      clearTimeout(timer)
      timer = setTimeout(
        () =>
          void saveAudioPrefs({
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
          }),
        DEBOUNCE_MS,
      )
    },
  )

  function dispose(): void {
    clearTimeout(timer)
    stop()
  }

  return { hydrate, dispose }
}
