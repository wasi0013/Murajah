# Murajah PWA Architecture Audit

Date: 2026-04-11
Repository: Murajah
Scope: PWA architecture, offline model, service worker design, iOS/WebKit risk analysis, mobile-browser/WebView hardening, and current test status.

## 1. Executive Summary

Murajah is currently implemented as a static multi-page Progressive Web App with no build step, a custom service worker, a large IndexedDB-backed data layer, and heavy client-side initialization inside HTML entry points. The product direction is correct for the problem domain: local-first storage, offline access, persistent memorization state, and fast repeated reads are all appropriate for a Quran memorization tool used frequently on mobile devices.

The current implementation is functional and already contains several meaningful hardening decisions, especially around Safari/WebKit behavior. The codebase shows that previous failures have been encountered and partially addressed. Examples include Blob-first service-worker caching to avoid WebKit body-lock issues, font-cache key separation, recovery tooling in the hotfix page, BFCache handling, and IndexedDB timeout guards in some flows.

However, the PWA architecture is still below a professional mobile-first standard for iOS-heavy usage. The biggest issue is not one isolated bug; it is the interaction of several decisions:

1. The service worker precaches too much, including very large Quran JSON files.
2. Large resources are also cached again in IndexedDB, creating double storage pressure.
3. The main app bootstrap still contains unbounded IndexedDB and fetch paths.
4. Update/reload logic is duplicated across entry points and has diverged.
5. The main app remains a very large inline script with critical runtime logic embedded in `index.html`.

For Android and desktop browsers the app is reasonably strong. For iOS Safari and in-app WebViews, there are still credible failure paths that can produce exactly the sort of user reports typically described as:

- "The app keeps loading forever"
- "The app worked before but now won’t open after an update"
- "Offline/downloaded mode is unreliable"
- "The app suddenly feels broken on iPhone after some usage"

The most important conclusion from this audit is this: Murajah should move from a "cache everything everywhere" architecture to a "small app shell + one authoritative data cache + bounded boot path" architecture.

## 2. Current Architecture

### 2.1 Delivery Model

Murajah is a static-site PWA served directly from the `source` directory. There is no bundler, no compilation step, and no framework build pipeline. The main runtime entry points are:

- `source/index.html` for the primary Quran experience
- `source/plan.html` for plan workflows
- `source/quiz.html` for quiz workflows
- `source/sw.js` as the service worker
- `source/manifest.json` as the web app manifest
- `source/hotfix.html` as the recovery surface

This approach reduces deployment complexity and keeps hosting simple, but it pushes a very large amount of orchestration into the browser at runtime.

### 2.2 Runtime Composition

The app currently mixes three styles of architecture:

1. A monolithic HTML application shell in `source/index.html`
2. Imported ES modules under `source/resources/js/`
3. Standalone entry pages (`plan.html`, `quiz.html`) that duplicate some bootstrap and service-worker coordination logic

The main page is the most complex part of the system. It defines:

- the IndexedDB schema and migration logic
- app bootstrap and initialization
- state stores and view toggles
- cache-management UI
- service-worker client logic
- audio recording and playback flows
- persistence logic for notes, plans, daily goals, and settings

This gives flexibility, but it also creates a very large blast radius for change. Boot logic, persistence logic, and UI logic are tightly coupled.

### 2.3 Storage Layers

The app currently uses three effective caching/storage layers:

1. Service worker Cache API
2. IndexedDB
3. In-memory JavaScript caches

#### Service worker Cache API

The service worker stores:

- HTML entry points
- JS and CSS
- vendor assets
- fonts
- and, importantly, multiple very large JSON data files

#### IndexedDB

IndexedDB stores:

- `appData`
- `recordings`
- `dailyGoals`
- `quranCache`
- `resourceCache`
- `notes`
- `plans`
- `planHistory`

`resourceCache` is used for static resource caching. `quranCache` is still present as an older cache mechanism. This means the codebase contains both older and newer caching models at once.

#### In-memory caches

The unified data loader also keeps runtime indexes in memory for performance:

