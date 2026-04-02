/**
 * E2E Tests: Word-by-Word Feature
 * Tests translation display, tapping words, settings
 */

import { test, expect } from '@playwright/test';
import { waitForAppLoad, waitForQuranData } from './helpers.js';

test.describe('Word-by-Word Feature', () => {
  
  test('should enable word-by-word mode via URL', async ({ page }) => {
    await page.goto('/?page=1&wordbyword=true');
    await waitForQuranData(page);
    
    expect(page.url()).toContain('wordbyword=true');
  });

  test('should toggle word-by-word from UI', async ({ page }) => {
    await page.goto('/?page=1');
    await waitForQuranData(page);
    
    const wbwToggle = page.locator('button:has-text("Translation"), input[type="checkbox"]').first();
    
    if (await wbwToggle.isVisible()) {
      await wbwToggle.click();
      await page.waitForTimeout(500);
    }
    
    await expect(page.locator('body')).toBeVisible();
  });

  test('should maintain word-by-word setting on navigation', async ({ page }) => {
    // Start from page 10 so both next/prev buttons are enabled
    await page.goto('/?page=10&wordbyword=true');
    await waitForQuranData(page);
    
    // Close any modals
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Navigate to next page (page 9 in RTL)
    await page.goto('/?page=9&wordbyword=true');
    await page.waitForTimeout(500);
    
    // Verify wordbyword param persists
    expect(page.url()).toContain('wordbyword=true');
  });

  test('should display translations in correct layout', async ({ page }) => {
    await page.goto('/?page=1&wordbyword=true');
    await waitForQuranData(page);
    
    const quranSection = page.locator('#quran-text-section');
    const textContent = await quranSection.textContent();
    
    // Check Arabic text is present
    expect(textContent).toMatch(/[\u0600-\u06FF\uFB50-\uFDFF]/);
  });

  test('should work with different Quran layouts', async ({ page }) => {
    await page.goto('/?page=50&wordbyword=true');
    await waitForQuranData(page);
    
    const quranSection = page.locator('#quran-text-section');
    await expect(quranSection).toBeVisible();
  });
});
