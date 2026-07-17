import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { AB_NONE, abRegion, type AbState } from '@/core/audio/abRepeat'
import { DEFAULT_PAGE_RECITER, DEFAULT_VERSE_RECITER } from '@/core/audio/defaults'
import type { PlaylistItem } from '@/core/audio/playlist'
import type { AudioGrain } from '@/core/audio/types'

/**
 * Audio playback state — the single source of truth the engine (`useAudioEngine`)
 * drives and the player UI renders. Split into a **prefs** slice (persisted: grain,
 * reciters, speed — see 7.3) and a **transient** playback slice (playlist, cursor,
 * time) that resets each session. The `<audio>` element itself lives in the engine,
 * above the views, so switching reader ↔ mushaf never tears playback down.
 */
export const useAudioStore = defineStore('audio', () => {
  // —— Prefs (persisted) ————————————————————————————————————————————————
  const grain = ref<AudioGrain>('verse')
  const verseReciterId = ref(DEFAULT_VERSE_RECITER)
  const pageReciterId = ref(DEFAULT_PAGE_RECITER)
  const speed = ref(1)
  const repeatCount = ref(1)
  const spaced = ref(false)
  const autoNext = ref(true)
  const loopPlaylist = ref(false)

  // —— Transient playback ———————————————————————————————————————————————
  /** Shallow: items are replaced wholesale, never mutated in place. */
  const playlist = shallowRef<PlaylistItem[]>([])
  const index = ref(-1)
  const isPlaying = ref(false)
  const loading = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const ab = ref<AbState>({ ...AB_NONE })
  /** Whether the mini-player is on screen. */
  const open = ref(false)

  const current = computed<PlaylistItem | null>(() => playlist.value[index.value] ?? null)
  /** The active ayah (verse grain only) — drives the reader highlight. */
  const activeVerse = computed(() => (current.value?.kind === 'verse' ? (current.value.verse ?? null) : null))
  /** The active page, whichever grain (verse items carry their page too). */
  const activePage = computed(() => current.value?.page?.page ?? current.value?.verse?.page ?? null)
  const hasNext = computed(() => index.value < playlist.value.length - 1)
  const hasPrev = computed(() => index.value > 0)
  const region = computed(() => abRegion(ab.value))
  const progress = computed(() => (duration.value > 0 ? currentTime.value / duration.value : 0))

  function setPlaylist(items: PlaylistItem[]) {
    playlist.value = items
    index.value = items.length ? 0 : -1
    currentTime.value = 0
    duration.value = 0
  }

  function reset() {
    setPlaylist([])
    isPlaying.value = false
    loading.value = false
    ab.value = { ...AB_NONE }
  }

  return {
    // prefs
    grain,
    verseReciterId,
    pageReciterId,
    speed,
    repeatCount,
    spaced,
    autoNext,
    loopPlaylist,
    // playback
    playlist,
    index,
    isPlaying,
    loading,
    currentTime,
    duration,
    ab,
    open,
    // derived
    current,
    activeVerse,
    activePage,
    hasNext,
    hasPrev,
    region,
    progress,
    // actions
    setPlaylist,
    reset,
  }
})
