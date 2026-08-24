# Phase 2 — Design System (granular tasks)

**Parent:** [redesign-2026.md](./redesign-2026.md) · **Prereq:** Phase 1 complete. **Goal:** a real 2026 design language, componentized and accessible, that Phase 3 (the reader) and every later screen build on. This phase produces **tokens + primitives + a reading-surface visual spec + a gallery** — not feature screens.

**Definition of done:** tokens drive everything (no hardcoded colors/spacing in components); every primitive is theme-aware (light/dark/sepia), RTL-correct, keyboard-accessible, and unit-tested; a `/gallery` route renders all of it in every theme + RTL; contrast meets WCAG AA; bundle budgets (§3) still hold.

> Local-first constraint: **no external CDNs** (fonts/CSS/JS all self-hosted or system) — matches the offline PWA + current Cloudflare-only hosting. Reuse the existing `src/design/tokens.css` skeleton and Tailwind v4 (`@theme inline`).

---

## 2.1 — Visual direction (decisions first)
> The aesthetic is **the user's call** — this task surfaces options, it doesn't assume them.
- [ ] **2.1.1** Produce 2–3 concrete direction options (accent + neutral palette, corner-radius language, elevation style, density, motion character) as small mockups of the same reader screen. Get the user's pick.
  - *Verify:* user signs off on one direction (or a blend); recorded in a short `plans/design-direction.md`.
- [ ] **2.1.2** Choose the UI type pairing: a **self-hosted** Latin/Bengali UI font (or system stack) that pairs with the Arabic mushaf fonts. No Google Fonts CDN.
  - *Verify:* font renders offline; Latin + Bengali + Arabic shown together, LTR and RTL.

## 2.2 — Design tokens (finalize)
- [ ] **2.2.1** Expand `design/tokens.css`: full neutral ramp (50–900), semantic roles (`bg`, `surface`, `elevated`, `text`, `text-muted`, `border`, `accent`, `success`, `warn`, `danger` + their contrast pairs), complete for **light / dark / sepia**.
  - *Verify:* every role resolves in all 3 themes; sepia tuned for reading comfort.
- [ ] **2.2.2** Scales: spacing, radius, type (size + line-height + tracking), elevation (shadows), motion (durations + easings), z-index layers. Bridge all into Tailwind via `@theme inline`.
  - *Verify:* utilities like `bg-surface`, `rounded-lg`, `shadow-md`, `text-lg` all map to tokens and switch with theme.
- [ ] **2.2.3** RTL foundation: use CSS logical properties (`inline-start/end`), set `dir` handling, verify Tailwind logical utilities.
  - *Verify:* a flipped-layout demo mirrors correctly under `dir="rtl"`.

## 2.3 — Typography system
- [ ] **2.3.1** Arabic reading type scale: size steps (small/medium/large + finer), line-height and letter-spacing per surface (QPC vs Indopak have different `lineHeight`/`letterSpacing` — see legacy `LAYOUT_CONFIGS`).
  - *Verify:* a type specimen shows each step for QPC + Indopak; matches legacy legibility.
- [ ] **2.3.2** UI type scale + text components/utilities (headings, body, caption, mono for numbers/stats).
  - *Verify:* specimen in gallery; Bengali + Latin render at every step.

## 2.4 — Icon system
- [ ] **2.4.1** `Icon` wrapper over `lucide-vue-next`: size via tokens, `color: currentColor`, accessible name (`aria-label` / `aria-hidden`), consistent stroke.
  - *Verify:* renders with token color + a11y name; bundle stays tree-shaken (one icon ≈ 1KB, not the whole set).
- [ ] **2.4.2** Icon usage conventions doc (which icons for nav/actions) so screens stay consistent.
  - *Verify:* conventions listed; gallery shows the core set.

