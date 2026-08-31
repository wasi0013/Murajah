# Performance audit — August 2026

**Trigger:** user reports of sluggishness after `ecdc4aa8` (audio player setting
persistence). **Scope requested:** a from-scratch code read, service worker
outward, no reliance on prior MD docs, with empirical checks rather than
guesses. **Method:** read the actual runtime path (SW → main.ts → composables
→ stores → IndexedDB), then wrote throwaway Vitest benchmarks (fake-indexeddb
+ real Pinia/Vue reactivity) to measure the two hypotheses that looked
suspicious from the code alone, rather than asserting from code shape. Both
confirmed. Neither is in the two most-recent commits — both predate this
week's changes by months (see "why now" under each) — but they're the real
explanation the user asked for, and they compound with the newer, lighter
Progress-tab issues below.

Not a finding: `src/sw/service-worker.ts` and `routeMatchers.ts`. Read in
full — NetworkFirst navigation with a 4s timeout, cache-first for hashed
`/data/*` and `/fonts/*`, same-origin guards on every matcher, no unbounded
caches, no bug found. The two commits reviewed there (`3ec03bdd` "performance
improvement", the reader font-preload/skeleton/readyGate work) are genuine
wins with their own e2e coverage (`reader-perf.spec.ts`) — nothing to add.

## P0 — Confirmed root causes

### 1. `progress` store's persistence watcher writes the *entire* dataset to IndexedDB every second, on every route, whenever audio is playing (or the reader is open)

**Where:** `src/composables/useProgressPersistence.ts:49-60` (the
`watch(() => progress.snapshot(), ..., { deep: true })`), fed by
`src/composables/useListeningTime.ts` (`setInterval(..., 1000)` while
`audio.isPlaying`, mounted once, globally, in `App.vue`) and
`src/composables/useReadingReward.ts:41` (`progress.addReadingSeconds(1)`,
same 1s cadence while the reader is open).

**Mechanism:**
- `progress.snapshot()` (`src/stores/progress.ts:382-391`) allocates a *new*
  `Set`/`Map` copy of `memorized`, `strength`, and `reviewData` on every call
  — for a user who's memorized a meaningful chunk of the mushaf, that's up to
  ~3×604 entries copied.
- The watcher's source is that snapshot function with `{ deep: true }`. Two
  costs stack: (a) Vue's dependency-collection pass deep-`traverse()`s the
  returned value, walking every `reviewData` record's fields on every
  re-run; (b) because a *new* object is returned every time, reference
  inequality means the callback fires on every tick — `deep: true` buys
  nothing here (the return value is a plain, non-reactive copy) except the
  extra traversal cost.
- The callback debounces 300ms before calling `saveProgress()` — but
  `useListeningTime`/`useReadingReward` tick every **1000ms**, which is
  longer than the debounce window, so the debounce never coalesces anything
  in the steady state. Net effect: one full read-modify-write IndexedDB
  transaction of the *whole* progress record (not just the changed
  `listeningSeconds` field) roughly once per second, for the entire duration
  of any audio playback or reading session, regardless of which route/tab is
  active (the watcher lives in a detached `effectScope` for the app's whole
  lifetime).

**Measured:** a temporary Vitest benchmark (real Pinia store, `fake-indexeddb`,
604 memorized pages with full review history — the realistic long-time-user
shape) confirmed `saveProgress` fires on **10 of 10** simulated one-second
ticks (not just the first), and timed `snapshot()` + `serializeProgress()`
alone at **~0.32ms/call** in Node/jsdom. That's before Vue's own `deep`
traversal, before the real IndexedDB transaction (disk-backed, not in-memory,
on the real target — this app explicitly supports older Android WebViews per
`181e18a4`), and before whatever else is competing for the main thread while
audio is decoding and the UI is live. On a low-end Android device this is a
plausible multi-millisecond main-thread stall, once a second, indefinitely,
for as long as someone listens — which is exactly the behavior the audio
persistence update made more common (settings sticking now encourages longer,
less-interrupted listening sessions).

**Why now, if the code is old:** this pattern (`snapshot()` + `deep: true`)
is a shared idiom across *every* persistence composable in the app
(`useDayLogPersistence`, `usePlanPersistence`, `useHabitVersesPersistence`,
`usePartialProgressPersistence`, `useMistakesPersistence`,
`useQuizPersistence` all do the same thing) and it's harmless everywhere else
because none of those stores have a field that changes every second — only
`progress.listeningSeconds`/`readingSeconds` do. `useListeningTime.ts` dates
to `9d303a2d` (well before this week); the watcher pattern itself to `phase
4.1`. The recent audio-persistence commit didn't introduce this, but it's the
single most on-point explanation for "audio playback correlates with
sluggishness" the codebase actually contains.

**Amplification — this isn't isolated to the `progress` key.**
`src/core/storage/userData.ts:16-30` keeps every user-data record (mistakes,
progress, plan, dayLog, quiz, audio prefs, live prefs, recordings,
habitVerses, partialProgress) as separate keys inside **one** object store
(`STORE = 'data'` in the `murajah-userdata` database), through **one** cached
connection (`db()`), explicitly shared with `journalStorage.ts` too (its own
doc comment: "so it can share this exact object store"). IndexedDB only runs
one `readwrite` transaction against a given object store at a time — every
other transaction against `'data'` (any other view's `hydrate()` load,
`saveAudioPrefs`, `saveDayLog`, a journal write, …) queues behind whichever
one is currently running. A readwrite transaction on this store firing every
~1s for as long as audio plays means the *entire rest of the app's local
persistence* is periodically blocked behind it — this is a more direct match
for "feels sluggish specifically while something is playing" than the raw
~0.3ms of CPU is by itself, since a queued transaction shows up as a stalled
route-transition/hydrate rather than a subtle frame hitch. (`trackListeningTime`
defaults to `true` — `src/stores/settings.ts:34` — so this is the common
case, not an opt-in edge case.)

**Fix direction:** stop the watcher from firing on `listeningSeconds`/
`readingSeconds` changes at all — split the store's snapshot into a
"structural" slice (memorized/strength/reviewData, watched+debounced as
today) and a "counters" slice (readingSeconds/listeningSeconds, saved on a
much coarser cadence — e.g. every 30s and on `visibilitychange`/`beforeunload`
— or just written directly without a deep watch, since they're two plain
numbers). Either removes the per-second full-table churn, and the
transaction-queuing it causes on every other feature's storage, entirely.

<details><summary>Benchmark (reproduce: paste into a `.test.ts` under
<code>app/tests/unit/</code>, run <code>npx vitest run</code>)</summary>

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { useProgressStore } from '@/stores/progress'
import * as userData from '@/core/storage/userData'
import { _resetUserDataDb } from '@/core/storage/userData'
import { useProgressPersistence, __resetProgressPersistence } from '@/composables/useProgressPersistence'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetUserDataDb()
  __resetProgressPersistence()
  setActivePinia(createPinia())
})