- word lookup cache
- page-line index cache
- verse-text index cache
- per-layout load state

This is a good decision for rendering speed, but it assumes the underlying boot path succeeds consistently.

### 2.4 Service Worker Strategy

The service worker uses three main strategies:

- Navigation requests: network-first with timeout and cache fallback
- Static assets: stale-while-revalidate
- Fonts: stale-while-revalidate with custom font identity logic

Positive decisions already present:

- navigation timeout exists
- fetches are wrapped with `AbortController`
- Blob-first response recreation is used before cache writes to avoid WebKit response-body locking problems
- root navigation is also cached as `index.html` for Safari compatibility
- activation only clears old caches after checking a minimum resource set
- a hotfix recovery page exists for catastrophic cases

These are all signs of deliberate engineering work, and they are valuable.

### 2.5 Data Loading Pipeline

The current data pipeline is centered on `source/resources/js/utils/unifiedDataLoader.js` and `source/resources/js/utils/resourceCache.js`.

The main page boot path does roughly this:

1. Open IndexedDB and build the app database object
2. Import utility modules
3. Initialize locale/state
4. Run `initializeApp()`
5. Load stored settings and user data
6. Load Quran layout data, words, tafsir mapping, surah names, and translations
7. Load secondary resources such as `quran.json` and Bangla translations
8. Initialize daily goals
9. Render and continue background work

The architecture goal is sensible: prioritize critical render data and push the rest later. But the current implementation does not consistently enforce bounded time or non-blocking behavior across all steps.

### 2.6 Audio Architecture

Audio is split across:

- `audioRecorder.js` for recording and blob conversion
- `QuranAudioPlayerComponent.js` for Quran recitation playback
- `FloatingAudioPlayerComponent.js` for recorded audio playback

Positive existing decisions:

- iOS device detection exists
- MIME type selection attempts platform-aware fallbacks
- playback uses `playsinline` and `webkit-playsinline`
- recorder metadata includes MIME type

This is directionally correct for iOS, but the surrounding test coverage and browser capability handling are still inconsistent.

### 2.7 Update and Recovery Flows

The app has three different update/recovery concepts:

1. Update banner logic on the main page
2. Service-worker forced reload logic in all entry points
3. Manual recovery via `hotfix.html`

These are important building blocks. The problem is that they are implemented differently in different pages, which increases drift and makes failure recovery harder to reason about.

## 3. Design Decisions Already Taken So Far

This section records the important design decisions that are already visible in the current codebase and worktree state.

### 3.1 Local-first storage

Decision:
All meaningful user data is stored client-side, primarily in IndexedDB.

Why it was taken:

- memorization data is personal and frequently updated
- offline use matters
- the product currently has no server dependency

Assessment:
Correct product decision. This should remain.

### 3.2 Multi-layer caching

Decision:
Use service-worker cache, IndexedDB resource cache, and in-memory indexes together.

Why it was taken:

- fast repeated loads
- resilience to partial network loss
- reuse of structured JSON data without repeated parsing

Assessment:
The intention is good, but the current implementation over-caches the same data in multiple places. That is the central architectural excess in the PWA today.

### 3.3 WebKit-specific hardening in service worker

Decision:
Service-worker cache writes recreate responses from Blob bodies instead of relying on `Response.clone()`.

Why it was taken:

- iOS WebKit has known response-stream and body-lock quirks
- redirected navigation responses are dangerous in Safari

Assessment:
Strong decision. This is one of the better parts of the current architecture.

### 3.4 Font identity isolation

Decision:
Differentiate QPC and Tajweed page fonts with explicit identifiers and canonical cache keys.

Why it was taken:

- both font families use page-numbered files
- incorrect matching would render wrong glyph sets

Assessment:
Correct and necessary. Keep it.

### 3.5 Recovery surface (`hotfix.html`)

Decision:
Provide an explicit recovery page that can unregister service workers, clear caches, and partially or fully reset local data.

Why it was taken:

- PWA failure states can trap users behind broken caches or blocked IndexedDB state
- mobile users need a self-service recovery path

Assessment:
Strong operational decision. This should be made more discoverable and better integrated.

