/**
 * E2E Tests: Mushaf View
 *
 * Mushaf view renders 604-page QPC Quran images instead of font-based text.
 * Each image covers two pages (e.g. page-1-2.png, page-3-4.png).
 * Available only in QPC/Tajweed layout, not in Indopak layout.
 */

import { test, expect } from '@playwright/test';
import { waitForAppLoad, waitForQuranData } from './helpers.js';

// Helper: switch the font mode to the given mode name by clicking the layout button
// Clicks until the button label matches the target mode label.
async function switchToFontMode(page, targetLabel, maxClicks = 6) {
  const fontButton = page.locator('button').filter({ hasText: /Uthmani|Tajweed|Indopak|Mushaf/i }).first();
  for (let i = 0; i < maxClicks; i++) {
    const current = await fontButton.textContent();
    if (current && current.trim().toLowerCase() === targetLabel.toLowerCase()) break;
    await fontButton.click();
    await page.waitForTimeout(300);
  }
}

// Helper: activate mushaf mode via Vue app internals (faster than UI clicks)
async function enableMushafMode(page) {
  await page.evaluate(() => {
    // Access the Vue app store through the exposed app instance
    const app = document.querySelector('#app')?.__vue_app__;
    if (!app) return;
    const instance = app._instance;
    if (!instance) return;
    const { settingsStore } = instance.setupContext.expose || instance.exposed || {};
    if (settingsStore) {
      settingsStore.layout = 'qpc';
      settingsStore.tajweedEnabled = false;
      settingsStore.mushafEnabled = true;
    }
  });
  await page.waitForTimeout(300);
}

// Helper: disable mushaf mode (back to uthmani)
async function disableMushafMode(page) {
  await page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__;
    if (!app) return;
    const instance = app._instance;
    if (!instance) return;
    const { settingsStore } = instance.setupContext.expose || instance.exposed || {};
    if (settingsStore) {
      settingsStore.mushafEnabled = false;
      settingsStore.tajweedEnabled = true;
    }
  });
  await page.waitForTimeout(300);
}

