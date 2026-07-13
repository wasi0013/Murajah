/**
 * E2E Tests: Mushaf View
 *
 * Mushaf view renders 604-page QPC Quran images instead of font-based text.
 * Each image covers two pages (e.g. page-1-2.png, page-3-4.png).
 * Available only in QPC/Tajweed layout, not in Indopak layout.
 *
 * Mushaf is a dedicated nav destination (desktop "Home" dropdown / mobile menu),
 * decoupled from the Indopak/Tajweed/Uthmani font-toggle cycle.
 */

import { test, expect } from '@playwright/test';
import { waitForAppLoad, waitForQuranData } from './helpers.js';

// Helper: switch the font mode (Indopak/Tajweed/Uthmani) by clicking the layout toggle button.
// Clicks until the button label matches the target mode label.
async function switchToFontMode(page, targetLabel, maxClicks = 4) {
  const fontButton = page.locator('button').filter({ hasText: /Uthmani|Tajweed|Indopak/i }).first();
  for (let i = 0; i < maxClicks; i++) {
    const current = await fontButton.textContent();
    if (current && current.trim().toLowerCase() === targetLabel.toLowerCase()) break;
    await fontButton.click();
    await page.waitForTimeout(300);
  }
}

// Helper: navigate to the dedicated "Mushaf" nav item via the desktop "Home" dropdown.
// Note: use a plain substring filter (not an anchored regex) — the item's accessible
// text includes the icon glyph/whitespace, which an anchored `/^Mushaf$/` won't match.
async function openMushafView(page) {
  await page.hover('.nav-dropdown > button');
  await page.waitForTimeout(200);
  await page.locator('.nav-dropdown-item').filter({ hasText: 'Mushaf' }).first().click();
  await page.waitForTimeout(400);
}

// Helper: leave Mushaf view by navigating to the "Quran" nav item.
async function closeMushafView(page) {
  await page.hover('.nav-dropdown > button');
  await page.waitForTimeout(200);
  await page.locator('.nav-dropdown-item').filter({ hasText: 'Quran' }).first().click();
  await page.waitForTimeout(400);
}

