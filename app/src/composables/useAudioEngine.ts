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
 *
 * Long background sessions (the "stops after 4-5 pages with the screen locked"
 * bug). A mobile OS only keeps a hidden page alive and online while it is
 * audibly playing; the moment between two items is silent, and that is when
 * Android (Doze, Chrome dropping its media service) or iOS (suspending a silent
 * web view) cuts it off. Three things keep a long queue alive:
 *   1. The next item is downloaded into memory while the current one still plays
 *      (`prefetch.ts`), so a boundary is `ended` → `src = blob:` → `play()` in one
 *      synchronous task with no network round-trip.
 *   2. The pause the element fires right before `ended` is not reported to the OS
 *      as "paused" — the session stays "playing" across the boundary.
 *   3. Transient network failures (a mid-stream drop, a load that stalls) are
 *      retried in place, resuming at the same position, instead of skipping the
 *      item or giving up; recovery is re-checked whenever the page comes back
 *      (visible/focus/pageshow/online) because background timers can't be trusted.
 */
import { AB_NONE, abOnEnded, abSeekTarget, clearAb, setA, setB, toggleLoop } from '@/core/audio/abRepeat'
import {
  isSupported as mediaSessionSupported,
  setActionHandlers as setMediaSessionActionHandlers,
  setMetadata as setMediaSessionMetadata,
  setPlaybackState as setMediaSessionPlaybackState,
  setPositionState as setMediaSessionPositionState,
} from '@/core/audio/mediaSession'
import { createAudioPrefetcher } from '@/core/audio/prefetch'
import { pageReciter, verseReciter } from '@/core/audio/reciters'
import { nextOnEnd, nextOnFailure, upcomingIndex, type Advance } from '@/core/audio/transport'
import type { PlaylistItem } from '@/core/audio/playlist'
import { t } from '@/core/i18n'
import { useAudioStore } from '@/stores/audio'

