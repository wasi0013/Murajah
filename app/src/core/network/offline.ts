/**
 * Best-effort offline/network-failure detector, shared by every place that
 * needs to tell "you're offline" apart from "something else broke" —
 * currently `composables/audioPlaybackError.ts` (a player failed to fetch
 * its data) and `composables/lazyComponent.ts` (an in-page async component's
 * chunk failed to load).
 *
 * `navigator.onLine` is the reliable-when-true signal (a device that knows
 * it has no radio/link at all); browsers disagree on the exact wording of a
 * failed `fetch()`/dynamic `import()` (Chrome "Failed to fetch", Firefox
 * "NetworkError when attempting to fetch resource.", Safari "Load failed"),
 * so the regex is a fallback for "online per the browser, but the request
 * still couldn't reach anything" (a flaky connection, captive portal, etc.)
 * — mirrors `router/index.ts`'s `CHUNK_LOAD_ERROR` pattern-match for the
 * same reason.
 */
export function isLikelyOffline(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const message = error instanceof Error ? error.message : String(error)
  return /Failed to fetch|NetworkError|Load failed|network error|internet/i.test(message)
}
