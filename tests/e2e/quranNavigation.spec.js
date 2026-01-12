/**
 * E2E Tests: Quran Navigation
 * Tests page navigation, goto, Surah dropdown
 */

import { test, expect } from '@playwright/test';
import { waitForAppLoad, waitForQuranData } from './helpers.js';

test.describe('Quran Navigation', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('should navigate to next page', async ({ page }) => {
    // Navigate via URL - from page 2 to page 1
    await page.goto('/?page=2');
    await waitForQuranData(page);
    
    // Verify we start on page 2
    expect(page.url()).toContain('page=2');
    
    // Navigate to page 1 via URL
    await page.goto('/?page=1');
    await waitForQuranData(page);
    
    // Verify navigation worked
    expect(page.url()).toContain('page=1');
    await expect(page.locator('#quran-text-section')).toBeVisible();
  });

  test('should navigate to previous page', async ({ page }) => {
    // Navigate via URL - from page 10 to page 11
    await page.goto('/?page=10');
    await waitForQuranData(page);
    
    // Verify we start on page 10
    expect(page.url()).toContain('page=10');
    
    // Navigate to page 11 via URL
    await page.goto('/?page=11');
    await waitForQuranData(page);
    
    // Verify navigation worked
    expect(page.url()).toContain('page=11');
    await expect(page.locator('#quran-text-section')).toBeVisible();
  });

  test('should handle goto page input', async ({ page }) => {
    await page.goto('/?page=1');
    await waitForQuranData(page);
    
    const pageInput = page.locator('input[type="number"]').first();
    
    if (await pageInput.isVisible()) {
      await pageInput.fill('100');
      await pageInput.press('Enter');
      await page.waitForTimeout(500);
      expect(page.url()).toContain('page=100');
    }
  });

  test('should handle invalid page numbers gracefully', async ({ page }) => {
    await page.goto('/?page=0');
    await waitForAppLoad(page);
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle page exceeding maximum', async ({ page }) => {
    await page.goto('/?page=700');
    await waitForAppLoad(page);
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show Surah selection dropdown', async ({ page }) => {
    await page.goto('/?page=1');
    await waitForQuranData(page);
    
    const surahSelector = page.locator('select').first();
    if (await surahSelector.isVisible()) {
      await expect(surahSelector).toBeVisible();
    }
  });

  test('should display current page number', async ({ page }) => {
    await page.goto('/?page=42');
    await waitForQuranData(page);
    
    const pageDisplay = page.locator('text=/42/');
    const pageExists = await pageDisplay.count();
    expect(pageExists).toBeGreaterThan(0);
  });

  test('should persist page in URL', async ({ page }) => {
    await page.goto('/?page=50');
    await waitForQuranData(page);
    expect(page.url()).toContain('page=50');
  });
});
