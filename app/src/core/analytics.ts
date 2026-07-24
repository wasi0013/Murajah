/**
 * Minimal GA4 wrapper — ported from legacy (`gtag.js`, `G-JEMZ83QK37`) for
 * rollout-signal continuity with its historical data (plan §10.7.2, open
 * question 3: "yes port existing"). This is deliberately not a general
 * event-tracking system — just enough to answer Phase 11's "what fraction of
 * traffic has handed off from legacy" question. Lazily loads the GA script so
 * it never blocks first paint, and every call is best-effort: an ad blocker,
 * offline boot, or GA outage must never be able to break the app.
 */
const GA_MEASUREMENT_ID = 'G-JEMZ83QK37'

type Gtag = (...args: unknown[]) => void
interface GaWindow {
  dataLayer?: unknown[]
  gtag?: Gtag
}

let loaded = false

function ensureLoaded(): Gtag | undefined {
  const w = window as typeof window & GaWindow
  if (!loaded) {
    loaded = true
    w.dataLayer = w.dataLayer ?? []
    const gtag: Gtag = (...args) => w.dataLayer!.push(args)
    w.gtag = gtag
    gtag('js', new Date())
    gtag('config', GA_MEASUREMENT_ID)
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
    document.head.appendChild(script)
  }
  return w.gtag
}

export function trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
  try {
    ensureLoaded()?.('event', name, params)
  } catch {
    // best-effort — analytics must never break the app
  }
}
