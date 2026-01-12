import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use happy-dom for faster DOM simulation
    environment: 'happy-dom',
    
    // Global test setup
    setupFiles: ['./tests/setup.js'],
    
    // Include patterns
    include: [
      'tests/unit/**/*.test.js',
      'tests/integration/**/*.test.js'
    ],
    
    // Exclude E2E tests (run by Playwright)
    exclude: [
      'tests/e2e/**/*',
      'node_modules/**/*'
    ],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'source/resources/js/**/*.js'
      ],
      exclude: [
        'source/resources/js/vendor/**',
        'source/resources/js/components/Achievement*.js',
        'source/resources/js/components/BadgeShareCardComponent.js',
        'source/resources/js/components/ShareBadgeModal.js',
        'source/resources/js/stores/achievementStore.js',
        'source/resources/js/utils/achievementLogic.js',
        'source/resources/js/utils/badgeImageGenerator.js',
        'source/resources/js/utils/imageUtils.js'
      ],
      // 75% coverage threshold
      thresholds: {
        statements: 75,
        branches: 75,
        functions: 75,
        lines: 75
      }
    },
    
    // Globals for cleaner test syntax
    globals: true,
    
    // Timeout for async operations
    testTimeout: 10000,
    
    // Reporter for better output
    reporters: ['verbose']
  }
});
