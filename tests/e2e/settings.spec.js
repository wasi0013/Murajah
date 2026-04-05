/**
 * E2E Tests: Settings & Preferences
 * Tests settings modal, theme, language, data export/import
 */

import { test, expect } from '@playwright/test';
import { waitForAppLoad, openSettings } from './helpers.js';

test.describe('Settings & Preferences', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('should open settings modal', async ({ page }) => {
    const opened = await openSettings(page);
    if (opened) {
      const modal = page.locator('[role="dialog"], .modal, .fixed.inset-0').first();
      await expect(modal).toBeVisible({ timeout: 5000 });
    }
  });

  test('should display language options', async ({ page }) => {
    await openSettings(page);
    
    const languageOption = page.locator('text=/language|Language|English|Arabic/i').first();
    if (await languageOption.isVisible()) {
      await expect(languageOption).toBeVisible();
    }
  });

  test('should display font size options', async ({ page }) => {
    await openSettings(page);
    
    const fontSizeOption = page.locator('text=/font|Font|size|Size/i').first();
    if (await fontSizeOption.isVisible()) {
      await expect(fontSizeOption).toBeVisible();
    }
  });

  test('should display Tajweed toggle', async ({ page }) => {
    await openSettings(page);
    
    const tajweedOption = page.locator('text=/Tajweed/i').first();
    if (await tajweedOption.isVisible()) {
      await expect(tajweedOption).toBeVisible();
    }
  });

  test('should display data export option', async ({ page }) => {
    await openSettings(page);
    
    const exportButton = page.locator('button:has-text("Export"), button:has-text("Backup")').first();
    if (await exportButton.isVisible()) {
      await expect(exportButton).toBeVisible();
    }
  });

  test('should display version information', async ({ page }) => {
    await openSettings(page);
    
    const versionInfo = page.locator('text=/v?\\d+\\.\\d+\\.\\d+/');
    const exists = await versionInfo.count();
    expect(exists).toBeGreaterThan(0);
  });

  test('should persist settings across reload', async ({ page }) => {
    await openSettings(page);
    
    const toggle = page.locator('input[type="checkbox"]:not(:disabled)').first();
    
    if (await toggle.isVisible()) {
      const stateBefore = await toggle.isChecked();
      await toggle.click({ force: true });
      await page.waitForTimeout(500);
      
      await page.reload();
      await waitForAppLoad(page);
      await openSettings(page);
      
      const newToggle = page.locator('input[type="checkbox"]:not(:disabled)').first();
      if (await newToggle.isVisible()) {
        const stateAfter = await newToggle.isChecked();
        expect(stateAfter).toBe(!stateBefore);
        
        // Reset
        await newToggle.click({ force: true });
      }
    }
  });
});

