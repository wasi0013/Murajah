/**
 * E2E Test Helpers
 * Shared utility functions for Playwright tests
 */

/**
 * Dismiss the language selection modal if it appears
 * This modal shows for new users who haven't selected a language yet
 */
export async function dismissLanguageModal(page, options = {}) {
  const { timeout = 3000, retries = 3 } = options;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Check for the modal backdrop
      const modalBackdrop = page.locator('.fixed.inset-0.bg-black\\/50');
      const isModalVisible = await modalBackdrop.isVisible({ timeout: 500 }).catch(() => false);
      
      if (isModalVisible) {
        // Wait for modal to possibly appear
        const continueButton = page.locator('button:has-text("Continue"), button:has-text("متابعة"), button:has-text("চালিয়ে যান")').first();
        
        // Check if the button is visible
        const isButtonVisible = await continueButton.isVisible({ timeout: 1000 }).catch(() => false);
        
        if (isButtonVisible) {
          await continueButton.click({ force: true });
          // Wait for modal to close
          await page.waitForFunction(() => {
            const modal = document.querySelector('.fixed.inset-0.bg-black\\/50');
            return !modal || modal.offsetParent === null;
          }, { timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(300);
          console.log('[Test Helper] Language selection modal dismissed');
          return true;
        }
      }
    } catch (e) {
      // Modal not present or couldn't be dismissed, retry
      await page.waitForTimeout(200);
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
  }, { timeout });
  
  // Give Vue a moment to finish mounting
  await page.waitForTimeout(500);
  
  // Dismiss language selection modal if it appears (try multiple times)
  await dismissLanguageModal(page, { retries: 5 });
  
  // Wait a bit more and try again in case modal appears after initial load
  await page.waitForTimeout(300);
  await dismissLanguageModal(page, { retries: 3 });
}

/**
 * Wait for Quran data to load
 */
export async function waitForQuranData(page, options = {}) {
  const { timeout = 30000 } = options;
  
  await waitForAppLoad(page, { timeout });
  
  // Wait for Quran text section to have content
  await page.waitForFunction(() => {
    const section = document.getElementById('quran-text-section');
    return section && section.textContent && section.textContent.trim().length > 0;
  }, { timeout });
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
  
  if (await settingsButton.isVisible()) {
    await settingsButton.click();
    await page.waitForTimeout(500);
    return true;
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
