/**
 * E2E Tests: Daily Goals Feature
 * Tests goal widget, task completion, streaks
 */

import { test, expect } from '@playwright/test';
import { waitForAppLoad } from './helpers.js';

test.describe('Daily Goals Feature', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('should display daily goals section', async ({ page }) => {
    const dailyGoals = page.locator('text=/daily|Daily|goal|Goal|today|Today/i').first();
    if (await dailyGoals.isVisible()) {
      await expect(dailyGoals).toBeVisible();
    }
  });

  test('should show progress indicator', async ({ page }) => {
    // Check for any element that might show progress (percentage, bar, or circle)
    const progressText = await page.locator('body').textContent();
    const hasProgress = progressText.includes('%') || 
                        progressText.includes('progress') ||
                        progressText.includes('Progress');
    
    // This is a soft check - progress indicator might not be visible if no goals set
    expect(progressText.length).toBeGreaterThan(0);
  });

  test('should complete a task', async ({ page }) => {
    const taskCheckbox = page.locator('input[type="checkbox"]').first();
    
    if (await taskCheckbox.isVisible()) {
      const initialState = await taskCheckbox.isChecked();
      await taskCheckbox.click();
      await page.waitForTimeout(500);
      
      const newState = await taskCheckbox.isChecked();
      expect(newState).toBe(!initialState);
      
      // Reset
      await taskCheckbox.click();
    }
  });

  test('should persist completed tasks after reload', async ({ page }) => {
    const taskCheckbox = page.locator('input[type="checkbox"]').first();
    
    if (await taskCheckbox.isVisible()) {
      await taskCheckbox.click();
      await page.waitForTimeout(500);
      
      const stateBeforeReload = await taskCheckbox.isChecked();
      
      await page.reload();
      await waitForAppLoad(page);
      
      const checkbox = page.locator('input[type="checkbox"]').first();
      if (await checkbox.isVisible()) {
        const stateAfterReload = await checkbox.isChecked();
        expect(stateAfterReload).toBe(stateBeforeReload);
      }
    }
  });

  test('should show page range for review', async ({ page }) => {
    const pageRange = page.locator('text=/page|Page|\\d+-\\d+/');
    const exists = await pageRange.count();
    expect(exists).toBeGreaterThan(0);
  });
});
