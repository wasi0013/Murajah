# Phase 7 — Audio (granular tasks) · DRAFT

**Parent:** [redesign-2026.md](./redesign-2026.md) §7 (Phase 7) · **Prereqs:** Phase 3 (reader: `reader` store `page`/`layout`, `ReadingSurface`), Phase 3b (mushaf: `mushaf` store `visible`/`spread`, `core/mushaf/spread`), Phase 1 (data client `getPage`/`getNavIndex`/`getSurahNames`) complete. **Goal:** bring recitation audio into the SPA as a **lazy, code-split** feature that works identically in the text reader and the mushaf image view, lets each user pick their preferred grain (**verse-by-verse or page-by-page**) and reciter, and — in the mushaf 2-up spread — plays **both visible pages**. Plus the two adjacent audio deliverables from the roadmap: **own-recitation record + playback** and a **live-stream embed**. Heavy audio deps (HLS) load only when used.

> Status: **DRAFT for review.** No code written yet. Tasks are unchecked; the "Done:" notes will be filled as each lands. One decision below (advanced controls, decision 4) has an open sub-point flagged `⚠ CONFIRM`.

## Why this is a redesign, not a port

The port-map lists the audio utilities as PORT/PARTIAL. The pure URL-building tables (`audioLoader.js`, ~200 lines) are genuinely portable and will be re-typed almost verbatim (per decision 5 below — the product owner chose "keep legacy sources as-is"). But the **players** must be rebuilt:

1. **The main player is a 1,842-line monolith.** `QuranAudioPlayerComponent.js` fuses verse mode, page mode, AB-repeat, spaced-repetition, playback-speed, reciter persistence, *and* a per-reading-mode snapshot/restore system into one Options-API component. The snapshot machinery (`modeSnapshots`, `isSwitchingReadingMode`, `snapshotCurrentState`/`restoreSnapshot`) exists **only** to paper over one shared `<audio>` element being torn between the mushaf and text views as they mount/unmount. In the new SPA the fix is architectural: a **single app-level audio engine** (a store + composable owning one `<audio>`) that both views *drive* rather than *own* — so position is preserved by construction and the entire snapshot subsystem evaporates.

2. **The data contracts changed.** Legacy `loadPageVerses` flattened `quran.json` (`{ "2": [{chapter, verse, page, text}] }`) to find verses on a page. That shape is gone; the new app assembles a page's verses from `getPage(layout, page).words` (the same assembly the quiz's `source.ts` and the reader already do). Verse→page adjacency comes from `getNavIndex(layout)`, not a flat scan.

3. **Page-audio numbering is layout-coupled and the legacy ignored it.** Page-by-page mp3s are indexed by the **QPC 604-page** scheme. The legacy only ever ran QPC, so it hardcoded `SURAH_PAGE_RANGES_QPC` and never noticed. The new reader also offers **Indopak (610 pages)**, whose page numbers do **not** map to those files. This must be handled explicitly (decision 6), not discovered in production.

**The decisions taken for this phase (product-owner confirmed):**