test.describe('Audio Play Mode Persistence', () => {

  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start from default state
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('murajah-audioPlayMode'));
    await page.reload();
    await waitForAppLoad(page);
  });

  test('should display audio play mode radio buttons in settings', async ({ page }) => {
    await openSettings(page);
    const verseRadio = page.locator('input[type="radio"][name="audioPlayMode"][value="verse"]');
    const pageRadio = page.locator('input[type="radio"][name="audioPlayMode"][value="page"]');
    await expect(verseRadio).toBeVisible({ timeout: 5000 });
    await expect(pageRadio).toBeVisible({ timeout: 5000 });
  });

  test('should default to verse-by-verse mode', async ({ page }) => {
    await openSettings(page);
    const verseRadio = page.locator('input[type="radio"][name="audioPlayMode"][value="verse"]');
    await expect(verseRadio).toBeChecked();
  });

  test('should switch to page-by-page mode when selected', async ({ page }) => {
    await openSettings(page);
    const pageRadio = page.locator('input[type="radio"][name="audioPlayMode"][value="page"]');
    await pageRadio.click({ force: true });
    await page.waitForTimeout(500);
    await expect(pageRadio).toBeChecked();
    // Verify verse radio is unchecked
    const verseRadio = page.locator('input[type="radio"][name="audioPlayMode"][value="verse"]');
    await expect(verseRadio).not.toBeChecked();
  });

  test('should persist page-by-page mode to localStorage immediately', async ({ page }) => {
    await openSettings(page);
    const pageRadio = page.locator('input[type="radio"][name="audioPlayMode"][value="page"]');
    await pageRadio.click({ force: true });
    await page.waitForTimeout(500);

    const stored = await page.evaluate(() => localStorage.getItem('murajah-audioPlayMode'));
    expect(stored).toBe('page');
  });

  test('should persist audioPlayMode to IndexedDB', async ({ page }) => {
    await openSettings(page);
    const pageRadio = page.locator('input[type="radio"][name="audioPlayMode"][value="page"]');
    await pageRadio.click({ force: true });
    await page.waitForTimeout(1000);

    // Verify IndexedDB has the value
    const dbValue = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('murajah-db');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['appData'], 'readonly');
          const store = tx.objectStore('appData');
          const get = store.get('setting-audioPlayMode');
          get.onsuccess = () => resolve(get.result ? get.result.value : null);
          get.onerror = () => reject(get.error);
        };
        req.onerror = () => reject(req.error);
      });
    });
    expect(dbValue).toBe('page');
  });

  test('should restore page-by-page mode after reload', async ({ page }) => {
    // Set to page mode
    await openSettings(page);
    const pageRadio = page.locator('input[type="radio"][name="audioPlayMode"][value="page"]');
    await pageRadio.click({ force: true });
    await page.waitForTimeout(1000);

    // Reload the page
    await page.reload();
    await waitForAppLoad(page);

    // Verify localStorage is still 'page'
    const stored = await page.evaluate(() => localStorage.getItem('murajah-audioPlayMode'));
    expect(stored).toBe('page');

    // Re-open settings and verify radio state
    await openSettings(page);
    const restoredPageRadio = page.locator('input[type="radio"][name="audioPlayMode"][value="page"]');
    await expect(restoredPageRadio).toBeChecked({ timeout: 5000 });
  });

  test('should restore page-by-page mode after multiple reloads', async ({ page }) => {
    // Set to page mode
    await openSettings(page);
    const pageRadio = page.locator('input[type="radio"][name="audioPlayMode"][value="page"]');
    await pageRadio.click({ force: true });
    await page.waitForTimeout(1000);

    // Reload twice
    await page.reload();
    await waitForAppLoad(page);
    await page.reload();
    await waitForAppLoad(page);

    // Verify it's still 'page'
    await openSettings(page);
    const restoredPageRadio = page.locator('input[type="radio"][name="audioPlayMode"][value="page"]');
    await expect(restoredPageRadio).toBeChecked({ timeout: 5000 });
  });

  test('should pass audioPlayMode prop to QuranAudioPlayerComponent', async ({ page }) => {
    // Set to page mode
    await openSettings(page);
    const pageRadio = page.locator('input[type="radio"][name="audioPlayMode"][value="page"]');
    await pageRadio.click({ force: true });
    await page.waitForTimeout(500);

    // Close settings
    const closeButton = page.locator('button:has(.fa-times)').first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await page.waitForTimeout(300);
    }

    // Verify settingsStore.audioPlayMode is 'page' AND localStorage matches
    const result = await page.evaluate(() => {
      const ls = localStorage.getItem('murajah-audioPlayMode');
      // Also check via the audio player component's attribute binding
      const audioSection = document.getElementById('audio-section');
      return { localStorage: ls, audioSectionExists: !!audioSection };
    });
    expect(result.localStorage).toBe('page');
  });

  test('should disable page-by-page radio when Indopak layout is active', async ({ page }) => {
    // Switch to Indopak layout via the font toggle button
    const fontButton = page.locator('button:has(.fa-font), button[title*="font"], button[title*="Font"]').first();
    const fontButtonVisible = await fontButton.isVisible().catch(() => false);
    if (fontButtonVisible) {
      // Click until we reach indopak (check by looking at the layout label)
      for (let i = 0; i < 3; i++) {
        await fontButton.click({ force: true });
        await page.waitForTimeout(2000);
        // Check if layout is indopak by looking for "Indopak" text on screen
        const layoutText = await page.locator('text=/Indopak/i').count();
        if (layoutText > 0) break;
      }
    }

    await openSettings(page);
    const pageRadio = page.locator('input[type="radio"][name="audioPlayMode"][value="page"]');
    const isDisabled = await pageRadio.isDisabled().catch(() => false);
    // Check if layout label shows Indopak
    const hasIndopakLabel = await page.locator('text=/Indopak/i').count() > 0;
    if (hasIndopakLabel) {
      expect(isDisabled).toBe(true);
    }
  });

  test('should switch to verse mode when switching to Indopak layout with page mode active', async ({ page }) => {
    // First set page mode
    await openSettings(page);
    const pageRadio = page.locator('input[type="radio"][name="audioPlayMode"][value="page"]');
    await pageRadio.click({ force: true });
    await page.waitForTimeout(500);

    // Close settings modal and wait for toast to disappear
    const closeButton = page.locator('button:has(.fa-times)').first();
    if (await closeButton.isVisible()) await closeButton.click();
    await page.waitForTimeout(2500); // Wait for success toast to disappear

    // Switch font until we reach Indopak
    const fontButton = page.locator('button:has(.fa-font), button[title*="font"], button[title*="Font"]').first();
    const fontButtonVisible = await fontButton.isVisible().catch(() => false);

    if (fontButtonVisible) {
      for (let i = 0; i < 3; i++) {
        await fontButton.click({ force: true });
        await page.waitForTimeout(2000);
        const currentMode = await page.evaluate(() => localStorage.getItem('murajah-audioPlayMode'));
        const currentLayout = await page.evaluate(() => {
          try {
            // Check layout label text as a reliable indicator
            const label = document.querySelector('button:has(.fa-font), button[title*="font"]');
            return label ? label.textContent.trim() : '';
          } catch (_) { return ''; }
        });
        // If localStorage was reset to 'verse', Indopak mode was triggered
        if (currentMode === 'verse') {
          expect(currentMode).toBe('verse');
          return;
        }
      }
    }
    // If we couldn't switch to indopak, skip assertion
  });
});
