/**
 * E2E: iOS-only service worker branch (2026-07-23 hotfix).
 *
 * iOS/iPadOS clients register `./sw.js?platform=ios` and get a network-only
 * navigation strategy (no Cache Storage read/write for the document itself) —
 * see the "iOS navigation" note at the top of source/sw.js for why. This test
 * guards two things: (1) iOS actually gets the `?platform=ios` worker and
 * never caches the navigated document, and (2) non-iOS is provably untouched
 * — still registers the plain `./sw.js` and still caches navigations, exactly
 * as before this change.
 */

import { test, expect, devices } from '@playwright/test';
import { waitForAppLoad } from './helpers.js';

// Only the UA/viewport/touch bits — NOT the full device descriptor, which also
// sets `defaultBrowserType: 'webkit'` and can't be applied inside a describe
// block (Playwright would need a dedicated project/worker for that). Our
// isIOSDevice() check only reads userAgent/platform/maxTouchPoints, so this
// subset is all that's needed to exercise the iOS branch on either engine.
const { defaultBrowserType, ...iPhone13 } = devices['iPhone 13'];

test.describe('iOS-only service worker branch', () => {
  test.use({ ...iPhone13 });

  test('iOS registers the platform=ios worker and does not cache the navigation', async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    await page.waitForTimeout(1500); // let the SW finish installing/activating

    const scriptURL = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg?.active?.scriptURL || reg?.installing?.scriptURL || reg?.waiting?.scriptURL || null;
    });
    expect(scriptURL).toContain('platform=ios');

    const navigationIsCached = await page.evaluate(async () => {
      const cacheNames = (await caches.keys()).filter((n) => n.startsWith('murajah-cache-'));
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const match = await cache.match('./') || await cache.match('./index.html') || await cache.match(location.href);
        if (match) return true;
      }
      return false;
    });
    expect(navigationIsCached).toBe(false);

    // The app itself must still work — network-only doesn't mean broken.
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Non-iOS service worker branch is unaffected', () => {
  test('desktop registers the plain worker and still caches the navigation', async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    await page.waitForTimeout(1500);

    const scriptURL = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg?.active?.scriptURL || reg?.installing?.scriptURL || reg?.waiting?.scriptURL || null;
    });
    expect(scriptURL).not.toContain('platform=ios');

    const navigationIsCached = await page.evaluate(async () => {
      const cacheNames = (await caches.keys()).filter((n) => n.startsWith('murajah-cache-'));
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const match = await cache.match('./') || await cache.match('./index.html') || await cache.match(location.href);
        if (match) return true;
      }
      return false;
    });
    expect(navigationIsCached).toBe(true);
  });
});