/** Lock-screen/notification artwork — the same icons the installed PWA itself uses. */
const ARTWORK: MediaImage[] = [
  { src: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png' },
]

/** `MediaError.MEDIA_ERR_NETWORK` — a fetch failure after the resource was found. */
const MEDIA_ERR_NETWORK = 2
/**
 * Backoff before each in-place retry of a network failure. Once spent, the item
 * moves to its fallback URL (verse grain), and after that playback parks — paused,
 * still on this item — until the network or the user comes back. It never skips:
 * the file is fine, the connection isn't, and skipping would just burn through
 * the rest of the queue the same way.
 */
export const NETWORK_RETRY_DELAYS_MS = [1000, 3000, 8000] as const
/** How long a wanted-playing load may go with no data and no playback before it's reloaded. */
export const STALL_TIMEOUT_MS = 15_000

/** The "Now Playing" title for an item — same label the mini-player shows. */
function mediaSessionTitle(item: PlaylistItem): string {
  return item.kind === 'verse' && item.verse
    ? t('audio.ayahLabel', { surah: item.verse.surah, ayah: item.verse.ayah })
    : item.label
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

interface AudioEngine {
  setPlaylistAndPlay(items: PlaylistItem[]): void
  /**
   * Extend the current queue (cursor and playing item untouched) — the reader's
   * next-page lookahead, so crossing a page is an ordinary in-list advance.
   */
  appendToPlaylist(items: PlaylistItem[]): void
  /** Undo a lookahead append: keep only the first `length` items (the current one included). */
  trimPlaylist(length: number): void
  /** Forget the first `n` (already played) items; the cursor stays on the same item. */
  dropBefore(n: number): void
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
  const prefetcher = createAudioPrefetcher()
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
   * The listener's intent: true from any play request until an explicit pause/
   * stop, a pause from outside (lock screen, OS interruption, headset unplug) or
   * the true end of the queue. Element events alone can't tell a deliberate pause
   * from a track boundary, a blocked `play()` or a dropped connection — this can,
   * and it's what decides whether recovery should resume anything.
   */
  let wantPlaying = false
  /** Bumped per `play()` call; a rejection from a superseded attempt is ignored. */
  let playSeq = 0
  /** True while the element's `src` is this item's in-memory (prefetched) copy. */
  let usingPrefetched = false
  /** In-place network retries spent on the current URL. */
  let networkRetries = 0
  /** Position to seek to once a reloaded source has metadata (in-place retry). */
  let resumeAt: number | null = null
  /** A reload is owed (scheduled, or parked waiting for network/the user). */
  let retryPending = false
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  /** `Date.now()` when the current wanted-playing load stopped making progress. */
  let stallSince: number | null = null
  let stallTimer: ReturnType<typeof setTimeout> | undefined
  /** `current|next` URLs last handed to the prefetcher, to skip redundant syncs. */
  let prefetchKey = ''

  /**
   * Call `play()` and, if the browser rejects the returned promise (an
   * autoplay-policy block, a media session the OS suspended while backgrounded/
   * screen-locked, etc.), recover instead of leaving the caller's `loading: true`
   * stuck forever — the `'playing'` event is the *only* other place that ever
   * clears it, and that event never fires on a rejected attempt. This does not
   * retry immediately: a rejection typically means the browser wants a fresh user
   * gesture. `wantPlaying` stays set, so `recover()` tries again when the page is
   * next brought to the foreground.
   */
  function attemptPlay(a: HTMLAudioElement): void {
    store.lastPlayError = null
    stoppedForMediaSession = false
    wantPlaying = true
    const seq = ++playSeq
    a.play().then(
      () => {},
      (error: unknown) => {
        // A newer load/play superseded this one (typically an `AbortError` from
        // `load()` during a fast skip) — that newer attempt owns the state now.
        if (seq !== playSeq) return
        store.loading = false
        store.isPlaying = false
        clearStall()
        setMediaSessionPlaybackState('paused')
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
      wantPlaying = true
      networkRetries = 0
      clearStall()
      // Backstop: a reload that never reported usable metadata still resumes
      // (best-effort) and never leaves the position frozen.
      applyResume(a)
      setMediaSessionPlaybackState('playing')
      // Belt-and-braces alongside `onMeta`: exactly *when* a WebView resets
      // `playbackRate` isn't something we can pin down from the outside, so
      // reassert here too, right as playback actually starts. Idempotent — a
      // no-op when the rate is already correct, so this never causes an audible
      // hiccup on an ordinary play/resume.
      if (a.playbackRate !== store.speed) a.playbackRate = store.speed
      // Audibly playing is when the OS lets us use the network in the
      // background — start fetching whatever plays next, now.
      syncPrefetch(true)
    })
    a.addEventListener('pause', () => {
      // A natural end fires `pause` right before `ended`; `onEnded` decides what
      // happens next. Reporting "paused" here would tell the OS the session is
      // over at every single track boundary.
      if (a.ended) return
      // `pause` is a queued event — a newer `play()` already started (e.g. a
      // manual next/prev: pause → new src → play), so this one is stale.
      if (!a.paused) return
      store.isPlaying = false
      clearStall()
      // Skip while `stopEl` is the reason we're paused — see `stoppedForMediaSession`.
      if (stoppedForMediaSession) return
      // A pause from outside the engine (lock screen without our handler, an OS
      // interruption, a headset unplug) is the user's/system's call — respect it,
      // never auto-resume over it.
      wantPlaying = false
      cancelRetry()
      setMediaSessionPlaybackState('paused')
    })
    a.addEventListener('waiting', () => {
      store.loading = true
      if (wantPlaying) armStall()
    })
    // Data still arriving = not stalled, however slowly it's playing.
    a.addEventListener('progress', () => {
      if (stallSince !== null) armStall(true)
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

  // —— Prefetch ————————————————————————————————————————————————————————————

  /**
   * Keep the in-memory copies to exactly {current, next} and, while audibly
   * playing, download the next one. `force` re-runs even when nothing changed
   * (on `playing` — the moment to start fetching); otherwise it's a cheap string
   * compare, which is what lets every `timeupdate` pick up an autoplay-next/loop
   * toggle or a lookahead append mid-item. `fetchNow: false` (on load) only trims
   * the cache: the incoming item's own load shouldn't compete for bandwidth.
   */
  function syncPrefetch(force: boolean, fetchNow = true): void {
    const current = store.current
    const nextIdx =
      current && !store.ab.loop
        ? upcomingIndex(store.index, store.playlist.length, store.autoNext, store.loopPlaylist)
        : null
    const upcoming = nextIdx !== null ? store.playlist[nextIdx] : null
    const key = `${current?.urls.primary ?? ''}|${upcoming?.urls.primary ?? ''}`
    if (key === prefetchKey && !force) return
    prefetchKey = key
    prefetcher.retain([current?.urls.primary, upcoming?.urls.primary])
    if (upcoming && fetchNow && wantPlaying && store.isPlaying) prefetcher.prefetch(upcoming.urls.primary)
  }

  // —— Stall watchdog / in-place retry ————————————————————————————————————

  function clearStall(): void {
    stallSince = null
    clearTimeout(stallTimer)
    stallTimer = undefined
  }

  /**
   * Start (or with `restart`, restart) the no-progress window. The timer is only
   * a backstop — background timers get throttled or frozen outright — so
   * `recover()` re-checks the same `stallSince` clock on every return to the page.
   */
  function armStall(restart = false): void {
    if (stallSince === null || restart) stallSince = Date.now()
    clearTimeout(stallTimer)
    stallTimer = setTimeout(checkStall, STALL_TIMEOUT_MS)
  }

  function checkStall(): void {
    if (stallSince === null || !wantPlaying || !el || el.paused) return
    const waited = Date.now() - stallSince
    if (waited < STALL_TIMEOUT_MS) {
      clearTimeout(stallTimer)
      stallTimer = setTimeout(checkStall, STALL_TIMEOUT_MS - waited)
      return
    }
    clearStall()
    onNetworkFailure()
  }

  function cancelRetry(): void {
    retryPending = false
    clearTimeout(retryTimer)
    retryTimer = undefined
  }

  /** Show "not playing" while a retry is owed, without dropping the intent to play. */
  function park(): void {
    clearTimeout(retryTimer)
    retryTimer = undefined
    retryPending = true
    store.isPlaying = false
    store.loading = false
    setMediaSessionPlaybackState('paused')
  }

  /**
   * A transient failure on the current URL (network error, stalled load). Retry
   * in place with backoff, resuming where it broke off; offline, wait for the
   * `online` event without spending a retry. Out of retries: try the fallback
   * host if there is one, else park on this item until `recover()` or a tap.
   */
  function onNetworkFailure(): void {
    if (!store.current) return
    // The failed load's own pending `play()` will reject next (NotSupported/
    // Abort); it must not undo the retry state set below or report "paused".
    playSeq++
    if (resumeAt === null) resumeAt = store.currentTime
    clearStall()
    // Broke while paused (e.g. preloading): nothing to retry yet — the next
    // `play()` reloads from here.
    if (!wantPlaying) {
      retryPending = true
      return
    }
    if (isOffline()) {
      park()
      return
    }
    if (networkRetries < NETWORK_RETRY_DELAYS_MS.length) {
      const delay = NETWORK_RETRY_DELAYS_MS[networkRetries++]
      retryPending = true
      store.loading = true
      clearTimeout(retryTimer)
      retryTimer = setTimeout(reloadInPlace, delay)
      return
    }
    if (switchToFallback()) return
    console.warn('[audio] network retries exhausted; waiting for the connection')
    store.lastPlayError = 'NetworkError'
    park()
  }

  /**
   * Point the element at `url` — its in-memory copy when the prefetch finished,
   * else the network URL — and `load()`. The single place a source is swapped, so
   * the rate reassertion and prefetch bookkeeping can't drift between callers.
   */
  function setSource(a: HTMLAudioElement, url: string): void {
    const cached = prefetcher.resolve(url)
    usingPrefetched = !!cached
    // Still downloading: we're streaming it now, so a second copy would only
    // compete for bandwidth at the boundary it was meant to protect.
    if (!cached) prefetcher.discard(url)
    a.src = cached ?? url
    a.playbackRate = store.speed
    a.load()
  }

  /** The URL the current item is on: its primary, or the fallback once switched. */
  function currentUrl(item: PlaylistItem): string {
    return triedFallback ? item.urls.fallback : item.urls.primary
  }

  /** Reload the current item's source and resume at `resumeAt`. */
  function reloadInPlace(): void {
    cancelRetry()
    const item = store.current
    if (!item || !wantPlaying) return
    const a = ensureEl()
    setSource(a, currentUrl(item))
    store.loading = true
    armStall(true)
    attemptPlay(a)
  }

  /**
   * Retry a parked item with a fresh retry budget — it was parked because the
   * connection was gone; now that something (the network, the user, the page
   * coming back) says it may be back, one failed attempt mustn't end it again.
   */
  function retryParked(): void {
    networkRetries = 0
    if (resumeAt === null) resumeAt = store.currentTime
    reloadInPlace()
  }

  /** Move to the fallback URL once, if it's a different source. */
  function switchToFallback(): boolean {
    const item = store.current
    if (!item || triedFallback || item.urls.fallback === item.urls.primary) return false
    triedFallback = true
    networkRetries = 0
    resumeAt = null // a different recording — positions don't carry over
    const a = ensureEl()
    setSource(a, item.urls.fallback)
    armStall(true)
    attemptPlay(a)
    return true
  }

  /**
   * Re-evaluate after the page comes back (visible / focus / pageshow) or the
   * network does (online). Background timers are throttled or frozen, and a
   * `play()` started while screen-locked can be refused — so whatever was owed
   * is settled here: a pending retry runs, a refused play is retried, a load that
   * has been stalled past the timeout is reloaded. Does nothing unless the
   * listener still wants playback (a deliberate pause is never overridden).
   */
  function recover(): void {
    if (!wantPlaying || !el || !store.current) return
    if (retryPending) {
      if (isOffline()) return
      // A backoff timer is running: just run it now. Parked: start over.
      if (retryTimer !== undefined) reloadInPlace()
      else retryParked()
      return
    }
    // Mid-boundary: the `ended` handler will run and take it from there.
    if (el.ended) return
    if (el.paused) {
      play()
      return
    }
    checkStall()
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'visible') recover()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', recover)
    window.addEventListener('focus', recover)
    window.addEventListener('pageshow', recover)
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange)

  // —— Transport ————————————————————————————————————————————————————————————

  function applyAdvance(advance: Advance, autoplay: boolean): void {
    if (advance === 'stop' || advance === 'exhausted') {
      wantPlaying = false
      cancelRetry()
      clearStall()
      store.isPlaying = false
      store.loading = false
      setMediaSessionPlaybackState('paused')
      if (advance === 'exhausted') onExhausted?.()
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
    networkRetries = 0
    resumeAt = null
    cancelRetry()
    clearStall()
    const a = ensureEl()
    // Pause + load() so switching source mid-playback reliably aborts the current
    // media. Setting `.src` alone is not enough in webviews (Android) — the element
    // keeps playing the already-buffered audio, so a grain/reciter switch appears to
    // do nothing until the old clip ends. Skipped when already paused/ended (an
    // autoplay-advance): there's nothing to abort, and no pause to report.
    if (!a.paused) a.pause()
    // The in-memory copy when the previous item finished downloading it — the
    // whole point: no network needed at a silent, screen-locked boundary.
    setSource(a, item.urls.primary)
    store.currentTime = 0
    store.duration = 0
    store.loading = true
    setMediaSessionMetadata({
      title: mediaSessionTitle(item),
      artist: mediaSessionArtist(item),
      artwork: ARTWORK,
    })
    // After the src swap: releases the outgoing item's in-memory copy.
    syncPrefetch(true, false)
    if (autoplay) {
      armStall()
      attemptPlay(a)
    }
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
    // A reload for an in-place retry starts at 0 until `onMeta` seeks it back —
    // don't let that transient 0 overwrite the position we're resuming to.
    if (resumeAt === null) store.currentTime = a.currentTime
    const target = abSeekTarget(store.ab, a.currentTime)
    if (target !== null && Math.abs(a.currentTime - target) > 0.05) a.currentTime = target
    syncMediaSessionPosition()
    syncPrefetch(false)
  }

  function onMeta(): void {
    const a = ensureEl()
    const d = a.duration
    if (Number.isFinite(d) && d > 0) store.duration = d
    // Reassert rather than trust the pre-load() assignment in `loadCurrent` — see
    // the module doc: some WebViews reset `playbackRate` to 1 during load().
    if (a.playbackRate !== store.speed) a.playbackRate = store.speed
    // An in-place retry: pick up where the connection dropped, not from the top.
    // (Infinity = an unbounded stream; NaN = the reset `load()` itself fires.)
    if (d === Infinity || (Number.isFinite(d) && d > 0)) applyResume(a)
    syncMediaSessionPosition()
  }

  /** Seek a reloaded source back to `resumeAt` (once), then let time flow to the store again. */
  function applyResume(a: HTMLAudioElement): void {
    if (resumeAt === null) return
    const d = a.duration
    const target = Number.isFinite(d) ? Math.min(resumeAt, d) : resumeAt
    if (target > 0 && (!Number.isFinite(d) || target < d)) a.currentTime = target
    store.currentTime = target
    resumeAt = null
  }

  function onEnded(): void {
    clearStall()
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
    if (!item || !el) return
    const a = el
    // The in-memory copy itself is bad (it decoded wrong, or the blob was
    // released) — drop it and stream the same URL instead.
    if (usingPrefetched) {
      usingPrefetched = false
      prefetcher.discard(currentUrl(item))
      if (resumeAt === null) resumeAt = store.currentTime
      reloadInPlace()
      return
    }
    // A dropped connection, not a bad file: retry in place, don't skip.
    if (a.error?.code === MEDIA_ERR_NETWORK || isOffline()) {
      onNetworkFailure()
      return
    }
    if (switchToFallback()) return
    applyAdvance(nextOnFailure(store.index, store.playlist.length), true)
  }

  function play(): void {
    const a = ensureEl()
    if (!a.src && store.current) loadCurrent(true)
    // Parked on a failure (or the element is in an error state) — a tap should
    // reload where it stopped, not `play()` a dead source.
    else if (store.current && (retryPending || a.error)) {
      wantPlaying = true
      retryParked()
    } else attemptPlay(a)
  }

  function pause(): void {
    wantPlaying = false
    cancelRetry()
    clearStall()
    el?.pause()
    if (store.loading) store.loading = false
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
    wantPlaying = false
    cancelRetry()
    clearStall()
    resumeAt = null
    if (el) {
      el.pause()
      el.currentTime = 0
    }
    store.currentTime = 0
    store.isPlaying = false
    store.loading = false
    prefetcher.clear()
    prefetchKey = ''
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
    appendToPlaylist(items) {
      if (!items.length || !store.playlist.length) return
      store.appendPlaylist(items)
      syncPrefetch(true)
    },
    trimPlaylist(length) {
      store.trimPlaylist(length)
      syncPrefetch(true)
    },
    dropBefore(n) {
      store.dropBefore(n)
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
      wantPlaying = false
      cancelRetry()
      clearStall()
      el?.pause()
      if (el) el.src = ''
      prefetcher.clear()
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', recover)
        window.removeEventListener('focus', recover)
        window.removeEventListener('pageshow', recover)
      }
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange)
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