### 3.6 Partial iOS timeout mitigation

Decision:
Add timeout guards to some IndexedDB and resource-cache flows, especially in `plan.html`, `resourceCache.js`, and related iOS-sensitive paths.

Why it was taken:

- WebKit can leave IDB requests hanging indefinitely
- blocked transactions look like infinite loading to users

Assessment:
Correct decision, but incomplete rollout. The main app bootstrap still lacks equivalent protection.

### 3.7 BFCache mitigation

Decision:
Handle `pageshow` in the main page and plan page to recover from iOS BFCache restores when initialization state is stale.

Why it was taken:

- iOS restores pages aggressively from back-forward cache
- stale initialization state can leave overlays visible forever

Assessment:
Good decision. Coverage is still inconsistent and should be centralized.

### 3.8 SW-driven forced refresh after activate

Decision:
Notify clients when a new service worker activates and reload pages so stale HTML does not run against new JS.

Why it was taken:

- no build hash manifest exists to guarantee HTML/JS consistency
- stale entry HTML plus updated modules is a real breakage mode

Assessment:
The decision is valid. The implementation is fragmented across entry points.

## 4. Confirmed Architectural Flaws and Problematic Decisions

This section focuses on flaws that are visible in the current code and that materially affect reliability, performance, maintainability, or mobile-browser behavior.

### 4.1 Oversized app-shell precache

Severity: Critical

Where:

- `source/sw.js` `APP_SHELL`

Problem:
The service worker precaches not only the actual app shell, but also very large Quran data assets such as:

- `qpc-v2-15-lines.json`
- `qpc-v2-word-by-word.json`
- `quran.json`
- tafsir mappings and tafsir datasets
- translations

Why this is a flaw:

- an app shell should be small and fast to install
- large data sets belong in an explicit data-cache strategy, not install-time app-shell precache
- service-worker install is currently sequential across the shell list, so first install/update on mobile is heavier than necessary
- iOS storage and background execution limits make this especially fragile

Impact:

- slower first install
- higher chance of install timeout or partial install on weak networks
- larger storage footprint before the user has explicitly asked for offline completeness
- greater chance of update instability when network conditions are poor

Better approach:

- keep `APP_SHELL` to HTML, CSS, JS, icons, manifest, and a minimal locale set
- move Quran datasets fully into the structured data layer
- let the app download large datasets on first usage or via explicit offline download flow

### 4.2 Duplicate storage of large resources

Severity: Critical

Where:

- `source/sw.js`
- `source/resources/js/utils/resourceCache.js`
- `source/resources/js/utils/unifiedDataLoader.js`

Problem:
Large data is effectively cached twice:

- once in service-worker Cache API
- again in IndexedDB `resourceCache`

In practice, the architecture keeps:

- app shell responses in Cache API
- large JSON payloads in Cache API
- large JSON payloads again in IndexedDB
- in-memory copies and indexes during runtime

Why this is a flaw:

- it wastes storage on the devices that can least afford it
- it increases the odds of quota exhaustion on iOS Safari and embedded WebViews
- it creates more places where cache invalidation can fail
- it complicates reasoning about which cache is authoritative

Impact:

- higher probability of quota-related instability on iOS
- stale data surviving in one layer after another is cleared
- larger recovery surface when users report "downloaded content disappeared" or "offline mode broke"

Better approach:

- Cache API should own only the true app shell and font/media responses that are best represented as HTTP responses
- IndexedDB should own large structured Quran datasets and application state
- memory caches should be runtime-only and rebuilt from IndexedDB/network when needed

### 4.3 Main app IndexedDB bootstrap still has no timeout

Severity: Critical

Where:

- `source/index.html`, `MurajahDB.init()`

Problem:
The main app still opens IndexedDB without a timeout guard. In contrast, `plan.html`, `resourceCache.js`, and `hotfix.html` already contain timeout-based WebKit mitigation patterns.

Why this is a flaw:

- it shows the codebase already knows this class of iOS failure exists
- the most important page, `index.html`, remains exposed to the same issue

Impact on iOS users:

- app can sit on the initial loader forever if `indexedDB.open()` stalls
- the user sees a broken app before Vue app recovery logic even has a chance to run
- BFCache workarounds do not help if boot never reaches the mounted app state

Fix:

- centralize database open in a shared helper with timeout and fallback strategy
- use that helper in `index.html`, `plan.html`, and any future entry page
- if open times out, surface a recoverable UI with reload and hotfix links instead of a permanent spinner

### 4.4 Main app initialization still blocks on raw secondary fetches with no timeout

Severity: Critical

Where:

- `source/index.html`, `initializeApp()` and `loadSecondaryData()`

Problem:
After core data loads, the app still awaits:

- `fetch('./resources/data/quran/quran.json').then(r => r.json())`
- `fetch('./resources/data/quran/bangali-word-by-word-translation.json').then(r => r.json())`

These fetches are wrapped in `Promise.allSettled`, but there is no timeout and no `response.ok` check.

Why this is a flaw:

- `Promise.allSettled` still waits forever if a fetch never resolves
- the main initialization path awaits `loadSecondaryData()` before reaching the `finally` block that clears `isInitializing`
- on mobile networks, especially iOS in weak-signal states, an unbounded fetch can keep the loading overlay visible indefinitely

Why this likely matches iOS user reports:

- it produces the exact symptom users describe as "stuck loading"
- the issue is network-condition sensitive and more likely on mobile than desktop

Fix:

- use the same timeout discipline already present in `resourceCache.fetchResource()` and parts of `unifiedDataLoader.js`
- do not block initial render on `quran.json` or Bangla translations
- load these after the main shell becomes interactive

### 4.5 Inconsistent update/reload policy across entry points

Severity: High

Where:

- `source/index.html`
- `source/plan.html`
- `source/quiz.html`

Problem:
Each entry point manages service-worker updates differently.

Observations:

- `plan.html` and `quiz.html` immediately message `SKIP_WAITING` during `updatefound`
- `index.html` relies on update notification and reload coordination logic
- `plan.html` and `quiz.html` use per-version sessionStorage dedup keys for reload suppression
- `index.html` does not use the same dedup scheme

Why this is a flaw:

- the same SW lifecycle event can produce different user behavior depending on the page
- fixes applied to one entry point can drift from the others
- update-loop and stale-controller bugs become harder to debug

Fix:

- extract a shared SW client coordinator module
- make reload, banner display, waiting-worker activation, and version dedup behavior consistent everywhere

### 4.6 Sequential, heavy service-worker install path

Severity: High

Where:

- `source/sw.js` install handler

Problem:
The install handler iterates the full `APP_SHELL` sequentially, including very large JSON assets.

Why this is a flaw:

- install duration becomes unnecessarily long
- one slow large fetch extends the total activation timeline
- the browser has to keep more work alive in one lifecycle window
- mobile Safari is particularly hostile to long-running install/update work

Fix:

- shrink the app shell dramatically
- if any non-shell bulk data needs optional background caching, schedule that after activation and only when the app is stable

### 4.7 Cache metrics are not trustworthy

Severity: Medium

Where:

- `source/resources/js/utils/resourceCache.js`

Problem:
Cache statistics are based on rough estimates:

- approximately 100 KB per IndexedDB record when not in memory
- approximately 80 KB per font

Why this is a flaw:

- numbers shown to users are not actual storage usage
- the values become especially misleading when large datasets are involved
- support and debugging are harder when the UI reports inaccurate cache health

Fix:

- use `navigator.storage.estimate()` for overall usage
- report exact cache counts separately from storage estimates
- stop presenting rough size estimates as if they are precise measurements

### 4.8 Cache version is duplicated by hand

Severity: Medium

Where:

- `source/sw.js`
- `source/resources/js/utils/resourceCache.js`
- version references across docs and metadata

Problem:
The cache version string is duplicated manually.

Why this is a flaw:

- drift is easy
- subtle version mismatch can break refresh behavior, stats, or invalidation logic

Fix:

- derive runtime version from a single generated source or small shared module
- if a build step is still intentionally avoided, create one canonical version file and import it from both SW and runtime modules

