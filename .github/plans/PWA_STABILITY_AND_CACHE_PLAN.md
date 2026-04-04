# PWA Stability, Cache Accuracy & Service Worker Fixes — v26.05

> **Date:** 2026-04-03
> **Status:** DRAFT — Awaiting manual review before implementation
> **Scope Mode:** HOLD SCOPE — Bug fixes, accuracy improvements, and reliability hardening
> **Prior Plans:** MOBILE_UX_IMPROVEMENT_PLAN (✅ fully implemented, removed), NAVIGATION_IMPROVEMENT_PLAN (✅ fully implemented, removed)

---

## Table of Contents

1. [System Audit](#1-system-audit)
2. [Step 0: Scope Challenge](#2-step-0-scope-challenge)
3. [Bug Reports](#3-bug-reports)
4. [Architecture & Data Flow](#4-architecture--data-flow)
5. [Error & Rescue Map](#5-error--rescue-map)
6. [Implementation Tasks](#6-implementation-tasks)
7. [Test Plan](#7-test-plan)
8. [Carried-Forward Items](#8-carried-forward-items)
9. [NOT in Scope](#9-not-in-scope)
10. [QA Pre-Assessment](#10-qa-pre-assessment)
11. [Completion Summary](#11-completion-summary)

---

## 1. System Audit

### 1.1 Recent Git History

```
d212593 (HEAD, tag: 26.04.03) bump version update readme
7590962 Merge pull request #2 from wasi0013/dev
e9ab6b6 fix: merge duplicate watch declarations in NotesComponent
d07ad00 hide the unnecessary top nav on mobile
f20f80f improve navigation
078a066 improve nav
7b4e394 fix test bugs
5721131 add sheikh luhaidan
60d2708 add Sheikh luhaidaan's verse by verse beta
24dc0d9 hotfix
fa1838b remove annoying banner  ← directly related to refresh banner issue
b14d753 menu touch fix
4cc01c1 add refresh button
397a801 critical bug fix
```

**Pattern:** Commit `fa1838b remove annoying banner` confirms the refresh banner has been a recurring pain point — it was literally removed at one point due to annoyance, and is still misbehaving.

### 1.2 Current State

- **Branch:** master (clean, no uncommitted changes, no stashes)
- **Unit tests:** 655 passing (17 test files), 676ms
- **No TODO/FIXME markers** in source code (only in vendor libs)
- **Outstanding PERFORMANCE_ISSUES_PHASE2.md:** Issues #3-#7 remain (quiz timer leak, 3s delay, morphology preloader, quiz surah selection, audio player sort)

### 1.3 Prior Plans — Disposition

| Plan | Items | Status | Action |
|------|-------|--------|--------|
| MOBILE_UX_IMPROVEMENT_PLAN | 8 items | 8/8 implemented ✅ | **Removed** |
| NAVIGATION_IMPROVEMENT_PLAN | 6 items | 5/6 implemented, 1 partial | **Removed** |

**Partial item carried forward:** Swipe performance micro-optimizations (DB write guard on hot path, updateURL deduplication) — see Task 5 below.

---

## 2. Step 0: Scope Challenge

### 2.1 What is the actual problem?

Four user-facing bugs that erode trust in the PWA:

1. **Safari crashes on refresh** — "response served by the service worker has redirections" kills the page
2. **Refresh banner won't go away** — Shows repeatedly even after the user explicitly refreshed
3. **Offline stats are wrong** — Numbers in settings are based on rough estimates, not real data
4. **Clear cache is incomplete** — Doesn't clear the SW main cache, leaving stale resources

### 2.2 Premise Challenge

**Q: Is this the right work to do?**
Yes. These are trust-destroying bugs. A user who sees inaccurate stats loses confidence in offline mode. A user who can't reload on Safari will abandon the app. A banner that nags after refresh trains users to ignore all notifications.

**Q: What if we did nothing?**
Users on iOS Safari would continue to get blocked from reloading. The refresh banner would continue to annoy. Users would see fake cache stats. Real pain.

### 2.3 What already exists?

| Sub-problem | Existing Code | Issue |
|-------------|--------------|-------|
| Redirect stripping | `sw.js` install handler (line 368) + `staleWhileRevalidate()` (line 198) | Strips redirects for new responses, but cached responses from before can still be redirected |
| Version check | `resourceCache.needsVersionRefresh()` | Never clears unless `preloadAllResources()` is called |
| Cache stats | `resourceCache.getCacheStats()` | Uses ~100KB/record and 80KB/font estimates instead of real sizes |
| Clear cache | `resourceCache.clearAll()` | Doesn't clear SW main cache (`murajah-cache-v*`) |
| SW cache status | `window.swGetCacheStatus()` | Exists but not used in stats display |
| Update banner | `window.showUpdateNotification()` | No dedup, no cooldown, 3 independent triggers |

### 2.4 Minimum changes to fix all 4 bugs

**6 files touched** (under 8-file threshold):

| File | Change Type |
|------|-------------|
| `source/sw.js` | Fix redirect handling for cached responses on navigation |
| `source/index.html` | Fix banner logic, fix stats display, fix clear cache, fix refresh |
| `source/resources/js/utils/resourceCache.js` | Accurate stats, version save on refresh, clearAll clears SW cache |
| `tests/unit/resourceCache.test.js` | New: test stats accuracy, clear cache completeness (if needed) |
| `tests/e2e/pwa.spec.js` | Update existing PWA tests for new behavior |
| `source/resources/js/PERFORMANCE_ISSUES_PHASE2.md` | Update resolved items |

No new classes, no new abstractions, no new files beyond test files.

### 2.5 Dream State Mapping

```
  CURRENT STATE                       THIS PLAN                          12-MONTH IDEAL
  ┌────────────────────┐             ┌──────────────────────┐           ┌──────────────────────┐
  │ Safari reload crash │            │ Clean cached resp.   │           │ Bulletproof PWA       │
  │ Banner nag loop     │  ───────►  │ Banner shows 1x only │  ──────► │ Background updates    │
  │ Fake cache stats    │            │ Real byte sizes      │           │ Delta updates (diffs) │
  │ Incomplete clear    │            │ Full cache clear     │           │ Storage quota mgmt    │
  └────────────────────┘             └──────────────────────┘           └──────────────────────┘
```

---

## 3. Bug Reports

### BUG-1: Safari "response served by the service worker has redirections"

**Severity:** 🔴 Critical
**Location:** `source/sw.js` — `staleWhileRevalidate()` (line 175-232) + install handler (line 354-400)
**Affects:** iOS Safari users on page refresh/reload

**Root Cause Analysis:**

The service worker caches `'./'` during install. On most servers (including Cloudflare Pages), requesting `./` redirects to `./index.html`. The install handler creates a "clean" response via `new Response(blob)` (line 368-373), but stores it under the key `'./'`.

When Safari navigates to `./`:
1. SW intercepts the navigation request
2. `staleWhileRevalidate()` finds the cached response for `'./'`
3. Returns it directly (line 232)
4. Safari checks: the original request was for `./`, the response was synthesized from a redirect chain
5. Safari rejects: "response served by the service worker has redirections"

**Why Chrome doesn't crash:** Chrome is more lenient about returning synthesized responses for navigation requests. Safari strictly enforces the spec.

**Additional risk:** The `CONTENT_UPDATED` background fetch (line 188-217) re-caches HTML responses. If `./` is fetched in the background and the server redirects, the new response may be cached as a redirect even with the stripping logic, because `request.destination` may not equal `'document'` for a non-navigation background fetch.

**Fix approach:**
1. In the fetch handler, for navigation requests to `./` or the root, rewrite the cache lookup to check `./index.html` as well
2. Add a guard: if the cached response has `redirected === true`, fall through to network
3. In the install handler, cache `./` content under BOTH `./` and `./index.html` keys
4. Add `redirect: 'manual'` awareness for navigation requests

```
  NAVIGATION REQUEST: './'
    │
    ├── Check cache for './'
    │   ├── Found + NOT redirected → return cached ✅
    │   ├── Found + redirected → SKIP, try './index.html' ⚠️ (NEW)
    │   └── Not found → try './index.html' (NEW)
    │
    ├── Check cache for './index.html'
    │   ├── Found → return it ✅ (NEW)
    │   └── Not found → fall to network
    │
    └── Network fetch (existing)
```

---

### BUG-2: Refresh banner shows repeatedly after refresh

**Severity:** 🟡 Medium
**Location:** `source/index.html` — lines 3258-3264 (needsVersionRefresh), 10255-10265 (updatefound), 10298-10304 (CONTENT_UPDATED)
**Affects:** All users on every page load

**Root Cause Analysis:**

Three independent triggers all call `window.showUpdateNotification()`:

```
  APP STARTUP
    │
    ├── Trigger 1: needsVersionRefresh()          ← line 3258
    │   Compares stored version vs CACHE_VERSION
    │   Problem: Version is ONLY saved to IndexedDB inside preloadAllResources()
    │   So after a normal refresh, the stored version is STILL old, and this
    │   trigger fires AGAIN on the next page load.
    │
    ├── Trigger 2: SW updatefound → statechange   ← line 10258
    │   Fires when a new SW installs. This is correct behavior when there's
    │   actually a new SW. But combined with Trigger 1, creates double-fire.
    │
    └── Trigger 3: CONTENT_UPDATED message         ← line 10298
        SW sends this every time stale-while-revalidate fetches HTML in background
        and successfully caches it. Problem: this fires on EVERY page load because
        stale-while-revalidate ALWAYS fetches in background. The SW doesn't check
        if the cached content actually changed — it sends the message every time
        it caches any HTML response.
```

**Fix approach:**

1. **Fix Trigger 1:** Save `CACHE_VERSION` to IndexedDB during app initialization (after `needsVersionRefresh()` check), not only during `preloadAllResources()`. This way, after one refresh, the version matches and the banner doesn't fire again.

2. **Fix Trigger 3:** In `sw.js` `staleWhileRevalidate()`, before sending `CONTENT_UPDATED`, compare the new response body (or ETag/Last-Modified headers) with the cached response. Only send the message if content actually changed. Alternatively, compare content-length + last-modified headers as a lightweight check.

3. **Add session guard:** In `refreshApp()`, set `sessionStorage.setItem('murajah-just-refreshed', Date.now())`. In `showUpdateNotification()`, check if the user refreshed within the last 30 seconds — if so, suppress the banner.

```
  showUpdateNotification() — NEW LOGIC:
    │
    ├── Check sessionStorage 'murajah-just-refreshed'
    │   └── If < 30s ago → suppress, don't show banner
    │
    └── Show banner
```

---

### BUG-3: Inaccurate offline stats in settings

**Severity:** 🟡 Medium
**Location:** `source/resources/js/utils/resourceCache.js` — `getCacheStats()` (line 209-295)
**Affects:** All users viewing settings

**Root Cause Analysis:**

```
  CURRENT STAT CALCULATION:
    │
    ├── IndexedDB size: in-memory items use real size, others use 100KB ESTIMATE
    │   Reality: JSON files range from 2KB (i18n) to 5MB+ (quran.json)
    │   A user with 3 items cached could show as "300KB" or "15MB" — both wrong
    │
    ├── Font size: fontsCached × 80KB ESTIMATE
    │   Reality: QPC fonts are ~20-120KB each, tajweed fonts vary similarly
    │
    ├── totalResources denominator: manifest items + 604 + 604 = ~1230
    │   But SW APP_SHELL has ~80 items NOT counted in manifest
    │   SW-cached items are completely invisible to getCacheStats()
    │
    └── Hit/miss counters: reset every page load, persisted stats may be stale
```

**Fix approach:**

1. Use `navigator.storage.estimate()` for total storage usage — gives the real browser-reported consumption
2. For fonts cache: iterate responses and use `response.clone().blob().then(b => b.size)` for actual sizes (or batch-check `Content-Length` headers)
3. Query SW for main cache item count via existing `GET_CACHE_STATUS` message
4. Include SW-cached items in `totalResources` denominator

```
  NEW STAT CALCULATION:
    │
    ├── Storage estimate: navigator.storage.estimate() → { usage, quota }
    │   Shows "Using X of Y available"
    │
    ├── IndexedDB count: store.count() (existing, accurate)
    │
    ├── Fonts count: unique font identifiers (existing, accurate)
    │
    ├── SW App Shell count: GET_CACHE_STATUS message → cachedCount
    │
    └── Total cached: IndexedDB + fonts + SW items
        Total resources: manifest + 604 + 604 + APP_SHELL count
```

---

### BUG-4: Clear cache leaves SW main cache intact

**Severity:** 🟡 Medium
**Location:** `source/index.html` — `clearResourceCache()` (line 8951-8978), `source/resources/js/utils/resourceCache.js` — `clearAll()` (line 423-460)
**Affects:** Users who click "Clear Cache" in settings

**Root Cause Analysis:**

```
  CURRENT clearResourceCache() FLOW:
    │
    ├── resourceCache.clearAll()
    │   ├── Clear in-memory Map ✅
    │   ├── Clear Cache API font caches (murajah-fonts-v1, murajah-fonts-v2) ✅
    │   ├── Clear IndexedDB resourceCache store ✅
    │   ├── Clear appData cache-stats entry ❌ NOT DONE
    │   └── Clear SW main cache (murajah-cache-v*) ❌ NOT DONE
    │
    └── updateCacheStats()
        └── getCacheStats() runs, but SW cache still has ~80 items
            Stats show partial clear — confusing
```

**There IS a `window.swClearCache()` function** defined at `index.html` line ~10350 that sends `CLEAR_CACHE` message to the SW. But `clearResourceCache()` never calls it.

**Fix approach:**

1. `clearResourceCache()` should call `window.swClearCache()` after `resourceCache.clearAll()`
2. `resourceCache.clearAll()` should also clear `cache-version` and `cache-stats` from `appData` store
3. After full clear, the app should re-register the SW (or prompt for a reload) since the app shell is now gone
4. Stats should reflect 0/0 after clear

---

## 4. Architecture & Data Flow

### 4.1 Service Worker Response Flow (Current + Fix)

```
  BROWSER NAVIGATION REQUEST ──► SERVICE WORKER FETCH HANDLER
    │
    │  Current flow (BUGGY):
    │  ├── isPageFont? → staleWhileRevalidateFont()
    │  ├── isFont? → staleWhileRevalidateFont()
    │  └── else → staleWhileRevalidate(request, CACHE_NAME)
    │             ├── cache.match(request) → cachedResponse
    │             ├── if cachedResponse → RETURN IT (even if redirected!) ← BUG
    │             └── else → fetch from network
    │
    │  Fixed flow:
    │  ├── isPageFont? → staleWhileRevalidateFont()
    │  ├── isFont? → staleWhileRevalidateFont()
    │  └── else → staleWhileRevalidate(request, CACHE_NAME)
    │             ├── cache.match(request) → cachedResponse
    │             ├── if cachedResponse.redirected && isNavigation → SKIP ← FIX
    │             ├── if isNavigation && request.url ends with '/' → try index.html ← FIX
    │             ├── if validCachedResponse → return it
    │             └── else → fetch from network
    │
    └── Background: fetchPromise updates cache (strip redirects for new responses)
```

### 4.2 Update Banner State Machine

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                    UPDATE BANNER STATE MACHINE                   │
  │                                                                  │
  │  ┌──────────┐  trigger  ┌──────────────┐  click   ┌──────────┐ │
  │  │  HIDDEN   │ ────────► │  SHOWING      │ ────────► │ REFRESH  │ │
  │  │ (default) │           │  (banner up)  │  refresh │ (reload)  │ │
  │  └──────────┘           └──────────────┘          └──────────┘ │
  │       ▲                       │                        │        │
  │       │        dismiss        │                        │        │
  │       └───────────────────────┘                        │        │
  │       ▲                                                │        │
  │       │           session flag set                     │        │
  │       └────────────────────────────────────────────────┘        │
  │                                                                  │
  │  Guards (NEW):                                                   │
  │  - sessionStorage 'murajah-just-refreshed' < 30s → suppress     │
  │  - needsVersionRefresh saves version on check → no re-trigger   │
  │  - CONTENT_UPDATED only fires on actual content change           │
  └─────────────────────────────────────────────────────────────────┘
```

### 4.3 Cache Stats Data Flow

```
  SETTINGS PANEL
    │
    ├── On mount → updateCacheStats()
    │
    └── updateCacheStats()
        ├── navigator.storage.estimate() → { usage, quota }  (NEW)
        ├── resourceCache.getCacheStats()
        │   ├── IndexedDB store.count() → itemCount
        │   ├── Cache API fonts → unique font count
        │   └── (real sizes via response.blob() or estimate fallback)
        ├── SW GET_CACHE_STATUS → { cachedCount, version }    (NEW)
        └── Merge into cacheStats reactive object
```

---

## 5. Error & Rescue Map

| Method/Codepath | What Can Go Wrong | Rescued? | User Sees |
|----------------|-------------------|----------|-----------|
| SW returns cached redirect | Safari blocks page load | **N ← BUG-1** | "Can't open page" crash |
| needsVersionRefresh after refresh | Returns true again, shows banner | **N ← BUG-2** | Banner re-appears |
| CONTENT_UPDATED on stale-while-revalidate | Fires on every load, not just changes | **N ← BUG-2** | Banner every visit |
| getCacheStats size estimation | 100KB/record average wildly inaccurate | **N ← BUG-3** | Wrong size shown |
| clearAll misses SW cache | 80 app shell items remain cached | **N ← BUG-4** | Partial clear |
| navigator.storage.estimate() unsupported | Old browsers lack API | Plan: Y | Falls back to estimate |
| SW GET_CACHE_STATUS message timeout | SW not responding | Plan: Y | Stats show without SW count |
| clearResourceCache + SW clear race | Both clear async | Plan: Y | Await both before updating stats |

---

## 6. Implementation Tasks

### Task 1: Fix Safari Service Worker Redirect Issue (BUG-1)

**File:** `source/sw.js`
**Priority:** P0 — Critical, blocks Safari users

**Changes:**

1. In `staleWhileRevalidate()`, after getting `cachedResponse` from `cache.match()`, add a guard:
   ```js
   // Don't return redirected responses for navigation requests (Safari strict)
   if (cachedResponse && !(isNavigation && cachedResponse.redirected)) {
     fetchPromise.catch(() => {});
     return cachedResponse;
   }
   ```

2. For navigation requests where the URL ends with `/` or is the root, also check `./index.html` in cache as a fallback:
   ```js
   if (isNavigation && !cachedResponse) {
     // Try index.html for root/directory navigation
     const urlPath = new URL(request.url).pathname;
     if (urlPath.endsWith('/')) {
       const indexUrl = new URL('index.html', request.url).href;
       const indexResponse = await cache.match(indexUrl);
       if (indexResponse && !indexResponse.redirected) {
         fetchPromise.catch(() => {});
         return indexResponse;
       }
     }
   }
   ```

3. In the install handler, after caching `'./'`, also cache the same content under `'./index.html'` if not already cached separately:
   ```js
   // Ensure root content is also available as ./index.html
   if (url === './' && responseToCache) {
     const indexCached = await cache.match('./index.html');
     if (!indexCached) {
       await cache.put('./index.html', responseToCache.clone());
     }
   }
   ```

4. In `staleWhileRevalidate()` `CONTENT_UPDATED`, skip the message if the response was served from `./` (it's the same as `index.html` — no need for double notification).

**Tests:** E2E test verifying SW serves non-redirected response for root navigation.

---

### Task 2: Fix Refresh Banner Persistence (BUG-2)

**File:** `source/index.html`, `source/sw.js`
**Priority:** P1 — High annoyance, user-facing

**Changes in index.html:**

1. After `needsVersionRefresh()` check shows the banner, immediately save the current version:
   ```js
   resourceCache.needsVersionRefresh().then(async (needsCacheRefresh) => {
     if (needsCacheRefresh) {
       Logger.log('[Murajah] Cache version changed, showing update banner');
       if (window.showUpdateNotification) {
         window.showUpdateNotification();
       }
       // Save version so banner doesn't re-appear after user refreshes
       await resourceCache.setCacheVersion(CACHE_VERSION);
     }
   });
   ```

2. Add session guard to `showUpdateNotification()`:
   ```js
   window.showUpdateNotification = () => {
     // Don't show banner if user just refreshed (within 30 seconds)
     const lastRefresh = sessionStorage.getItem('murajah-just-refreshed');
     if (lastRefresh && (Date.now() - parseInt(lastRefresh)) < 30000) {
       console.log('[Murajah] Suppressing update banner — user just refreshed');
       return;
     }
     showUpdateBanner.value = true;
   };
   ```

3. In `refreshApp()`, set the session flag:
   ```js
   const refreshApp = async () => {
     showUpdateBanner.value = false;
     sessionStorage.setItem('murajah-just-refreshed', Date.now().toString());
     // ... rest of existing logic
   };
   ```

**Changes in sw.js:**

4. In `staleWhileRevalidate()`, only send `CONTENT_UPDATED` when the response body actually differs from the cached version. Use a lightweight check by comparing `Content-Length` and `ETag`/`Last-Modified` headers:
   ```js
   // Only notify if content actually changed
   if (request.destination === 'document' || request.url.endsWith('.html')) {
     const existingResponse = cachedResponse;
     const newLength = networkResponse.headers.get('content-length');
     const oldLength = existingResponse?.headers?.get('content-length');
     const newEtag = networkResponse.headers.get('etag');
     const oldEtag = existingResponse?.headers?.get('etag');
     
     const contentChanged = !existingResponse 
       || (newEtag && oldEtag && newEtag !== oldEtag)
       || (newLength && oldLength && newLength !== oldLength)
       || (!newEtag && !newLength); // Can't tell — notify to be safe
     
     if (contentChanged) {
       const clients = await self.clients.matchAll();
       clients.forEach(client => {
         client.postMessage({ type: 'CONTENT_UPDATED', url: request.url });
       });
     }
   }
   ```

**Tests:** Unit test for session guard logic; E2E test that banner doesn't reappear after refresh.

---

### Task 3: Fix Offline Stats Accuracy (BUG-3)

**File:** `source/resources/js/utils/resourceCache.js`, `source/index.html`
**Priority:** P2 — Medium, cosmetic but trust-eroding

**Changes in resourceCache.js:**

1. Add `getAccurateStorageStats()` method that uses `navigator.storage.estimate()`:
   ```js
   async getAccurateStorageStats() {
     const stats = { usage: 0, quota: 0, formattedUsage: '0 Bytes', formattedQuota: '0 Bytes' };
     if (navigator.storage?.estimate) {
       try {
         const estimate = await navigator.storage.estimate();
         stats.usage = estimate.usage || 0;
         stats.quota = estimate.quota || 0;
         stats.formattedUsage = this.formatBytes(stats.usage);
         stats.formattedQuota = this.formatBytes(stats.quota);
       } catch (e) {
         Logger.warn(Logger.MODULES.CACHE, 'storage.estimate() failed', e);
       }
     }
     return stats;
   }
   ```

2. Update `getCacheStats()` to include the SW app shell count by accepting an optional parameter:
   ```js
   async getCacheStats(swCacheCount = 0) {
     // ... existing IndexedDB + fonts counting ...
     const totalCached = indexedDBCached + fontsCached + swCacheCount;
     const totalResources = getTotalResourceCount(false) + 604 + 604 + APP_SHELL_COUNT;
     // ...
   }
   ```

3. Export `APP_SHELL_COUNT` constant (hard-coded to match the SW's APP_SHELL array length, currently ~80 items). Or better: query it from SW.

**Changes in index.html:**

4. Update `updateCacheStats()` to query the SW for cache count and use `navigator.storage.estimate()`:
   ```js
   const updateCacheStats = async () => {
     // Get SW cache status
     let swCacheCount = 0;
     if (window.swGetCacheStatus) {
       try {
         const swStatus = await window.swGetCacheStatus();
         swCacheCount = swStatus?.cachedCount || 0;
       } catch (e) { /* SW not ready */ }
     }
     
     const stats = await resourceCache.getCacheStats(swCacheCount);
     
     // Get real storage usage
     const storageStats = await resourceCache.getAccurateStorageStats();
     
     Object.assign(cacheStats, stats, {
       storageUsage: storageStats.formattedUsage,
       storageQuota: storageStats.formattedQuota,
       storageUsageBytes: storageStats.usage,
       storageQuotaBytes: storageStats.quota
     });
   };
   ```

5. Update the settings UI to show `storageUsage` instead of the estimated `formattedSize` for the main storage stat. Keep the item counts (X of Y resources cached) as a secondary stat.

**Tests:** Unit test for `getAccurateStorageStats()` with mocked `navigator.storage.estimate()`.

---

### Task 4: Fix Clear Cache Completeness (BUG-4)

**File:** `source/index.html`, `source/resources/js/utils/resourceCache.js`
**Priority:** P2 — Medium, functional bug

**Changes in index.html:**

1. `clearResourceCache()` should also clear the SW main cache:
   ```js
   const clearResourceCache = async () => {
     if (cacheRefreshInProgress.value) return;
     if (!confirm(t('settings.clearCacheConfirm') || '...')) return;

     try {
       // Clear IndexedDB resources + font caches
       await resourceCache.clearAll();
       
       // Also clear SW main cache (app shell)
       if (window.swClearCache) {
         try {
           await window.swClearCache();
         } catch (e) {
           console.warn('[Murajah] SW cache clear failed:', e);
         }
       }
       
       await updateCacheStats();
       cacheStatusMessage.value = { type: 'success', text: '...' };
       // ...
     } catch (error) { /* ... */ }
   };
   ```

**Changes in resourceCache.js:**

2. `clearAll()` should also clear `cache-version` and `cache-stats` from `appData`:
   ```js
   async clearAll() {
     this.memoryCache.clear();
     this.cacheStats = { hits: 0, misses: 0, lastUpdated: null };
     
     // Clear font caches
     if ('caches' in window) {
       await caches.delete('murajah-fonts-v1');
       await caches.delete('murajah-fonts-v2');
     }
     
     // Clear IndexedDB resourceCache store
     if (this.db?.db) {
       const tx = this.db.db.transaction(['resourceCache', 'appData'], 'readwrite');
       tx.objectStore('resourceCache').clear();
       // Also clear version and stats so they reset properly
       tx.objectStore('appData').delete('cache-version');
       tx.objectStore('appData').delete('cache-stats');
       await new Promise((resolve, reject) => {
         tx.oncomplete = resolve;
         tx.onerror = () => reject(tx.error);
       });
     }
   }
   ```

3. After clearing all caches, the user should be prompted to reload (since app shell is now gone from SW cache, the app may not work correctly until the SW re-installs):
   ```js
   // After successful clear:
   if (confirm('Cache cleared. Reload the app to re-download essential resources?')) {
     window.location.reload();
   }
   ```

**Tests:** E2E test that clear cache results in 0 cached items in stats.

---

### Task 5: Swipe Performance Micro-Optimizations (Carried from prior plan)

**File:** `source/index.html`
**Priority:** P3 — Low, polish

**Changes:**

1. Guard the `showTafsir` DB write in the swipe hot path:
   ```js
   // In forceQuranMode / page navigation:
   if (settingsStore.showTafsir) {
     settingsStore.showTafsir = false;
     murajahDB.setSetting('showTafsir', false);
   }
   ```

2. Remove duplicate `updateURL()` call from `nextPage()`/`previousPage()` since the `watch(currentPage)` watcher already handles it.

**No new tests needed** — existing navigation tests cover this. Verify no double-push-state in E2E.

---

### Task 6: Update PERFORMANCE_ISSUES_PHASE2.md

**File:** `source/resources/js/PERFORMANCE_ISSUES_PHASE2.md`
**Priority:** P3 — Housekeeping

**Changes:**
- Mark items #1 and #2 as explicitly resolved (already done with strikethrough)
- Add note that items #3-#7 are deferred to a quiz-focused release

---

## 7. Test Plan

### 7.1 New Tests Needed

**Unit Tests (Vitest):**

| Test | File |
|------|------|
| `showUpdateNotification` suppresses within 30s of refresh | New or existing |
| `resourceCache.getAccurateStorageStats()` returns formatted bytes | `tests/unit/resourceCache.test.js` (new) |
| `resourceCache.clearAll()` clears appData entries | `tests/unit/resourceCache.test.js` (new) |
| `needsVersionRefresh` returns false after version saved | `tests/unit/resourceCache.test.js` (new) |

**E2E Tests (Playwright):**

| Test | File |
|------|------|
| Page loads without SW redirect error | `tests/e2e/pwa.spec.js` |
| Update banner does NOT show after refresh | `tests/e2e/pwa.spec.js` |
| Settings shows non-zero cache stats after loading | `tests/e2e/settings.spec.js` |
| Clear cache resets stats to near-zero | `tests/e2e/settings.spec.js` |
| Download all resources completes without error | `tests/e2e/settings.spec.js` |

### 7.2 Test Diagram

```
  NEW/FIXED CODEPATHS:
  ├── SW: navigation request for './' with cached redirect → fall through
  ├── SW: CONTENT_UPDATED only on actual change
  ├── App: showUpdateNotification with session guard
  ├── App: needsVersionRefresh + immediate setCacheVersion
  ├── App: getCacheStats with SW count + real storage estimate
  ├── App: clearResourceCache → clearAll + swClearCache
  ├── App: clearAll clears appData entries
  └── App: DB write guard on swipe, updateURL dedup

  EDGE CASES:
  ├── navigator.storage.estimate() not available → fallback to estimate
  ├── SW not registered yet when querying cache status → return 0
  ├── User clicks clear cache then immediately closes tab → partial clear OK
  ├── Multiple CONTENT_UPDATED messages arrive rapidly → banner shows once
  └── User on page 1, swipes prev → no-op (existing, verify no regression)
```

### 7.3 Failure Modes

```
  CODEPATH                       | FAILURE MODE         | RESCUED? | TEST? | USER SEES    | LOGGED?
  ──────────────────────────────|─────────────────────|──────────|───────|──────────────|────────
  SW cached redirect for nav    | Safari blocks page   | FIX: Y   | Y     | Normal load  | Console
  needsVersionRefresh loop      | Banner every load    | FIX: Y   | Y     | Banner 1x    | Console
  CONTENT_UPDATED spam          | Banner every load    | FIX: Y   | Y     | Banner 1x    | Console
  storage.estimate() missing    | No size data         | Y        | Y     | "Unknown"    | Warn
  swGetCacheStatus timeout      | No SW count          | Y        | Y     | Partial stats| Warn
  clearAll + SW clear race      | Stats briefly wrong  | Y        | N     | Brief flash  | No
```

**CRITICAL GAPS:** None after fixes applied.

---

## 8. Carried-Forward Items

These items from prior plans and PERFORMANCE_ISSUES_PHASE2.md are deferred to future releases:

### From PERFORMANCE_ISSUES_PHASE2.md (Issues #3-#7)

| # | Issue | Effort | Priority | Notes |
|---|-------|--------|----------|-------|
| 3 | Quiz timer memory leak (`setInterval` not cleaned) | S | P2 | Quiz-focused release |
| 4 | Quiz 3s hardcoded delay (no skip) | S | P2 | Quiz-focused release |
| 5 | Morphology preloader O(n²) (dormant) | S | P3 | Not active in production |
| 6 | Quiz surah selection O(n²) `.includes()` → `Set` | S | P2 | Quiz-focused release |
| 7 | Audio player sorted recordings re-sort | S | P3 | Minor overhead |

### From Prior Plans (Deferred TODOs)

| Item | Effort | Priority | Notes |
|------|--------|----------|-------|
| Page turn animation (slide/fade CSS transition on swipe) | S | P3 | Polish after swipe stabilizes |
| List virtualization for surah/juz grids | M | P2 | Performance for 114+ item lists |
| Full `preloadAllResources` should also cache SW APP_SHELL items | S | P2 | Ensures true "Download All" offline |

---

## 9. NOT in Scope

| Item | Rationale |
|------|-----------|
| Quiz performance fixes (#3, #4, #6) | Separate quiz-focused release |
| Component extraction from `index.html` | Architectural change, separate initiative |
| Build step / bundler | Infrastructure change, separate initiative |
| Delta updates / incremental SW caching | Future optimization, not needed now |
| Storage quota management / eviction | Over-engineering for current user scale |
| Dark mode | Not currently supported; `.dark` CSS exists only for Android WebView forced-dark workaround |
| Tablet / landscape optimizations | Separate scope |

---

## 10. QA Pre-Assessment

### Health Score (Current — Before This Plan)

```
  Health Score: 82/100
  - Tests pass:     30/30 — All 655 unit tests pass ✅
  - Test coverage:  16/20 — Good unit coverage, gaps in SW/PWA/cache paths
  - Critical bugs:  10/20 — Safari reload crash is critical (BUG-1)
  - Error handling: 14/15 — Most paths handled, SW redirect gap
  - Edge cases:     12/15 — Banner/stats/clear-cache edge cases missed
```

### Expected Health Score (After This Plan)

```
  Health Score: 93/100
  - Tests pass:     30/30 — Existing + new tests pass
  - Test coverage:  18/20 — SW/PWA/cache paths now tested
  - Critical bugs:  20/20 — Safari crash fixed, all P0/P1 resolved
  - Error handling: 14/15 — Comprehensive (storage.estimate fallback, SW timeout)
  - Edge cases:     11/15 — Banner session guard, clear cache completeness
```

---

## 11. Completion Summary

```
 +====================================================================+
 |      PWA STABILITY & CACHE ACCURACY — PLAN SUMMARY                  |
 +====================================================================+
 | Mode selected         | HOLD SCOPE                                  |
 | System Audit          | Clean state, 655 tests pass, no stashes     |
 |                       | Prior plans fully implemented, removed       |
 +-----------------------+---------------------------------------------+
 | Bugs                  | 4 bugs identified (1 critical, 3 medium)    |
 | Tasks                 | 6 implementation tasks                      |
 | Files touched         | 6 (under 8-file threshold)                  |
 | New abstractions      | 1 method (getAccurateStorageStats)           |
 | Carried-forward items | 8 (5 from PHASE2, 3 from prior plans)       |
 +-----------------------+---------------------------------------------+
 | Test Plan             | 4 new unit tests, 5 new E2E tests           |
 | Failure Modes         | 0 critical gaps after fixes                 |
 | Health Score          | 82 → 93 (projected)                         |
 +====================================================================+
```

---

## Implementation Order

```
  1. Task 1: Fix Safari SW redirect         (P0 — unblocks iOS users)
  2. Task 2: Fix refresh banner persistence  (P1 — removes annoyance)
  3. Task 3: Fix offline stats accuracy      (P2 — builds trust)
  4. Task 4: Fix clear cache completeness    (P2 — functional correctness)
  5. Task 5: Swipe performance polish        (P3 — carried forward)
  6. Task 6: Update PHASE2 doc              (P3 — housekeeping)
  7. Run all tests (unit + E2E)
  8. Manual test on iOS Safari (physical device)
```

---

## Questions for Review

| # | Question | Context |
|---|----------|---------|
| 1 | **BUG-1 fix approach**: Should we also add `redirect: 'manual'` to navigation fetches in the SW, or keep `redirect: 'follow'` and just guard cached responses? Option A (guard only) is simpler; Option B (manual redirect handling) is more defensive. | Safari strictness |
| 2 | **BUG-2 session guard duration**: 30 seconds cooldown after refresh — too short? Too long? | Banner suppression |
| 3 | **BUG-3 stats display**: Should we show `navigator.storage.estimate()` as the primary "Storage Used" metric, or keep the item-count breakdown as primary with storage estimate as secondary? | Settings UI |
| 4 | **BUG-4 post-clear behavior**: After clearing all caches (including SW app shell), should we auto-reload, confirm-then-reload, or just show a warning? | UX after clear |
| 5 | **Carried-forward priority**: Should any of the quiz performance fixes (#3-#7) be bundled into this release instead of deferred? | Scope decision |
| 6 | **Download All Resources**: Should `preloadAllResources()` also cache the SW APP_SHELL items (making it truly "download everything for offline")? This would require sending a message to the SW. | Offline completeness |

**Please answer each question before implementation begins.**
1. Pick what is best for the current usecase.
2. adequate
3. let's get rid of the metrics they serve little to no value. 
4. auto reload
5. yes
6. yes make it truly offline