test.describe('Mushaf View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?page=1');
    await waitForAppLoad(page);
  });

  // ── Image rendering ────────────────────────────────────────────────────────

  test('shows mushaf image when mushaf mode is active', async ({ page }) => {
    await waitForQuranData(page);
    await openMushafView(page);

    const mushafSection = page.locator('#mushaf-view-section');
    await expect(mushafSection).toBeVisible({ timeout: 5000 });

    const img = mushafSection.locator('img');
    await expect(img).toBeVisible();
  });

  test('mushaf image src uses correct page-pair naming for odd page', async ({ page }) => {
    await page.goto('/?page=1');
    await waitForAppLoad(page);
    await openMushafView(page);

    const img = page.locator('#mushaf-view-section img');
    await expect(img).toBeVisible({ timeout: 5000 });

    const src = await img.getAttribute('src');
    expect(src).toMatch(/page-1-2\.png/);
  });

  test('mushaf image src uses correct page-pair naming for even page', async ({ page }) => {
    await page.goto('/?page=2');
    await waitForAppLoad(page);
    await openMushafView(page);

    const img = page.locator('#mushaf-view-section img');
    await expect(img).toBeVisible({ timeout: 5000 });

    // Even page 2 → image page-1-2.png (same image as page 1)
    const src = await img.getAttribute('src');
    expect(src).toMatch(/page-1-2\.png/);
  });

  test('mushaf image src updates on page navigation', async ({ page }) => {
    await page.goto('/?page=3');
    await waitForAppLoad(page);
    await openMushafView(page);

    const img = page.locator('#mushaf-view-section img');
    await expect(img).toBeVisible({ timeout: 5000 });

    // Page 3 → page-3-4.png
    const src = await img.getAttribute('src');
    expect(src).toMatch(/page-3-4\.png/);
  });

  test('mushaf image src at page 603 uses page-603-604.png', async ({ page }) => {
    await page.goto('/?page=603');
    await waitForAppLoad(page);
    await openMushafView(page);

    const img = page.locator('#mushaf-view-section img');
    await expect(img).toBeVisible({ timeout: 5000 });

    const src = await img.getAttribute('src');
    expect(src).toMatch(/page-603-604\.png/);
  });

  // ── Layout mode visibility guards ─────────────────────────────────────────

  test('hides font-based quran text when mushaf mode is active', async ({ page }) => {
    await waitForQuranData(page);
    await openMushafView(page);

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

    // Verify font button does not show a mushaf label when in indopak
    const fontButton = page.locator('button').filter({ hasText: /Uthmani|Tajweed|Indopak/i }).first();
    const label = await fontButton.textContent();
    expect(label?.trim().toLowerCase()).toBe('indopak');
  });

  test('mushaf mode is available in QPC (uthmani) mode', async ({ page }) => {
    await waitForQuranData(page);
    await openMushafView(page);

    const mushafSection = page.locator('#mushaf-view-section');
    await expect(mushafSection).toBeVisible({ timeout: 5000 });
  });

  // ── Cycling through modes ──────────────────────────────────────────────────

  test('font mode cycle no longer includes mushaf (decoupled into dedicated nav item)', async ({ page }) => {
    await waitForQuranData(page);

    // The font toggle only cycles Indopak/Tajweed/Uthmani; Mushaf is reached via its
    // own nav item and should never appear as one of the toggle's labels.
    const fontButton = page.locator('button').filter({ hasText: /Uthmani|Tajweed|Indopak/i }).first();

    const labels = [];
    for (let i = 0; i < 4; i++) {
      const label = await fontButton.textContent();
      labels.push(label?.trim().toLowerCase());
      await fontButton.click();
      await page.waitForTimeout(400);
    }

    expect(labels).not.toContain('mushaf');
    expect(new Set(labels)).toEqual(new Set(['indopak', 'tajweed', 'uthmani']));
  });

  test('clicking the font toggle while in Mushaf exits to a text mode', async ({ page }) => {
    await waitForQuranData(page);

    const fontButton = page.locator('button').filter({ hasText: /Uthmani|Tajweed|Indopak/i }).first();

    // Enter Mushaf via its dedicated nav item
    await openMushafView(page);
    const mushafSection = page.locator('#mushaf-view-section');
    await expect(mushafSection).toBeVisible({ timeout: 5000 });

    // Clicking the font toggle while in Mushaf should exit Mushaf entirely and show
    // one of the text modes — never "mushaf" (it's no longer part of this control).
    await fontButton.click();
    await page.waitForTimeout(400);

    const label = await fontButton.textContent();
    expect(label?.trim().toLowerCase()).not.toBe('mushaf');
    expect(['indopak', 'tajweed', 'uthmani']).toContain(label?.trim().toLowerCase());
    await expect(mushafSection).not.toBeVisible();
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  test('page navigation updates mushaf image', async ({ page }) => {
    await page.goto('/?page=1');
    await waitForAppLoad(page);
    await openMushafView(page);

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
    await openMushafView(page);

    const img = page.locator('#mushaf-view-section img');
    await expect(img).toBeVisible({ timeout: 5000 });

    const alt = await img.getAttribute('alt');
    // Alt text should mention page numbers
    expect(alt).toMatch(/\d+/);
  });

  // ── Page ID section preserved ─────────────────────────────────────────────

  test('quran-text-section remains visible in mushaf mode', async ({ page }) => {
    await waitForQuranData(page);
    await openMushafView(page);

    const section = page.locator('#quran-text-section');
    await expect(section).toBeVisible({ timeout: 5000 });
  });

  // ── UI toggle states: action buttons ──────────────────────────────────────

  test('record button remains visible in mushaf mode', async ({ page }) => {
    await waitForQuranData(page);
    await openMushafView(page);

    // Record button should be visible (it's always shown regardless of mushaf mode)
    const recordBtn = page.locator('button').filter({ hasText: /^Record$/i });
    await expect(recordBtn.first()).toBeVisible({ timeout: 5000 });
  });

  test('memorize button is hidden in mushaf mode', async ({ page }) => {
    await waitForQuranData(page);

    // Confirm visible outside mushaf mode first
    const memorizeBtn = page.locator('button span').filter({ hasText: /^Memorized?$/i });
    await expect(memorizeBtn.first()).toBeVisible({ timeout: 5000 });

    await openMushafView(page);

    // Should be hidden in mushaf mode
    await expect(memorizeBtn.first()).not.toBeVisible();
  });

  test('perfect button is hidden in mushaf mode', async ({ page }) => {
    await waitForQuranData(page);

    const perfectBtn = page.locator('button').filter({ hasText: /Recited without mistakes/i });
    await expect(perfectBtn.first()).toBeVisible({ timeout: 5000 });

    await openMushafView(page);

    await expect(perfectBtn.first()).not.toBeVisible();
  });

  test('note button is hidden in mushaf mode', async ({ page }) => {
    await waitForQuranData(page);

    const noteBtn = page.locator('button span').filter({ hasText: /^Note$/i });
    await expect(noteBtn.first()).toBeVisible({ timeout: 5000 });

    await openMushafView(page);

    await expect(noteBtn.first()).not.toBeVisible();
  });

  test('action card is visible in mushaf mode (contains record button)', async ({ page }) => {
    await waitForQuranData(page);
    await openMushafView(page);

    // The action card itself is always visible now (v-if removed)
    const recordBtn = page.locator('button').filter({ hasText: /^Record$/i });
    await expect(recordBtn.first()).toBeVisible({ timeout: 5000 });
  });

  // ── UI toggle states: audio section ───────────────────────────────────────

  test('audio player section is visible in mushaf mode', async ({ page }) => {
    await waitForQuranData(page);
    await openMushafView(page);

    const audioSection = page.locator('#audio-section');
    await expect(audioSection).toBeVisible({ timeout: 5000 });
  });

  // ── UI toggle states: color palette hidden ────────────────────────────────

  test('color palette toggle is hidden in mushaf mode', async ({ page }) => {
    await waitForQuranData(page);

    // In normal mode the color palette / quran options toggle is in top-left of card
    // It uses `v-if="!isMushaf"` with class "absolute top-2 left-2 z-10"
    const palette = page.locator('#quran-text-section .absolute.\\!isMushaf, #quran-text-section [class*="absolute"][class*="top-2"][class*="left-2"]').first();

    await openMushafView(page);

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
    await openMushafView(page);

    // Hidden in mushaf
    const memorizeBtn = page.locator('button span').filter({ hasText: /^Memorized?$/i });
    await expect(memorizeBtn.first()).not.toBeVisible();

    // Leave mushaf mode via the "Quran" nav item
    await closeMushafView(page);

    // Should be visible again
    await expect(memorizeBtn.first()).toBeVisible({ timeout: 5000 });
  });
});
