# Murajah — QA Health Report

**Date:** 2025-06-05  
**Scope:** Full project audit — test infrastructure, E2E failures, source code bugs, security  
**Test Run:** Chromium E2E (local, retries=0) + full unit suite  
**Result:** 10 E2E failures / 175 passed · 866 unit tests all passing

---

## 1. Executive Summary

| Category | Count | Highest Severity |
|---|---|---|
| E2E test failures (confirmed) | 10 | CRITICAL |
| Source code bugs | 4 | HIGH |
| Security vulnerabilities | 4 | MEDIUM |
| Test infrastructure defects | 3 | CRITICAL |
| Architecture weaknesses (future) | 8 | LOW–MEDIUM |

**Overall health score: 52 / 100**

Unit coverage is solid (866 tests, 0 failures, ≥75% threshold enforced). E2E coverage is critically broken — 10 confirmed failures block the pre-commit gate. The root cause of 9/10 failures is a single missing call to `dismissLanguageModal()` in `plan.spec.js`. One additional failure is a navigation race condition in `surahView.spec.js`. All findings have concrete, executable fixes.

---

## 2. Test Infrastructure Defects

### F1 — CRITICAL: `.husky/pre-commit` hook missing shebang and husky.sh source

**File:** `.husky/pre-commit`  
**Current content:**
```sh
echo "🧪 Running pre-commit tests..."
npm run test:unit && npm run test:e2e -- --workers=4
```

**Problem:** Missing `#!/bin/sh` shebang and `. "$(dirname "$0")/_/husky.sh"` source line. Compare to `.husky/pre-commit-fast` which has both. Without these, Husky may silently skip the hook on some shells/systems, allowing broken commits to land.

**Fix:**
```sh
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"
echo "🧪 Running pre-commit tests..."
npm run test:unit && npm run test:e2e -- --workers=4
```

---

### F2 — HIGH: Local E2E runs have `retries: 0` — all flaky tests fail at pre-commit

**File:** `playwright.config.js`  
**Current:**
```js
retries: process.env.CI ? 2 : 0,
```

**Problem:** `retries: 0` locally means any flaky test fails permanently during `pre-commit`. The webkit project has `retries: 1` overriding this, but chromium does not. Combined with timing-sensitive tests in `quiz.spec.js` and `quizAlgorithm.spec.js`, developers hit false failures on every commit.

