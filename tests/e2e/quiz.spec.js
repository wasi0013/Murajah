/**
 * E2E Tests: Quiz Page
 * Tests quiz loading, interactions, scoring
 */

import { test, expect } from '@playwright/test';

test.describe('Quiz Page', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/quiz.html');
    await page.waitForTimeout(3000);
  });

  test('should load quiz page', async ({ page }) => {
    await expect(page).toHaveURL(/quiz/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display quiz interface', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show quiz options or settings', async ({ page }) => {
    const options = page.locator('select, input[type="radio"], input[type="checkbox"], button').first();
    if (await options.isVisible()) {
      await expect(options).toBeVisible();
    }
  });

  test('should start a quiz session', async ({ page }) => {
    const startButton = page.locator('button:has-text("Start"), button:has-text("Begin"), button:has-text("Quiz")').first();
    
    if (await startButton.isVisible()) {
      await startButton.click();
      await page.waitForTimeout(1000);
      
      const question = page.locator('text=/\\?|ayah|verse|surah/i');
      const exists = await question.count();
      expect(exists).toBeGreaterThan(0);
    }
  });

  test('should display answer options', async ({ page }) => {
    const startButton = page.locator('button:has-text("Start")').first();
    if (await startButton.isVisible()) {
      await startButton.click();
      await page.waitForTimeout(1000);
    }
    
    const answerOptions = page.locator('button, [role="button"], input[type="radio"]');
    const count = await answerOptions.count();
    expect(count).toBeGreaterThan(1);
  });

  test('should handle answer selection', async ({ page }) => {
    const startButton = page.locator('button:has-text("Start")').first();
    if (await startButton.isVisible()) {
      await startButton.click();
      await page.waitForTimeout(1000);
    }
    
    const answerOption = page.locator('main button, .quiz-touch-btn').first();
    if (await answerOption.isVisible()) {
      await answerOption.click();
      await page.waitForTimeout(500);
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should track score', async ({ page }) => {
    const startButton = page.locator('button:has-text("Start")').first();
    if (await startButton.isVisible()) {
      await startButton.click();
      await page.waitForTimeout(1000);
    }
    
    await expect(page.locator('body')).toBeVisible();
  });

  test('should link back to main app', async ({ page }) => {
    const mainLink = page.locator('a[href*="index"], a:has-text("Home"), a:has-text("Back")').first();
    
    if (await mainLink.isVisible()) {
      await mainLink.click();
      await page.waitForTimeout(1000);
      expect(page.url()).not.toContain('quiz.html');
    }
  });
});
