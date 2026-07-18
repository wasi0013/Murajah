import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { readerEnabled } from '@/core/flags'

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
    // Design gallery (dev/design tool). Code-split → never in the reader bundle.
    path: '/gallery',
    name: 'gallery',
    component: () => import('@/features/gallery/GalleryView.vue'),
  },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// Gate the reader behind the feature flag; when off, show the disabled placeholder.
const READER_ROUTES = new Set(['home', 'reader'])
router.beforeEach((to) => {
  if (READER_ROUTES.has(String(to.name)) && !readerEnabled()) {
    return { name: 'reader-disabled' }
  }
  if (to.name === 'reader-disabled' && readerEnabled()) {
    return { name: 'home' }
  }
})
