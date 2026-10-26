/**
 * Next-item audio prefetch, held in memory as Blob object URLs.
 *
 * Why this exists (the "stops after 4-5 pages on mobile" bug): without it, every
 * item boundary needs a fresh network request that only starts *after* the
 * previous item has ended — i.e. at the one moment the page is silent. That's
 * exactly when mobile OSes are allowed to cut a backgrounded/screen-locked page
 * off: Android Doze defers network for apps without an active media foreground
 * service (Chrome drops its media notification service once nothing plays), and
 * iOS suspends a web page whose audio has stopped. The next file's request then
 * never completes, and playback silently ends.
 *
 * Fetching the upcoming item while the current one is still audibly playing
 * (when the OS still treats the page as a media app) means the boundary needs
 * no network at all: `ended` → `src = blob:` → `play()`, synchronously.
 *
 * Every audio host serves `Access-Control-Allow-Origin: *`; a host that doesn't
 * simply fails the fetch, and the engine streams that item from its URL as before.
 * Holds only what the engine asks it to `retain` (current + next), so memory stays
 * bounded to a couple of files even across a whole-Quran Listen session.
 *
 * A failed download is retried, not given up on after one attempt: a fetch can
 * fail mid-download (iOS reports "Load failed" when the connection is cut around
 * the screen locking), and a single lost attempt left that item's boundary on
 * the network, the gap this file exists to close. A short list repeating the
 * same few files (Today) is far less exposed, since the HTTP cache can answer
 * the streaming fallback at once; a juz needs a new file at every boundary.
 *
 * Retries are bounded so a host outage can't turn every open player into a
 * request loop: exponential backoff from `PREFETCH_RETRY_MS`, at most
 * `PREFETCH_MAX_ATTEMPTS` downloads per URL while it stays the upcoming item, and
 * none for a 4xx answer that won't change on asking again (404, 403, ...).
 * The engine can then simply keep asking on every `timeupdate`.
 */

/** Wait after a URL's first failed download; doubles per failure up to `PREFETCH_RETRY_MAX_MS`. */
export const PREFETCH_RETRY_MS = 5000
export const PREFETCH_RETRY_MAX_MS = 60_000
/** Downloads attempted per URL (the first one included) before giving up on it. */
export const PREFETCH_MAX_ATTEMPTS = 4

interface Failure {
  /** `Date.now()` of the last failed download. */
  at: number
  /** Failed downloads so far. */
  count: number
  /** False for an answer retrying can't change (a 4xx other than 408/429). */
  retryable: boolean
}

/** A non-OK HTTP answer, kept so a 4xx can be told apart from a dropped connection. */
class HttpStatusError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`HTTP ${status}`)
    this.status = status
  }
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof HttpStatusError)) return true // network drop, empty body
  const { status } = error
  return status >= 500 || status === 408 || status === 429
}

function retryDelay(count: number): number {
  return Math.min(PREFETCH_RETRY_MS * 2 ** (count - 1), PREFETCH_RETRY_MAX_MS)
}

interface Entry {
  controller: AbortController
  /** Set once the whole file is in memory. */
  objectUrl: string | null
}

export interface AudioPrefetcher {
  /**
   * Start downloading `url` in the background (no-op if already held, in flight,
   * still backing off after a failure, or given up on).
   */
  prefetch(url: string): void
  /** The in-memory object URL for `url`, or null if it isn't fully downloaded. */
  resolve(url: string): string | null
  /** Abort/revoke one URL (e.g. an in-memory copy that failed to decode). */
  discard(url: string): void
  /** Abort/revoke everything except these URLs. */
  retain(urls: readonly (string | null | undefined)[]): void
  /** Abort/revoke everything. */
  clear(): void
}

function canPrefetch(): boolean {
  return (
    typeof fetch === 'function' &&
    typeof AbortController === 'function' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  )
}

/**
 * A blob URL plays as whatever type the blob carries, and WebKit won't sniff it
 * the way it sniffs a network response — a CDN answering `application/octet-
 * stream` (or nothing) would make every in-memory copy fail on iOS. Every
 * recitation file is MP3, so every copy is typed `audio/mpeg`, the registered
 * MP3 type, including the github.io host's non-standard `audio/mp3`, which the
 * blob path can't be trusted to accept the way it accepts a network response.
 */
function asAudio(blob: Blob): Blob {
  return blob.type === 'audio/mpeg' ? blob : new Blob([blob], { type: 'audio/mpeg' })
}

export function createAudioPrefetcher(): AudioPrefetcher {
  const entries = new Map<string, Entry>()
  /** Each URL's failed downloads, for the retry backoff. */
  const failures = new Map<string, Failure>()

  function drop(url: string): void {
    const entry = entries.get(url)
    if (!entry) return
    entries.delete(url)
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl)
    else entry.controller.abort()
  }

  return {
    prefetch(url) {
      if (!url || entries.has(url) || !canPrefetch()) return
      const failed = failures.get(url)
      if (failed) {
        if (!failed.retryable || failed.count >= PREFETCH_MAX_ATTEMPTS) return
        if (Date.now() - failed.at < retryDelay(failed.count)) return
      }
      const entry: Entry = { controller: new AbortController(), objectUrl: null }
      entries.set(url, entry)
      fetch(url, { signal: entry.controller.signal })
        .then((res) => {
          if (!res.ok) throw new HttpStatusError(res.status)
          return res.blob()
        })
        .then((blob) => {
          // Dropped (retained away / cleared) while downloading — don't leak a URL.
          if (entries.get(url) !== entry) return
          if (!blob.size) throw new Error('empty body')
          entry.objectUrl = URL.createObjectURL(asAudio(blob))
          failures.delete(url)
        })
        .catch((error: unknown) => {
          // Forget it so a later call can retry once the backoff passes; the
          // engine streams from the network URL if the boundary comes first.
          // An abort (retained away / cleared) has already removed the entry and
          // isn't a failure.
          if (entries.get(url) !== entry) return
          entries.delete(url)
          const count = (failures.get(url)?.count ?? 0) + 1
          failures.set(url, { at: Date.now(), count, retryable: isRetryable(error) })
        })
    },
    resolve(url) {
      return entries.get(url)?.objectUrl ?? null
    },
    discard: drop,
    retain(urls) {
      const keep = new Set(urls.filter((u): u is string => !!u))
      for (const url of [...entries.keys()]) if (!keep.has(url)) drop(url)
      for (const url of [...failures.keys()]) if (!keep.has(url)) failures.delete(url)
    },
    clear() {
      for (const url of [...entries.keys()]) drop(url)
      failures.clear()
    },
  }
}
