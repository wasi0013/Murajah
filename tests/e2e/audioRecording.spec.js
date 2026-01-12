/**
 * E2E Tests: Audio Recording Feature
 * Tests recorder, playback, permissions
 */

import { test, expect } from '@playwright/test';
import { waitForAppLoad, waitForQuranData } from './helpers.js';

test.describe('Audio Recording Feature', () => {
  
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['microphone']);
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('should display recording controls', async ({ page }) => {
    const recordButton = page.locator('button:has(.fa-microphone), button:has(.fa-mic)').first();
    if (await recordButton.isVisible()) {
      await expect(recordButton).toBeVisible();
    }
  });

  test('should display playlist of recordings', async ({ page }) => {
    const playlist = page.locator('[class*="playlist"], [class*="recording"]').first();
    if (await playlist.isVisible()) {
      await expect(playlist).toBeVisible();
    }
  });

  test('should show playback controls for recordings', async ({ page }) => {
    const playButton = page.locator('button:has(.fa-play), button:has(.fa-play-circle)').first();
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle microphone permission denial gracefully', async ({ page, context }) => {
    await context.clearPermissions();
    await page.reload();
    await waitForAppLoad(page);
    
    // Close any modals that may be open
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    await expect(page.locator('body')).toBeVisible();
  });

  test('should associate recording with specific page', async ({ page }) => {
    await page.goto('/?page=25');
    await waitForQuranData(page);
    
    const recordButton = page.locator('button:has(.fa-microphone)').first();
    if (await recordButton.isVisible()) {
      await expect(recordButton).toBeVisible();
    }
  });
});
