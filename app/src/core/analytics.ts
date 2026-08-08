/**
 * Minimal GA4 wrapper — ported from legacy (`gtag.js`, `G-JEMZ83QK37`) for
 * rollout-signal continuity with its historical data (plan §10.7.2, open
 * question 3: "yes port existing"). Lazily loads the GA script so it never
 * blocks first paint, and every call is best-effort: an ad blocker, offline
 * boot, or GA outage must never be able to break the app.
 *
 * Loading is triggered by the *first* `trackEvent`/`trackPageView` call from
 * anywhere — deliberately not tied to any one feature (PWA boot, a specific
 * route, …) so a failure in that feature can never take analytics down with
 * it. The router's `afterEach` (see `router/index.ts`) is what actually fires
 * that first call in practice, on every navigation including the initial one.
 *
 * Automatic pageview-on-`config` is turned off: this is a client-routed SPA,
 * so the browser-navigation signal GA's default relies on only exists once,
 * on hard load. `trackPageView` sends an explicit `page_view` per route
 * change instead (including the first), so it's both the whole and the only
 * source of pageview counts — no double-counting the first page.
 */
const GA_MEASUREMENT_ID = 'G-JEMZ83QK37'

type Gtag = (...args: unknown[]) => void
interface GaWindow {
  dataLayer?: unknown[]
  gtag?: Gtag
}

let loaded = false

function ensureLoaded(): Gtag | undefined {
  try {
    const w = window as typeof window & GaWindow
    if (!loaded) {
      loaded = true
      w.dataLayer = w.dataLayer ?? []
      const gtag: Gtag = (...args) => w.dataLayer!.push(args)
      w.gtag = gtag
      gtag('js', new Date())
      gtag('config', GA_MEASUREMENT_ID, { send_page_view: false })
      const script = document.createElement('script')
      script.async = true
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
      document.head.appendChild(script)
    }
    return w.gtag
  } catch {
    // best-effort — a broken DOM/global (odd embed context, locked-down
    // CSP, …) must never stop the caller from proceeding.
    return undefined
  }
}

export function trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
  try {
    ensureLoaded()?.('event', name, params)
  } catch {
    // best-effort — analytics must never break the app
  }
}

/**
 * One `page_view` per route change — see the module comment for why this
 * replaces GA's automatic pageview instead of running alongside it.
 *
 * `page_location` (not `page_path`) is the parameter GA4's `page_view` event
 * actually recognizes — confirmed against
 * https://developers.google.com/analytics/devguides/collection/ga4/views,
 * which also documents this exact manual-page_view shape for SPAs.
 * `page_path` is a Universal Analytics-era name; GA4 silently ignores it,
 * which would have made every manually-tracked pageview here invisible.
 *
 * `path` is expected caller-normalized (no query) — see router/index.ts's
 * dedupe, which is what keeps every `/preview/2/12-45?red=…` highlight edit
 * from fragmenting into its own report row. The *current* query string is
 * still appended below (not folded into `path`'s identity): GA4 reads
 * `utm_source`/`utm_campaign`/`gclid` off `page_location`, and `/download` —
 * one of the two pages this exists to measure — is exactly the kind of page
 * that gets linked from a campaign. Dropping the query would silently break
 * attribution for it.
 */
export function trackPageView(path: string): void {
  trackEvent('page_view', {
    page_location: `${window.location.origin}${path}${window.location.search}`,
  })
}