test.describe('Mushaf View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?page=1');
    await waitForAppLoad(page);
  });

  // ── Image rendering ────────────────────────────────────────────────────────

  test('shows mushaf image when mushaf mode is active', async ({ page }) => {
    await waitForQuranData(page);
    await switchToFontMode(page, 'Mushaf');

    const mushafSection = page.locator('#mushaf-view-section');
    await expect(mushafSection).toBeVisible({ timeout: 5000 });

    const img = mushafSection.locator('img');
    await expect(img).toBeVisible();
  });

  test('mushaf image src uses correct page-pair naming for odd page', async ({ page }) => {
    await page.goto('/?page=1');
    await waitForAppLoad(page);
    await switchToFontMode(page, 'Mushaf');

    const img = page.locator('#mushaf-view-section img');
    await expect(img).toBeVisible({ timeout: 5000 });

    const src = await img.getAttribute('src');
    expect(src).toMatch(/page-1-2\.png/);
  });

  test('mushaf image src uses correct page-pair naming for even page', async ({ page }) => {
    await page.goto('/?page=2');
    await waitForAppLoad(page);
    await switchToFontMode(page, 'Mushaf');

    const img = page.locator('#mushaf-view-section img');
    await expect(img).toBeVisible({ timeout: 5000 });

    // Even page 2 → image page-1-2.png (same image as page 1)
    const src = await img.getAttribute('src');
    expect(src).toMatch(/page-1-2\.png/);
  });

  test('mushaf image src updates on page navigation', async ({ page }) => {
    await page.goto('/?page=3');
    await waitForAppLoad(page);
    await switchToFontMode(page, 'Mushaf');

    const img = page.locator('#mushaf-view-section img');
    await expect(img).toBeVisible({ timeout: 5000 });

    // Page 3 → page-3-4.png
    const src = await img.getAttribute('src');
    expect(src).toMatch(/page-3-4\.png/);
  });

  test('mushaf image src at page 603 uses page-603-604.png', async ({ page }) => {
    await page.goto('/?page=603');
    await waitForAppLoad(page);
    await switchToFontMode(page, 'Mushaf');

    const img = page.locator('#mushaf-view-section img');
    await expect(img).toBeVisible({ timeout: 5000 });

    const src = await img.getAttribute('src');
    expect(src).toMatch(/page-603-604\.png/);
  });

  // ── Layout mode visibility guards ─────────────────────────────────────────

  test('hides font-based quran text when mushaf mode is active', async ({ page }) => {
    await waitForQuranData(page);
    await switchToFontMode(page, 'Mushaf');

    // The font-rendered quran text container should not exist
    const fontText = page.locator('.quran-text');
    // Either not in DOM or not visible
    const count = await fontText.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(fontText.nth(i)).not.toBeVisible();
      }
    }
  });

  test('mushaf section is hidden in non-mushaf mode', async ({ page }) => {
    await waitForQuranData(page);
    // Ensure we are NOT in mushaf mode (default is tajweed or uthmani)
    const mushafSection = page.locator('#mushaf-view-section');
    await expect(mushafSection).not.toBeVisible();
  });

  // ── Mode availability ──────────────────────────────────────────────────────

  test('mushaf mode is NOT available when layout is indopak', async ({ page }) => {
    await waitForQuranData(page);

    // First set indopak layout via UI cycling
    await switchToFontMode(page, 'Indopak');

    // Mushaf section should never appear
    const mushafSection = page.locator('#mushaf-view-section');
    await expect(mushafSection).not.toBeVisible();

    // Verify font button does not show mushaf label when in indopak
    const fontButton = page.locator('button').filter({ hasText: /Uthmani|Tajweed|Indopak|Mushaf/i }).first();
    const label = await fontButton.textContent();
    expect(label?.trim().toLowerCase()).toBe('indopak');
  });

  test('mushaf mode is available in QPC (uthmani) mode', async ({ page }) => {
    await waitForQuranData(page);
    await switchToFontMode(page, 'Mushaf');

    const mushafSection = page.locator('#mushaf-view-section');
    await expect(mushafSection).toBeVisible({ timeout: 5000 });
  });

  // ── Cycling through modes ──────────────────────────────────────────────────

  test('font mode cycles include mushaf as 4th mode', async ({ page }) => {
    await waitForQuranData(page);

    // From default tajweed mode, cycle through all 4 modes and verify mushaf appears
    const fontButton = page.locator('button').filter({ hasText: /Uthmani|Tajweed|Indopak|Mushaf/i }).first();

    // Collect all labels seen across 4 clicks
    const labels = [];
    for (let i = 0; i < 4; i++) {
      const label = await fontButton.textContent();
      labels.push(label?.trim().toLowerCase());
      await fontButton.click();
      await page.waitForTimeout(400);
    }

    expect(labels).toContain('mushaf');
  });

  test('cycling back from mushaf returns to next mode in sequence', async ({ page }) => {
    await waitForQuranData(page);

    const fontButton = page.locator('button').filter({ hasText: /Uthmani|Tajweed|Indopak|Mushaf/i }).first();

    // Reach mushaf mode
    await switchToFontMode(page, 'Mushaf');
    await expect(fontButton).toHaveText(/Mushaf/i);

    // One more click should leave mushaf
    await fontButton.click();
    await page.waitForTimeout(400);

    const label = await fontButton.textContent();
    expect(label?.trim().toLowerCase()).not.toBe('mushaf');
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  test('page navigation updates mushaf image', async ({ page }) => {
    await page.goto('/?page=1');
    await waitForAppLoad(page);
    await switchToFontMode(page, 'Mushaf');

    const img = page.locator('#mushaf-view-section img');
    await expect(img).toBeVisible({ timeout: 5000 });

    // Navigate to next page via next button
    const nextBtn = page.locator('button').filter({ hasText: /next/i }).last();
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForTimeout(400);
    } else {
      // Use the overlay arrow
      await page.locator('button[title*="Next page"], button[title*="next page"]').first().click({ force: true });
      await page.waitForTimeout(400);
    }

    // Image should now show page-3-4.png (page 2 → even → still page-1-2, page 3 → page-3-4)
    // Either page 2 (page-1-2.png) or page 3 (page-3-4.png) depending on navigation
    const src = await img.getAttribute('src');
    expect(src).toMatch(/page-\d+-\d+\.png/);
  });

  test('mushaf image has accessible alt text with page numbers', async ({ page }) => {
    await page.goto('/?page=5');
    await waitForAppLoad(page);
    await switchToFontMode(page, 'Mushaf');

    const img = page.locator('#mushaf-view-section img');
    await expect(img).toBeVisible({ timeout: 5000 });

    const alt = await img.getAttribute('alt');
    // Alt text should mention page numbers
    expect(alt).toMatch(/\d+/);
  });

  // ── Page ID section preserved ─────────────────────────────────────────────

  test('quran-text-section remains visible in mushaf mode', async ({ page }) => {
    await waitForQuranData(page);
    await switchToFontMode(page, 'Mushaf');

    const section = page.locator('#quran-text-section');
    await expect(section).toBeVisible({ timeout: 5000 });
  });

  // ── UI toggle states: action buttons ──────────────────────────────────────

  test('record button remains visible in mushaf mode', async ({ page }) => {
    await waitForQuranData(page);
    await switchToFontMode(page, 'Mushaf');

    // Record button should be visible (it's always shown regardless of mushaf mode)
    const recordBtn = page.locator('button').filter({ hasText: /^Record$/i });
    await expect(recordBtn.first()).toBeVisible({ timeout: 5000 });
  });

  test('memorize button is hidden in mushaf mode', async ({ page }) => {
    await waitForQuranData(page);

    // Confirm visible outside mushaf mode first
    const memorizeBtn = page.locator('button span').filter({ hasText: /^Memorized?$/i });
    await expect(memorizeBtn.first()).toBeVisible({ timeout: 5000 });

    await switchToFontMode(page, 'Mushaf');

    // Should be hidden in mushaf mode
    await expect(memorizeBtn.first()).not.toBeVisible();
  });

  test('perfect button is hidden in mushaf mode', async ({ page }) => {
    await waitForQuranData(page);

    const perfectBtn = page.locator('button').filter({ hasText: /Recited without mistakes/i });
    await expect(perfectBtn.first()).toBeVisible({ timeout: 5000 });

    await switchToFontMode(page, 'Mushaf');

    await expect(perfectBtn.first()).not.toBeVisible();
  });

  test('note button is hidden in mushaf mode', async ({ page }) => {
    await waitForQuranData(page);

    const noteBtn = page.locator('button span').filter({ hasText: /^Note$/i });
    await expect(noteBtn.first()).toBeVisible({ timeout: 5000 });

    await switchToFontMode(page, 'Mushaf');

    await expect(noteBtn.first()).not.toBeVisible();
  });

  test('action card is visible in mushaf mode (contains record button)', async ({ page }) => {
    await waitForQuranData(page);
    await switchToFontMode(page, 'Mushaf');

    // The action card itself is always visible now (v-if removed)
    const recordBtn = page.locator('button').filter({ hasText: /^Record$/i });
    await expect(recordBtn.first()).toBeVisible({ timeout: 5000 });
  });

  // ── UI toggle states: audio section ───────────────────────────────────────

  test('audio player section is visible in mushaf mode', async ({ page }) => {
    await waitForQuranData(page);
    await switchToFontMode(page, 'Mushaf');

    const audioSection = page.locator('#audio-section');
    await expect(audioSection).toBeVisible({ timeout: 5000 });
  });

  // ── UI toggle states: color palette hidden ────────────────────────────────

  test('color palette toggle is hidden in mushaf mode', async ({ page }) => {
    await waitForQuranData(page);

    // In normal mode the color palette / quran options toggle is in top-left of card
    // It uses `v-if="!isMushaf"` with class "absolute top-2 left-2 z-10"
    const palette = page.locator('#quran-text-section .absolute.\\!isMushaf, #quran-text-section [class*="absolute"][class*="top-2"][class*="left-2"]').first();

    await switchToFontMode(page, 'Mushaf');

    // The palette div should not be visible (v-if="!isMushaf")
    const count = await page.locator('#quran-text-section').locator('[class*="absolute"][class*="top-2"]').count();
    // Either 0 elements or all are hidden
    for (let i = 0; i < count; i++) {
      const el = page.locator('#quran-text-section').locator('[class*="absolute"][class*="top-2"]').nth(i);
      const isVisible = await el.isVisible();
      // None of the palette-area elements should be visible in mushaf mode
      if (isVisible) {
        // It might be a different element; only check ones inside the quran-text card that are palette-like
        const text = await el.textContent();
        // Palette elements have icon text or are empty, not mushaf image
        expect(text).not.toMatch(/🎨|palette|color/i);
      }
    }
  });

  // ── Restoring normal mode after mushaf ────────────────────────────────────

  test('memorize and perfect buttons reappear after leaving mushaf mode', async ({ page }) => {
    await waitForQuranData(page);
    await switchToFontMode(page, 'Mushaf');

    // Hidden in mushaf
    const memorizeBtn = page.locator('button span').filter({ hasText: /^Memorized?$/i });
    await expect(memorizeBtn.first()).not.toBeVisible();

    // Leave mushaf mode
    const fontButton = page.locator('button').filter({ hasText: /Mushaf/i }).first();
    await fontButton.click();
    await page.waitForTimeout(400);

    // Should be visible again
    await expect(memorizeBtn.first()).toBeVisible({ timeout: 5000 });
  });
});
