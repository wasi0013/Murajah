import { createRouter, createWebHistory, type RouteLocationNormalized, type RouteRecordRaw } from 'vue-router'
import { readerEnabled } from '@/core/flags'
import { toast } from '@/composables/useToast'
import { t } from '@/core/i18n'

// Routes are lazy-loaded (code-split) so each feature ships its own chunk
// and never bloats the initial reader bundle. See plans/redesign-2026.md §3.
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/features/reader/ReaderView.vue'),
  },
  {
    // Reading surface — layout + page in the path, view toggles in the query
    // (see core/navigation/readerRoute).
    path: '/read/:layout/:page',
    name: 'reader',
    component: () => import('@/features/reader/ReaderView.vue'),
  },
  {
    // Shown when the reader flag is off (staged rollout — see core/flags).
    path: '/disabled',
    name: 'reader-disabled',
    component: () => import('@/features/reader/ReaderDisabled.vue'),
  },
  {
    // Standalone mushaf image (scan) surface. Code-split → never in the reader
    // bundle. `:page` is optional; the view restores the last page when absent.
    path: '/mushaf/:page(\\d+)?',
    name: 'mushaf',
    component: () => import('@/features/mushaf/MushafView.vue'),
  },
  {
    // The merged daily practice loop (plans + goals). Code-split → never in the
    // reader bundle, though it's the surface most sessions start from.
    path: '/today',
    name: 'today',
    component: () => import('@/features/today/TodayView.vue'),
  },
  {
    // Quiz mode (translation / continuation / completion). Code-split → never in
    // the reader bundle; drills the plan's pages and feeds quiz accuracy to weakness.
    path: '/quiz',
    name: 'quiz',
    component: () => import('@/features/quiz/QuizView.vue'),
  },
  {
    // Memorization progress (grid + stats). Code-split → never in the reader bundle.
    path: '/progress',
    name: 'progress',
    component: () => import('@/features/progress/ProgressView.vue'),
  },
  {
    // Contents browser (surah / juz / page index) — the "Surahs" tab. A tappable,
    // beginner-friendly index over the nav data. Code-split → never in the reader bundle.
    path: '/contents',
    name: 'contents',
    component: () => import('@/features/contents/ContentsView.vue'),
  },
  {
    // Live recitation (Makkah / Madinah YouTube embeds). A full view reached from
    // the "More" tab. Code-split → never in the reader bundle.
    path: '/live',
    name: 'live',
    component: () => import('@/features/live/LiveView.vue'),
  },
  {
    // Listen — audio-only whole-scope playback (a surah / juz / the whole Quran).
    // Reached from the "More" tab; reuses the audio engine + mini-player. Code-split.
    path: '/listen',
    name: 'listen',
    component: () => import('@/features/listen/ListenView.vue'),
  },
  {
    // App settings (theme, data backup). Reached from the "More" tab. Code-split
    // → never in the reader bundle.
    path: '/settings',
    name: 'settings',
    component: () => import('@/features/settings/SettingsView.vue'),
  },
  {
    // Design gallery (dev/design tool). Code-split → never in the reader bundle.
    path: '/gallery',
    name: 'gallery',
    component: () => import('@/features/gallery/GalleryView.vue'),
  },
  {
    // Standalone install page — Android → Play Store, iOS → in-page PWA
    // "Add to Home Screen" instructions. Reached only from an outside link
    // (never linked from in-app nav). A literal path, so it always outranks
    // the `/:slug` catch-all below regardless of registration order (vue-router
    // scores static segments over dynamic ones) — kept above it anyway for
    // readability. Code-split → never in any other route's bundle.
    path: '/download',
    name: 'download',
    component: () => import('@/features/download/DownloadView.vue'),
  },
  {
    // Bare /preview — a beginner-friendly landing page: a short tutorial on
    // highlighting + sharing, plus surah/from/to dropdowns to build a link
    // below without hand-editing a URL. Static path, so it's registered
    // ahead of (and never shadowed by) the two parameterized routes below.
    path: '/preview',
    name: 'preview-landing',
    component: () => import('@/features/preview/PreviewLandingView.vue'),
  },
  {
    // Shareable read-only verse-range preview, always Uthmani tajweed —
    // /preview/2/12-45 (a range) or /preview/2/255 (a single verse). Highlight
    // words via query params (see core/navigation/previewRoute.ts). Two routes,
    // not one `(\d+(-\d+)?)` custom-regex param: vue-router's own path tokenizer
    // (not path-to-regexp) can't handle a nested group inside a custom param
    // regex — it closes the param at the *first* `)` it finds, unbalanced, and
    // throws "Unterminated group" at router creation (confirmed empirically).
    // `:ayah-:endAyah` (two params sharing one segment, joined by a literal
    // dash) is a supported shape and sidesteps the parser entirely.
    path: '/preview/:surah(\\d{1,3})/:ayah(\\d+)-:endAyah(\\d+)',
    name: 'preview-range',
    component: () => import('@/features/preview/PreviewView.vue'),
  },
  {
    // The single-verse form of the above (no dash).
    path: '/preview/:surah(\\d{1,3})/:ayah(\\d+)',
    name: 'preview',
    component: () => import('@/features/preview/PreviewView.vue'),
  },

  // —— Friendly reader URLs (Phase 9.1) ————————————————————————————
  // Human-typable entry points, all rendered by the reader. Personal prefs
  // (script + toggles) come from the store, not the URL (see readerRoute.ts).
  // Regex-disjoint from the static word-routes above (which win by specificity)
  // and from each other (\d vs [a-z]), so none can shadow another.
  {
    // A page in the text reader, user's own script — /page/50.
    path: '/page/:page(\\d+)',
    name: 'read-page',
    component: () => import('@/features/reader/ReaderView.vue'),
  },
  {
    // A surah + ayah — /2/255 scrolls to Ayat al-Kursi.
    path: '/:surah(\\d{1,3})/:ayah(\\d+)',
    name: 'read-ayah',
    component: () => import('@/features/reader/ReaderView.vue'),
  },
  {
    // A surah by number — /1 → Al-Fatihah, /114 → An-Nas.
    path: '/:surah(\\d{1,3})',
    name: 'read-surah',
    component: () => import('@/features/reader/ReaderView.vue'),
  },
  {
    // A surah by name-slug — /al-fatihah, /an-nas (desktop/shareable).
    path: '/:slug([a-z][a-z0-9-]*)',
    name: 'read-slug',
    component: () => import('@/features/reader/ReaderView.vue'),
  },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// Gate the reader behind the feature flag; when off, show the disabled placeholder.
