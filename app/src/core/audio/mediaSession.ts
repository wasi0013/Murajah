/**
 * Thin, capability-guarded wrapper around `navigator.mediaSession` (7.1.3's
 * long-deferred "nice-to-have", now load-bearing). Two payoffs: lock-screen /
 * notification "Now Playing" controls and Bluetooth/headset button support, and
 * — the more consequential half for the "audio just stops in the background"
 * reports — the standard signal mobile OSes use to treat this tab as running a
 * legitimate, ongoing media session rather than a suspendable background page.
 *
 * Every function is a no-op when `navigator.mediaSession` doesn't exist (older
 * browsers, every unit test environment) so callers never need their own
 * feature-detection. `setActionHandler` is called per-action inside its own
 * try/catch: an unsupported action (e.g. `seekto` on an older engine) throws a
 * `TypeError` per spec, and one unsupported action must never stop the rest
 * from registering.
 */

export interface MediaSessionMetadataInput {
  title: string
  artist?: string
  artwork?: readonly MediaImage[]
}

export type MediaSessionPlaybackState = 'playing' | 'paused' | 'none'

export interface MediaSessionActionHandlers {
  play: () => void
  pause: () => void
  previoustrack: () => void
  nexttrack: () => void
  seekto: (seconds: number) => void
}

function session(): MediaSession | null {
  return typeof navigator !== 'undefined' ? (navigator.mediaSession ?? null) : null
}

/** Whether this browser exposes the Media Session API at all. */
export function isSupported(): boolean {
  return session() !== null
}

/** Set the "Now Playing" title/artist/artwork shown on lock screens and notifications. */
export function setMetadata(meta: MediaSessionMetadataInput): void {
  const s = session()
  if (!s || typeof MediaMetadata === 'undefined') return
  s.metadata = new MediaMetadata({
    title: meta.title,
    artist: meta.artist,
    artwork: meta.artwork ? [...meta.artwork] : undefined,
  })
}

/** Mirror the engine's actual playing/paused/stopped state for the OS's controls. */
export function setPlaybackState(state: MediaSessionPlaybackState): void {
  const s = session()
  if (s) s.playbackState = state
}

export interface MediaSessionPositionState {
  duration: number
  position: number
  playbackRate: number
}

/**
 * Publish the current duration/position/rate. Several platforms (notably
 * Android's media notification) only surface a seek bar — and the `seekto`
 * action that comes with it — once position state has been published at least
 * once; without this, a registered `seekto` handler can be unreachable from the
 * OS side even though it's correctly wired. `null` clears it (e.g. on stop).
 * Guarded in a try/catch: the spec requires `0 <= position <= duration`, and a
 * value that briefly violates that during a seek/track-change race must never
 * crash playback over what's purely a lock-screen cosmetic.
 */
export function setPositionState(state: MediaSessionPositionState | null): void {
  const s = session()
  if (!s || typeof s.setPositionState !== 'function') return
  try {
    s.setPositionState(state ?? undefined)
  } catch {
    // See above — never let an out-of-range value crash playback.
  }
}

/** Register the lock-screen/notification/hardware-button handlers, once. */
export function setActionHandlers(handlers: MediaSessionActionHandlers): void {
  const s = session()
  if (!s) return
  const set = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
    try {
      s.setActionHandler(action, handler)
    } catch {
      // Not every action is supported everywhere (e.g. older Chromium lacks
      // `seekto`) — skip it, don't let it stop the rest from registering.
    }
  }
  set('play', () => handlers.play())
  set('pause', () => handlers.pause())
  set('previoustrack', () => handlers.previoustrack())
  set('nexttrack', () => handlers.nexttrack())
  set('seekto', (details) => {
    if (typeof details.seekTime === 'number') handlers.seekto(details.seekTime)
  })
}
