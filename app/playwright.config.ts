import { defineConfig, devices } from '@playwright/test'

// E2E against the built app served by `vite preview`.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  // Pre-completes onboarding (see global-setup.ts) so specs land straight on
  // the UI they're testing, not the first-run language modal.
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    storageState: './tests/e2e/.auth/onboarded.json',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
