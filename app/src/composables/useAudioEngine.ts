/**
 * The audio engine (7.1.2) — owns the one and only `<audio>` element and drives the
 * audio store. A module singleton so it lives above the views: navigating reader ↔
 * mushaf ↔ quiz never tears playback down, which is why the legacy snapshot/restore
 * subsystem (bug A5) simply doesn't exist here.
 *
 * Source-with-fallback (fixes A2/A3): set the primary URL; on the element's `error`
 * event, swap to the fallback once; if that also fails, skip the item. No HEAD
 * probe, no per-play listener churn.
 *
 * Playback rate is reasserted on `loadedmetadata`/`durationchange` (`onMeta`), not
 * only right before `load()`: some WebViews (Android) silently reset `playbackRate`
 * back to 1 as part of the load algorithm, which otherwise leaves the UI showing the
 * chosen speed while the track actually plays at 1×.
 *
 * Media Session (7.1.3): lock-screen/notification "Now Playing" + hardware-button
 * support, and — more importantly for mobile background/lock-screen playback — the
 * standard signal the OS uses to treat this as a legitimate ongoing media session
 * rather than a suspendable background page. Metadata is set per item load; the
 * action handlers are registered once and simply delegate to this engine's own
 * transport, so there is exactly one implementation of play/pause/next/prev/seek.
 */
import { AB_NONE, abOnEnded, abSeekTarget, clearAb, setA, setB, toggleLoop } from '@/core/audio/abRepeat'
import {
  isSupported as mediaSessionSupported,
  setActionHandlers as setMediaSessionActionHandlers,
  setMetadata as setMediaSessionMetadata,
  setPlaybackState as setMediaSessionPlaybackState,
  setPositionState as setMediaSessionPositionState,
} from '@/core/audio/mediaSession'
import { pageReciter, verseReciter } from '@/core/audio/reciters'
import { nextOnEnd, nextOnFailure, type Advance } from '@/core/audio/transport'
import type { PlaylistItem } from '@/core/audio/playlist'
import { t } from '@/core/i18n'
import { useAudioStore } from '@/stores/audio'

/** Lock-screen/notification artwork — the same icons the installed PWA itself uses. */
const ARTWORK: MediaImage[] = [
  { src: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png' },
]

/** The "Now Playing" title for an item — same label the mini-player shows. */
function mediaSessionTitle(item: PlaylistItem): string {
  return item.kind === 'verse' && item.verse
    ? t('audio.ayahLabel', { surah: item.verse.surah, ayah: item.verse.ayah })
    : item.label
}

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
  /**
   * Register the callback fired when the playlist ends with autoplay-next on but
   * nowhere left to advance to in-list (see `Advance = 'exhausted'`) — the view
   * (`AudioHost`) uses this to ask its parent for the next page. Pass `null` to
   * unregister (e.g. on unmount) so a stale view is never asked to advance again.
   */
  setOnExhausted(cb: (() => void) | null): void
  dispose(): void
}

let engine: AudioEngine | null = null