### 4.9 Monolithic main-page architecture

Severity: High

Where:

- `source/index.html`

Problem:
The main page contains too much critical application logic inline.

Why this is a flaw:

- harder to unit test boot behavior
- harder to isolate mobile-browser failures
- higher chance that one change destabilizes unrelated flows
- difficult to enforce shared patterns for timeout, update handling, or recovery

Fix:

- extract boot orchestration, persistence coordination, and SW client logic into dedicated modules
- keep HTML mostly declarative and let modules own runtime policy

## 5. iOS-Specific Critical Bugs Detected in This Audit

These are the issues most likely to correspond to the critical iOS user reports mentioned in the request.

### 5.1 Critical Bug A: Main page can freeze before the app fully mounts

Root cause:
`indexedDB.open()` in the main bootstrap has no timeout or fallback, while other parts of the codebase already assume iOS/WebKit can hang on IDB.

Why this is likely real:

- the repo already contains compensating logic for the same failure mode in `plan.html`, `resourceCache.js`, and `hotfix.html`
- those mitigations would not exist if the failure had never been observed
- the most exposed path, the main app bootstrap, still lacks the same guard

User-visible symptom:

- blank or perpetual loading state on iPhone/iPad
- reload may not help consistently

Fix:

- add a shared `openIndexedDBWithTimeout()` helper and use it everywhere

### 5.2 Critical Bug B: Infinite loading overlay on weak mobile networks

Root cause:
`initializeApp()` blocks on secondary fetches (`quran.json`, Bangla translation) that have no timeout and no non-blocking scheduling.

Why this is likely real:

- mobile Safari and WebViews are much more likely than desktop to leave fetches unresolved for long periods under radio/network transitions
- the code awaits these requests before clearing `isInitializing`

User-visible symptom:

- "Loading Murajah..." never disappears
- especially likely after network drop, captive portal, poor cellular connection, or app resume

Fix:

- move secondary fetches off the critical boot path
- use abortable fetches with a hard upper bound

### 5.3 Critical Bug C: iOS storage pressure and quota exhaustion risk

Root cause:
Large Quran data is cached in both SW Cache API and IndexedDB.

Why this is likely real:

- iOS storage quotas are tighter and eviction behavior is more aggressive
- the current architecture stores large structured data in multiple layers simultaneously
- updates and offline downloads amplify this cost

User-visible symptom:

- offline mode becomes inconsistent
- data appears to disappear after background eviction
- updates become flaky or stuck
- app behaves unpredictably after heavy offline use

Fix:

- designate one authoritative storage layer for structured data
- keep Cache API limited to shell and font/media responses

### 5.4 Critical Bug D: Update behavior diverges across pages and can surprise mobile users

Root cause:
The SW client-side reload/update policy differs between main, plan, and quiz pages.

Why this matters on iOS:

- BFCache and page restoration already complicate state
- differing reload policies increase the chance of loops, stale state, or inconsistent update experience

User-visible symptom:

- app refreshes unexpectedly on one page but not another
- page appears outdated until manual reload

Fix:

- centralize SW client coordination in one module used by all entry points

## 6. Better Target Architecture

This is the target architecture I would recommend for Murajah if the goal is professional-grade reliability on mobile browsers and iOS/Android WebViews.

### 6.1 Boot Model

Target principle:
The app becomes interactive quickly with a minimal boot path.

Boot stages:

1. HTML shell + critical JS + basic locale
2. open app state DB with timeout
3. restore lightweight settings and last-view context
4. load only current-layout core page/word data required for initial screen
5. render UI and hide loading state
6. background-load secondary datasets, tafsir, alternate layout, and optional offline bundles

### 6.2 Storage Model

Target principle:
One authoritative storage owner per data class.

Recommended ownership:

- Cache API: HTML, JS, CSS, icons, fonts, maybe immutable audio metadata responses
- IndexedDB: Quran structured datasets, tafsir, translations, user state, plans, notes, recordings
- memory: runtime indexes only

### 6.3 Update Model

