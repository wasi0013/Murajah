import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for Murajah
 * Run with: npm run test:e2e
 * Debug with: npm run test:e2e:debug
 */
export default defineConfig({
  // Test directory
  testDir: './tests/e2e',
  
  // Run tests in parallel
  fullyParallel: true,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry failed tests (helpful for flaky network tests)
  retries: process.env.CI ? 2 : 0,
  
  // Number of parallel workers
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter configuration
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  
  // Shared settings for all projects
  use: {
    // Base URL for the local server
    baseURL: 'http://localhost:3000',
    
    // Collect trace when retrying failed tests
    trace: 'on-first-retry',
    
    // Screenshots on failure
    screenshot: 'only-on-failure',
    
    // Video on failure
    video: 'on-first-retry',
    
    // Timeout for actions
    actionTimeout: 10000,
    
    // Timeout for navigation
    navigationTimeout: 30000
  },

  // Configure projects for Chrome only
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Grant permissions for audio recording tests
        permissions: ['microphone']
      }
    }
  ],

  // Local dev server configuration
  webServer: {
    command: 'npx serve source -p 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  },
  
  // Output directory for test artifacts
  outputDir: 'test-results',
  
  // Global timeout
  timeout: 60000,
  
  // Expect timeout
  expect: {
    timeout: 5000
  }
});
