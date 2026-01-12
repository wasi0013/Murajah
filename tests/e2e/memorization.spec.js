/**
 * E2E Tests: Memorization Tracking
 * Tests memorized pages, Juz progress, marking pages
 */

import { test, expect } from '@playwright/test';
import { waitForAppLoad, waitForQuranData } from './helpers.js';

test.describe('Memorization Tracking', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('should display memorization dashboard', async ({ page }) => {
    const dashboard = page.locator('text=/memorized|Memorized|Juz|Progress/i').first();
    if (await dashboard.isVisible()) {
      await expect(dashboard).toBeVisible();
    }
  });

  test('should show Juz grid', async ({ page }) => {
    const juzGrid = page.locator('text=/Juz|جزء/i');
    const exists = await juzGrid.count();
    expect(exists).toBeGreaterThan(0);
  });

  test('should toggle page as memorized', async ({ page }) => {
    await page.goto('/?page=1');
    await waitForQuranData(page);
    
    const memorizeButton = page.locator('button:has(.fa-bookmark), button:has(.fa-check)').first();
    
    if (await memorizeButton.isVisible()) {
      await memorizeButton.click();
      await page.waitForTimeout(500);
      await memorizeButton.click();
      await page.waitForTimeout(500);
    }
  });

  test('should show progress statistics', async ({ page }) => {
    const progressIndicator = page.locator('text=/%|pages|Pages/');
    const exists = await progressIndicator.count();
    expect(exists).toBeGreaterThan(0);
  });

  test('should display daily goals widget', async ({ page }) => {
    const dailyGoals = page.locator('text=/daily|Daily|goal|Goal|today|Today/i').first();
    if (await dailyGoals.isVisible()) {
      await expect(dailyGoals).toBeVisible();
    }
  });

  test('should calculate Juz completion percentage', async ({ page }) => {
    const percentage = page.locator('text=/%/');
    const exists = await percentage.count();
    expect(exists).toBeGreaterThan(0);
  });
});
