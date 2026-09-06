import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      // Hand-written SW (not auto-generated) — required so it can branch once
      // at top level on `?platform=ios` (see src/sw/service-worker.ts and
      // plans/archive/phase-10-pwa-migration.md decision 1). `injectRegister: false`:
      // registration is hand-rolled in main.ts, both because the device-gated
      // URL needs a query string the virtual-module registrar can't express,
      // and because it must run *after* legacy-SW teardown (10.2), not before.
      strategies: 'injectManifest',
      injectRegister: false,
      srcDir: 'src/sw',
      filename: 'service-worker.ts',
      injectManifest: {
        // Mushaf page images are cached via the app's own IndexedDB blob cache
        // (MushafClient), not Cache Storage — excluded from the precache manifest.
        globPatterns: ['**/*.{js,css,html}'],
      },
      manifest: {
        name: 'Murajah - Quran Memorization',
        short_name: 'Murajah',
        description: 'A beautiful Quran memorization and revision tracking app that works offline',
        // Matches legacy's effective scope/start_url so existing Home Screen
        // installs don't orphan when this SW takes over (plan §0, task 10.6.1).
        scope: '/',
        start_url: '/index.html',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#ffffff',
        theme_color: '#3b82f6',
        lang: 'en',
        dir: 'ltr',
        categories: ['education', 'lifestyle', 'books'],
        icons: [
          { src: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // By default Vite adds a `<link rel="modulepreload">` in the head for
    // every chunk the entry statically imports, transitively — 7 of them
    // here (Icon, pinia, i18n, runtime-dom, etc.), several tens of KB
    // combined. Under Lighthouse CI's throttled profile (lighthouserc.json:
    // ~1.6Mbps/150ms RTT) those compete on the wire with the render-blocking
    // app-shell stylesheet and the entry script itself, which is what was
    // pushing First Contentful Paint just over its budget (measured locally:
    // ~1505ms → ~1430ms with this off, LCP/TTI unchanged). The chunks are
    // still fetched exactly when needed via normal `import()` resolution —
    // this only removes the eager head start, which wasn't buying enough to
    // be worth the bandwidth contention it caused this early.
    modulePreload: { resolveDependencies: () => [] },
  },
})
