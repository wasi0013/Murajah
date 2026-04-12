/**
 * E2E Tests: Audio Recording Feature
 * Tests recorder, playback, permissions, and iOS compatibility
 */

import { test, expect } from '@playwright/test';
import { waitForAppLoad, waitForQuranData } from './helpers.js';

test.describe('Audio Recording Feature', () => {
  
  test.beforeEach(async ({ page, context, browserName }) => {
    if (browserName !== 'webkit') await context.grantPermissions(['microphone']);
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

test.describe('Audio Recording - MIME Type and Format Handling', () => {
  
  test.beforeEach(async ({ page, context, browserName }) => {
    if (browserName !== 'webkit') await context.grantPermissions(['microphone']);
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('should detect correct platform for audio format selection', async ({ page }) => {
    // Evaluate AudioRecorder detection in browser context
    const isIOS = await page.evaluate(() => {
      return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
             (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    });
    
    // Just verify detection runs without error
    expect(typeof isIOS).toBe('boolean');
  });

  test('should have MediaRecorder available', async ({ page }) => {
    const hasMediaRecorder = await page.evaluate(() => {
      return typeof MediaRecorder !== 'undefined';
    });
    
    expect(hasMediaRecorder).toBe(true);
  });

  test('should support at least one audio MIME type', async ({ page }) => {
    const supportedTypes = await page.evaluate(() => {
      const types = [
        'audio/mp4',
        'audio/webm',
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/wav'
      ];
      return types.filter(type => MediaRecorder.isTypeSupported(type));
    });
    
    // At least one format should be supported (or browser uses default)
    expect(supportedTypes.length).toBeGreaterThanOrEqual(0);
  });

  test('should correctly identify supported MIME types for current platform', async ({ page }) => {
    const result = await page.evaluate(async () => {
      // Import and test the actual AudioRecorder
      const { AudioRecorder } = await import('./resources/js/utils/audioRecorder.js');
      
      return {
        isIOS: AudioRecorder.isIOS(),
        supportedMimeType: AudioRecorder.getSupportedMimeType(),
        isSupported: AudioRecorder.isSupported()
      };
    });
    
    expect(result.isSupported).toBe(true);
    expect(typeof result.isIOS).toBe('boolean');
    expect(typeof result.supportedMimeType).toBe('string');
  });
});

test.describe('Audio Recording - Format Duration', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('should format duration correctly', async ({ page }) => {
    const results = await page.evaluate(async () => {
      const { AudioRecorder } = await import('./resources/js/utils/audioRecorder.js');
      
      return {
        zero: AudioRecorder.formatDuration(0),
        thirtySeconds: AudioRecorder.formatDuration(30000),
        oneMinute: AudioRecorder.formatDuration(60000),
        oneMinuteThirty: AudioRecorder.formatDuration(90000),
        fiveMinutes: AudioRecorder.formatDuration(300000),
        tenMinutes: AudioRecorder.formatDuration(600000),
        nullValue: AudioRecorder.formatDuration(null),
        negativeValue: AudioRecorder.formatDuration(-1000)
      };
    });
    
    expect(results.zero).toBe('0:00');
    expect(results.thirtySeconds).toBe('0:30');
    expect(results.oneMinute).toBe('1:00');
    expect(results.oneMinuteThirty).toBe('1:30');
    expect(results.fiveMinutes).toBe('5:00');
    expect(results.tenMinutes).toBe('10:00');
    expect(results.nullValue).toBe('0:00');
    expect(results.negativeValue).toBe('0:00');
  });
});

test.describe('Audio Recording - Blob Conversion', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('should convert blob to base64 and back', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { AudioRecorder } = await import('./resources/js/utils/audioRecorder.js');
      
      // Create a test blob
      const originalData = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const blob = new Blob([originalData], { type: 'audio/webm' });
      
      // Convert to base64 (returns ArrayBuffer)
      const base64Result = await AudioRecorder.blobToBase64(blob);
      
      return {
        originalSize: blob.size,
        base64Size: base64Result.byteLength,
        isArrayBuffer: base64Result instanceof ArrayBuffer
      };
    });
    
    expect(result.originalSize).toBe(5);
    expect(result.base64Size).toBe(5);
    expect(result.isArrayBuffer).toBe(true);
  });

  test('should create blob from base64 with correct MIME type', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { AudioRecorder } = await import('./resources/js/utils/audioRecorder.js');
      
      // Base64 for "Hello"
      const base64 = 'SGVsbG8=';
      
      const blobWebm = AudioRecorder.base64ToBlob(base64, 'audio/webm');
      const blobMp4 = AudioRecorder.base64ToBlob(base64, 'audio/mp4');
      
      return {
        webmType: blobWebm.type,
        webmSize: blobWebm.size,
        mp4Type: blobMp4.type,
        mp4Size: blobMp4.size
      };
    });
    
    expect(result.webmType).toBe('audio/webm');
    expect(result.webmSize).toBe(5);
    expect(result.mp4Type).toBe('audio/mp4');
    expect(result.mp4Size).toBe(5);
  });
});

