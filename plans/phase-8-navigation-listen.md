# Phase 8 — Navigation & Listen (browse + audio-only playback) · DRAFT

**Parent:** [redesign-2026.md](./redesign-2026.md) §5 (Phase 8, redefined — see note below) · **Prereqs:** Phase 3 (reader route, `reader` store, `core/navigation/*`, `CommandPalette`), Phase 7 (audio engine `useAudioEngine`, `core/audio/*` playlist + reciters, `AudioMiniPlayer`, `useAudioPersistence`) complete. **Goal:** two beginner-friendly surfaces built on what already exists — (1) a **Contents browser** that turns the stubbed "Surahs" tab into a real, tap-to-navigate index of surahs / juz / pages, so a newcomer never has to know quick-jump syntax; and (2) **Listen**, a new "More" entry that plays a whole **surah / juz / entire Quran** through the existing audio engine, honouring the user's reciter, grain, and speed.

> Status: **DRAFT for review.** No code written yet. Tasks unchecked; "Done:" notes filled as each lands. Roadmap renumbering and a few design calls flagged `⚠ CONFIRM` below.

## Roadmap change this phase encodes

The master plan's original Phase 8 was "Notes, settings, i18n & PWA polish." Per the product-owner directive (2026-07-18):

- **Notes / journal is dropped entirely** — no longer a product requirement.
- **Phase 8 is redefined** to the two features in this doc (Contents browser + Listen).
- **Service worker, offline mode, and caching move to Phase 9**, together with the surviving remainder of the old Phase 8 (settings polish, i18n/RTL, export/import round-trip). Cutover & launch becomes **Phase 10**.

`redesign-2026.md` §5 is updated to match. This is the one structural decision in the phase; everything else is additive and reversible.

## Why this is small — and mostly reuse

Neither feature needs new playback machinery or new data. The heavy lifting already shipped:

- **Playback** is a module-singleton engine (`useAudioEngine`) that walks a flat `PlaylistItem[]`; `useQariPlayer` builds that list from *"the pages currently in view."* Listen is the same engine fed a playlist built from *"a whole scope"* instead — a sibling builder, not a new engine. The mini-player, reciter picker, grain/speed prefs, and fallback-URL handling are all reused verbatim.
- **Navigation targets** already resolve: `NavIndex` (`ayahToPage` / `surahToPage` / `juzToPage`) maps any surah / juz / ayah to a page per layout, and `SURAH_NAMES` (transliteration) + the Arabic `surah-names.json` are loaded. The Contents browser is a *presentation* of data the quick-jump palette already consumes — it just makes it tappable and scannable instead of typed.

The only genuinely new **data** is small, static, immutable reference tables (per-surah ayah counts; juz→start-ayah boundaries) needed to enumerate a scope's verses without loading page chunks. These are reference constants on the order of `SURAH_NAMES`, not pipeline output.

**What this phase must not regress:** the reader/mushaf audio path (Phase 7), the quick-jump palette (it stays — power users keep it), and the existing bundle budgets. Listen is code-split; the Contents browser is its own route.

---

## Decisions (all confirmed 2026-07-18)