it('counts saveProgress calls for 10 one-second listeningSeconds ticks', async () => {
  const progress = useProgressStore()
  for (let p = 1; p <= 604; p++) {
    progress.setMemorized(p, true)
    progress.strength.set(p, 40)
    progress.reviewData.set(p, {
      lastReviewDate: '2026-08-01', reviewCount: 5, interval: 6,
      easeFactor: 2.5, nextReviewDate: '2026-09-01', consecutiveCorrect: 3,
    })
  }
  const saveSpy = vi.spyOn(userData, 'saveProgress')
  await useProgressPersistence(progress).hydrate()
  saveSpy.mockClear()
  for (let i = 0; i < 10; i++) {
    progress.addListeningSeconds(1)
    await new Promise((r) => setTimeout(r, 350)) // > 300ms debounce, like real 1000ms ticks
  }
  console.log('saveProgress calls for 10 ticks:', saveSpy.mock.calls.length) // → 10
  expect(saveSpy.mock.calls.length).toBeGreaterThan(0)
})

it('times snapshot()+serializeProgress alone (604 pages)', () => {
  const progress = useProgressStore()
  for (let p = 1; p <= 604; p++) {
    progress.setMemorized(p, true)
    progress.strength.set(p, 40)
    progress.reviewData.set(p, {
      lastReviewDate: '2026-08-01', reviewCount: 5, interval: 6,
      easeFactor: 2.5, nextReviewDate: '2026-09-01', consecutiveCorrect: 3,
    })
  }
  const N = 1000
  const start = performance.now()
  for (let i = 0; i < N; i++) userData.serializeProgress(progress.snapshot())
  const elapsed = performance.now() - start
  console.log(`x${N}: ${elapsed.toFixed(2)}ms total, ${(elapsed / N).toFixed(4)}ms/call`) // → ~0.32ms/call
})
```

Measured result: 10/10 ticks triggered a `saveProgress` call (no coalescing
in steady state); `snapshot()` + `serializeProgress()` averaged ~0.32ms/call
in Node/jsdom — before Vue's own `deep` traversal and before a real,
disk-backed IndexedDB transaction.
</details>

### 2. `AssetCache.put()` does a full-table `getAll()` enumeration on every single write — cache writes get slower as a session goes on, on the main thread for mushaf page images

**Where:** `src/core/storage/assetCache.ts:107-122` (`evict()`), called from
`put()` on every write. Three consumers share this class:
`src/core/mushaf/imageTransport.ts` (page-scan Blobs, **main thread**, no
worker — its own doc comment says so), `src/workers/data.worker.ts` (reader
JSON chunks, in a worker), `src/core/fonts/fontCache.ts` (font
`ArrayBuffer`s).

**Mechanism:** `evict()` calls `idbGetAll<Entry>(store)` — the *entire*
object store, full `Entry` objects (`{ url, data, bytes, ts }`), not just the
`bytes`/`ts` fields it actually needs to decide whether to evict — on *every
single* `put()`. Correction from an earlier draft of this doc: for the
**image** cache specifically, Chromium/WebKit store an IndexedDB `Blob`
value file-backed and hand back a lazy handle on structured-clone
deserialization, not the raw bytes — so this is *not* "every cached page
image's bytes read into memory on every page turn." What it still costs,
every single `put()`, regardless of engine: a full enumeration + structured-
clone deserialization of every record's metadata in the store, inside a
`readwrite` transaction that (per the same one-writer-per-store rule as P0-1)
blocks any other pending transaction on that same object store until it
completes. That's real, and it's O(n) in the number of cached entries, but
it is not the "tens of MB re-read from disk" framing — flagging that so the
severity claim stays honest.

**The JSON-chunk cache (`data.worker.ts`) is plausibly the worse offender
per entry, for a different reason.** There, `Entry.data` is a *fully
materialized parsed JS object* (`JSON.parse(text)`, per `data.worker.ts:63`)
— nav indexes, translations, tafsir, morphology data, per that file's own
"generous headroom" comment — not a lazy Blob handle. `getAll()` on that
store means structured-cloning every one of those parsed objects back out on
every fetch of a not-yet-cached URL. This runs inside a dedicated Worker, so
it doesn't directly cause main-thread jank the way the image cache's
main-thread `evict()` does — but the worker is single-threaded, so a large
deserialization here delays the *next* queued fetch's response back to the
main thread, which reads as a slow data/page load rather than a stutter.
Net: image-cache instances of this bug are the better main-thread-jank
suspect; JSON-cache instances are the better slow-load suspect. Both share
one root cause and one fix.

**Measured:** a temporary Vitest benchmark (`fake-indexeddb`, ~110KB blobs —
`imageTransport.ts`'s own stated average page-scan size) showed `put()`
latency growing roughly linearly with cache occupancy — 0.12ms at 10 cached
pages → 0.43ms at 300 (~3.6× for 30× the entries), confirming the O(n)
enumeration-per-put shape predicted by the code. `fake-indexeddb` keeps
everything in memory (no disk I/O, and — per the correction above — no lazy
Blob-handle path the way a real engine has), so this specific number likely
overstates the real-engine image-cache cost and understates the real-engine
JSON-cache cost; the O(n)-per-put *shape* is what transfers, not the
absolute milliseconds.

**Fix direction:** stop calling `getAll()` on the hot path. Options, cheapest
first: (a) keep a running `totalBytes` counter in the `META` store, updated
incrementally on `put`/`delete`, and only fall back to a real enumeration
(via `store.index('ts').openCursor()`, which can be limited to just
key/`ts`/`bytes` without touching the `data` field's payload) when the
counter says the cap is actually exceeded; (b) at minimum, only run
eviction opportunistically (e.g., every Nth put, or debounced), not
synchronously inside every single `put()`. (a) is the correct fix — it turns
every `put()` back into O(1) in the common case (under cap) and only pays
`getAll()`-shaped cost on the rare eviction sweep itself, for all three
`AssetCache` consumers at once.

<details><summary>Benchmark (reproduce: paste into a `.test.ts` under
<code>app/tests/unit/</code>, run <code>npx vitest run</code>)</summary>

```ts
import { describe, it, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { AssetCache } from '@/core/storage/assetCache'

beforeEach(() => { globalThis.indexedDB = new IDBFactory() })

it('measures put() latency as the image cache grows', async () => {
  const cache = await AssetCache.open({ name: 'audit-images', version: '1', maxBytes: 96 * 1024 * 1024 })
  const blob = new Blob([new Uint8Array(110 * 1024)]) // ~average mushaf scan size
  for (let n = 1; n <= 300; n++) {
    const start = performance.now()
    await cache.put(`/mushaf/qpc/page-${n}.jpg`, blob, blob.size)
    const ms = performance.now() - start
    if ([10, 50, 100, 200, 300].includes(n)) console.log(n, ms.toFixed(3), 'ms')
  }
})
```

Measured: 10 → 0.12ms, 50 → 0.13ms, 100 → 0.18ms, 200 → 0.29ms, 300 → 0.43ms.
</details>

## P1 — Progress tab: non-memoized full-grid recompute (matches the two most-recent Progress commits)

**Where:** `src/features/progress/MemorizedGrid.vue` — the 604-cell grid.
`cell(page)` (from `src/composables/useMemorization.ts:49-57`, itself calling
`pageCell()` → `effectiveRank()` → `daysSince()`, allocating a `Date` and
recomputing the decay band from scratch) is called **up to 3×** per cell in
the template (`:class`, `:style` via `cellStyle()`, `:aria-label` via
`cellLabel()`, template lines 190-192) — none of it cached — plus 2-4 `t()`
i18n calls per cell inside `cellLabel`. `juzProgress(g, progress.memorized)`
(`progressView.ts:124-131`, an O(pages-in-juz) scan) is likewise called
**twice** inline per juz header (lines 164 and 171) instead of once, and
`juzSegments(g)`/`juzBandSegments()` — a second O(pages-in-juz) scan — is
*also* called **twice** per juz header: once inside `juzBarLabel()` (line
169's `aria-label`) and again directly in the template (line 175's
`v-for="seg in juzSegments(g)"`). None of `cell`, `juzProgress`, or `juzSegments` are
wrapped in a `computed` — they're plain functions invoked directly from the
template, so **every** re-render of this component (which happens on any
reactive change the render function touches — marking one page, an
`awardHasanah` call, an import, etc.) redoes all ~604 cells' band
classification, ~1200-1800 `t()` calls, and re-walks all 604 pages 2-3× for
the 30 juz headers, to redraw a grid where in the overwhelming majority of
cases only one page actually changed.

This isn't a new bug in `f0f123d2`/`7e47f335` (`improve progress bar view`,
`layout customization for progress tab`) — the underlying `cell()`/
`juzProgress()` shape predates them — but those two commits are what grew
`StatsSummary.vue` from nothing to 400+ lines and added the segmented
per-juz band bars (`juzBandSegments`) on top of the existing ungrouped
per-cell cost, so the *total* per-render work on this screen genuinely grew
this week, on the exact tab the user is asking about.

**Fix direction:** memoize per page. The cleanest shape: a single `computed`
in `useMemorization.ts` — `const cells = computed(() => new Map(pages.map(p
=> [p, cell(p)])))` (or a plain array indexed by page), rebuilt only when
`progress.memorized`/`strength`/`reviewData`/`mistakes.byPage` actually
change, with the template reading `cells.get(page)` instead of calling
`cell(page)` fresh in three separate bindings. Same treatment for
`juzProgress`/`juzSegments`: compute once per juz into a `computed` array
alongside `juzGroups`, not as functions called from the template. This is a
pure refactor — no behavior change — and removes both the 3× redundant calls
per cell and the "whole grid recomputes on any change" cost in one pass.

## Checked and ruled out: initial-load / bundle size

Ran `npm run build && npm run size` (the project's own `.size-limit.json`
budgets) rather than leaving this unchecked. Every budget passes, most with
real headroom:

| Budget | Limit | Actual (gzip) |
|---|---|---|
| Initial JS — reader route | 120 kB | 62.36 kB |
| Initial JS — today route | 120 kB | 63.17 kB |
| Initial JS — quiz route | 120 kB | 62.65 kB |
| Audio player (lazy) | 20 kB | 1.06 kB |
| Contents browser (lazy) | 10 kB | 3.46 kB |
| Listen view (lazy) | 8 kB | 2.22 kB |
| Progress route incl. Journal (lazy) | 20 kB | 12.89 kB |
| App shell CSS | 36 kB | **34.71 kB** |

Bundle size/initial load is not the source of the reported sluggishness —
ruled out with data, not assumed out of scope. One thing worth a note, not a
task: **App shell CSS is at 96% of its budget** (34.71 kB of 36 kB gzipped),
and the two most recent Progress-tab commits added a lot of new markup/
Tailwind classes (`StatsSummary.vue` alone went from nothing to 400+ lines
across two commits). It hasn't tripped the budget yet, but it's close enough
that the next CSS-heavy change to that screen likely will — worth bumping
the limit deliberately (with a reason) rather than being surprised by a
failing CI check.

## P2 — Smaller, worth doing while in this code

- **`stats` computed re-walks all 604 `strength` entries once a second
  while Progress is open and audio is playing** (`useMemorization.ts:37-47`
  → `memorizationStats()`'s `for (const n of strength.values()) strengthSum
  += n`). Cheap in isolation (~604 iterations), but it's dead work every
  single tick since `readingSeconds`/`listeningSeconds` are two of the six
  fields `memorizationStats` computes and the other four never changed.
  Once P0-1 splits the counters out of the watched snapshot, consider
  splitting this computed the same way so the strength-sum loop isn't tied
  to a per-second timer at all.
- **`useAudioPersistence`'s debounced watcher instantiates once per mounted
  player view** (Today/Listen/AudioHost) — by design (module doc explains
  why), but note for future review: if a route ever mounts more than one of
  these simultaneously, each holds its own 300ms timer and writes
  independently. Not currently reachable (route-based, one player view
  active at a time) — no action needed now, just flagging the assumption so
  a future layout change (e.g. a persistent mini-player alongside a full
  player) doesn't quietly reintroduce duplicate writes.
- **`AssetCache` is one class shared by three very different payload
  sizes** (JSON chunks, font buffers, page-scan Blobs) with one fixed
  eviction strategy. Once the P0-2 fix lands (counter-based, cursor-based
  eviction), it benefits all three call sites for free — no separate work
  needed per consumer.

## Suggested order

1. P0-1 (progress watcher) — isolated, low-risk, highest "why does this get
   slower the longer I listen" payoff.
2. P0-2 (AssetCache eviction) — isolated to one class, benefits reader JSON,
   fonts, and mushaf images at once; highest "why does turning pages get
   slower the longer I read" payoff.
3. P1 (MemorizedGrid/juz memoization) — pure refactor, no behavior change,
   directly on the tab the user flagged.
4. P2 items opportunistically alongside 1-3.

Each should land with a regression test the way the rest of this codebase
already does it: for P0-1, a test asserting `saveProgress` call count stays
flat (not O(ticks)) across N simulated 1s ticks; for P0-2, a test asserting
`evict()`/`getAll()` isn't called when the running total is under cap; for
P1, a snapshot/call-count test on `cell`/`juzProgress` confirming they're
computed once per relevant store change, not once per template binding.
