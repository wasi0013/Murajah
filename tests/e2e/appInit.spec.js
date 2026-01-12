/**
 * E2E Tests: App Initialization
 * Tests the full app load, IndexedDB initialization, and basic state
 */

import { test, expect } from '@playwright/test';

// Helper to wait for app to finish loading
async function waitForAppLoad(page) {
  // Wait for the initial loader to disappear
  await page.waitForFunction(() => {
    const loader = document.getElementById('initial-loader');
    return !loader || loader.style.display === 'none' || loader.classList.contains('hidden');
  }, { timeout: 60000 });
  
  // Also wait for Vue app to be mounted
  await page.waitForTimeout(1000);
}

test.describe('App Initialization', () => {
  
  test.beforeEach(async ({ page }) => {
    // Clear IndexedDB before each test
    await page.goto('/');
    await page.evaluate(async () => {
      const databases = await indexedDB.databases();
      for (const db of databases) {
        if (db.name) {
          indexedDB.deleteDatabase(db.name);
        }
      }
    });
  });

  test('should load the app without errors', async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    
    // App should be visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show the main Quran text section', async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    
    // Quran text container should exist
    const quranSection = page.locator('#quran-text-section');
    await expect(quranSection).toBeVisible({ timeout: 10000 });
  });

  test('should show navigation elements', async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    
    // Navigation should be visible
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });
  });

  test('should initialize with page 1 by default', async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    
    // URL should not have page param or have page=1
    const url = page.url();
    expect(url.includes('page=1') || !url.includes('page=')).toBe(true);
  });

  test('should handle URL page parameter', async ({ page }) => {
    await page.goto('/?page=50');
    await waitForAppLoad(page);
    
    // URL should maintain page parameter
    expect(page.url()).toContain('page=50');
  });

  test('should initialize IndexedDB', async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    
    // Check IndexedDB was created
    const dbExists = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const request = indexedDB.open('murajah-db');
        request.onsuccess = () => {
          const db = request.result;
          const storeNames = Array.from(db.objectStoreNames);
          db.close();
          resolve(storeNames.includes('appData'));
        };
        request.onerror = () => resolve(false);
      });
    });
    
    expect(dbExists).toBe(true);
  });

  test('should display version in footer', async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    
    // Scroll to footer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    
    // Footer should contain version
    const footer = page.locator('footer');
    await expect(footer).toContainText(/v?\d+\.\d+\.\d+/, { timeout: 10000 });
  });

  test('should handle tafsir URL parameter', async ({ page }) => {
    await page.goto('/?page=10&tafsir=true');
    await waitForAppLoad(page);
    
    // URL should contain tafsir parameter
    expect(page.url()).toContain('tafsir=true');
  });

  test('should handle wordbyword URL parameter', async ({ page }) => {
    await page.goto('/?page=10&wordbyword=true');
    await waitForAppLoad(page);
    
    // URL should contain wordbyword parameter
    expect(page.url()).toContain('wordbyword=true');
  });
});
