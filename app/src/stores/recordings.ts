import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Recording } from '@/core/audio/recorder'

const byNewest = (a: Recording, b: Recording) => b.recordedAt.localeCompare(a.recordedAt)

/**
 * Own-recitation recordings (Phase 7.6), kept newest-first. Blobs live in the list;
 * persistence (IndexedDB, shared app DB) is bound separately by
 * `useRecordingsPersistence` so any surface can read recordings.
 */
export const useRecordingsStore = defineStore('recordings', () => {
  const items = ref<Recording[]>([])

  function setAll(list: Recording[]) {
    items.value = [...list].sort(byNewest)
  }
  function add(rec: Recording) {
    items.value = [rec, ...items.value]
  }
  function remove(id: string) {
    items.value = items.value.filter((r) => r.id !== id)
  }

  return { items, setAll, add, remove }
})