1. **Two surfaces, independently shippable.** (a) Contents browser lands first (pure navigation, no audio dependency); (b) Listen builds on it (reuses the scope-picker UI). Neither blocks the other's tests.
2. **"Accessibility" here = beginner-friendly discoverability, not a WCAG workstream.** The aim is that a newcomer can *find* Surah Al-Furqan or Juz 5 by tapping a readable list, without knowing `2:255` / `juz 5` syntax. (Baseline a11y — labels, focus, contrast, RTL — is the standing cross-cutting requirement from §6 and applies here as everywhere, but it is not the feature.)
3. **The Contents browser is the "Surahs" tab, expanded to three lenses.** One route, segmented **Surah | Juz | Page**. Tapping a row navigates the reader to that location. The command palette stays as the fast path; the browser is the discoverable path. They share `NavIndex` + `parseJump`/`resolveJump`, no logic fork.
4. **Listen is a standalone full view reached from "More"**, modelled on `/live` and the mushaf route (a real code-split route, not a drawer). It contains a beginner-friendly **scope picker** (Surah / Juz / Whole Quran) and, once playing, docks the **existing mini-player**. Playback is standalone — **not** tied to any visible reader page, so it does not drive the reader highlight/auto-scroll (that stays reader-only).
5. **Listen plays from PAGE audio, honouring the user's page-reciter preference — it has no verse/page grain toggle** (that toggle is a reader concept; Listen doesn't reuse it). A scope is reconstructed page-first:
   - **Juz and Whole-Quran are page-aligned.** In the standard 604-page mushaf every juz begins at the *top* of a page (juz 1 = pages 1–21, juz 2 = 22–41, … juz 30 = 582–604). So both are a straight page sequence — a juz is its page range, the whole Quran is pages 1–604 — played page-by-page, **no boundary handling**.
   - **Surahs start/end mid-page**, so surah scope is the *only* hybrid case:
     - **Alafasy** (the default) is multi-part and **surah-segmented** — its page files split at surah boundaries (`page{P}-{surah}{offset}`), so a surah is exactly its own parts, one per page, seamlessly. No verse audio needed.
     - **Other reciters** (one file per page): a page **wholly inside** the surah plays as that page file; a **partial boundary page** (the surah starts or ends on it) plays that surah's verses on that page from the **same qari's per-ayah recording**.
6. **Curated single-voice reciter list for Listen.** Listen offers only reciters that have **both** page and per-ayah recordings (Alafasy + 8 others), so every scope plays in one voice, boundaries included. **Husary and Juhaynee** (page-only in our tables) are **excluded from Listen** — they stay available in the reader. If the user's stored page reciter isn't in Listen's curated set, Listen plays with **Alafasy** without overwriting the stored preference.
7. **Speed is honoured** (shared `audio` store); **AB-repeat / spaced-repetition / repeat-count are not shown in Listen** — those are per-page hifz-drill controls, not "play the whole surah." Listen's controls = reciter + speed only.
8. **Beginner-friendly row content:** surah number, Arabic name, transliteration, ayah count, and a Makki/Madani badge. English *meaning* ("The Criterion") is a nice touch but needs a new 114-entry table — **deferred** to keep the phase tight (revisit if wanted).
9. **Cross-link browse → listen (confirmed):** a small headphones button on the browser's surah/juz rows deep-links into Listen and auto-plays that scope — the "pick a surah and it plays" flow, one tap from browsing.

---

## 8.0 — Scope model (pure, typed `core/quran/` + `core/audio/`)
> The "what plays for a surah / juz / the whole Quran" math. All page-first (Listen uses page audio, decision 5). Pure, unit-testable, no DOM, no `<audio>`. **Everything is QPC-page-indexed** — page audio only exists for the 604-page scheme, so scope resolution always uses the QPC nav index regardless of the reader's current layout.

- [ ] **8.0.1** `core/quran/surahMeta.ts` — static reference tables + helpers used by the browser and the surah-boundary logic. `AYAH_COUNTS` (114 ints, index 0 = surah 1) and `MAKKI_MADANI` (114 flags, for the badge), immutable `as const`. Helpers: `ayahCount(surah)`, `versesInSurah(surah) → {surah,ayah}[]`. **No juz-verse table needed** — juz boundaries are page-aligned (decision 5), taken from `NavIndex.juzToPage`.
  - *Verify:* unit — `AYAH_COUNTS` totals **6,236**; `ayahCount(25)` = 77; `versesInSurah(25)` (Al-Furqan) yields `25:1…25:77`; `versesInSurah(1)` yields 7; `MAKKI_MADANI[25]` etc. match a spot-check.
- [ ] **8.0.2** `core/quran/surahPages.ts` — **promote** the currently-private `SURAH_PAGE_RANGES_QPC` out of `reciters.ts` into a shared module (re-imported there, no behaviour change) so both the reciter tables and scope logic use one source. Add `surahPageRange(surah) → [start,end]`, `surahsOnPage(page) → number[]` (which surahs have verses on a page — length 1 ⇒ the page is wholly within one surah; >1 ⇒ a shared/partial page), and `pageIsWhollyWithin(surah, page)`.
  - *Verify:* unit — `surahsOnPage(1)` = `[1]` (page 1 is only Al-Fatihah); a known shared page (e.g. 106, where Surah 4 ends and 5 begins) returns `[4,5]`; `pageIsWhollyWithin(2, 3)` true, `pageIsWhollyWithin(5, 106)` false.
