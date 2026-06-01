/**
 * E2E Test Helpers
 * Shared utility functions for Playwright tests
 */

/**
 * Dismiss the language selection modal if it appears
 * This modal shows for new users who haven't selected a language yet
 */
export async function dismissLanguageModal(page, options = {}) {
  const { timeout = 3000, retries = 5 } = options;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Check for any fixed overlay with bg-black/50 (language modal or loading)
      const hasOverlay = await page.evaluate(() => {
        const overlays = document.querySelectorAll('.fixed.inset-0');
        for (const el of overlays) {
          // For position:fixed elements, offsetParent is always null,
          // so use getComputedStyle to check visibility
          const style = window.getComputedStyle(el);
          const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          if (el.className.includes('bg-black') && isVisible) return true;
        }
        return false;
      }).catch(() => false);
      
      if (!hasOverlay) return false; // No overlay, nothing to dismiss
      
      // Try clicking the Continue button (language modal)
      const continueButton = page.locator('button:has-text("Continue"), button:has-text("متابعة"), button:has-text("চালিয়ে যান")').first();
      const isButtonVisible = await continueButton.isVisible({ timeout: 1500 }).catch(() => false);
      
      if (isButtonVisible) {
        await continueButton.click({ force: true });
        // Wait for overlay to fully disappear
        await page.waitForFunction(() => {
          const overlays = document.querySelectorAll('.fixed.inset-0');
          for (const el of overlays) {
            const style = window.getComputedStyle(el);
            const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            if (el.className.includes('bg-black') && isVisible) return false;
          }
          return true;
        }, { timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);
        console.log('[Test Helper] Language selection modal dismissed');
        return true;
      } else {
        // Maybe it's the loading overlay, not the language modal - wait for it
        await page.waitForTimeout(500);
      }
    } catch (e) {
      // Modal not present or couldn't be dismissed, retry
      await page.waitForTimeout(300);
    }
  }
  return false;
}

/**
 * Wait for the Murajah app to finish loading
 * Waits for the initial loader to disappear and Vue app to mount
 */
export async function waitForAppLoad(page, options = {}) {
  const { timeout = 60000 } = options;
  
  // Wait for the initial loader to disappear
  await page.waitForFunction(() => {
    const loader = document.getElementById('initial-loader');
    if (!loader) return true;
    const style = window.getComputedStyle(loader);
    return style.display === 'none' || style.opacity === '0' || loader.classList.contains('hidden');
  }, null, { timeout });
  
  // Wait for the Vue isInitializing overlay to disappear
  // This overlay shows "Loading Murajah..." with bg-black/50
  await page.waitForFunction(() => {
    // Check that no loading spinner overlay is active
    const overlays = document.querySelectorAll('.fixed.inset-0');
    for (const el of overlays) {
      // Skip if it's the language selection modal (has a form-like child)
      if (el.querySelector('.bg-gradient-to-r')) continue;
      const style = window.getComputedStyle(el);
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      // If there's a spinner overlay still visible, wait
      if (el.className.includes('bg-black') && el.querySelector('.fa-spinner') && isVisible) {
        return false;
      }
    }
    return true;
  }, null, { timeout: 30000 }).catch(() => {});
  
  // Give Vue a moment to finish mounting
  await page.waitForTimeout(500);
  
  // Dismiss language selection modal if it appears
  await dismissLanguageModal(page, { retries: 5 });
  
  // Final check: ensure no overlays remain
  await page.waitForFunction(() => {
    const overlays = document.querySelectorAll('.fixed.inset-0');
    for (const el of overlays) {
      const style = window.getComputedStyle(el);
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      if (el.className.includes('bg-black') && isVisible) return false;
    }
    return true;
  }, { timeout: 10000 }).catch(() => {});
}

/**
 * Wait for Quran data to load
 */
export async function waitForQuranData(page, options = {}) {
  const { timeout = 30000 } = options;
  
  await waitForAppLoad(page, { timeout });
  
  // Wait for actual Arabic text to appear in the Quran section
  // (not just "Loading Quran text..." placeholder)
  await page.waitForFunction(() => {
    const section = document.getElementById('quran-text-section');
    if (!section) return false;
    const text = section.textContent || '';
    // Check for Arabic Unicode characters:
    // U+0600-U+06FF (basic Arabic - used by Indopak layout)
    // U+FB50-U+FDFF (Arabic Presentation Forms-A - used by QPC layout)
    // U+FC00-U+FCFF (Arabic Presentation Forms-A subset)
    return /[\u0600-\u06FF\uFB50-\uFDFF]/.test(text);
  }, null, { timeout });
}

/**
 * Navigate to a specific page and wait for it to load
 */
export async function navigateToPage(page, pageNum) {
  await page.goto(`/?page=${pageNum}`);
  await waitForQuranData(page);
}

/**
 * Clear all IndexedDB databases
 */
export async function clearAllDatabases(page) {
  await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    for (const db of databases) {
      if (db.name) {
        indexedDB.deleteDatabase(db.name);
      }
    }
  });
}

/**
 * Open the settings modal
 */
export async function openSettings(page) {
  await waitForAppLoad(page);
  
  const settingsButton = page.locator('button:has(.fa-cog), button:has(.fa-gear), [title*="Settings"]').first();
  // Settings modal contains an h2 with fa-cog icon - unique to settings
  const settingsModal = page.locator('.fixed.inset-0 h2:has(.fa-cog)');
  
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await settingsButton.waitFor({ state: 'visible', timeout: 5000 });
      await settingsButton.click();
      await settingsModal.waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(300);
      return true;
    } catch {
      if (attempt === 0) {
        // Retry after dismissing any blocking modal
        await dismissLanguageModal(page, { retries: 2 });
        await page.waitForTimeout(500);
      }
    }
  }
  return false;
}

/**
 * Close any open modal
 */
export async function closeModal(page) {
  const closeButton = page.locator('button:has(.fa-times), button:has(.fa-close), [aria-label="Close"]').first();
  
  if (await closeButton.isVisible()) {
    await closeButton.click();
    await page.waitForTimeout(300);
    return true;
  }
  
  // Try pressing Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  return true;
}

/**
 * Check if the app has loaded successfully
 */
export async function isAppLoaded(page) {
  try {
    await waitForAppLoad(page, { timeout: 5000 });
    const body = page.locator('body');
    return await body.isVisible();
  } catch {
    return false;
  }
}

/**
 * Wait for the Quiz page (quiz.html) to finish loading.
 * The Vue app renders a full-screen loading overlay (isLoading=true) while it
 * initialises; this helper waits for that overlay to disappear from the DOM.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} options
 * @param {number} [options.timeout=30000]
 */
export async function waitForQuizLoad(page, options = {}) {
  const { timeout = 30000 } = options;

  // Ensure the page content is ready before we start polling
  await page.waitForLoadState('domcontentloaded').catch(() => {});

  // The loading overlay: <div v-if="isLoading" class="fixed inset-0 bg-gray-900 bg-opacity-50 ...">
  // Vue removes it from the DOM when isLoading becomes false.
  await page.waitForFunction(() => {
    const overlay = document.querySelector('.fixed.bg-gray-900.bg-opacity-50');
    return !overlay;
  }, null, { timeout }).catch(() => {});

  // Wait for all network requests (including large quiz data JSON) to complete.
  // isLoading is set false inside initializeApp(), but loadQuizData() fires after
  // and fetches up to 7.5MB. networkidle ensures those fetches are done before we
  // proceed — critical on webkit where an interrupted fetch logs a critical error.
  await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
}
