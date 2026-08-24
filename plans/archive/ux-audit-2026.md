# Murajah — UI/UX Audit & Improvement Plan (2026-07-22)

**Parent:** [redesign-2026.md](./redesign-2026.md) (supporting doc, alongside [audit-assets-data.md](./audit-assets-data.md)). **Status:** DRAFT, ready to sequence into build tasks. **Scope:** the *already-shipped* Phase 0–9.5 app (`app/`) as it runs today — not a new redesign, a polish pass on top of the existing design system ("Mihrab", [design-direction.md](./design-direction.md)).

## Method

Reviewed the live app, not mockups: ran `npm run dev`, drove it headless with Playwright (the project's own E2E tool) at **390×844** (mobile — the product's primary target) and **1440×900** (desktop — explicitly a supported reading context per §4.1's 2-up mushaf spread), across all three themes, then cross-checked every finding against the actual source (`router/index.ts`, `App.vue`, `BottomTabBar.vue`, `tokens.css`) so nothing below is a guess from a screenshot. One finding from the first pass (`text-muted` contrast) turned out to already be fixed in code (`tokens.css:93` — shipped values are AA-compliant, 5.1–5.7:1; the design-direction.md draft values were stale) and is dropped rather than reported as a bug.

## What's already strong (baseline — not touching this)

- **Reading surfaces.** QPC tajweed coloring, Indopak, and the mushaf 2-up desktop spread / single-page mobile all render exactly per spec — this is the hardest part of the app and it's in good shape.
- **Theming.** Light/dark/sepia are three genuinely distinct, considered identities (not an inverted-afterthought dark mode), consistent across every surface tested.
- **i18n/RTL and a11y groundwork.** en/ar/bn with correct `dir`, `@axe-core/playwright` wired into e2e, tokenized contrast already verified in code. This is a rare foundation to have this early — later phases should keep leaning on it rather than re-deriving it.
- **Empty/first-run states.** Today's "Set up your practice" screen, Quiz's "you don't have a plan yet" hint — these are handled, not blank.

The findings below are about the layer above that foundation: information architecture and layout, not the reading engine or the token system.

---

## P1 — Navigation architecture (highest impact, contained blast radius)

### Finding 1.1: every screen except the Reader is a dead end
`grep -rl BottomTabBar src/` returns exactly two files: `ReaderView.vue` and `GalleryView.vue` (a dev-only tool). Today, Progress, Quiz, Mushaf, Contents, Settings, Listen, and Live — eight of nine product surfaces — render with **no persistent navigation**. Each one's only way out is a single top-left back arrow, which returns to the Reader; reaching a *different* tab from there requires landing back on the Reader first. Confirmed live: from `/today`, there's no path to `/quiz` without an extra hop through `/`.

This is sharper than it sounds because of one more thing found in the router itself: `router/index.ts:36` comments that Today is *"the surface most sessions start from"* — yet `/` (the actual default route, `router/index.ts:10-12`) opens the Reader, and Today is the one screen furthest from the rest of the app once you're on it.

### Finding 1.2: Progress (memorization analytics) has no discoverable entry point at all
Grepped every route/view for a link to `/progress` — the only one that exists is a single icon-only button in the Reader's top bar (`ReaderView.vue:246-247`, a brain glyph, `aria-label="reader.progress"`). Today never links to it, despite being the screen that would motivationally benefit most from "see your progress" after finishing daily tasks (`TodayView.vue` has zero `router.push` calls targeting `progress`). A new user has to know to tap an unlabeled icon inside the reading screen to find the Juz grid, page heatmap, and completion estimate that Phase 9.2 built.

### Recommendation
One shell-level fix addresses both: lift `BottomTabBar` (already a clean, presentational, accessible component — `defineModel` + `tabs` prop, nothing Reader-specific about it) out of `ReaderView.vue` into `App.vue`, driven by the current route name instead of local `activeTab` state. Concretely:
- [ ] **1.1** Move tab-bar rendering to `App.vue`, wrapping `<RouterView>`. Keep it on every route except ones that intentionally want full-bleed/focus chrome (e.g. an in-progress quiz question, if that's judged distraction — decide per-route, default to *showing* it).
- [ ] **1.2** Add **Progress** as a real tab (it currently has no tab slot at all — six items fit `Home · Mushaf · Surahs · Today · Quiz · More`; either swap one into "More" or go to seven items / keep it in More but *also* surface it from Today, see 1.3).
- [ ] **1.3** Today gets a visible "View progress" affordance (a card or a link near the streak/summary), not just the reader's icon-only button.
- *Verify:* e2e — from `/today`, reach `/quiz` and `/progress` in one tap each; the tab bar's active state matches the current route on every listed screen; axe scan stays clean on the shell nav in all three themes/both RTL directions (mirrors the existing rtl.spec pattern).

---

## P2 — Desktop layout for non-reading screens

### Finding
At 1440×900, `/today`, `/quiz`, `/contents`, `/settings`, `/listen`, `/live` all render as a narrow mobile-width column of content pinned to the top-left, with the remaining ~65% of the viewport as flat, empty background — confirmed on all six via screenshot. This is distinct from the Reader/Mushaf, where a centered column *is* the correct reading-width choice (already narrow by design, and correctly so — don't touch that). The utility screens aren't reading surfaces; they're app chrome, and right now they read as "a phone screenshot stretched onto a monitor" rather than a desktop-considered layout. It's also the same root cause as P1: because none of these screens has shell-level nav, there's nothing to occupy the rest of the frame either.

### Recommendation
- [ ] **2.1** As part of the P1 shell work, make the shell nav responsive: bottom tab bar under a width breakpoint (current mobile/webview behavior, unchanged), a **left nav rail** above it on desktop — same tab list, vertical, persistent. This alone fills a meaningful chunk of the dead space and gives desktop a real navigation model instead of relying on back-arrow-only chrome.
- [ ] **2.2** For content that's still short next to a rail (e.g. Live's two masjid cards, Settings), don't force full-height centering artificially — but do cap it at a sane content width and let secondary information (e.g. Live: prayer-time context; Listen: recently-played) fill the rest rather than leaving void. See P3 for what goes there.
- *Verify:* visual check at 1024/1440/1920 — no screen is >50% empty background; rail + content coexist without overlap; rail collapses back to the bottom bar below the mobile breakpoint with no layout jump.

---

## P3 — Content & interaction polish (lower effort, do alongside P1/P2)

- [ ] **3.1** **Listen / Live empty states are thinner than they need to be.** Both currently just list picker cards with a one-line hint and nothing else (`listen-mobile.png`, `live-mobile.png`). Listen could surface "continue where you left off" once a scope has been played; Live could show each masjid's iqamah/stream-active status if available, or at least static prayer-time context — right now they're functionally single-purpose pickers with no memory.
- [ ] **3.2** **Progress → "Mark pages" range control is two bare number inputs joined by a dash** (`ProgressView` bulk-mark row). Works, but on mobile the two ~70px inputs plus a `Memorized`/`Clear` button pair are tight targets stacked with no visual grouping cue beyond proximity. Consider a single bounded range affordance (e.g. a compact from–to stepper or a page-range picker sheet consistent with how ranges are picked elsewhere, like PlanSetup) rather than raw `<input type=number>` pairs.
- [ ] **3.3** **Gallery's color-role grid overflows its container at 390px** (right column clipped against the viewport edge in `gallery-mobile.png`). Low priority since Gallery is a dev-only tool already slated for removal (per phase-9-routing-progress-polish.md §9.5.3), but if it stays alive past that removal date, worth a one-line `grid-cols-2` fix.

---

## Suggested sequencing

1. **P1** first — it's one architectural change (lift the tab bar to the shell) that fixes the worst navigational friction on both mobile and desktop, and every other screen benefits immediately without individual rework.
2. **P2** rides the same shell change — do 1.1/2.1 together as one PR (responsive shell), then 1.2/1.3/2.2 as fast follow-ups.
3. **P3** items are independent and can land whenever; none blocks the others.

None of this touches the reading engine, data pipeline, or design tokens — it's routing/shell/layout work, so it carries none of the §3 performance-budget risk that reader-adjacent changes would.