const READER_ROUTES = new Set([
  'home',
  'reader',
  'read-page',
  'read-surah',
  'read-ayah',
  'read-slug',
  'preview-landing',
  'preview',
  'preview-range',
])
router.beforeEach((to) => {
  if (READER_ROUTES.has(String(to.name)) && !readerEnabled()) {
    return { name: 'reader-disabled' }
  }
  if (to.name === 'reader-disabled' && readerEnabled()) {
    return { name: 'home' }
  }
})

// Every route is a lazy chunk, so a navigation can fail if its chunk doesn't
// load — a flaky connection, a dev server reached over the LAN, or a stale deploy
// where the hashed chunk no longer exists. Without a handler Vue Router just
// rejects the `push` and the tap looks dead. Recover a chunk-load failure with a
// one-shot full navigation to the target (fetches the chunk fresh); anything else
// (or a repeat failure) surfaces a toast instead of failing silently.
const CHUNK_LOAD_ERROR =
  /dynamically imported module|Loading( CSS)? chunk|Importing a module script failed|Failed to fetch/i

function fullPathOf(to?: RouteLocationNormalized): string | undefined {
  return to && to.fullPath ? to.fullPath : undefined
}

router.onError((error: unknown, to?: RouteLocationNormalized) => {
  const message = error instanceof Error ? error.message : String(error)
  const target = fullPathOf(to)

  if (CHUNK_LOAD_ERROR.test(message) && target) {
    // Guard against a reload loop when the chunk is genuinely gone.
    let alreadyReloaded = false
    try {
      alreadyReloaded = sessionStorage.getItem('murajah:reload-target') === target
      sessionStorage.setItem('murajah:reload-target', target)
    } catch {
      /* storage unavailable — fall through to the toast */
    }
    if (!alreadyReloaded) {
      window.location.assign(target)
      return
    }
  }

  console.error('[router] navigation failed:', error)
  toast(t('common.navError'), { variant: 'error' })
})

// A navigation completed, so clear the one-shot reload guard — a *future* chunk
// failure on the same path should be allowed to recover again.
router.afterEach(() => {
  try {
    sessionStorage.removeItem('murajah:reload-target')
  } catch {
    /* storage unavailable — nothing to clear */
  }
})
