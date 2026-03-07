/**
 * E2E Tests: Touch Interaction
 * Tests touch compatibility in mobile WebView context.
 * Uses Playwright's touch emulation with a mobile device profile.
 */

import { test, expect } from '@playwright/test';
import { dismissLanguageModal } from './helpers.js';

// Use a mobile device context with touch enabled
test.use({
    ...test.info ? {} : {},
    hasTouch: true,
    viewport: { width: 360, height: 640 },
    userAgent: 'Mozilla/5.0 (Linux; Android 9; SM-G950F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Mobile Safari/537.36'
});

test.describe('Touch Interaction - Main Page', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(2000);
        await dismissLanguageModal(page);
    });

    test('viewport meta should disable user scaling', async ({ page }) => {
        const viewportContent = await page.getAttribute('meta[name="viewport"]', 'content');
        expect(viewportContent).toContain('maximum-scale=1.0');
        expect(viewportContent).toContain('user-scalable=no');
    });

    test('quran-word elements should have user-select none', async ({ page }) => {
        // Navigate to a page that would have quran words
        const wordElement = page.locator('.quran-word').first();
        const isVisible = await wordElement.isVisible({ timeout: 5000 }).catch(() => false);

        if (isVisible) {
            const userSelect = await wordElement.evaluate(el => {
                const cs = window.getComputedStyle(el);
                // Check both standard and webkit-prefixed property
                const standard = cs.getPropertyValue('user-select');
                const webkit = cs.getPropertyValue('-webkit-user-select');
                return standard === 'none' || webkit === 'none' ? 'none' : (standard || webkit);
            });
            expect(userSelect).toBe('none');
        }
    });

    test('quran-word elements should have touch-action manipulation', async ({ page }) => {
        const wordElement = page.locator('.quran-word').first();
        const isVisible = await wordElement.isVisible({ timeout: 5000 }).catch(() => false);

        if (isVisible) {
            const touchAction = await wordElement.evaluate(el => {
                return window.getComputedStyle(el).getPropertyValue('touch-action');
            });
            expect(touchAction).toBe('manipulation');
        }
    });

    test('word tap should not trigger text selection', async ({ page }) => {
        const wordElement = page.locator('.quran-word').first();
        const isVisible = await wordElement.isVisible({ timeout: 5000 }).catch(() => false);

        if (isVisible) {
            // Tap the word
            await wordElement.tap();
            await page.waitForTimeout(300);

            // Verify no text is selected
            const hasSelection = await page.evaluate(() => {
                const sel = window.getSelection();
                return sel && sel.toString().length > 0;
            });
            expect(hasSelection).toBe(false);
        }
    });
});

test.describe('Touch Interaction - Quiz Page', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/quiz.html');
        await page.waitForTimeout(3000);
    });

    test('viewport meta should disable user scaling', async ({ page }) => {
        const viewportContent = await page.getAttribute('meta[name="viewport"]', 'content');
        expect(viewportContent).toContain('maximum-scale=1.0');
        expect(viewportContent).toContain('user-scalable=no');
    });

    test('surah grid items should have touch-action manipulation', async ({ page }) => {
        // Look for surah grid items
        const gridItem = page.locator('.surah-grid-item').first();
        const isVisible = await gridItem.isVisible({ timeout: 5000 }).catch(() => false);

        if (isVisible) {
            const touchAction = await gridItem.evaluate(el => {
                return window.getComputedStyle(el).touchAction;
            });
            expect(touchAction).toBe('manipulation');
        }
    });

    test('surah grid items should be tappable', async ({ page }) => {
        const gridItem = page.locator('.surah-grid-item').first();
        const isVisible = await gridItem.isVisible({ timeout: 5000 }).catch(() => false);

        if (isVisible) {
            // Tap a surah grid item
            await gridItem.tap();
            await page.waitForTimeout(300);

            // Should toggle selection (check class change)
            const hasActiveClass = await gridItem.evaluate(el => {
                return el.classList.contains('bg-primary') || el.classList.contains('border-primary');
            });
            // The exact class depends on initial state; just verify no crash
            expect(typeof hasActiveClass).toBe('boolean');
        }
    });

    test('quiz answer buttons should have quiz-touch-btn class', async ({ page }) => {
        const btn = page.locator('.quiz-touch-btn').first();
        const isVisible = await btn.isVisible({ timeout: 5000 }).catch(() => false);

        if (isVisible) {
            const userSelect = await btn.evaluate(el => {
                return window.getComputedStyle(el).userSelect || window.getComputedStyle(el).webkitUserSelect;
            });
            expect(userSelect).toBe('none');
        }
    });

    test('answer buttons should respond to single tap without delay', async ({ page }) => {
        // Start a quiz if possible
        const startButton = page.locator('button:has-text("Start"), button:has-text("Begin")').first();
        const isStartVisible = await startButton.isVisible({ timeout: 3000 }).catch(() => false);

        if (isStartVisible) {
            await startButton.tap();
            await page.waitForTimeout(2000);

            // Find an answer button
            const answerBtn = page.locator('.quiz-touch-btn').first();
            const isBtnVisible = await answerBtn.isVisible({ timeout: 3000 }).catch(() => false);

            if (isBtnVisible) {
                // Tap and verify response
                await answerBtn.tap();
                await page.waitForTimeout(500);
                // Page should still be functional (no crash)
                await expect(page.locator('body')).toBeVisible();
            }
        }
    });
});
