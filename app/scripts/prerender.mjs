#!/usr/bin/env node
/**
 * Post-build prerender step (see `postbuild` in package.json).
 *
 * Murajah is a pure client-rendered SPA — `dist/index.html` ships nothing but
 * a "Loading Murajah…" boot placeholder, and every route gets the same
 * generic `<title>`/`<meta description>`. A crawler that doesn't execute JS
 * (most AI-answer bots, and link-unfurlers like Slack/Twitter/Discord) never
 * sees anything else. This script renders a small, deliberately narrow set of
 * externally-linked, static marketing/informational routes in a real headless
 * Chromium, waits for the boot placeholder to actually be gone and the
 * route's own content to be on screen, then writes the result as a real
 * static file at BOTH `dist/<route>.html` and `dist/<route>/index.html` —
 * Cloudflare Pages resolves a request in that same order (exact match →
 * `<path>.html` → `<path>/index.html`), so both `/download` and `/download/`
 * get a direct 200 with the real content, no redirect either way (confirmed
 * with `wrangler pages dev`, which reproduces Pages' real asset resolution).
 * That matters more than it sounds: this was originally *only* the directory
 * form, which made the bare path 308 to the trailing-slash one — technically
 * fine (curl -L follows it and lands on the right content), but 308 is a
 * newer status code (2014) that some link-unfurl crawlers' HTTP clients
 * don't reliably follow the way they follow 301/302. Rather than gamble on
 * that, every route this script covers now serves its real content directly,
 * with zero redirect hops, however it's requested. This is all served by
 * Cloudflare Pages' normal static-asset resolution *before* it ever consults
 * `_redirects`' SPA catch-all, so it reaches every visitor (human or bot)
 * identically. No user-agent sniffing, no divergent content, no separate
 * "bot view".
 *
 * Deliberately NOT included in this pass: `/`, `/contents`, `/live`,
 * `/listen` (all fetch through the IndexedDB/Web-Worker data client, which is
 * more moving parts to make deterministic here) and every Quran-content route
 * (`/:surah`, `/page/:page`, `/preview/:surah/:ayah`, …) — hundreds of pages
 * across layouts, a separate follow-up. `?lang=` variants (see
 * router/index.ts's LANG_OVERRIDE_ROUTES) aren't prerendered either: a query
 * string isn't a distinct static file on Pages, so a crawlable Bengali/Arabic
 * `/download` needs its own path (e.g. `/bn/download`) — a URL-shape decision
 * left for later, not decided silently here.
 *
 * This step runs inside Cloudflare Pages' own build container (the build
 * command is just `npm run build`, per app/README.md's Deploy section — there
 * is no separate CI/deploy workflow to hook into), where headless Chromium
 * has NOT been verified to run. Every failure mode below is caught and only
 * ever logged — this script must NEVER fail the build. Worst case on a
 * failure: no prerendered files get written, and the site deploys exactly as
 * it did before this script existed.
 *
 * If Chromium isn't already cached in the build container, the install-and-
 * retry path below downloads it (~150MB) on every build with no cache across
 * builds — accepted for now given the container is unverified; revisit if it
 * measurably slows deploys once this has run in production a few times.
 */
import { preview } from 'vite'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const SITE_ORIGIN = 'https://murajah.pages.dev'
// The same wide banner GitHub's own repo social-preview card shows (sourced
// from screenshots/title.png, resized/re-encoded to a link-unfurler-friendly
// ~90KB JPEG at scripts/../../../screenshots' own 2048x1000 crop down to
// 1200x586 — see app/public/img/social/og-banner.jpg) rather than the square
// PWA icon: a wide image is what Facebook/Twitter/Discord/Slack render as a
// large banner card, and Telegram/WhatsApp still render it fine as a
// side-thumbnail when a client chooses the compact layout instead.
// Width/height/type are given explicitly so a crawler that needs them upfront
// (Facebook's in particular) doesn't have to fetch the image first just to
// learn its dimensions.
const OG_IMAGE = `${SITE_ORIGIN}/img/social/og-banner.jpg`
const OG_IMAGE_WIDTH = 1200
const OG_IMAGE_HEIGHT = 586
const OG_IMAGE_ALT = 'The Murajah logo — a gold calligraphic "M" open-book mark — beside the wordmark on a dark navy background.'

// Each `readySelector` is a selector already present in that view's template
// root (see the view's own <template>) with no async data gate on it — i.e.
// it's on screen as soon as Vue mounts the route, not after a network/IDB
// round trip. That keeps the readiness check meaningful: if it never
// appears, something is actually wrong, not just "still loading".
const ROUTES = [
  {
    path: '/download',
    readySelector: 'main.download',
    title: 'Murajah — Quran Memorization & Revision App | Download',
    description:
      'Your daily companion for Quran memorization & revision: word-by-word translation, tajweed coloring, an adaptive daily practice queue, audio recitation, and mushaf reading. Free on Android, installable on iOS.',
  },
  {
    path: '/preview',
    readySelector: 'main.landing',
    title: 'Share Highlighted Quranic Verses — Murajah',
    description:
      'Highlight specific words in any Quranic passage and share a direct link instantly — perfect for marking recitation mistakes or emphasizing key points. No installation, account, or sign-in required to view.',
  },
]

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function injectMeta(html, route) {
  // The trailing-slash form, matching the root README's own links and this
  // script's `dist/<route>/index.html` output — but see the header comment:
  // both this and the bare-path form now serve 200 directly, so this choice
  // is just "pick one for canonical/og:url", not "avoid a redirect".
  const canonical = `${SITE_ORIGIN}${route.path}/`
  const title = escapeHtml(route.title)
  const description = escapeHtml(route.description)

  // The `prefix` attribute is the Open Graph protocol's own RDFa namespace
  // declaration (https://ogp.me/ — "Required" per spec, `<html prefix="og:
  // https://ogp.me/ns#">`). No crawler still enforces it — Facebook dropped
  // requiring it years ago — but it costs nothing and it's what "the
  // standard" actually specifies, so there's no reason not to.
  let out = html
    .replace(/<html([^>]*)>/, (_match, attrs) =>
      /\bprefix=/.test(attrs) ? `<html${attrs}>` : `<html${attrs} prefix="og: https://ogp.me/ns#">`,
    )
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${description}" />`)

  const extraTags = [
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Murajah" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:secure_url" content="${OG_IMAGE}" />`,
    `<meta property="og:image:type" content="image/jpeg" />`,
    `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(OG_IMAGE_ALT)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
    `<meta name="twitter:image:alt" content="${escapeHtml(OG_IMAGE_ALT)}" />`,
  ]
    .map((tag) => `    ${tag}`)
    .join('\n')

  return out.replace('</head>', `${extraTags}\n  </head>`)
}