- [ ] **8.0.3** `core/audio/scope.ts` — `PlaybackScope` (`{ kind:'surah', surah } | { kind:'juz', juz } | { kind:'quran' }`) and one builder that turns a scope + the chosen page reciter (+ its same-qari verse reciter, + the QPC nav index) into a ready `PlaylistItem[]` — the **existing** mixed `page-part` / `verse` item shapes the engine already walks, so no engine change:
  - **`pagesForScope(scope, nav) → number[]`** — juz `j` ⇒ `juzToPage[j] … juzToPage[j+1]-1` (juz 30 → 604); whole Quran ⇒ `1 … 604`; surah `s` ⇒ `surahPageRange(s)`.
  - **`buildScopePlaylist(scope, pageReciter, verseReciter, nav) → PlaylistItem[]`:**
    - **Juz / Whole-Quran** — page-aligned, no boundaries: one straight page sequence. For each page, emit the reciter's `pageUrls(page)` as `page-part` items (Alafasy: all of the page's surah-parts in order; others: the single page file). This is exactly today's `buildPagePlaylist` over the page list.
    - **Surah** — the only hybrid. For each page `P` in the surah's range: if `pageIsWhollyWithin(s, P)` → a `page-part` item from `pageUrls(P)` (for Alafasy a wholly-within page yields exactly one part, so this is uniform). If `P` is **partial** → **Alafasy:** the single surah-part `page{P}-{s}{P-start}.mp3` (via a new `pageReciter.surahPartUrl(P, s)` for the multi-part reciter); **other reciters:** `verse` items for surah `s`'s verses on `P` (the ayahs of `s` whose `nav.ayahToPage["s:a"] === P`, built with `verseReciter.verseUrl`).
  - Needs a tiny reciter-table extension: expose the `multiPart` flag on `PageReciter` and add `surahPartUrl(page, surah)` for the multi-part case (thin wrapper over the existing `alafasyPageUrls` offset math). Non-multi-part reciters don't implement it (never called for them).
  - *Verify:* unit (nav + page-range fixtures) — `buildScopePlaylist({kind:'juz',juz:1}, husary, …)` = page files `Page001…Page021`; `{kind:'quran'}` = 604 page items (bounded count assertion); **surah 25 with a single-file reciter** = page files for its wholly-within pages + `verse` items at the start/end partial pages, in reading order; **surah 25 with Alafasy** = one surah-part per page, no `verse` items; a short surah sharing a page with neighbours (e.g. 108) with a single-file reciter = all `verse` items (no wholly-within page); Alafasy same short surah = one surah-part.

## 8.1 — Contents browser (`features/contents/`)
> The stubbed "Surahs" tab becomes a real route: a scannable, tappable index. Pure presentation over `NavIndex` + names.

- [ ] **8.1.1** Route + shell. Add `{ path:'/contents', name:'contents', component: () => import('@/features/contents/ContentsView.vue') }` (code-split). Full-view chrome modelled on `LiveView`/mushaf: back affordance, title, a `SegmentedControl` **Surah | Juz | Page**. Wire the reader's **"Surahs" tab** to `router.push({ name:'contents' })` (replacing the "coming later" toast branch).
- [ ] **8.1.2** `SurahList.vue` — 114 rows: number, Arabic name (`surah-names.json`), transliteration (`SURAH_NAMES`), ayah count + Makki/Madani badge (`surahMeta`). Tap → `router.push` to the reader at `surahToPage[s]` for the current layout (via the existing route builder in `core/navigation/readerRoute`). Virtualise only if it janks — 114 rows is likely fine as plain DOM; measure first, don't pre-optimise.
  - *Verify:* unit — renders 114 rows; row 25 shows "Al-Furqan / الفرقان / 77"; click emits/navigates to Al-Furqan's start page. e2e — Surahs tab → tap Al-Furqan → reader URL is its page.