Target principle:
Updates should be deliberate, centralized, and predictable.

Recommended behavior:

- shared SW client module for all pages
- one version source
- one banner policy
- one reload policy
- one recovery escalation path

### 6.4 Resilience Model

Target principle:
Every network and IDB operation in the critical path must be bounded.

Rules:

- every critical fetch gets a timeout
- every IDB open/read in boot gets a timeout or fallback
- non-critical work never blocks first render
- recovery UI appears instead of indefinite spinners

### 6.5 Test Model

Target principle:
Test what breaks in mobile reality, not only what is easy to mock.

Required coverage additions:

- real WebKit-compatible load-path tests
- BFCache restore tests
- offline-first and update-path tests
- quota and recovery-path tests
- device-matrix smoke coverage on real iOS hardware or device cloud

## 7. Professional-Standards Improvement Plan

### Phase 0: Stabilize the Current Architecture

Goal:
Eliminate the highest-risk failure modes without a full rewrite.

Tasks:

1. Add a shared IndexedDB open timeout helper and use it in `index.html`, `plan.html`, and any future entry page.
2. Remove `quran.json` and Bangla translation fetches from the blocking part of `initializeApp()`.
3. Add timeouts and `response.ok` checks to every remaining raw fetch in boot and post-boot critical flows.
4. Keep recovery links visible whenever initialization fails.

Expected result:
The app no longer gets trapped in infinite loading due to IDB stall or unbounded secondary fetches.

### Phase 1: Shrink and Correct the PWA Shell

Goal:
Make service-worker install fast and reliable on mobile.

Tasks:

1. Redefine `APP_SHELL` to include only minimal runtime shell assets.
2. Remove large Quran JSON and tafsir payloads from install-time precache.
3. Keep fonts cached via SW, but move large structured data to IndexedDB-only ownership.
4. Revisit `CRITICAL_RESOURCES` so they truly reflect only boot-critical assets.

Expected result:
Faster install, fewer update failures, lower storage pressure, cleaner invalidation behavior.

### Phase 2: Unify Data Ownership

Goal:
Remove duplicate storage and simplify offline behavior.

Tasks:

1. Make IndexedDB the sole structured-data cache.
2. Sunset legacy overlap between `quranCache` and `resourceCache`.
3. Add explicit versioning and migration policy for structured data.
4. Keep runtime indexes in memory only.

Expected result:
Lower quota risk, easier support, simpler cache-clearing semantics.

### Phase 3: Centralize Service-Worker Client Logic

Goal:
Make update behavior identical across entry points.

Tasks:

1. Extract SW client registration/update/reload code into a shared module.
2. Standardize banner, reload, waiting-worker, and controller-change behavior.
3. Add dedup keys consistently across all pages.
4. Remove dead or stale event paths such as client listeners that no longer match SW behavior.

Expected result:
Predictable updates, fewer reload races, easier future maintenance.

### Phase 4: Mobile-First Performance and Resilience Budget

Goal:
Define operational limits instead of relying on best effort.

Tasks:

1. Set maximum critical-boot payload budget.
2. Set maximum boot time budget on mid-tier mobile networks.
3. Set maximum offline-storage budget before warning or cleanup.
4. Add telemetry hooks or local diagnostic logging for boot failures, IDB timeouts, and SW activation failures.

Expected result:
The product becomes measurable and supportable instead of only debuggable by manual reproduction.

### Phase 5: Testing and Release Hardening

Goal:
Catch mobile-browser regressions before users do.

Tasks:

1. Add targeted PWA regression specs for install, update, offline open, cache clear, and recovery.
2. Add BFCache navigation tests.
3. Split audio tests into browser-appropriate suites.
4. Run a real iOS device smoke suite for release candidates.

Expected result:
Failures become visible in CI instead of in user reports.

## 8. Test Audit and Current Failures

### 8.1 How tests were run

The repository documents the pre-commit flow as:

`npm run test:unit && npm run test:e2e -- --workers=5`

That is the workflow used for this audit.

### 8.2 Unit test result

Result:
`npm run test:unit` passed.