async function loadChromium() {
  try {
    const { chromium } = await import('playwright')
    return chromium
  } catch (error) {
    console.warn('[prerender] "playwright" is not resolvable — skipping prerendering.', error)
    return null
  }
}

async function launchChromium(chromium) {
  try {
    return await chromium.launch({ headless: true })
  } catch {
    console.warn('[prerender] Chromium launch failed — attempting `playwright install chromium`…')
    try {
      execFileSync('npx', ['playwright', 'install', 'chromium'], { stdio: 'inherit' })
    } catch (installError) {
      console.warn(
        '[prerender] Could not install Chromium in this build environment — skipping prerendering. ' +
          'The SPA will deploy without prerendered snapshots, same as before this script existed.',
        installError,
      )
      return null
    }
    try {
      return await chromium.launch({ headless: true })
    } catch (retryError) {
      console.warn(
        '[prerender] Chromium still failed to launch after install — skipping prerendering.',
        retryError,
      )
      return null
    }
  }
}

async function main() {
  const chromium = await loadChromium()
  if (!chromium) return

  const browser = await launchChromium(chromium)
  if (!browser) return

  // Serves the just-built dist/ with the same SPA (index.html) fallback Vite
  // uses for `vite preview`/`vite dev` — the same behavior `_redirects`
  // provides in production, so each route resolves the way it would live.
  const server = await preview({ preview: { port: 0 } })
  const base = server.resolvedUrls?.local?.[0]
  if (!base) {
    console.warn('[prerender] Could not determine the preview server URL — skipping prerendering.')
    await browser.close()
    await server.close()
    return
  }

  const page = await browser.newPage()
  const previewOrigin = new URL(base).origin
  let succeeded = 0

  for (const route of ROUTES) {
    try {
      await page.goto(new URL(route.path, base).toString(), { waitUntil: 'domcontentloaded' })
      // The real failure mode this guards against: capturing the boot
      // placeholder itself and shipping it as a "fixed" static file.
      await page.waitForSelector('#murajah-boot', { state: 'detached', timeout: 15000 })
      await page.waitForSelector(route.readySelector, { state: 'visible', timeout: 15000 })

      // A route's own lazy-chunk CSS is injected at runtime as a fresh
      // `<link>` built from the page's current location — unlike the
      // eagerly-bundled stylesheet already in the template, which Vite
      // writes as a root-relative href at build time. Captured as-is, that
      // link's href is `http://localhost:<preview-port>/assets/…`, which
      // 404s for every real visitor once this file is served from the real
      // domain. Strip the ephemeral preview origin so it falls back to
      // root-relative, resolving correctly against whatever origin actually
      // serves the file (production, a Pages preview deploy, custom domain).
      const html = (await page.content()).split(previewOrigin).join('')
      if (html.includes('Loading Murajah')) {
        throw new Error('captured HTML still contains the boot placeholder text')
      }

      const rendered = injectMeta(html, route)
      const distDir = path.join(process.cwd(), 'dist')
      const routeSlug = route.path.replace(/^\//, '')

      // Both forms — see the header comment on why this isn't just belt and
      // braces: it's what makes the bare path a direct 200 instead of a 308.
      const flatFile = path.join(distDir, `${routeSlug}.html`)
      const dirFile = path.join(distDir, routeSlug, 'index.html')
      await mkdir(path.dirname(dirFile), { recursive: true })
      await Promise.all([writeFile(flatFile, rendered, 'utf8'), writeFile(dirFile, rendered, 'utf8')])
      console.log(
        `[prerender] wrote ${route.path} -> ${path.relative(process.cwd(), flatFile)}, ${path.relative(process.cwd(), dirFile)}`,
      )
      succeeded++
    } catch (error) {
      console.warn(`[prerender] skipping ${route.path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  await browser.close()
  await server.close()

  if (succeeded === 0) {
    console.warn(
      '[prerender] No routes were prerendered this build. The SPA shell is served for all routes, ' +
        'same as before this script existed.',
    )
  } else {
    console.log(`[prerender] Prerendered ${succeeded}/${ROUTES.length} route(s).`)
  }
}

main().catch((error) => {
  // Must never fail the build — an SEO nice-to-have breaking is not
  // acceptable trade for it blocking deployment of the app itself.
  console.warn('[prerender] Unexpected failure — continuing without prerendering:', error)
})