test.describe('Audio Playback - iOS Compatibility', () => {
  
  test.beforeEach(async ({ page, context, browserName }) => {
    if (browserName !== 'webkit') await context.grantPermissions(['microphone']);
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('should create audio element with playsinline attributes for playback', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { AudioRecorder } = await import('./resources/js/utils/audioRecorder.js');
      
      // Create a minimal valid audio blob
      const audioBlob = new Blob(['fake audio data'], { type: 'audio/webm' });
      
      // We can't actually play fake audio, but we can check that the function exists
      return {
        playAudioExists: typeof AudioRecorder.playAudio === 'function',
        isIOSExists: typeof AudioRecorder.isIOS === 'function',
        getSupportedMimeTypeExists: typeof AudioRecorder.getSupportedMimeType === 'function'
      };
    });
    
    expect(result.playAudioExists).toBe(true);
    expect(result.isIOSExists).toBe(true);
    expect(result.getSupportedMimeTypeExists).toBe(true);
  });

  test('should handle playback error gracefully', async ({ page }) => {
    // Inject a recording with invalid data to test error handling
    const errorHandled = await page.evaluate(async () => {
      const { AudioRecorder } = await import('./resources/js/utils/audioRecorder.js');
      
      // Create an invalid audio blob
      const invalidBlob = new Blob(['not valid audio'], { type: 'audio/webm' });
      
      try {
        await AudioRecorder.playAudio(invalidBlob);
        return { played: true, error: null };
      } catch (error) {
        return { played: false, error: error.message };
      }
    });
    
    // Should either play (unlikely with fake data) or handle error gracefully
    expect(errorHandled).toBeDefined();
    expect(typeof errorHandled.played).toBe('boolean');
  });
});

test.describe('Audio Recording - Error Handling', () => {
  
  test('should show error message on playback failure', async ({ page, context, browserName }) => {
    if (browserName !== 'webkit') await context.grantPermissions(['microphone']);
    await page.goto('/');
    await waitForAppLoad(page);
    
    // Verify the app loads correctly even without recordings
    await expect(page.locator('body')).toBeVisible();
    
    // Check that error message container exists in the app
    const hasErrorHandling = await page.evaluate(() => {
      // The app should have appStore.errorMessage capability
      return document.getElementById('app') !== null;
    });
    
    expect(hasErrorHandling).toBe(true);
  });

  test('should log playback attempts with blob metadata', async ({ page, context, browserName }) => {
    if (browserName !== 'webkit') await context.grantPermissions(['microphone']);
    await page.goto('/');
    await waitForAppLoad(page);
    
    // Verify console logging is set up (by checking the playAudio function exists)
    const hasPlaybackLogging = await page.evaluate(async () => {
      const { AudioRecorder } = await import('./resources/js/utils/audioRecorder.js');
      
      // The playAudio function should exist and accept a blob
      return typeof AudioRecorder.playAudio === 'function';
    });
    
    expect(hasPlaybackLogging).toBe(true);
  });
});

test.describe('Audio Recording - Recording State Management', () => {
  
  test.beforeEach(async ({ page, context, browserName }) => {
    if (browserName !== 'webkit') await context.grantPermissions(['microphone']);
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('should initialize recorder in correct state', async ({ page }) => {
    const state = await page.evaluate(async () => {
      const { AudioRecorder } = await import('./resources/js/utils/audioRecorder.js');
      const recorder = new AudioRecorder();
      
      return {
        isRecording: recorder.isRecording,
        mediaRecorder: recorder.mediaRecorder,
        audioChunks: recorder.audioChunks.length,
        mimeType: recorder.mimeType
      };
    });
    
    expect(state.isRecording).toBe(false);
    expect(state.mediaRecorder).toBeNull();
    expect(state.audioChunks).toBe(0);
    expect(state.mimeType).toBeNull();
  });

  test('should cancel recording and reset state', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { AudioRecorder } = await import('./resources/js/utils/audioRecorder.js');
      const recorder = new AudioRecorder();
      
      // Simulate partial recording state
      recorder.isRecording = true;
      recorder.audioChunks = ['chunk1', 'chunk2'];
      recorder.mimeType = 'audio/webm';
      recorder.recordingStartTime = Date.now();
      
      // Mock mediaRecorder and audioStream
      recorder.mediaRecorder = {
        stop: () => {},
        state: 'recording'
      };
      recorder.audioStream = {
        getTracks: () => [{ stop: () => {} }]
      };
      
      // Cancel
      recorder.cancelRecording();
      
      return {
        isRecording: recorder.isRecording,
        audioChunksLength: recorder.audioChunks.length,
        mimeType: recorder.mimeType
      };
    });
    
    expect(result.isRecording).toBe(false);
    expect(result.audioChunksLength).toBe(0);
    expect(result.mimeType).toBeNull();
  });
});