Interpretation:
The core utility/testable logic is currently in good shape. The main weakness is not unit-level correctness; it is browser-runtime behavior under WebKit/mobile constraints.

### 8.3 Full pre-commit result

Result:
The full pre-commit workflow fails in E2E.

Primary confirmed failure:

- `tests/e2e/audioRecording.spec.js`
- WebKit project
- first concrete failure: `browserContext.grantPermissions: Unknown permission: microphone`

What this means:

- Chromium audio tests pass further into execution.
- WebKit audio tests fail at setup before meaningful app assertions run.
- The current test harness assumes microphone permission can be granted uniformly across projects, which is false in Playwright WebKit.

This is a real test-suite defect. It blocks trustworthy WebKit audio coverage and therefore masks actual iOS browser behavior.

### 8.4 Test-fix recommendation

Recommended fix for the failing test suite:

1. Split microphone-permission integration tests into Chromium-only coverage.
2. Keep WebKit audio tests focused on capability detection, UI fallbacks, and non-permission-dependent behavior.
3. Gate permission setup with browser support checks instead of unconditional `grantPermissions(['microphone'])`.

Suggested direction:

- Chromium: full recorder integration tests
- WebKit: compatibility smoke tests and graceful-degradation tests
- Vitest: MIME selection, blob conversion, state management, and playback error handling

### 8.5 Additional test gaps discovered during audit

Missing or insufficiently covered scenarios:

1. Main-page IndexedDB open timeout failure path.
2. Infinite-loader prevention when secondary fetches hang.
3. App open after service-worker update while offline.
4. Quota-pressure or storage-estimate behavior.
5. Recovery flow from `hotfix.html`.
6. Shared SW client behavior consistency across `index.html`, `plan.html`, and `quiz.html`.

## 9. Actionable Bug Reports With Fixes

### Bug Report 1: Main app can stall forever before mount on iOS

Severity: Critical

Symptoms:

- initial loader never goes away
- app appears frozen on iPhone/iPad

Probable root cause:
unbounded `indexedDB.open()` in `source/index.html`

Fix:

- extract and use shared timeout-based DB open helper
- show recoverable error UI if timeout is hit

### Bug Report 2: Initialization can block forever on secondary resource fetches

Severity: Critical

Symptoms:

- spinner persists indefinitely
- more likely on poor mobile networks

Probable root cause:
`quran.json` and Bangla translation fetches in `initializeApp()` are awaited without timeout

Fix:

- move them off the critical path
- make them abortable and best-effort

### Bug Report 3: Offline architecture is over-cached and storage-heavy

Severity: Critical on iOS, High elsewhere

Symptoms:

- inconsistent offline reliability over time
- possible storage eviction or quota problems

Probable root cause:
large Quran data cached in both service-worker cache and IndexedDB

Fix:

- choose one authoritative storage layer for structured data
- slim SW cache to shell/fonts only

### Bug Report 4: WebKit audio E2E coverage is currently broken

Severity: High for CI confidence, not a production app bug by itself

Symptoms:

- `audioRecording.spec.js` fails in WebKit immediately
- pre-commit E2E suite reports failures

Root cause:
Playwright WebKit does not accept unconditional microphone permission grant in the current test setup

Fix:

- split browser-specific test responsibilities
- gate or skip unsupported permission flows in WebKit

## 10. Final Recommendation

Murajah should keep its local-first, offline-capable product direction, but it should stop treating the entire data corpus as part of the app shell. The current architecture already includes many smart defensive decisions, which means the right engineering instinct is present. The remaining work is to simplify ownership, bound all critical-path I/O, and make mobile-browser behavior consistent.

If only a small amount of work can be done next, the highest-value sequence is:

1. Fix main-page IDB timeout handling.
2. Remove raw secondary fetches from the blocking boot path.
3. Shrink the service-worker app shell.
4. Eliminate duplicate large-data caching.
5. Fix the WebKit audio test harness so release confidence improves.

That combination would address the most credible iOS failures, materially improve startup reliability on mobile browsers, and move the PWA much closer to a professional-grade operational baseline.
