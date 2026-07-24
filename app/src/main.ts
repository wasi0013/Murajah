import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { router } from '@/router'
import { usePwaUpdate } from '@/composables/usePwaUpdate'

createApp(App).use(createPinia()).use(router).mount('#app')

// Fire-and-forget: retires the legacy SW and registers the new one (see
// plans/phase-10-pwa-migration.md §10.2) without blocking first paint.
void usePwaUpdate().init()
