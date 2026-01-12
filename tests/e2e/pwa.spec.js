/**
 * E2E Tests: PWA Features
 * Tests offline mode, service worker, installability
 */

import { test, expect } from '@playwright/test';
import { waitForAppLoad } from './helpers.js';

test.describe('PWA Features', () => {
  
  test('should register service worker', async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    
    const hasServiceWorker = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.length > 0;
    });
    
    expect(hasServiceWorker).toBe(true);
  });

  test('should have valid manifest.json', async ({ page }) => {
    const response = await page.request.get('/manifest.json');
    expect(response.status()).toBe(200);
    
    const manifest = await response.json();
    expect(manifest).toHaveProperty('name');
    expect(manifest).toHaveProperty('short_name');
    expect(manifest).toHaveProperty('start_url');
    expect(manifest).toHaveProperty('display');
    expect(manifest).toHaveProperty('icons');
  });

  test('should have PWA meta tags', async ({ page }) => {
    await page.goto('/');
    
    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
    expect(themeColor).toBeDefined();
    
    const appleIcon = page.locator('link[rel="apple-touch-icon"]');
    const hasAppleIcon = await appleIcon.count();
    expect(hasAppleIcon).toBeGreaterThan(0);
  });

  test('should link to manifest', async ({ page }) => {
    await page.goto('/');
    
    const manifestLink = page.locator('link[rel="manifest"]');
    const href = await manifestLink.getAttribute('href');
    expect(href).toContain('manifest');
  });

  test('should cache static assets', async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    await page.waitForTimeout(2000);
    
    const hasCaches = await page.evaluate(async () => {
      if (!('caches' in window)) return false;
      const cacheNames = await caches.keys();
      return cacheNames.length > 0;
    });
    
    expect(hasCaches).toBe(true);
  });

  test('should have proper viewport meta tag', async ({ page }) => {
    await page.goto('/');
    
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('initial-scale=1');
  });

  test('should display properly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await waitForAppLoad(page);
    
    const body = page.locator('body');
    const boundingBox = await body.boundingBox();
    expect(boundingBox?.width).toBeLessThanOrEqual(375);
  });

  test('should handle network errors gracefully', async ({ page, context }) => {
    // First load page online
    await page.goto('/');
    await waitForAppLoad(page);
    
    // Go offline then back online
    await context.setOffline(true);
    await page.waitForTimeout(1000);
    await context.setOffline(false);
    
    // Reload should work
    await page.reload();
    await waitForAppLoad(page);
    
    await expect(page.locator('body')).toBeVisible();
  });
});
