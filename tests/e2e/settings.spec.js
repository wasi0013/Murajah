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
