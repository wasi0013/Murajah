import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

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
    // (see core/navigation/readerRoute). Wired to the reader store in 3.10.
    path: '/read/:layout/:page',
    name: 'reader',
    component: () => import('@/features/reader/ReaderView.vue'),
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
