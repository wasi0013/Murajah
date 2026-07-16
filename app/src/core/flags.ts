/**
 * Client feature flags (local-first — no backend). The reader flag gates the new
 * reading experience so it can be rolled out to a subset of webview users. It
 * defaults **on** via a build-time env var (`VITE_READER_ENABLED`, set to
 * `"false"` in a build to ship it off), and can be flipped per-device via
 * `localStorage['murajah:reader'] = 'on' | 'off'` (QA / staged rollout).
 */
const READER_KEY = 'murajah:reader'

export function readerEnabled(): boolean {
  try {
    const override = localStorage.getItem(READER_KEY)
    if (override === 'on') return true
    if (override === 'off') return false
  } catch {
    /* storage unavailable — fall through to the build default */
  }
  return import.meta.env.VITE_READER_ENABLED !== 'false'
}
