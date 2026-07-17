import { watch } from 'vue'
import { useAudioStore } from '@/stores/audio'
import { loadAudioPrefs, saveAudioPrefs } from '@/core/storage/userData'
import { PAGE_RECITERS, VERSE_RECITERS } from '@/core/audio/reciters'
import type { AudioGrain } from '@/core/audio/types'

const DEBOUNCE_MS = 300
const SPEEDS = new Set([0.5, 0.75, 1, 1.25, 1.5, 2])

/**
 * Binds the audio store's **preference** slice to IndexedDB (7.3): grain, the two
 * reciters, and speed. Transient playback (playlist, cursor, time) is deliberately
 * never persisted — a fresh session starts clean. Hydration validates stored ids
 * against the current registries so a removed reciter falls back to the default.
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
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = watch(
    () => [store.grain, store.verseReciterId, store.pageReciterId, store.speed] as const,
    ([grain, verseReciterId, pageReciterId, speed]) => {
      clearTimeout(timer)
      timer = setTimeout(() => void saveAudioPrefs({ grain, verseReciterId, pageReciterId, speed }), DEBOUNCE_MS)
    },
  )

  function dispose(): void {
    clearTimeout(timer)
    stop()
  }

  return { hydrate, dispose }
}
