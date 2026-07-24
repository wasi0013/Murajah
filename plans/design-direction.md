# Murajah 2026 — Design Direction (Phase 2.1 sign-off)

**Parent:** [phase-2-design-system.md](./phase-2-design-system.md) · task 2.1.
Chosen from the [direction mockups](https://claude.ai/code/artifact/ee1c716c-e1fb-4655-bd55-4e22809f7378).

## The decision — a synthesis, not one of three

The three mockups aren't competing looks; they map to real product states:

- **Base chrome = "Mihrab"** (calm, architectural). Limestone neutrals, deep pine accent, matte surfaces, hairline borders, generous line-height. This is the app's resting visual language.
- **"Tajwīd" = a feature layer, not a separate skin.** Tajweed **off** → clean, uncolored reading (Mihrab). Tajweed **on** → the color-coded rules render **on the mushaf text only**; the chrome stays calm. Toggling never restyles the whole UI — it just reveals/hides the color coding. (This is also how the real per-page tajweed color font works — Phase 1.4.)
- **Dark theme = "Night Study."** Deep ink ground + warm lamp-amber accent, tuned for Fajr and late-night revision. Dark is a first-class identity here, not an inverted afterthought.

So: **one design system, three themes (light / dark / sepia), with tajweed as a toggle-driven color layer that works in all three.**

## Themes & tokens (starting values — finalized in 2.2)

| Role | Light (Mihrab) | Dark (Night Study) | Sepia (warm reading) |
|---|---|---|---|
| `bg` | `#e9ebe5` limestone | `#0e1524` deep ink | `#f2e9d6` |
| `surface` | `#f6f7f3` | `#141d31` | `#f8f1e2` |
| `elevated` | `#eef0ea` | `#1a2439` | `#eee3cc` |
| `text` | `#161d1a` | `#f0ebde` warm | `#3a3020` |
| `text-muted` | `#69726b` | `#8b95a9` | `#7a6b50` |
| `border` | `#d5dbcf` | `#26324c` | `#ddceb0` |
| `accent` | `#0f5f57` pine | `#e2a44b` lamp amber | `#0f5f57` pine |
| `accent-contrast` | `#ffffff` | `#0e1524` | `#ffffff` |

**Accent shifts by theme on purpose:** pine by day (light/sepia), warm amber at night — the nocturnal warmth is exactly what read well in the mockup. Revisit if a single constant accent is preferred.

### Tajweed color set (functional layer — consistent across all themes)
Applied to Arabic glyphs when tajweed is on; these come from the per-page color font (Phase 1.4). Named rule → colour is finalized against the real font in **2.7.3** (tajweed legend). Placeholder family: ghunnah/idghām green `#2e9e5b`, qalqalah/madd red `#d0453f`, ikhfā blue `#3b74d6`, plus amber for a fourth rule. These are **semantic**, separate from the brand accent.

## Shape, density, motion
- **Radius:** soft, architectural — 13px cards / 10px controls (not pill-round everywhere).
- **Elevation:** matte; hairline borders do most of the separation in light/sepia; a faint warm glow over shadow at night.
- **Density:** reading-first and airy in the mushaf; slightly tighter, tool-like density in chrome/lists (the useful part of "B") so daily tracking stays efficient.
- **Motion:** quiet and purposeful — page turns, sheet slides, tap feedback; always `prefers-reduced-motion`-aware. No ambient/decorative animation.

## Type intent (finalized in 2.1.2 / 2.3)
- **UI:** a humanist sans, self-hosted (no CDN), good Latin + Bengali coverage.
- **Arabic mushaf:** the real QPC uthmani / color-tajweed / Indopak fonts (Phase 1) — unchanged.
- Numerals: tabular in stats/goals.

## Backlog idea — tajweed colours on Indopak (new feature)

Today tajweed colour exists **only for QPC** (baked into per-page colour fonts); Indopak has no colour variant, and we hold **no tajweed rule data** (confirmed — only the UI label matches "tajweed"). Indopak is real Unicode Arabic with harakat, so tajweed colouring is feasible via **data-driven segment colouring**: source per-letter tajweed rule tags (QUL / quran.com / Tarteel) keyed by `s:a:w`, render coloured spans over the Indopak text. Font-independent, so it lights up tajweed for the large subcontinent/Bengali base — something legacy never offered.

**Scope (not Phase 2):** a research + data spike (source + validate tajweed annotation data against an authoritative mushaf), a `data-pipeline` dataset (per-word tajweed segments), and a reader rendering layer. Land in **Phase 3** (reader) as an enhancement; keep QPC's colour font for its proven fidelity. Semantic tajweed token colours (below) are shared by both paths.

## Confirmed decisions (2.1.2)
- **Accent shifts by theme:** pine (light/sepia) ↔ amber (dark). Confirmed.
- **UI font:** native **system stack** now (fast, zero-download, OS-native Bengali/Arabic fallback — right for the mobile/webview + subcontinent base). A bespoke self-hosted face stays a one-line token swap for later.
- Lock tajweed rule→colour names against the font in 2.7.3.