- [ ] **8.1.3** `JuzList.vue` — 30 rows: juz number + its page range and starting surah, tap → reader at `juzToPage[j]`. The starting surah is derived, no new table: `surahsOnPage(juzToPage[j])[0]` (8.0.2) → surah name; the page range is `juzToPage[j] … juzToPage[j+1]-1`. `PageList.vue` — a compact page jumper (grid of 1…`pageCount`, or a number entry reusing `parseJump`) → reader at that page. Both share the row/navigation helper from 8.1.2.
  - *Verify:* unit — Juz row 1 shows "Juz 1 · Al-Fatihah · pages 1–21"; Page list navigates to page N. e2e — Juz tab → tap Juz 30 → reader URL is juz 30's page.
- [ ] **8.1.4** Layout-awareness. The browser navigates using the **current reader layout's** `NavIndex` (QPC vs Indopak page numbers differ). Read layout from the `reader` store; if the browser is opened cold (no reader state), default to the persisted layout.
  - *Verify:* unit — same surah resolves to different pages under a QPC vs Indopak nav fixture.

## 8.2 — Listen (`features/listen/` + `composables/useListenPlayer.ts`)
> Audio-only, whole-scope playback from page audio (decision 5). Reuses the Phase 7 engine, mini-player, reciter picker, and prefs. The only new pieces are the scope→playlist builder (8.0.3) and a picker UI; **no grain toggle**.