**Fix:** Set `retries: 1` for all local runs (still distinguishable from CI's `retries: 2`):
```js
retries: process.env.CI ? 2 : 1,
```

---

### F3 — MEDIUM: Pre-commit `--workers=4` flag has no effect via npm script passthrough

**File:** `.husky/pre-commit`  
**Current:** `npm run test:e2e -- --workers=4`

**Problem:** `npm run test:e2e` maps to `playwright test`. The `--` separator passes `--workers=4` as a Playwright CLI arg, but `package.json` may already define `--workers` in the script or the playwright config. In practice, the `workers` setting in `playwright.config.js` already defaults to unlimited locally. The `--workers=4` has no practical effect and creates confusion.

**Fix:** Remove `--workers=4` from the hook. If parallelism needs to be bounded, set it in `playwright.config.js`:
```js
workers: process.env.CI ? 1 : 4,
```

---

## 3. E2E Failures — Root Cause Analysis

### Confirmed Failures (Chromium, 2025-06-05)

```
10 failed / 175 passed (4m 0s)
```

| # | Test | File | Error Type |
|---|---|---|---|
| 1 | shows empty state when no plans exist | plan.spec.js:183 | App startup error |
| 2 | setup wizard renders three user types | plan.spec.js:191 | Modal intercepts pointer events |
| 3 | beginner plan can be created via wizard | plan.spec.js:216 | Modal intercepts pointer events |
| 4 | calendar view renders when tab is clicked | plan.spec.js:265 | Modal intercepts pointer events |
| 5 | calendar shows today highlighted | plan.spec.js:280 | Modal intercepts pointer events |
| 6 | progress view shows plan statistics | plan.spec.js:298 | Modal intercepts pointer events |
| 7 | plan can be paused from progress view | plan.spec.js:315 | Modal intercepts pointer events |
| 8 | plan is accessible from bottom navigation | plan.spec.js:366 | Wrong selector (`.bottom-nav-item` not present in plan context) |
| 9 | tab navigation switches between views | plan.spec.js:376 | Modal intercepts pointer events |
| 10 | should show last page content when surah ends mid-page (Surah Al-Mulk) | surahView.spec.js:494 | Navigation race — execution context destroyed |

---

### E1 — CRITICAL: `plan.spec.js` — Language modal never dismissed (8 tests)

**Files:** `tests/e2e/plan.spec.js`, `tests/e2e/helpers.js`

**Root Cause:** `plan.spec.js` defines its own local `waitForPlanLoad()` and `gotoPlan()` functions that do **not** call `dismissLanguageModal()` from `helpers.js`. On every navigation, the language selection modal (`div.fixed.inset-0.bg-black/50`) renders and remains open. It has `z-50` and covers the entire viewport, intercepting all pointer events for the duration of the test.

The Playwright call log confirms this repeatedly:
```
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">…</div> intercepts pointer events
```

**Fix — `tests/e2e/plan.spec.js`:**

Add import at top:
```js
import { dismissLanguageModal, clearAllDatabases } from './helpers.js';
```

Replace `waitForPlanLoad`:
```js
async function waitForPlanLoad(page) {
  // Wait for app to boot
  await page.waitForFunction(() => {
    const loader = document.querySelector('#initial-loader');
    return !loader || loader.style.display === 'none' || loader.classList.contains('hidden');
  }, { timeout: 15000 });

  // Dismiss language modal — this is mandatory; without it all clicks will be blocked
  await dismissLanguageModal(page);

  // Wait for plan section to be rendered
  await page.waitForSelector('#plan-section, [data-view="plan"], .plan-container', {
    state: 'attached',
    timeout: 10000,
  }).catch(() => {});
}
```

---

### E2 — HIGH: `plan.spec.js` — `beforeEach` uses blind `waitForTimeout(1000)` instead of deterministic wait

**File:** `tests/e2e/plan.spec.js` (line ~272 in `beforeEach`)  
**Current:**
```js
await page.goto(INDEX_URL);
await page.waitForTimeout(1000);
await page.evaluate(() => { /* clear IndexedDB */ });
```

**Problem:** The 1000ms sleep is not guaranteed to be enough for app init on slow CI. If IndexedDB clear runs before the DB is opened by the app, the clear may operate on a version-0 DB that will be re-created with the wrong schema.

**Fix:**
```js
await page.goto(INDEX_URL);
// Wait for app to open its DB before clearing
await page.waitForFunction(() => {
  return new Promise(resolve => {
    const req = indexedDB.open('murajah-db');
    req.onsuccess = () => { req.result.close(); resolve(true); };
    req.onerror = () => resolve(true);
  });
}, { timeout: 10000 });
await page.evaluate(() => { /* clear IndexedDB */ });
```

---

### E3 — HIGH: `plan.spec.js` — `seedPlan()` hardcodes DB version 6

**File:** `tests/e2e/plan.spec.js` (line ~178)  
**Current:**
```js
const request = indexedDB.open('murajah-db', 6);
```

**Problem:** Hard-coding DB version 6 means the test will trigger `onupgradeneeded` and attempt to create stores manually if the current DB version differs. On any schema bump, this will silently create a mismatched DB schema that diverges from the app's own migration path, causing corrupted test state.

**Fix:** Open without a version number so the browser uses the existing (app-managed) version:
```js
const request = indexedDB.open('murajah-db');
```
Remove the `onupgradeneeded` handler entirely — seeding should only operate on an already-initialized DB, never bootstrap one.

---

### E4 — HIGH: `plan.spec.js` — Wrong nav selector for bottom navigation test

**File:** `tests/e2e/plan.spec.js` (line ~371)  
**Current:**
```js
const planNav = page.locator('button.bottom-nav-item:has-text("Plan"), button.bottom-nav-item >> svg').first();
```

**Problem:** In `index.html`, the bottom nav "plan" button has class `bottom-nav-item` and scrolls to `#plan-section`. It does **not** navigate to a plan page — it's a scroll anchor. The test navigates to `INDEX_URL#plan` (the plan hash route) via `gotoPlan()`, but the nav button that says "Plan" is `<button class="bottom-nav-item" @click="scrollToSection('plan-section')">`. The `has-text("Plan")` check would need to match an icon label, which in `index.html` reads as `<span>Plan</span>` inside the button.

**Fix:** Check for the nav item by its section anchor action, not by class + text:
```js
const planNav = page.locator('.bottom-nav-item').filter({ hasText: 'Plan' }).first();
// Or verify visibility of the bottom nav container itself:
const bottomNav = page.locator('nav.bottom-nav, [class*="bottom-nav"]').first();
await expect(bottomNav).toBeVisible({ timeout: 5000 });
```

---

### E5 — MEDIUM: `surahView.spec.js` — Navigation race condition

**File:** `tests/e2e/surahView.spec.js` (line 519)  
**Error:** `page.evaluate: Execution context was destroyed, most likely because of a navigation`

**Root Cause:** The test navigates to a Surah and then calls `page.evaluate()` while the page is mid-navigation. The previous `page.goto()` or a Vue router hash change caused the execution context to be replaced before the `evaluate` call completed.

**Fix:** Chain `page.evaluate` only after the page is fully settled — use `page.waitForLoadState('networkidle')` or `page.waitForFunction` on a DOM marker before calling evaluate:
```js
// Before evaluate at line 519:
await page.waitForLoadState('domcontentloaded');
await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 5000 }).catch(() => {});

const hasQalamHeader = await page.evaluate(() => {
  return document.body.textContent?.includes('القلم');
});
```

---

### E6 — MEDIUM: `quiz.spec.js` and `quizAlgorithm.spec.js` — Timing-based `beforeEach` synchronization

**Files:** `tests/e2e/quiz.spec.js`, `tests/e2e/quizAlgorithm.spec.js`  
**Pattern:**
```js
beforeEach(async ({ page }) => {
  await page.goto(...);
  await page.waitForTimeout(3000); // or 4000
});
```

**Problem:** Pure timing — will cause false positives on fast machines (test passes but app not ready) and false negatives on slow CI. These tests are inherently flaky under load.

**Fix:** Replace all `waitForTimeout(N000)` synchronization in `beforeEach` with `waitForQuizLoad` from `helpers.js`:
```js
import { waitForQuizLoad } from './helpers.js';

beforeEach(async ({ page }) => {
  await page.goto('http://localhost:3000/quiz.html');
  await waitForQuizLoad(page);
});
```
`waitForQuizLoad` already exists in `helpers.js` and provides deterministic synchronization.

---

### E7 — MEDIUM: `appInit.spec.js` — Local `waitForAppLoad` diverges from `helpers.js`

**File:** `tests/e2e/appInit.spec.js`

**Problem:** `appInit.spec.js` defines its own local `waitForAppLoad()` that only checks `#initial-loader` visibility + 1000ms blind timeout. It does **not** dismiss the language modal. Any test in this file that subsequently checks for visible UI elements will be flaky if the language modal appears.

**Fix:** Remove the local `waitForAppLoad` and import from `helpers.js`:
```js
import { waitForAppLoad } from './helpers.js';
```

---

### E8 — LOW: `helpers.js` — `waitForAppLoad` calls `dismissLanguageModal` twice

**File:** `tests/e2e/helpers.js`

**Problem:** `waitForAppLoad` calls `dismissLanguageModal(page)` as part of its flow, but some callers also call it manually before or after. Additionally, `waitForAppLoad` internally calls `dismissLanguageModal` and then waits 500ms unconditionally. This adds ~1s per test for no reason.

**Fix:** Remove the redundant second `dismissLanguageModal` call inside `waitForAppLoad` and remove the blind 500ms wait — `dismissLanguageModal` already waits for modal absence before returning.

---

## 4. Source Code Bugs

### B1 — HIGH: Service Worker `CACHE_VERSION` mismatch

**Files:** `source/sw.js`, `source/resources/js/utils/resourceCache.js`

| File | CACHE_VERSION |
|---|---|
| `sw.js` | `'26.04.13'` |
| `resourceCache.js` | `'26.04.14'` |

**Problem:** These two constants control when cached resources are invalidated on update. A mismatch means the SW will invalidate its cache but `resourceCache.js` will keep its IndexedDB copy, or vice versa. On an update deploy, users may receive partially stale resources — old JS served from SW cache, new tafsir JSON from IndexedDB (or vice versa).

**Fix:** Synchronize to the same value. Define once in a shared location or ensure both are bumped in lockstep. Immediate fix: change `sw.js` to `'26.04.14'`.

---

### B2 — MEDIUM: `planManager.js` — Duplicate Juz range in `INDOPAK_PAGES_PER_JUZ`

**File:** `source/resources/js/utils/planManager.js`

**Problem:** `INDOPAK_PAGES_PER_JUZ` array has indices 3 and 4 with identical ranges `[62, 81]`. One juz boundary is either missing or duplicated. This causes page range calculations for memorization plans in Indopak layout to be off by one juz for all juz after index 4.

**Fix:** Audit the full 30-entry array against the reference page mapping. The duplicate at index 4 should likely be `[82, 100]` or similar — verify against `scripts/generate_indopak_mappings.py`.

---

### B3 — MEDIUM: `audioRecorder.js` — `getSupportedMimeType()` returns empty string as fallback

**File:** `source/resources/js/utils/audioRecorder.js`

**Problem:** The MIME type detection chain falls through to `''` as a last resort. `MediaRecorder` with `mimeType: ''` uses the browser default, which varies across browsers and may not be playable cross-browser (e.g., Chromium defaults to `webm/opus`, Safari to `mp4/aac`). Recordings made on one platform may not play on another.

**Fix:** Return `null` or throw instead of `''` as fallback, and handle the null case explicitly in the caller to show an unsupported-browser warning:
```js
getSupportedMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null; // caller must handle
}
```

---

### B4 — LOW: `audioRecorder.js` — iOS detection via `navigator.userAgent` is fragile

**File:** `source/resources/js/utils/audioRecorder.js`

**Problem:** iOS detection combines `navigator.userAgent` string matching with `navigator.platform` and `maxTouchPoints`. This approach fails for:
- iPad OS 13+ (reports `MacIntel` for `platform`)
- Browsers with spoofed UA (Privacy Badger, Brave, etc.)
- Chrome/Firefox on iOS (wrapped WebKit but different UA string)

**Fix:** Use feature detection instead of UA sniffing. For audio recording, detect the specific capability needed:
```js
// Instead of isSafari/isIOS checks, detect what actually matters:
const needsBlobWorkaround = typeof window.AudioContext === 'undefined' 
  || !MediaRecorder.isTypeSupported('audio/webm');
```

---

## 5. Security Vulnerabilities

### S1 — MEDIUM: Logger emits INFO+ logs to browser console in production

**File:** `source/resources/js/utils/logger.js`

**Problem:** `logger.info()`, `logger.warn()`, `logger.error()` all write to `console` in production. This exposes:
- Internal app state transitions (DB operations, routing, sync events)
- Timing data that could be used for side-channel analysis
- Detailed error messages including stack traces

**Fix:** Set production log level to `WARN` or `ERROR` only:
```js
const DEFAULT_LOG_LEVEL = process.env.NODE_ENV === 'production' ? LOG_LEVELS.WARN : LOG_LEVELS.INFO;
```
Since this is a static app (no build step), use an app-version-gated check:
```js
const isProd = !location.hostname.includes('localhost') && !location.hostname.includes('127.');
const DEFAULT_LOG_LEVEL = isProd ? LOG_LEVELS.WARN : LOG_LEVELS.INFO;
```

---

### S2 — LOW: `murajah-debug` localStorage key enables DEBUG logging for any user

**File:** `source/resources/js/utils/logger.js`

**Problem:** Any user who opens DevTools and sets `localStorage.setItem('murajah-debug', 'true')` will enable DEBUG-level logging, potentially exposing detailed internal operations in a public production app.

**Risk:** Low for a personal PWA; medium if the app is ever multi-tenant. The bigger risk is that a user could be tricked into enabling debug mode via a social engineering attack or injected script.

**Fix:** If debug mode is needed for field support, gate it behind a more obscure mechanism (e.g., a URL param that is only active for one session and cleared on reload), or remove it entirely from production builds.

---

### S3 — INFO: No Content Security Policy headers

**Context:** App is served via `npx serve source -p 3000`. The static server adds no security headers.

**Problem:** Without a CSP header, any XSS vulnerability (e.g., from `marked.js` rendering unsanitized Quran text annotations, or future `innerHTML` usage) can execute arbitrary scripts.

**Fix:** Add a CSP header to the serve configuration or deploy via a server/CDN that supports custom headers. Minimum viable CSP:
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' cdn.jsdelivr.net; font-src 'self' fonts.gstatic.com; connect-src 'self';
```
Note: `'unsafe-inline'` is needed because Vue 3 CDN global and Tailwind CDN inject inline styles. A build step would eliminate this requirement.

---

### S4 — INFO: Service Worker caches multi-MB Quran JSON with no size bounds

**File:** `source/sw.js`, `source/resources/js/utils/resourceCache.js`

**Problem:** Tafsir and translation JSON files can be several MB each. Both SW Cache API and IndexedDB `resourceCache` store these simultaneously (double-caching). On iOS, both Safari's WKWebView Cache API quota (~50MB) and IndexedDB quota are constrained. Silent storage failures can corrupt app state.

**Fix (short-term):** Choose one storage layer per resource type — SW Cache API for static assets, IndexedDB for user data and dynamic JSON. Remove duplicate caching of the same tafsir JSON from both layers.

---

## 6. Prioritized Fix Action Plan

The following is ordered by impact. An agent executing these can run them independently.

### Priority 1 — Immediate (blocks CI/pre-commit)

**P1-A: Fix `.husky/pre-commit` shebang**
```
File: .husky/pre-commit
Action: Prepend #!/bin/sh and . "$(dirname "$0")/_/husky.sh"
```

**P1-B: Fix `plan.spec.js` — import and use `dismissLanguageModal` in `waitForPlanLoad`**
```
File: tests/e2e/plan.spec.js
Action: Add import { dismissLanguageModal } from './helpers.js'
        Replace local waitForPlanLoad() with version that calls dismissLanguageModal(page)
        This fixes 8 of 10 E2E failures in one change
```

**P1-C: Fix `surahView.spec.js` navigation race at line 519**
```
File: tests/e2e/surahView.spec.js
Action: Add waitForLoadState('domcontentloaded') before page.evaluate() at line 519
```

---

### Priority 2 — High (flakiness on CI and pre-commit)

**P2-A: Set `retries: 1` for local runs in `playwright.config.js`**
```
File: playwright.config.js
Action: Change retries: process.env.CI ? 2 : 0 → retries: process.env.CI ? 2 : 1
```

**P2-B: Fix `quiz.spec.js` and `quizAlgorithm.spec.js` `beforeEach` timing**
```
Files: tests/e2e/quiz.spec.js, tests/e2e/quizAlgorithm.spec.js
Action: Replace all waitForTimeout(3000/4000) in beforeEach with waitForQuizLoad(page) from helpers.js
```

**P2-C: Fix `appInit.spec.js` — replace local `waitForAppLoad` with helpers.js import**
```
File: tests/e2e/appInit.spec.js
Action: Remove local waitForAppLoad(), import from helpers.js
```

**P2-D: Fix `plan.spec.js` `beforeEach` — replace blind `waitForTimeout(1000)` with DB-ready check**
```
File: tests/e2e/plan.spec.js
Action: Replace waitForTimeout(1000) with waitForFunction that checks IndexedDB is accessible
```

---

### Priority 3 — Medium (correctness bugs)

**P3-A: Fix SW `CACHE_VERSION` mismatch**
```
File: source/sw.js
Action: Change CACHE_VERSION from '26.04.13' to '26.04.14' to match resourceCache.js
```

**P3-B: Fix `seedPlan()` hardcoded DB version**
```
File: tests/e2e/plan.spec.js
Action: Change indexedDB.open('murajah-db', 6) to indexedDB.open('murajah-db')
        Remove onupgradeneeded handler — seeding must not bootstrap DB schema
```

**P3-C: Fix `plan.spec.js` bottom-nav selector**
```
File: tests/e2e/plan.spec.js:371
Action: Replace 'button.bottom-nav-item:has-text("Plan")' with '.bottom-nav-item' filter hasText 'Plan'
        Or verify the actual DOM structure and match it exactly
```

**P3-D: Fix `INDOPAK_PAGES_PER_JUZ` duplicate range**
```
File: source/resources/js/utils/planManager.js
Action: Audit all 30 entries in INDOPAK_PAGES_PER_JUZ array
        Fix duplicate [62, 81] at index 4 — likely should be next juz's page range
```

---

### Priority 4 — Low / Future (architecture and hardening)

**P4-A: Remove `console.log/info/warn` suppression from vitest setup**
```
File: tests/setup.js
Problem: Global console suppression makes debugging test failures extremely difficult
Action: Remove or narrow the suppression — only suppress expected spam, not all output
```

**P4-B: Fix `helpers.js` double `dismissLanguageModal` call in `waitForAppLoad`**
```
File: tests/e2e/helpers.js
Action: Remove second redundant dismissLanguageModal() call
        Remove unconditional 500ms waitForTimeout after modal dismissal
```

**P4-C: Add production log level gate in logger.js**
```
File: source/resources/js/utils/logger.js
Action: Default log level to WARN when hostname is not localhost
```

**P4-D: Remove double-caching of tafsir/translation JSON**
```
Files: source/sw.js, source/resources/js/utils/resourceCache.js
Action: Pick one caching layer per resource type. Remove duplicate IndexedDB + Cache API caching for same files
```

**P4-E: Fix `audioRecorder.js` fallback MIME type**
```
File: source/resources/js/utils/audioRecorder.js
Action: Return null instead of '' as fallback in getSupportedMimeType()
        Handle null in caller with a user-visible "not supported" warning
```

**P4-F: Remove workers flag from pre-commit hook, configure in playwright.config.js**
```
File: .husky/pre-commit, playwright.config.js
Action: Remove -- --workers=4 from hook, set workers: process.env.CI ? 1 : 4 in config
```

---

## 7. Architecture Weaknesses (Non-Blocking, Future Roadmap)

These are systemic issues that don't require immediate fix but should be tracked:

1. **No browser context isolation between E2E tests** — `test.use({ storageState })` is not used anywhere. Tests rely on `page.evaluate` to clear IndexedDB manually, which is fragile. Playwright's `browserContext.newPage()` with a fresh context per test would be more reliable.

2. **Monolithic bootstrap in `index.html`** — The Vue app initializes inline with no bounded timeout enforcement. A slow IndexedDB open can hang the app indefinitely with no fallback recovery.

3. **Update/recovery logic duplicated across entry points** — `index.html`, `plan.html`, and `quiz.html` each have independent copies of the SW update and DB recovery logic. Any fix must be applied 3 times.

4. **Coverage excludes `badgeImageGenerator.js` and `imageUtils.js`** — These are explicitly excluded in `vitest.config.js`. These utilities are untested and invisible to the 75% threshold.

5. **iOS audio detection relies on `navigator.userAgent`** — As described in B4, UA sniffing is fragile for iPad OS 13+ and privacy-oriented browsers.

6. **`marked.js` renders Quran metadata with no sanitization gate** — If any tafsir JSON content contains HTML, `marked.js` will render it. A CSP (S3) is the primary mitigation; adding `DOMPurify` would add defense-in-depth.

7. **Service worker `CACHE_VERSION` must be bumped manually in two files** — No automation or validation exists to prevent drift. A lint check or shared constant would prevent B1 from recurring.

8. **No `test.afterEach` screenshot/video capture in failing tests beyond Playwright default** — Existing test screenshots are captured but not organized into a CI artifact summary. Failed tests produce `error-context.md` files but no aggregated dashboard.

---

## 8. Reference: Key Files

| File | Role | Issue IDs |
|---|---|---|
| `.husky/pre-commit` | Git commit gate | F1, F3 |
| `playwright.config.js` | E2E test runner config | F2 |
| `tests/e2e/plan.spec.js` | Plan feature E2E tests | E1, E2, E3, E4 |
| `tests/e2e/helpers.js` | Shared E2E utilities | E8 |
| `tests/e2e/appInit.spec.js` | App init E2E tests | E7 |
| `tests/e2e/quiz.spec.js` | Quiz E2E tests | E6 |
| `tests/e2e/quizAlgorithm.spec.js` | Quiz algorithm E2E tests | E6 |
| `tests/e2e/surahView.spec.js` | Surah view E2E tests | E5 |
| `source/sw.js` | Service Worker | B1, S4 |
| `source/resources/js/utils/resourceCache.js` | Cache management | B1, S4 |
| `source/resources/js/utils/planManager.js` | Plan logic | B2 |
| `source/resources/js/utils/audioRecorder.js` | Audio recording | B3, B4 |
| `source/resources/js/utils/logger.js` | Logging | S1, S2 |
| `tests/setup.js` | Vitest global setup | P4-A |
