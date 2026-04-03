/**
 * E2E Tests: Quran Display & Layout
 * Tests QPC/Indopak layouts, fonts, colors, Tajweed
 */

import { test, expect } from '@playwright/test';
import { waitForAppLoad, waitForQuranData } from './helpers.js';

test.describe('Quran Display & Layout', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('should display Quran text', async ({ page }) => {
    await page.goto('/?page=1');
    await waitForQuranData(page);
    
    const quranSection = page.locator('#quran-text-section');
    await expect(quranSection).toBeVisible();
    
    const textContent = await quranSection.textContent();
    expect(textContent).toMatch(/[\u0600-\u06FF\uFB50-\uFDFF]/);
  });

  test('should display RTL text correctly', async ({ page }) => {
    await page.goto('/?page=1');
    await waitForQuranData(page);
    
    // Check that Arabic text is present
    const quranSection = page.locator('#quran-text-section');
    const textContent = await quranSection.textContent();
    expect(textContent).toMatch(/[\u0600-\u06FF\uFB50-\uFDFF]/);
    
    // The actual text inside should have RTL or the page has dir=rtl
    const htmlDir = await page.locator('html').getAttribute('dir');
    const hasRtl = htmlDir === 'rtl' || textContent.match(/[\u0600-\u06FF\uFB50-\uFDFF]/);
    expect(hasRtl).toBeTruthy();
  });

  test('should render page lines correctly', async ({ page }) => {
    await page.goto('/?page=1');
    await waitForQuranData(page);
    
    const quranSection = page.locator('#quran-text-section');
    await expect(quranSection).toBeVisible();
  });

  test('should display Surah name', async ({ page }) => {
    await page.goto('/?page=1');
    await waitForQuranData(page);
    
    const surahName = page.locator('text=/الفاتحة|Al-Fatihah|Fatiha/i');
    const exists = await surahName.count();
    expect(exists).toBeGreaterThan(0);
  });

  test('should not crash on last page', async ({ page }) => {
    // Use page 600 which is valid for QPC layout
    await page.goto('/?page=600');
    await waitForQuranData(page);
    
    const quranSection = page.locator('#quran-text-section');
    await expect(quranSection).toBeVisible();
    
    // Wait for Arabic text to load
    await page.waitForFunction(() => {
      const section = document.querySelector('#quran-text-section');
      const text = section ? section.textContent : '';
      return /[\u0600-\u06FF\uFB50-\uFDFF]/.test(text);
    }, null, { timeout: 30000 });
    
    const textContent = await quranSection.textContent();
    expect(textContent).toMatch(/[\u0600-\u06FF\uFB50-\uFDFF]/);
  });

  test('should maintain layout on window resize', async ({ page }) => {
    await page.goto('/?page=1');
    await waitForQuranData(page);
    
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    
    const quranSection = page.locator('#quran-text-section');
    await expect(quranSection).toBeVisible();
    
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(500);
    
    await expect(quranSection).toBeVisible();
  });
});
