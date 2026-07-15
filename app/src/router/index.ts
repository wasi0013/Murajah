import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

// Routes are lazy-loaded (code-split) so each feature ships its own chunk
// and never bloats the initial reader bundle. See plans/redesign-2026.md §3.
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'reader',
    component: () => import('@/features/reader/ReaderView.vue'),
  },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})
