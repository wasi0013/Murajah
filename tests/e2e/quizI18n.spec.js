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

// ─── Tab selector ──────────────────────────────────────────────────────────

const TAB_NAV = 'nav[aria-label="Quiz Types"]';

// ─── Tests ─────────────────────────────────────────────────────────────────

test.describe('Quiz i18n – default English', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/quiz.html');
    await waitForQuizLoad(page);
  });

  test('shows Lightning Round tab in English', async ({ page }) => {
    const tabNav = page.locator(TAB_NAV);
    await expect(tabNav).toBeVisible();
    await expect(tabNav.locator(`button:has-text("${LOCALES.en.lightningTab}")`)).toBeVisible();
  });

  test('shows Settings tab in English', async ({ page }) => {
    await expect(
      page.locator(`${TAB_NAV} button:has-text("${LOCALES.en.settingsTab}")`)
    ).toBeVisible();
  });

  test('has 5 tab buttons', async ({ page }) => {
    const buttons = page.locator(`${TAB_NAV} button`);
    await expect(buttons).toHaveCount(5);
  });

  test('config tab shows English title', async ({ page }) => {
    // Navigate to the settings/config tab
    await page.locator(`${TAB_NAV} button:has-text("${LOCALES.en.settingsTab}")`).click();
    await page.waitForTimeout(300);
    await expect(page.locator(`text=${LOCALES.en.configTitle}`).first()).toBeVisible();
  });
});

test.describe('Quiz i18n – Bangla (bn) locale', () => {
  test.beforeEach(async ({ page }) => {
    await gotoQuizWithLocale(page, 'bn');
  });

  test('shows Lightning Round tab in Bangla', async ({ page }) => {
    await expect(
      page.locator(`${TAB_NAV} button:has-text("${LOCALES.bn.lightningTab}")`)
    ).toBeVisible();
  });

  test('shows Settings tab in Bangla', async ({ page }) => {
    await expect(
      page.locator(`${TAB_NAV} button:has-text("${LOCALES.bn.settingsTab}")`)
    ).toBeVisible();
  });

  test('config tab shows Bangla title', async ({ page }) => {
    await page.locator(`${TAB_NAV} button:has-text("${LOCALES.bn.settingsTab}")`).click();
    await page.waitForTimeout(300);
    await expect(page.locator(`text=${LOCALES.bn.configTitle}`).first()).toBeVisible();
  });

  test('does NOT show English tab labels', async ({ page }) => {
    const englishTab = page.locator(
      `${TAB_NAV} button:has-text("${LOCALES.en.lightningTab}")`
    );
    await expect(englishTab).not.toBeVisible();
  });
});

test.describe('Quiz i18n – Arabic (ar) locale', () => {
  test.beforeEach(async ({ page }) => {
    await gotoQuizWithLocale(page, 'ar');
  });

  test('shows Lightning Round tab in Arabic', async ({ page }) => {
    await expect(
      page.locator(`${TAB_NAV} button:has-text("${LOCALES.ar.lightningTab}")`)
    ).toBeVisible();
  });

  test('shows Settings tab in Arabic', async ({ page }) => {
    await expect(
      page.locator(`${TAB_NAV} button:has-text("${LOCALES.ar.settingsTab}")`)
    ).toBeVisible();
  });

  test('config tab shows Arabic title', async ({ page }) => {
    await page.locator(`${TAB_NAV} button:has-text("${LOCALES.ar.settingsTab}")`).click();
    await page.waitForTimeout(300);
    await expect(page.locator(`text=${LOCALES.ar.configTitle}`).first()).toBeVisible();
  });

  test('does NOT show English tab labels', async ({ page }) => {
    const englishTab = page.locator(
      `${TAB_NAV} button:has-text("${LOCALES.en.lightningTab}")`
    );
    await expect(englishTab).not.toBeVisible();
  });
});

test.describe('Quiz i18n – locale fallback', () => {
  test('unsupported locale falls back to English tab labels', async ({ page }) => {
    await gotoQuizWithLocale(page, 'fr'); // French is not supported
    await expect(
      page.locator(`${TAB_NAV} button:has-text("${LOCALES.en.lightningTab}")`)
    ).toBeVisible();
  });

  test('missing localStorage key defaults to English', async ({ page }) => {
    // Navigate without setting any locale
    await page.goto('/quiz.html');
    await waitForQuizLoad(page);
    await expect(
      page.locator(`${TAB_NAV} button:has-text("${LOCALES.en.lightningTab}")`)
    ).toBeVisible();
  });
});

test.describe('Quiz i18n – locale sync round-trip', () => {
  test('locale set in localStorage is honoured on fresh page load', async ({ page }) => {
    // Simulate the locale being set by index.html's setLocale()
    await page.addInitScript(() => {
      localStorage.setItem('murajah-language', 'ar');
    });
    await page.goto('/quiz.html');
    await waitForQuizLoad(page);

    await expect(
      page.locator(`${TAB_NAV} button:has-text("${LOCALES.ar.lightningTab}")`)
    ).toBeVisible();
  });

  test('changing locale in localStorage and reloading updates the UI', async ({ page }) => {
    // First load with English
    await page.goto('/quiz.html');
    await waitForQuizLoad(page);
    await expect(
      page.locator(`${TAB_NAV} button:has-text("${LOCALES.en.lightningTab}")`)
    ).toBeVisible();

    // Set locale to Bangla and reload
    await page.evaluate(() => localStorage.setItem('murajah-language', 'bn'));
    await page.reload();
    await waitForQuizLoad(page);
    await expect(
      page.locator(`${TAB_NAV} button:has-text("${LOCALES.bn.lightningTab}")`)
    ).toBeVisible();
  });
});
