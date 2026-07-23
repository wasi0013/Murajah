/**
 * Pure route-match predicates for `service-worker.ts`, split out so they're
 * unit-testable without pulling in Workbox's side-effecting top-level
 * registration calls (`clientsClaim()`, `precacheAndRoute`, ...).
 *
 * Both checks require same-origin: Workbox route-match callbacks see every
 * request the SW intercepts, cross-origin included — without the origin
 * check, a third-party URL whose path happens to start with `/data/` (e.g.
 * reciters.ts's `https://everyayah.com/data/...` verse-audio URLs) would get
 * swept into the app's own StaleWhileRevalidate cache buckets with no
 * expiration policy, growing unbounded.
 */
export function isAppDataRequest(url: URL): boolean {
  return url.origin === self.location.origin && url.pathname.startsWith('/data/')
}

export function isAppFontsRequest(url: URL): boolean {
  return url.origin === self.location.origin && url.pathname.startsWith('/fonts/')
}