function createEngine(): AudioEngine {
  const store = useAudioStore()
  let el: HTMLAudioElement | null = null
  /** Whether the current item has already been retried on its fallback URL. */
  let triedFallback = false
  /** See `AudioEngine.setOnExhausted`. */
  let onExhausted: (() => void) | null = null
  /**
   * True only between an explicit `stop()` and the next real play attempt.
   * `HTMLMediaElement.pause()` fires its `'pause'` event as a *queued* task, not
   * synchronously — so `stopEl` setting Media Session to `'none'` would otherwise
   * always be clobbered back to `'paused'` moments later when that queued event
   * finally fires, leaving a stale "paused" Now Playing entry on the lock screen
   * after the player was closed. This flag isn't about timing (it doesn't matter
   * how long the queued event takes) — it just gates that one listener's side
   * effect while genuinely stopped.
   */
  let stoppedForMediaSession = false

  /**
   * Call `play()` and, if the browser rejects the returned promise (an
   * autoplay-policy block, a media session the OS suspended while backgrounded/
   * screen-locked, etc.), recover instead of leaving the caller's `loading: true`
   * stuck forever — the `'playing'` event is the *only* other place that ever
   * clears it, and that event never fires on a rejected attempt. Previously every
   * call site swallowed the rejection with `.catch(() => {})`, so a blocked replay
   * looked identical to a hung spinner with no way out. This does not retry: a
   * rejection typically means the browser wants a fresh user gesture, which
   * silently calling `play()` again can't manufacture.
   */
  function attemptPlay(a: HTMLAudioElement): void {
    store.lastPlayError = null
    stoppedForMediaSession = false
    a.play().then(
      () => {},
      (error: unknown) => {
        store.loading = false
        store.isPlaying = false
        const reason = error instanceof Error ? error.name || error.message : 'unknown'
        store.lastPlayError = reason
        // The only diagnostic a future "it just stops" report has: distinguishes
        // an autoplay-policy/background-suspension block (`NotAllowedError`) from
        // a real media/network failure without needing to reproduce it live.
        console.warn(`[audio] play() rejected: ${reason}`)
      },
    )
  }

  /** The "Now Playing" artist for an item — the reciter actually voicing it. */
  function mediaSessionArtist(item: PlaylistItem): string {
    return item.kind === 'verse'
      ? verseReciter(store.verseReciterId).name
      : pageReciter(store.pageReciterId).name
  }

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
      setMediaSessionPlaybackState('playing')
      // Belt-and-braces alongside `onMeta`: exactly *when* a WebView resets
      // `playbackRate` isn't something we can pin down from the outside, so
      // reassert here too, right as playback actually starts. Idempotent — a
      // no-op when the rate is already correct, so this never causes an audible
      // hiccup on an ordinary play/resume.
      if (a.playbackRate !== store.speed) a.playbackRate = store.speed
    })
    a.addEventListener('pause', () => {
      store.isPlaying = false
      // Skip while `stopEl` is the reason we're paused — see `stoppedForMediaSession`.
      if (!stoppedForMediaSession) setMediaSessionPlaybackState('paused')
    })
    a.addEventListener('waiting', () => {
      store.loading = true
    })
    // Registered once, here, alongside the element itself — delegates to this
    // engine's own transport (defined below) so there is exactly one
    // implementation of each action, not a parallel copy for the lock screen.
    if (mediaSessionSupported()) {
      setMediaSessionActionHandlers({
        play,
        pause,
        previoustrack: prev,
        nexttrack: next,
        seekto(seconds) {
          if (store.duration > 0) a.currentTime = Math.max(0, Math.min(seconds, store.duration))
        },
      })
    }
    el = a
    return a
  }

  function applyAdvance(advance: Advance, autoplay: boolean): void {
    if (advance === 'stop') {
      store.isPlaying = false
      store.loading = false
      setMediaSessionPlaybackState('paused')
      return
    }
    if (advance === 'exhausted') {
      store.isPlaying = false
      store.loading = false
      setMediaSessionPlaybackState('paused')
      onExhausted?.()
      return
    }
    // AB markers are scoped to the item they were set on (module doc). Clear them
    // on every move to a (possibly different) index — covers autoplay-advance,
    // manual next()/prev(), and the failure-skip alike — so a loop region from the
    // outgoing item can never carry over onto whatever loads next. Safe even when
    // `loopPlaylist` wraps a single-item list back to the same index: this branch
    // is only ever reached while `ab.loop` is false (an active same-item AB loop is
    // handled entirely by `onTimeUpdate`/`onEnded`'s `abOnEnded` short-circuit,
    // which returns before `applyAdvance` is ever called), so there's no live loop
    // here to lose — only stale markers left over from a previous item.
    store.ab = { ...AB_NONE }
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
    setMediaSessionMetadata({
      title: mediaSessionTitle(item),
      artist: mediaSessionArtist(item),
      artwork: ARTWORK,
    })
    if (autoplay) attemptPlay(a)
  }

  /**
   * Publish duration/position/rate for the lock-screen scrubber. Only once a
   * duration is known — some platforms only expose the seek bar (and the
   * `seekto` action registered above) once this has been called at least once.
   */
  function syncMediaSessionPosition(): void {
    if (store.duration > 0) {
      setMediaSessionPositionState({
        duration: store.duration,
        position: Math.min(store.currentTime, store.duration),
        playbackRate: store.speed,
      })
    }
  }

  function onTimeUpdate(): void {
    const a = ensureEl()
    store.currentTime = a.currentTime
    const target = abSeekTarget(store.ab, a.currentTime)
    if (target !== null && Math.abs(a.currentTime - target) > 0.05) a.currentTime = target
    syncMediaSessionPosition()
  }

  function onMeta(): void {
    const a = ensureEl()
    const d = a.duration
    if (Number.isFinite(d) && d > 0) store.duration = d
    // Reassert rather than trust the pre-load() assignment in `loadCurrent` — see
    // the module doc: some WebViews reset `playbackRate` to 1 during load().
    if (a.playbackRate !== store.speed) a.playbackRate = store.speed
    syncMediaSessionPosition()
  }

  function onEnded(): void {
    const { state, seekTo } = abOnEnded(store.ab)
    store.ab = state
    if (seekTo !== null) {
      const a = ensureEl()
      a.currentTime = seekTo
      attemptPlay(a)
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
      attemptPlay(a)
      return
    }
    applyAdvance(nextOnFailure(store.index, store.playlist.length), true)
  }

  function play(): void {
    const a = ensureEl()
    if (!a.src && store.current) loadCurrent(true)
    else attemptPlay(a)
  }

  function pause(): void {
    el?.pause()
  }

  function next(): void {
    if (store.hasNext) applyAdvance({ index: store.index + 1 }, true)
  }

  function prev(): void {
    if (store.hasPrev) applyAdvance({ index: store.index - 1 }, true)
  }

  /** Pause and rewind the element, clearing playback flags. */
  function stopEl(): void {
    // Set before `el.pause()`, which fires its `'pause'` event asynchronously —
    // without this, that later event would overwrite 'none' back to 'paused'.
    stoppedForMediaSession = true
    if (el) {
      el.pause()
      el.currentTime = 0
    }
    store.currentTime = 0
    store.isPlaying = false
    store.loading = false
    // The one case that should clear "Now Playing" entirely rather than just
    // reflect a pause: an explicit stop/close, not merely reaching the end of
    // an item or an item without autoplay-next (see `applyAdvance`'s 'stop' case).
    setMediaSessionPlaybackState('none')
    setMediaSessionPositionState(null)
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
    next,
    prev,
    stop: stopEl,
    seekToFraction(fraction) {
      const a = ensureEl()
      if (store.duration > 0) a.currentTime = Math.max(0, Math.min(1, fraction)) * store.duration
    },
    setSpeed(speed) {
      store.speed = speed
      if (el) el.playbackRate = speed
      syncMediaSessionPosition() // keep the lock-screen clock honest at 0.5×/2×
    },
    markA() {
      // Read the element directly, not `store.currentTime` — that only updates on
      // `timeupdate` (browser-throttled, commonly ~250ms), so a tap right after a
      // seek or right at playback start could otherwise land on a stale value.
      store.ab = setA(store.ab, el?.currentTime ?? store.currentTime)
    },
    markB() {
      store.ab = setB(store.ab, el?.currentTime ?? store.currentTime)
    },
    toggleAbLoop() {
      store.ab = toggleLoop(store.ab, store.duration)
    },
    clearAbMarkers() {
      store.ab = clearAb()
    },
    setOnExhausted(cb) {
      onExhausted = cb
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