1. **Full Phase-7 scope, in three shippable slices.** (a) **Qari playback** (verse + page, both views, double-page) is the core and lands first; (b) **own-recitation record + playback**; (c) **live-stream embed**. Each is independently code-split and testable; b and c do not block a.
2. **Two grains, user's choice, remembered.** A single clear toggle — **Verse** (per-ayah files) or **Page** (one file per mushaf page) — persisted as a preference. Verse mode is layout-independent (keyed `surah:ayah`); page mode is QPC-page-indexed (see decision 6).
3. **Verse-playing highlight + auto-scroll in the text reader.** In verse mode, the active ayah highlights in `ReadingSurface` and scrolls into view; when audio advances, the highlight follows. Page mode (no per-verse timing) does **not** highlight. Mushaf image view never highlights (it's a bitmap) — it shows the active page/part instead.
4. **Advanced controls kept (not "minimal"):** **AB-repeat** (roadmap-mandated, with the auto-loop behaviour in decision 7), **playback speed**, **repeat-count / spaced-repetition**, and the two transport companions — an **autoplay-next** toggle and a **loop/repeat-playlist** toggle — layered so the default surface stays simple (transport + reciter + grain up front; power controls in an expandable tray).
5. **Keep legacy reciter sources verbatim.** Same CDNs, same primary→fallback pairs, same reciter lists (verse ~18, page ~11), ported as typed tables — **no validation pass** (your call). *Honest risk flag, not a task:* several primary URLs are single-host github-pages (`wasi0013.github.io/Murajah/recitations/…` for Shuraim, Luhaidan, Ali Jaber); if that host is down those reciters fall back to everyayah. Recorded so it's a known quantity, not a surprise.
6. **Page mode is QPC-only; verse mode is always available.** When the reader is in Indopak layout, the grain toggle still offers Verse (works everywhere), and **Page is disabled with a one-line hint** ("Page audio follows the standard mushaf; switch layout to use it"). The verse-range→QPC-page mapping is stubbed behind the same gate (7.0.4) so it can be turned on later without touching the engine, but it does **not** ship this phase.

7. **AB-repeat auto-loops, and the loop toggle is independent of the markers.** Three behaviours, confirmed: (a) set **A** then **B** → looping starts **immediately**, no extra tap. (b) set **A** but never **B** → when the current item reaches its end, **B is auto-placed at the end** and looping begins from that moment (so "A to the end, on repeat" needs one tap). (c) the loop can be **toggled off while A/B markers stay put**, and back on — a separate control from the A/B/clear buttons. Clearing removes the markers and stops the loop. (Full state machine in 7.2.2 / engine handling in 7.1.2.)

**Definition of done:** an audio feature that is **absent from the reader's initial bundle** (code-split; verified by size-limit). A single engine plays verse- or page-grain recitation, driven identically from the text reader and the mushaf view; in a mushaf 2-up spread it plays **both visible pages** in reading order. Verse mode highlights and auto-scrolls the active ayah in the text reader. AB-repeat, speed, and repeat/spaced controls work and their prefs persist. Users can record their own recitation, have it saved locally and played back from a floating playlist, and open a live-stream embed (HLS lazy-loaded). Works in Android webview and iOS Safari (`playsinline`); a11y-clean across all three themes. No monolith, no snapshot subsystem, no HEAD-probe.

> Local-first: prefs and recordings live in IndexedDB/localStorage; **no backend**. Recitation mp3s and the live stream are the only network dependencies and are the feature's single external coupling. Must never regress the reader, mushaf, progress, or scheduling.

---

## Bug catalogue — legacy defects this phase must not reintroduce

Audited in `QuranAudioPlayerComponent.js` (1842), `FloatingAudioPlayerComponent.js` (514), `audioLoader.js` (203), `audioRecorder.js` (315). Recorded so the rebuild is measured against them.

- **A1 — `nextVerse()` bounds-checks the wrong list.** [`QuranAudioPlayerComponent.js:1265`] Sequential advance guards on `this.pageVerses.length`, but the active list is `versesToPlay` (which is `selectedSurahVerses` when a surah is chosen). Surah-scoped playback stops at the page-verse count instead of the surah's, and can't advance past it. **Fix:** one `activeVerses` source of truth; every bound checks it.
- **A2 — HEAD-probe fallback fights CORS.** [`audioLoader.js:83` `getWorkingAudioUrl`] Probes the primary with a `fetch(HEAD)` that these CDNs block on CORS, then an `Audio()` load race with a 5s timeout — a wasted round trip that often *falsely* rejects a working URL. **Fix:** don't pre-probe. Set `src = primary`; on the `<audio>` `error` event, swap to `fallback` once. (The legacy `playVerse` already does this; the probe is dead weight elsewhere.)
- **A3 — Error-listener accumulation.** [`QuranAudioPlayerComponent.js:1203`] Manual `_audioErrorHandler` add/remove with `{once:true}` to avoid stacking listeners on the shared element — fragile bookkeeping. **Fix:** the engine owns one declarative `error` handler keyed to the current source; no per-play listener churn.
- **A4 — The monolith itself.** 1842 lines, Options API, every concern entangled. **Fix:** `core/audio/*` (pure) + `useAudioEngine` (one `<audio>`, transport) + thin per-view UI. Nothing stateful in the view components beyond expand/collapse.
- **A5 — Snapshot/restore subsystem.** [`:585`, `:738`, `:763`] `modeSnapshots`/`isSwitchingReadingMode` exist solely because the audio element is co-mounted with a view and dies on view switch. **Fix:** engine lives above both views (app-level); switching reader↔mushaf never unmounts it, so there is nothing to snapshot.
- **A6 — AB-repeat overshoots B.** [`:1318` `updateProgress`] The loop-back is polled in `timeupdate` (~4 Hz) and jumps `currentTime = a` only *after* passing B — an audible overshoot. **Fix:** acceptable to keep, but tighten by scheduling the loop from `timeupdate` with a small lookahead, and clamp; unit-test the region math (`abRegionStyle`) separately from playback.
- **A7 — Page-audio numbering assumed QPC.** `SURAH_PAGE_RANGES_QPC` + `getPageAudioUrls(pageNum)` treat page N as a QPC page. Silently wrong for Indopak. **Fix:** decision 6 — page mode is explicitly QPC-scoped; the engine maps/gates by layout (7.0.4).
- **A8 — Recording duration & MIME edge cases (port carefully, don't regress).** [`audioRecorder.js`, `FloatingAudioPlayerComponent.js:459`] iOS needs `audio/mp4`/`aac` (no webm); WebM blobs report `duration = Infinity`, worked around by storing `recording.duration` (ms) and falling back on `durationchange`. These are **correct** legacy behaviours to preserve, listed so the rebuild keeps them, not drops them.

---

## 7.0 — Audio sourcing model (pure, typed `core/audio/`)
> The URL tables and page-math. Pure, exhaustively unit-testable, no DOM, no `<audio>`. This is the honest "PORT" part of the phase.

- [ ] **7.0.1** `core/audio/reciters.ts` — typed registries ported from `audioLoader.js` + the verse-URL `switch` in the legacy player. Two tables: `VERSE_RECITERS` (`{ id, name, verseUrl(surah, ayah) → {primary, fallback} }`, ~18 entries) and `PAGE_RECITERS` (`{ id, name, pageUrls(page) → string[], multiPart }`, ~11 entries; Alafasy multi-part via the surah-range table). Padding helpers (`pad3`). `Rng`-free, no I/O.
  - *Verify:* unit — every reciter yields a well-formed URL for a spot-check verse/page; Alafasy multi-part emits one URL per surah on a boundary page; fallbacks all resolve to a real everyayah pattern.
- [ ] **7.0.2** `core/audio/verses.ts` — assemble the verse list for a set of pages from the data client, reusing the quiz's proven approach. `versesForPages(layout, pages, data)` → ordered `{ surah, ayah, page }[]` (group `getPage(...).words` by ayah; sort by page, then surah, then ayah). This is the single source both grains and both views feed from. (Mirrors `core/quiz/source.ts` `versesOnPage` — consider extracting a shared `core/quran/pageVerses.ts` so quiz and audio share one assembler. *Decision in 7.0.2 build.*)
  - *Verify:* unit — a page fixture assembles verses in order; a 2-page (spread) input concatenates in ascending page order; empty page → `[]`.
- [ ] **7.0.3** `core/audio/spread.ts` (or reuse `core/mushaf/spread`) — `audioPagesFor(view, ctx)`: given the current view (`text` | `mushaf`) and its state, return the page(s) whose audio should play. Text reader → `[reader.page]`. Mushaf single → `[mushaf.page]`. Mushaf 2-up spread → `mushaf.visible` (the RTL pair, already `[right, left]` = ascending). **This is the user's double-page requirement, and it falls straight out of the existing `mushaf.visible` computed** — no new pairing math.
  - *Verify:* unit — text view returns one page; mushaf spread returns both visible pages in ascending (reading) order; last-page spread returns one.
- [ ] **7.0.4** `core/audio/pageMode.ts` — **layout gating (decision 6).** `pageAudioAvailable(layout)` and, if we choose the mapping route, `qpcPagesForVerses(verses)` (map a visible verse range to the covering QPC page(s) via nav index). Ships with the **recommended default**: *page mode enabled only for QPC; in Indopak the grain toggle disables Page with an inline hint "Page audio follows the standard mushaf; switch layout to use it."* Mapping route is stubbed behind this so it can be turned on later without touching the engine.
  - *Verify:* unit — QPC → available; Indopak → unavailable (or mapped, per chosen route); verse mode unaffected by layout.
- [ ] **7.0.5** `core/audio/playlist.ts` — pure playlist builder. From (grain, reciter, pages/verses, options {repeatCount, spaced}) produce an ordered `PlaylistItem[]` (`{ kind:'verse'|'page-part', ref, urls:{primary,fallback}, label }`). Spaced-repetition expansion lives **here as a pure function** (the legacy `generateSpacedPlaylist` re-typed and de-bugged), so the engine just walks a flat list. No recursion; deterministic under a seeded RNG where shuffle is involved.
  - *Verify:* unit — verse grain over a page → one item per ayah; page grain over a spread → parts for both pages in order; `repeatCount:3` triples each item; spaced expansion matches a hand-computed fixture; total item count == legacy `totalSpacedRepetitionPlays` for the same inputs.

## 7.1 — The audio engine (`stores/audio.ts` + `composables/useAudioEngine.ts`)
> One `<audio>`, owned above the views. The heart of the redesign; replaces the monolith and the snapshot subsystem (fixes A3–A5).

- [ ] **7.1.1** `stores/audio.ts` — the reactive playback state: `grain`, `reciterVerse`, `reciterPage`, `speed`, `autoNext`, `loopPlaylist`, `ab:{a,b,enabled}`, `repeatCount`, `spaced`, plus live `playlist`, `index`, `isPlaying`, `currentTime`, `duration`, `activePage`, `activeVerse` (`{surah,ayah}|null` — what the reader highlights). Pinia composition store; prefs slice separated from transient playback slice.
- [ ] **7.1.2** `useAudioEngine.ts` — owns a single `<audio ref>` (mounted once in `App.vue`/a persistent host, **not** in a view). Transport: `load(playlist)`, `play/pause/toggle`, `next/prev`, `seek`, `stop`, `setSpeed`. Source-with-fallback: set primary; on `error`, swap to fallback once, then surface a skip (fix A2/A3). `timeupdate` updates `currentTime` + drives AB-loop (fix A6) and, in verse grain, sets `activeVerse`. `ended` → autoplay-next / loop / stop per flags (fix A1 via a single `activeVerses`/playlist list).
  - **AB-repeat, engine half (decision 7):** the pure reducer (7.2.2) owns the marker/loop *state*; the engine owns the *timeline effects*. When **Loop is on and both A/B set**, `timeupdate` seeks back to A on crossing B (min/max-normalised, with a small lookahead to avoid A6's overshoot). When **only A is set** and the item fires `ended`, the engine dispatches "B := duration, Loop := on" to the reducer and seeks to A **instead of** advancing to the next item — so an A-only marker becomes "loop A→end" on the first pass. AB-loop is scoped to the **current item** and does not auto-advance while looping.
  - *Verify:* unit (happy-dom + a stubbed `<audio>` / element mock) — advance walks the whole playlist and stops at the end unless `loopPlaylist`; a source `error` swaps to fallback exactly once then advances; AB-loop resets to A when crossing B; **A-only + `ended` auto-places B at duration, enables loop, and seeks to A rather than advancing**; toggling Loop off lets the item play through and advance normally with markers still present; `ended` respects `autoNext` when no AB-loop is active.
- [ ] **7.1.3** Persistent host + lifecycle. Mount the engine's `<audio>` once (hidden, `playsinline webkit-playsinline`) so navigating reader↔mushaf↔quiz never tears it down (fix A5). MediaSession API (lock-screen / notification transport) — nice-to-have, gated behind capability check.
  - *Verify:* e2e — start audio in text reader, navigate to mushaf, playback continues; position is unbroken (no snapshot needed).

## 7.2 — Player UI (mobile-first, `features/audio/`)
> Simple by default, powerful on demand. A compact **mini-player** the user can summon in either view; an expandable tray holds the advanced controls (decision 4).

- [ ] **7.2.1** `AudioMiniPlayer.vue` — the always-simple surface: play/pause, prev/next, a slim progress bar, the **grain toggle (Verse | Page)**, and the reciter name (tap → picker). Thumb-zone layout, `env(safe-area-inset-*)`, `100dvh`-aware, reduced-motion. Docks above the bottom nav; collapsible to a FAB (mirrors the legacy floating player's minimize, rebuilt).
- [ ] **7.2.2** `AudioControlsTray.vue` — the expandable advanced tray: **AB-repeat**, **speed** select, **repeat-count** + **spaced-repetition** toggle, and **autoplay-next** + **loop-playlist** toggles. Everything styled through design tokens; colour never the sole state signal (icon + label), matching the quiz's a11y bar.
  - **AB-repeat state machine (decision 7), UI half:** four controls — **Set A**, **Set B**, **Loop** (independent on/off), **Clear**. Markers render on the progress bar (port `abRegionStyle` from 7.0). Transitions: *(none)* → tap A → **A set** (marker shown, no loop yet); **A set** → tap B → **A+B set, Loop auto-on** (looping begins immediately); **A set**, item plays to its end → **B auto-placed at end, Loop auto-on** (see 7.1.2); **Loop on** ⇄ **Loop off** via the Loop button with **markers preserved**; any state → **Clear** → *(none)* (markers gone, loop off). Tapping **Set A** again while set re-arms A at the current time (same for B); if A>B after a re-arm, the engine normalises via `min/max` (7.0 region math already does this).
  - *Verify:* unit (pure reducer) — the transition table above, incl. A-only→auto-B-at-end and loop-toggle-preserves-markers; A/B re-arm and normalisation.
- [ ] **7.2.3** `ReciterPicker.vue` — a bottom-sheet picker listing the grain-appropriate reciters (verse list vs page list), Arabic + transliterated names, current selection marked. Selection persists (7.3).
- [ ] **7.2.4** Entry points — a headphones affordance in the reader chrome and the mushaf chrome that opens the mini-player scoped to the current view/page. Route: the audio feature is **not** its own route; it's an overlay on reader/mushaf (so it can highlight verses in place). Libs still code-split via dynamic import of `useAudioEngine`/UI on first open.
  - *Verify:* size-limit — reader/mushaf initial bundles unchanged (audio absent until opened); e2e — headphones opens the mini-player; grain toggle switches lists.

## 7.3 — Preference persistence
- [ ] **7.3.1** Extend `stores/settings` (or a small `audioPrefs` slice) + a `useAudioPersistence` composable mirroring the established debounced hydrate/save pattern. Persist: grain, verse reciter, page reciter, speed. **Do not** persist transient playback (index/time) — a fresh session starts clean (the legacy localStorage keys `murajah-reciter`, `murajah-page-reciter`, `murajah-playback-speed` are superseded by the app's IndexedDB store; a one-time read-through migration of those localStorage keys is a nice touch — *optional, note only*).
  - *Verify:* unit — round-trips through serialize/deserialize; e2e — pick a reciter, reload, it's remembered.

## 7.4 — Verse-highlight sync in the text reader (decision 3)
> The big UX win. Verse grain only; text view only.

- [ ] **7.4.1** Give `ReadingSurface` word/ayah elements a stable `data-verse="s:a"` anchor (words already carry `w.id` and lines carry `surah`; derive the ayah grouping the same way `versesForPages` does). A read-only prop/store subscription highlights the ayah matching `audio.activeVerse`; CSS highlight through tokens (not colour-only — a subtle inset/weight too).
- [ ] **7.4.2** Auto-scroll the active ayah into view on change (`scrollIntoView({block:'center', behavior})`, respecting reduced-motion → `auto`). Guard against fighting the user's manual scroll (only auto-scroll when the active verse is offscreen).
  - *Verify:* e2e — start verse audio; the first ayah highlights; on `ended`→next, the highlight and scroll follow; page-grain and mushaf never highlight.

## 7.5 — Mushaf double-page integration (decision + user's core requirement)
- [ ] **7.5.1** Wire the mini-player in `MushafView` to `audioPagesFor('mushaf', …)` (7.0.3). In a 2-up spread, the playlist covers **both** `mushaf.visible` pages (verse grain: all verses of both pages in order; page grain: both page files, ascending). The active page/part is indicated on the spread (highlight the page frame or a small "playing page N" chip — no per-verse highlight on the bitmap).
  - *Verify:* e2e (desktop-width spread) — playlist spans both visible pages; advancing crosses from the right page to the left; single-page (mobile) plays one page.

## 7.6 — Own-recitation record + playback (roadmap slice b)
> The deferred "record-a-page" habit. Port `audioRecorder.js` carefully (keep A8's correct iOS/duration handling); rebuild the floating playlist player as a Vue 3 component reusing the 7.1 transport where sensible.

- [ ] **7.6.1** `core/audio/recorder.ts` — re-typed `AudioRecorder` (MIME detection incl. iOS mp4/aac, start/stop, blob + measured duration ms). Static `isSupported()`.
- [ ] **7.6.2** Persist recordings in IndexedDB (a `recordings` slice in the app DB, **not** a separate database — avoid the legacy multi-DB trap). Store `{ id, pageNumber, blob, mimeType, duration, recordedAt }`. Blob storage verified against the reactive-proxy/structured-clone gotcha.
- [ ] **7.6.3** `RecordingsPlayer.vue` — rebuild the floating player (playlist, play/pause/seek/speed, delete-with-confirm, blob-URL lifecycle with revoke — the legacy one was actually careful here; keep it). Auto-select newest; badge count.
  - *Verify:* unit — recorder MIME selection per platform stub; blob round-trips IndexedDB. e2e (where MediaRecorder is stubbable) — record→save→appears in playlist→plays→delete. Honest note: real mic capture isn't e2e-testable in CI; assert the store/DB path and UI, stub the stream.

## 7.7 — Live-stream embed (roadmap slice c)
> Smallest, most isolated. HLS via `hls.js`, dynamically imported only when the stream is opened.

- [ ] **7.7.1** `LiveStreamPlayer.vue` — a lazily-loaded overlay that attaches an HLS source. Use native HLS on Safari (`canPlayType('application/vnd.apple.mpegurl')`), `hls.js` elsewhere (`import('hls.js')` on open). Reuse the legacy stream URL(s). Graceful "stream offline" state.
  - *Verify:* size-limit — `hls.js` in its own async chunk, absent from every initial bundle; e2e — opening the stream loads the chunk; a dead source shows the offline state, not a spinner.

## 7.8 — Quality gate & exit checklist
- [ ] **7.8.1** Full unit suite green (core/audio/* exhaustive; engine transport under a mocked element); `vue-tsc` clean; `npm run build` clean.
- [ ] **7.8.2** `.size-limit.json` — reader & mushaf initial bundles **unchanged** (audio code-split); add an "audio (lazy)" budget and an "hls (lazy)" budget; CSS budget held.
- [ ] **7.8.3** e2e across all three themes: mini-player a11y-clean (setup/playing/tray-expanded); verse-highlight sync; mushaf double-page playlist; record→play (stubbed); live-stream chunk lazy-loads.
- [ ] **7.8.4** Webview/iOS reality checks: `playsinline` honoured (no fullscreen takeover on iOS); audio survives reader↔mushaf↔quiz navigation (A5 regression); fallback URL swap fires on a forced primary 404 (A2 regression).

### Exit checklist
- [x] Audio absent from reader/mushaf initial bundles (size-limit: reader 55 kB unchanged; audio in its own 7 kB lazy chunk).
- [x] Verse **and** page grain both play, in **both** views; user's choice persists (7.3).
- [x] Mushaf 2-up spread plays **both** visible pages (`audioPagesFor` → `mushaf.visible`; unit-covered; e2e opens the player over the spread).
- [x] Verse grain highlights + auto-scrolls the active ayah in the text reader (7.4; unit + e2e anchor check).
- [x] AB-repeat, speed, repeat/spaced controls work; prefs persist (decision-7 reducer unit-tested; e2e drives A→B→loop through the real UI).
- [x] Record→save→playback works (recorder + shared-DB storage unit-tested; e2e opens the panel; real capture is browser-only).
- [x] Live stream opens (YouTube embed — see note; offline handled by YouTube's own player; e2e starts a channel).
- [x] No monolith, no snapshot subsystem, no HEAD-probe (A2–A5 gone by construction).
- [x] a11y clean, all three themes; reduced-motion respected (e2e axe on player + expanded tray × 3 themes).

**Verification:** 689 unit + 106 e2e green, `vue-tsc` clean, `npm run build` clean, all size budgets held (reader/today/quiz routes, audio-lazy 7.15/20 kB, CSS 19.96/30 kB).

### Implementation notes — deviations from the draft (as built)
- **Live stream is a YouTube embed, not hls.js.** Checking the legacy before reusing it (per your mandate) surfaced a literal comment — *"HLS.js removed: switching to YouTube embed for live streams"* — so the real, current source is two YouTube live channels (Makkah/Ḥaram, Madinah/Nabawī). Followed that: no HLS dependency at all, a 2.3 kB lazy chunk. The roadmap's "HLS" line is stale.
- **Verse-highlight e2e** asserts the `data-verse` anchors are present (the mapping is wired) rather than forcing audio to advance — which page/verse plays and whether the network serves it is non-deterministic in CI. The highlight logic itself is unit-proven (`reading-surface-highlight.test.ts`).
- **Blob byte-persistence** is asserted via metadata + type in unit tests; fake-indexeddb + happy-dom serialise a Blob to a plain object (dropping bytes), so byte-level round-trip is a real-browser behaviour, not unit-forced.
- **Real bug caught by e2e:** the mini-player docked at `z-index: 40`, below the sticky bottom tab bar (`--z-sticky: 100`), so the tab bar intercepted its controls on the reader — it would have been unusable. Fixed to `--z-dropdown` (above the tab bar, below sheets).

### Post-review UX pass (as built)

Seven small changes after first use:

1. **Tafsir Arabic** is right-aligned (was centred) — reads as scripture, not a caption.
2. **Player follows the page.** `AudioHost` watches the visible page(s); while playing, turning the page stops the old page and starts the new one (verse *and* page grain). Guarded on `isPlaying`, so merely opening/pausing the player never yanks the page along.
3. **Auto-scroll toggle** in the player's advanced tray (`store.autoScroll`, persisted). Gates the recited-ayah scroll in both the mushaf reader and the tafsir surface.
4. **Tafsir replaces the mushaf** (was shown beneath it). When Tafsir & translations is on, the 15-line pager is hidden and the study surface is the reading view; the normal-layout-only settings (page width, tajweed, word-by-word, tap mode) hide with it and return when it's off.
5. **Tafsir auto-scroll + highlight.** The study surface now highlights the recited ayah and scrolls it into view (offscreen-only, reduced-motion aware), gated by the auto-scroll toggle — mirroring the mushaf reader.
6. **Subtler playing highlight.** Softened from an 18% accent wash + 2 px solid bar to a ~9% wash + hairline (45% accent) rule; the tafsir card uses a 7% wash + start-edge accent bar. Cue still isn't colour-only.
7. **Live recitation is a full route** (`/live`, like the mushaf), reached from the **More** tab's menu rather than buried in the settings drawer. `LiveStreamPlayer.vue` (BottomSheet) was deleted for `features/live/LiveView.vue`.

---

## Deferred / open (noted, not blocking)
- **Offline audio download manager** — caching recitation for offline is **Phase 8** (service-worker/Workbox). Phase 7 streams; it must not assume a cache.
- **Indopak page-mode mapping** (decision 6) — ships disabled-with-hint this phase; the verse-range→QPC-page mapping is stubbed in 7.0.4 for a later turn-on.
- **MediaSession lock-screen transport** (7.1.3) — nice-to-have, capability-gated.
- **Reciter source validation** — explicitly out of scope per decision 5 (keep-as-is); the github-pages single-host risk is documented, not mitigated, this phase.
