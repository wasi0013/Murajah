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
 */

interface Entry {
  controller: AbortController
  /** Set once the whole file is in memory. */
  objectUrl: string | null
}

export interface AudioPrefetcher {
  /** Start downloading `url` in the background (no-op if already held or in flight). */
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
 * recitation file is MP3, so anything not already typed as audio becomes one.
 */
function asAudio(blob: Blob): Blob {
  return blob.type.startsWith('audio/') ? blob : new Blob([blob], { type: 'audio/mpeg' })
}

export function createAudioPrefetcher(): AudioPrefetcher {
  const entries = new Map<string, Entry>()

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
      const entry: Entry = { controller: new AbortController(), objectUrl: null }
      entries.set(url, entry)
      fetch(url, { signal: entry.controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.blob()
        })
        .then((blob) => {
          // Dropped (retained away / cleared) while downloading — don't leak a URL.
          if (entries.get(url) !== entry) return
          if (!blob.size) throw new Error('empty body')
          entry.objectUrl = URL.createObjectURL(asAudio(blob))
        })
        .catch(() => {
          // Best-effort: forget it so a later call can retry; the engine streams
          // from the network URL in the meantime.
          if (entries.get(url) === entry) entries.delete(url)
        })
    },
    resolve(url) {
      return entries.get(url)?.objectUrl ?? null
    },
    discard: drop,
    retain(urls) {
      const keep = new Set(urls.filter((u): u is string => !!u))
      for (const url of [...entries.keys()]) if (!keep.has(url)) drop(url)
    },
    clear() {
      for (const url of [...entries.keys()]) drop(url)
    },
  }
}
