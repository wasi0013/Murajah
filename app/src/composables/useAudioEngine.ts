/**
 * The audio engine (7.1.2) — owns the one and only `<audio>` element and drives the
 * audio store. A module singleton so it lives above the views: navigating reader ↔
 * mushaf ↔ quiz never tears playback down, which is why the legacy snapshot/restore
 * subsystem (bug A5) simply doesn't exist here.
 *
 * Source-with-fallback (fixes A2/A3): set the primary URL; on the element's `error`
 * event, swap to the fallback once; if that also fails, skip the item. No HEAD
 * probe, no per-play listener churn.
 */
import { AB_NONE, abOnEnded, abSeekTarget, clearAb, setA, setB, toggleLoop } from '@/core/audio/abRepeat'
import { nextOnEnd, nextOnFailure, type Advance } from '@/core/audio/transport'
import type { PlaylistItem } from '@/core/audio/playlist'
import { useAudioStore } from '@/stores/audio'

interface AudioEngine {
  setPlaylistAndPlay(items: PlaylistItem[]): void
  toggle(): void
  play(): void
  pause(): void
  next(): void
  prev(): void
  stop(): void
  seekToFraction(fraction: number): void
  setSpeed(speed: number): void
  markA(): void
  markB(): void
  toggleAbLoop(): void
  clearAbMarkers(): void
  dispose(): void
}

let engine: AudioEngine | null = null

function createEngine(): AudioEngine {
  const store = useAudioStore()
  let el: HTMLAudioElement | null = null
  /** Whether the current item has already been retried on its fallback URL. */
  let triedFallback = false

  function ensureEl(): HTMLAudioElement {
    if (el) return el
    const a = new Audio()
    a.preload = 'auto'
    a.addEventListener('timeupdate', onTimeUpdate)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('durationchange', onMeta)
    a.addEventListener('ended', onEnded)
    a.addEventListener('error', onError)
    a.addEventListener('playing', () => {
      store.isPlaying = true
      store.loading = false
    })
    a.addEventListener('pause', () => {
      store.isPlaying = false
    })
    a.addEventListener('waiting', () => {
      store.loading = true
    })
    el = a
    return a
  }

  function applyAdvance(advance: Advance, autoplay: boolean): void {
    if (advance === 'stop') {
      store.isPlaying = false
      store.loading = false
      return
    }
    store.index = advance.index
    loadCurrent(autoplay)
  }

  function loadCurrent(autoplay: boolean): void {
    const item = store.current
    if (!item) return
    triedFallback = false
    const a = ensureEl()
    // Pause + load() so switching source mid-playback reliably aborts the current
    // media. Setting `.src` alone is not enough in webviews (Android) — the element
    // keeps playing the already-buffered audio, so a grain/reciter switch appears to
    // do nothing until the old clip ends.
    a.pause()
    a.src = item.urls.primary
    a.playbackRate = store.speed
    a.load()
    store.currentTime = 0
    store.duration = 0
    store.loading = true
    if (autoplay) void a.play().catch(() => {})
  }

  function onTimeUpdate(): void {
    const a = ensureEl()
    store.currentTime = a.currentTime
    const target = abSeekTarget(store.ab, a.currentTime)
    if (target !== null && Math.abs(a.currentTime - target) > 0.05) a.currentTime = target
  }

  function onMeta(): void {
    const d = ensureEl().duration
    if (Number.isFinite(d) && d > 0) store.duration = d
  }

  function onEnded(): void {
    const { state, seekTo } = abOnEnded(store.ab, store.duration)
    store.ab = state
    if (seekTo !== null) {
      const a = ensureEl()
      a.currentTime = seekTo
      void a.play().catch(() => {})
      return
    }
    applyAdvance(nextOnEnd(store.index, store.playlist.length, store.autoNext, store.loopPlaylist), true)
  }

  function onError(): void {
    const item = store.current
    if (!item) return
    if (!triedFallback && item.urls.fallback !== item.urls.primary) {
      triedFallback = true
      const a = ensureEl()
      a.src = item.urls.fallback
      a.load()
      void a.play().catch(() => {})
      return
    }
    applyAdvance(nextOnFailure(store.index, store.playlist.length), true)
  }

  function play(): void {
    const a = ensureEl()
    if (!a.src && store.current) loadCurrent(true)
    else void a.play().catch(() => {})
  }

  function pause(): void {
    el?.pause()
  }

  /** Pause and rewind the element, clearing playback flags. */
  function stopEl(): void {
    if (el) {
      el.pause()
      el.currentTime = 0
    }
    store.currentTime = 0
    store.isPlaying = false
    store.loading = false
  }

  return {
    setPlaylistAndPlay(items) {
      store.setPlaylist(items)
      store.ab = { ...AB_NONE }
      if (items.length) loadCurrent(true)
      else stopEl() // an empty rebuild must silence whatever was playing
    },
    play,
    pause,
    toggle() {
      if (store.isPlaying) pause()
      else play()
    },
    next() {
      if (store.hasNext) applyAdvance({ index: store.index + 1 }, true)
    },
    prev() {
      if (store.hasPrev) applyAdvance({ index: store.index - 1 }, true)
    },
    stop: stopEl,
    seekToFraction(fraction) {
      const a = ensureEl()
      if (store.duration > 0) a.currentTime = Math.max(0, Math.min(1, fraction)) * store.duration
    },
    setSpeed(speed) {
      store.speed = speed
      if (el) el.playbackRate = speed
    },
    markA() {
      store.ab = setA(store.ab, store.currentTime)
    },
    markB() {
      store.ab = setB(store.ab, store.currentTime)
    },
    toggleAbLoop() {
      store.ab = toggleLoop(store.ab)
    },
    clearAbMarkers() {
      store.ab = clearAb()
    },
    dispose() {
      el?.pause()
      if (el) el.src = ''
    },
  }
}

export function useAudioEngine(): AudioEngine {
  return (engine ??= createEngine())
}

/** Test-only: drop the singleton so a fresh Pinia/element can be bound. */
export function __resetAudioEngine(): void {
  engine?.dispose()
  engine = null
}