## 2.5 — Core primitives (component library)
Each primitive: token-driven, theme-aware, RTL-correct, keyboard + screen-reader accessible, `prefers-reduced-motion` respected, unit-tested, and shown in the gallery.
- [ ] **2.5.1** `Button` — variants (primary/secondary/ghost/danger), sizes, loading + disabled, optional icon; focus-visible ring.
- [ ] **2.5.2** `SegmentedControl` + `Toggle`/`Switch` — for layout switch (QPC/Indopak), tajweed on/off, WBW on/off.
- [ ] **2.5.3** `Slider` — text-size control (keyboard + touch).
- [ ] **2.5.4** `BottomSheet` + `Modal`/`Dialog` — focus trap, escape/scrim close, scroll lock, mobile-first sheet.
- [ ] **2.5.5** `Tabs`, `Toast`, `Skeleton`, `Tooltip`/`Popover` (popover backs morphology later).
  - *Verify (each):* unit test for render + key interaction/roles; appears in gallery; keyboard-operable; contrast AA.

## 2.6 — Navigation shell primitives
- [ ] **2.6.1** `BottomTabBar` (mobile/webview-first: Read, Surahs, Goals, Quiz, More) — structure + a11y, not yet wired to real routes.
  - *Verify:* renders responsively; active state; keyboard/focus order correct; safe-area insets handled (webview).
- [ ] **2.6.2** Desktop header + `CommandPalette` / quick-jump (surah:ayah, page, juz) — parsing + keyboard nav skeleton (data wiring in Phase 3).
  - *Verify:* palette opens via shortcut, filters, keyboard-navigable; input parsing unit-tested.

## 2.7 — Reading-surface visual spec
- [ ] **2.7.1** Style a **static sample page** (real page-1 data from Phase 1, not the virtualized reader): ayah/line spacing, page frame, centered surah/basmallah lines, sepia comfort.
  - *Verify:* sample renders in all 3 themes + RTL using the real QPC font.
- [ ] **2.7.2** Word states: default, mistake-marked, morphology-active, selected — as token-driven styles.
  - *Verify:* each state shown on the sample page; distinguishable in all themes + AA contrast.
- [ ] **2.7.3** Tajweed color legend: map the tajweed color-font's colors to named rules; a legend component.
  - *Verify:* legend colors match the rendered tajweed page on 3 sampled pages.

## 2.8 — Gallery route + accessibility baseline
- [ ] **2.8.1** `/gallery` route (dev-only, code-split — must **not** enter the reader bundle) rendering tokens + all primitives + nav shell + reading-surface spec, with a theme switcher and an RTL toggle.
  - *Verify:* gallery shows everything in light/dark/sepia × LTR/RTL; absent from the initial reader bundle (size gate).
- [ ] **2.8.2** Accessibility baseline: WCAG **AA contrast** across all themes, `:focus-visible` everywhere, `prefers-reduced-motion` honored, reduced-transparency sanity.
  - *Verify:* automated contrast check over token pairs passes; an axe/Playwright a11y smoke on `/gallery` is clean.

---

### Exit checklist (all true to start Phase 3)
- [ ] Direction signed off; `design-direction.md` recorded.
- [ ] Tokens complete for light/dark/sepia + RTL; **no hardcoded colors** in components.
- [ ] All primitives: theme-aware, RTL, keyboard-accessible, unit-tested, in the gallery.
- [ ] Reading-surface visual spec approved (word states + tajweed legend).
- [ ] `/gallery` renders everything in 3 themes × LTR/RTL; a11y + contrast checks pass.
- [ ] Bundle budgets (§3) still green; gallery code-split out of the reader.

### What Phase 3 consumes from here
Tokens (2.2), Arabic type scale (2.3.1), `Button`/`SegmentedControl`/`Toggle`/`Slider`/`BottomSheet`/`Popover` (2.5), `BottomTabBar` + `CommandPalette` (2.6), and the **reading-surface spec + word states + tajweed legend** (2.7) — the reader is largely assembling these against the Phase 1 data/font layer.