- [ ] **8.2.1** `useListenPlayer.ts` — sibling to `useQariPlayer`, same engine/store. `play(scope)`: resolve the **curated page reciter** (`store.pageReciterId` if it's in the Listen set, else Alafasy — without mutating the stored pref) and its same-qari `verseReciter(id)`; `buildScopePlaylist(scope, pageReciter, verseReciter, qpcNav)` (8.0.3); `engine.setPlaylistAndPlay(...)`; `store.open = true`. `restart()` rebuilds the last scope after a reciter/speed change. Always QPC nav (page audio is QPC-indexed) — Listen works regardless of the reader's current layout. No page-follow watcher (Listen isn't bound to a visible page).
  - *Verify:* unit (mocked engine + fixtures) — `play({kind:'surah',surah:25})` with Alafasy → surah-part playlist, no verse items; with a single-file reciter → page items + boundary verse items; `{kind:'juz',juz:1}` → 21 page items; `{kind:'quran'}` → 604 items (bounded count); a reciter change → `restart` rebuilds; a stored non-curated reciter (e.g. Husary) plays via Alafasy and leaves `store.pageReciterId` untouched.
- [ ] **8.2.2** `CURATED_LISTEN_RECITERS` + reuse-friendly player props. Derive the curated set in `core/audio/reciters.ts` = page reciters whose `id` also has a verse recording (Alafasy + 8). Give `AudioMiniPlayer` a `showGrain` prop (default `true`; Listen passes `false`) and `ReciterPicker` an optional `reciterIds` filter (Listen passes the curated ids) — small, backward-compatible additions so the reader player is unchanged.
  - *Verify:* unit — the curated set excludes `husary`/`juhaynee` and includes `alafasy`; `AudioMiniPlayer` with `showGrain:false` renders no grain toggle (reader default still shows it).
- [ ] **8.2.3** Route + `ListenView.vue`. Add `{ path:'/listen', name:'listen', … }` (code-split). Beginner-friendly **scope picker**: segmented **Surah | Juz | Whole Quran**; Surah/Juz reuse the 8.1 list components (or a compact picker sharing their data) to choose *which*; a prominent **Play** calls `useListenPlayer.play(scope)`. Once playing, the **existing `AudioMiniPlayer`** docks (`show-grain="false"`): transport + progress + reciter (curated) + speed. Reads an optional `?scope=&ref=` query to preselect + auto-play (used by the cross-link, 8.2.5).
  - *Verify:* e2e — More → "Listen" → URL `/listen`; pick Surah → Al-Furqan → Play → mini-player appears (no grain toggle) and `isPlaying` (stubbed source); reciter change rebuilds; a11y-clean in all three themes.
- [ ] **8.2.4** "More" entry. Add a **Listen** row (headphones icon, "Listen" / "Play a full surah, juz, or the whole Quran") to the reader's More sheet, alongside the existing Live recitation row → `router.push({ name:'listen' })`. Same `.more-item` styling.
  - *Verify:* e2e — More tab menu shows both "Listen" and "Live recitation" entries.
- [ ] **8.2.5** Cross-link (decision 9). A small headphones button on the browser's surah/juz rows → `router.push({ name:'listen', query:{ scope:'surah', ref:'25' } })`; `ListenView` preselects + auto-plays from the query.
  - *Verify:* e2e — Contents → Al-Furqan's Listen button → `/listen?scope=surah&ref=25` → mini-player playing Al-Furqan.

## 8.3 — Quality gate & exit checklist

- [ ] **8.3.1** Full unit suite green (`core/quran/surahMeta` + `core/quran/surahPages` + `core/audio/scope` exhaustive; `useListenPlayer` under the mocked engine); `vue-tsc` clean; `npm run build` clean.
- [ ] **8.3.2** `.size-limit.json` — reader/mushaf initial bundles **unchanged** (Contents + Listen are their own route chunks; Listen shares the already-lazy audio chunk). Add a "contents (lazy)" budget; assert audio budgets from Phase 7 hold. CSS budget held.
- [ ] **8.3.3** e2e across all three themes: Contents browser (surah/juz/page → correct reader page, both layouts); Listen (scope pick → play → mini-player with no grain toggle; reciter change rebuilds; a surah plays seamlessly with Alafasy and with a single-file reciter); cross-link auto-start. Command palette still works (regression — the browser did not replace it).
- [ ] **8.3.4** Webview reality checks: Listen playback survives navigating away from `/listen` and back (engine is app-level, like Phase 7's reader↔mushaf survival); the whole-Quran playlist (604 page items) builds instantly. Manually confirm a real surah with **Alafasy** has no seam at page turns and a **single-file reciter** transitions cleanly from a full page into the boundary verse audio.

### Exit checklist

- [ ] Contents browser replaces the "Surahs" coming-soon toast with a real tap-to-navigate index (surah/juz/page), layout-aware, palette still intact.
- [ ] Listen plays a full surah / juz / whole Quran from page audio via the existing engine, honouring the (curated) page reciter + speed, no grain toggle, reached from "More," code-split.
- [ ] A surah reconstructs correctly: Alafasy via surah-parts (no verse audio); other reciters via full pages + same-qari verse audio at partial-page edges.
- [ ] Reader/mushaf audio (Phase 7) unregressed; initial bundles unchanged; a11y + RTL clean in all themes.
- [ ] No new data-pipeline output — only static reference tables added; `SURAH_PAGE_RANGES_QPC` promoted to a shared module (reciters.ts still passes).
- [ ] `redesign-2026.md` §5 reflects the Phase 8 redefinition and the Phase 9/10 shift.

---

## Notes & honest risks
- **Reference-table correctness is load-bearing.** `AYAH_COUNTS` (verse enumeration at surah boundaries) and `SURAH_PAGE_RANGES_QPC` (which pages a surah spans, and Alafasy's per-surah part offset) are what make a scope play the right audio; a single wrong number silently mis-plays. The 8.0.1/8.0.2 tests pin the known invariants (total 6,236; Al-Furqan = 77 and pages 359–366; page 106 shared by surahs 4 & 5) to catch a bad transcription.
- **Voice seam at partial pages (non-Alafasy).** A surah's boundary verses come from the qari's *per-ayah* recording, which is a different take/bitrate than the *page* recording — an audible but same-voice seam at the (≤2) boundary pages. Accepted by decision 6 (curated single-voice); Alafasy avoids it entirely. Some qaris' verse vs. page files also differ in folder/bitrate (e.g. Ahmed Al Ajmi) — the seam is more noticeable there; if it grates, the mitigation is trimming the curated list, not new machinery.
- **No whole-Quran memory concern anymore.** Since Listen is page-first, whole Quran = 604 page-part items and a juz = ~20; verse items appear only at a surah's (≤2) partial edges. The old 6,236-item worry is gone — the flat playlist is always small.
- **QPC-indexed by nature.** Page audio only exists for the 604-page scheme, so Listen always resolves via the QPC nav index; it is available from either reader layout (no Indopak gating needed — it simply doesn't use Indopak page numbers).
- **No backend, local-first unchanged:** the only network dependency Listen adds is the same recitation CDNs Phase 7 already uses; scope resolution is fully offline (static tables + already-cached `NavIndex`).
