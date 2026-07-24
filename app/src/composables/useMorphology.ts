import { computed, shallowRef, ref } from 'vue'
import type { DataClient } from '@/core/data'
import { getDataClient } from '@/core/data'

/**
 * Morphology-on-tap state: which word is active, its anchor element (for the
 * popup to position against), and the loaded analysis HTML. Per-surah chunks are
 * cached (loaded lazily via DataClient.getMorphology), so the first tap in a
 * surah fetches and every later tap in it is instant. The popup UI itself is
 * code-split by the caller, so neither it nor the data touch the initial bundle.
 */
export function useMorphology(data: DataClient = getDataClient()) {
  const cache = new Map<number, Record<string, string>>()
  const location = ref<string | null>(null)
  const anchor = shallowRef<HTMLElement | null>(null)
  const content = ref<string | null>(null)
  const loading = ref(false)

  const open = computed(() => location.value !== null)

  async function openFor(loc: string, el: HTMLElement): Promise<void> {
    location.value = loc
    anchor.value = el
    content.value = null
    const surah = Number(loc.split(':')[0])

    const cached = cache.get(surah)
    if (cached) {
      content.value = cached[loc] ?? null
      return
    }
    loading.value = true
    try {
      await data.init()
      const map = await data.getMorphology(surah)
      cache.set(surah, map)
      if (location.value === loc) content.value = map[loc] ?? null
    } catch {
      if (location.value === loc) content.value = null
    } finally {
      loading.value = false
    }
  }

  function close(): void {
    location.value = null
    anchor.value = null
    content.value = null
  }

  return { open, location, anchor, content, loading, openFor, close }
}
