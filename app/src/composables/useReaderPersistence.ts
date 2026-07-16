import { watch } from 'vue'
import type { useReaderStore } from '@/stores/reader'
import { getPref, setPref } from '@/core/storage/prefs'

type ReaderStore = ReturnType<typeof useReaderStore>

const PREF_KEY = 'reader'
const DEBOUNCE_MS = 300

/**
 * Binds a reader store to the prefs KV: `hydrate()` applies the saved view
 * options + last page (call it before mounting the surface, inside the same
 * data/font await window, so there's no visible flash), and a debounced watch
 * persists changes off the render path. Best-effort — storage errors never
 * surface to the reader.
 */
export function useReaderPersistence(reader: ReaderStore) {
  async function hydrate(): Promise<void> {
    const saved = await getPref<Parameters<ReaderStore['restore']>[0]>(PREF_KEY)
    if (saved) reader.restore(saved)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = watch(
    () => reader.snapshot(),
    (snap) => {
      clearTimeout(timer)
      timer = setTimeout(() => void setPref(PREF_KEY, snap), DEBOUNCE_MS)
    },
  )

  function dispose(): void {
    clearTimeout(timer)
    stop()
  }

  return { hydrate, dispose }
}
