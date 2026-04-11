/**
 * E2E Tests: Quiz Page — i18n / Locale Behaviour
 *
 * Verifies that quiz.html correctly reads the language preference from
 * localStorage (written by index.html / setLocale()) and renders the UI
 * in the chosen locale (English, Bangla, Arabic).
 *
 * Covers:
 *  - Default English rendering
 *  - Bangla locale via localStorage
 *  - Arabic locale via localStorage
 *  - Tab labels in each locale
 *  - Config tab title in each locale
 *  - Locale sync round-trip (write then read)
 *  - Unsupported locale falls back to English
 */

import { test, expect } from '@playwright/test';
import { waitForQuizLoad } from './helpers.js';

// ─── Locale-specific strings expected in the UI ────────────────────────────

const LOCALES = {
  en: {
    lightningTab: '⚡ Lightning Round',
    settingsTab: '⚙️ Settings',
    configTitle: '⚙️ Quiz Settings'
  },
  bn: {
    lightningTab: '⚡ লাইটনিং রাউন্ড',
    settingsTab: '⚙️ সেটিংস',
    configTitle: '⚙️ কুইজ সেটিংস'
  },
  ar: {
    lightningTab: '⚡ الجولة السريعة',
    settingsTab: '⚙️ الإعدادات',
    configTitle: '⚙️ إعدادات الاختبار'
  }
};

// Helper – navigate to quiz.html with a preset locale in localStorage
async function gotoQuizWithLocale(page, locale) {
  await page.addInitScript((loc) => {
    localStorage.setItem('murajah-language', loc);
  }, locale);
  await page.goto('/quiz.html');
  await waitForQuizLoad(page);
}

// ─── Selectors (drawer-based navigation on all viewports) ──────────────────

const PILL = '.mobile-tab-bar';          // tappable pill showing current tab
const DRAWER = '.mobile-menu';            // slide-out drawer
const DRAWER_TAB = `${DRAWER} button.mobile-menu-item`; // quiz mode buttons

// Switch tab via dispatchEvent on the hidden desktop nav buttons (avoids flaky drawer animation)
async function selectTabByClick(page, tabText) {
  // The hidden nav[aria-label="Quiz Types"] buttons are still in the DOM (display:none)
  // dispatchEvent bypasses visibility checks and fires the @click handler
  await page.locator('nav[aria-label="Quiz Types"] button').filter({ hasText: tabText }).dispatchEvent('click');
  await page.waitForTimeout(300);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

test.describe('Quiz i18n – default English', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/quiz.html');
    await waitForQuizLoad(page);
  });

  test('shows Lightning Round tab in English', async ({ page }) => {
    // The pill displays the current tab label — verify it
    await expect(page.locator(PILL)).toContainText(LOCALES.en.lightningTab);
  });

  test('shows Settings tab in English', async ({ page }) => {
    // Verify Settings tab text exists in the drawer buttons (DOM always present)
    const tabTexts = await page.locator(DRAWER_TAB).allTextContents();
    expect(tabTexts.some(t => t.includes('Settings'))).toBe(true);
  });

  test('has 5 tab buttons', async ({ page }) => {
    await expect(page.locator(DRAWER_TAB)).toHaveCount(5);
  });

  test('config tab shows English title', async ({ page }) => {
    await selectTabByClick(page, LOCALES.en.settingsTab);
    await expect(page.locator(`text=${LOCALES.en.configTitle}`).first()).toBeVisible();
  });
});

test.describe('Quiz i18n – Bangla (bn) locale', () => {
  test.beforeEach(async ({ page }) => {
    await gotoQuizWithLocale(page, 'bn');
  });

  test('shows Lightning Round tab in Bangla', async ({ page }) => {
    await expect(page.locator(PILL)).toContainText(LOCALES.bn.lightningTab);
  });

  test('shows Settings tab in Bangla', async ({ page }) => {
    const tabTexts = await page.locator(DRAWER_TAB).allTextContents();
    expect(tabTexts.some(t => t.includes('সেটিংস'))).toBe(true);
  });

  test('config tab shows Bangla title', async ({ page }) => {
    await selectTabByClick(page, LOCALES.bn.settingsTab);
    await expect(page.locator(`text=${LOCALES.bn.configTitle}`).first()).toBeVisible();
  });

  test('does NOT show English tab labels', async ({ page }) => {
    const tabTexts = await page.locator(DRAWER_TAB).allTextContents();
    expect(tabTexts.some(t => t.includes('Lightning Round'))).toBe(false);
  });
});

test.describe('Quiz i18n – Arabic (ar) locale', () => {
  test.beforeEach(async ({ page }) => {
    await gotoQuizWithLocale(page, 'ar');
  });

  test('shows Lightning Round tab in Arabic', async ({ page }) => {
    await expect(page.locator(PILL)).toContainText(LOCALES.ar.lightningTab);
  });

  test('shows Settings tab in Arabic', async ({ page }) => {
    const tabTexts = await page.locator(DRAWER_TAB).allTextContents();
    expect(tabTexts.some(t => t.includes('الإعدادات'))).toBe(true);
  });

  test('config tab shows Arabic title', async ({ page }) => {
    await selectTabByClick(page, LOCALES.ar.settingsTab);
    await expect(page.locator(`text=${LOCALES.ar.configTitle}`).first()).toBeVisible();
  });

  test('does NOT show English tab labels', async ({ page }) => {
    const tabTexts = await page.locator(DRAWER_TAB).allTextContents();
    expect(tabTexts.some(t => t.includes('Lightning Round'))).toBe(false);
  });
});

test.describe('Quiz i18n – locale fallback', () => {
  test('unsupported locale falls back to English tab labels', async ({ page }) => {
    await gotoQuizWithLocale(page, 'fr'); // French is not supported
    await expect(page.locator(PILL)).toContainText(LOCALES.en.lightningTab);
  });

  test('missing localStorage key defaults to English', async ({ page }) => {
    await page.goto('/quiz.html');
    await waitForQuizLoad(page);
    await expect(page.locator(PILL)).toContainText(LOCALES.en.lightningTab);
  });
});

test.describe('Quiz i18n – locale sync round-trip', () => {
  test('locale set in localStorage is honoured on fresh page load', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('murajah-language', 'ar');
    });
    await page.goto('/quiz.html');
    await waitForQuizLoad(page);
    await expect(page.locator(PILL)).toContainText(LOCALES.ar.lightningTab);
  });

  test('changing locale in localStorage and reloading updates the UI', async ({ page }) => {
    // First load with English
    await page.goto('/quiz.html');
    await waitForQuizLoad(page);
    await expect(page.locator(PILL)).toContainText(LOCALES.en.lightningTab);

    // Set locale to Bangla and reload
    await page.evaluate(() => localStorage.setItem('murajah-language', 'bn'));
    await page.reload();
    await waitForQuizLoad(page);
    await expect(page.locator(PILL)).toContainText(LOCALES.bn.lightningTab);
  });
});