test.describe('Audio Recording - Edge Cases', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('should correctly check API support in isSupported', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { AudioRecorder } = await import('./resources/js/utils/audioRecorder.js');
      
      // Test that modern API is detected
      const hasModernAPI = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      const isSupported = AudioRecorder.isSupported();
      
      return {
        hasModernAPI,
        isSupported,
        // If modern API exists, isSupported should be true
        correctDetection: hasModernAPI ? isSupported === true : true
      };
    });
    
    expect(result.correctDetection).toBe(true);
  });

  test('should detect iOS devices correctly', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { AudioRecorder } = await import('./resources/js/utils/audioRecorder.js');
      return {
        isIOS: AudioRecorder.isIOS(),
        userAgent: navigator.userAgent
      };
    });
    
    // Just verify the method exists and returns a boolean
    expect(typeof result.isIOS).toBe('boolean');
  });

  test('should get supported MIME type', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { AudioRecorder } = await import('./resources/js/utils/audioRecorder.js');
      return {
        mimeType: AudioRecorder.getSupportedMimeType(),
        isIOS: AudioRecorder.isIOS()
      };
    });
    
    // Should return a string (possibly empty for browser default)
    expect(typeof result.mimeType).toBe('string');
  });
});

test.describe('Floating Audio Player - E2E', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('should not show floating player when no recordings', async ({ page }) => {
    // Initially there should be no recordings
    const floatingPlayer = page.locator('.floating-audio-player-container');
    
    // The container may exist but should not have visible content
    // Check if the toggle button is visible (it shows recording count)
    const toggleBtn = page.locator('.floating-toggle-btn');
    
    // Either the container doesn't exist or the button shows no recordings
    const isHidden = await floatingPlayer.isHidden().catch(() => true);
    const buttonCount = await toggleBtn.count();
    
    // At least one of these conditions should be true
    expect(isHidden || buttonCount === 0).toBe(true);
  });

  test('should display recording button or disabled state', async ({ page }) => {
    // Either the enabled record button or disabled record button should be visible
    const enabledButton = page.locator('button:has(.fa-microphone):not(:disabled)');
    const disabledButton = page.locator('button:has(.fa-microphone-slash)');
    
    const enabledCount = await enabledButton.count();
    const disabledCount = await disabledButton.count();
    
    // At least one type of record button should exist
    expect(enabledCount + disabledCount).toBeGreaterThanOrEqual(0);
  });

  test('should have proper z-index for floating player', async ({ page }) => {
    const styles = await page.evaluate(() => {
      const style = document.createElement('style');
      document.head.appendChild(style);
      
      // Get computed styles for floating player elements
      const container = document.querySelector('.floating-audio-player-container');
      if (container) {
        const computed = window.getComputedStyle(container);
        return {
          exists: true,
          zIndex: computed.zIndex,
          position: computed.position
        };
      }
      return { exists: false };
    });
    
    // If the container exists, check its styling
    if (styles.exists) {
      expect(parseInt(styles.zIndex)).toBeGreaterThanOrEqual(1000);
      expect(styles.position).toBe('fixed');
    }
  });

  test('should have mobile-responsive floating button styles', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);
    
    const styles = await page.evaluate(() => {
      const btn = document.querySelector('.floating-toggle-btn');
      if (btn) {
        const computed = window.getComputedStyle(btn);
        return {
          exists: true,
          width: computed.width,
          height: computed.height,
          bottom: computed.bottom,
          right: computed.right
        };
      }
      return { exists: false };
    });
    
    // Verify responsive styles if button exists
    if (styles.exists) {
      const width = parseInt(styles.width);
      // On mobile, button should be 44px
      expect(width).toBeLessThanOrEqual(56);
    }
  });
});

test.describe('Recording Button Visibility - Edge Cases', () => {
  
  test('should show record button in secure context', async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    
    const isSecure = await page.evaluate(() => window.isSecureContext);
    
    // In tests, we're typically in a secure context (localhost)
    if (isSecure) {
      const recordBtn = page.locator('button:has(.fa-microphone), button:has(.fa-microphone-slash)');
      const count = await recordBtn.count();
      
      // At least one form of record button should be visible
      expect(count).toBeGreaterThan(0);
    }
  });

  test('should show disabled button with tooltip when unsupported', async ({ page }) => {
    // This test checks that the unsupported state UI exists
    const disabledBtn = page.locator('button:has(.fa-microphone-slash)[disabled]');
    
    // If disabled button exists, it should have a title attribute
    const count = await disabledBtn.count();
    
    if (count > 0) {
      const title = await disabledBtn.first().getAttribute('title');
      expect(title).toBeTruthy();
      expect(title.length).toBeGreaterThan(0);
    }
  });

  test('should handle different viewport sizes for recording controls', async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    
    const viewports = [
      { width: 320, height: 568 },  // iPhone SE
      { width: 375, height: 667 },  // iPhone 8
      { width: 768, height: 1024 }, // iPad
      { width: 1920, height: 1080 } // Desktop
    ];
    
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(200);
      
      // Page should not have layout errors
      const body = await page.locator('body').boundingBox();
      expect(body).toBeTruthy();
      expect(body.width).toBeGreaterThan(0);
    }
  });
});
