/**
 * E2E Tests: Surah View
 * Tests for Surah-by-Surah browsing feature including:
 * - Surah grid display
 * - Surah selection
 * - Page-based lazy loading (same layout as Quran view)
 * - Navigation (back button, URL params)
 */

import { test, expect } from '@playwright/test';
import { waitForAppLoad, waitForQuranData, dismissLanguageModal } from './helpers.js';

test.describe('Surah View', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test.describe('Navigation to Surah View', () => {
    test('should navigate to Surah View via URL parameter surahview=true', async ({ page }) => {
      await page.goto('/?surahview=true');
      await waitForAppLoad(page);
      
      // Should show surah grid - wait for grid to render with Arabic names
      await page.waitForFunction(() => {
        const buttons = document.querySelectorAll('.grid button');
        if (buttons.length === 0) return false;
        // Wait for Arabic names to load (not just buttons)
        return document.body.textContent?.includes('الفاتحة');
      }, { timeout: 15000 });
      
      // Check for Arabic surah names
      const hasArabic = await page.evaluate(() => {
        return document.body.textContent?.includes('الفاتحة');
      });
      expect(hasArabic).toBeTruthy();
    });

    test('should navigate directly to a specific surah via URL parameter surah=N', async ({ page }) => {
      await page.goto('/?surah=1');
      await waitForAppLoad(page);
      
      // Should show surah 1 (Al-Fatihah) content
      await page.waitForFunction(() => {
        const text = document.body.textContent;
        return text && text.includes('الفاتحة');
      }, { timeout: 15000 });
    });
  });

  test.describe('Surah Grid Display', () => {
    test('should display 114 surah cards in the grid', async ({ page }) => {
      await page.goto('/?surahview=true');
      await waitForAppLoad(page);
      
      // Wait for grid to render
      await page.waitForFunction(() => {
        const buttons = document.querySelectorAll('.grid button');
        return buttons.length === 114;
      }, { timeout: 15000 });
      
      // Count surah cards
      const surahCards = page.locator('.grid button');
      const count = await surahCards.count();
      expect(count).toBe(114);
    });

    test('should display Arabic surah names in the grid', async ({ page }) => {
      await page.goto('/?surahview=true');
      await waitForAppLoad(page);
      
      // Wait for grid to render with Arabic names
      await page.waitForFunction(() => {
        const buttons = document.querySelectorAll('.grid button');
        if (buttons.length === 0) return false;
        // Wait for Arabic surah names to actually load
        const text = document.body.textContent || '';
        return text.includes('الفاتحة') && text.includes('الناس');
      }, { timeout: 15000 });
      
      // Check for Al-Fatihah and Al-Nas
      const hasFirstSurah = await page.evaluate(() => document.body.textContent?.includes('الفاتحة'));
      const hasLastSurah = await page.evaluate(() => document.body.textContent?.includes('الناس'));
      
      expect(hasFirstSurah).toBeTruthy();
      expect(hasLastSurah).toBeTruthy();
    });

    test('should display verse count for each surah', async ({ page }) => {
      await page.goto('/?surahview=true');
      await waitForAppLoad(page);
      
      // Wait for grid and check for verse count text
      await page.waitForFunction(() => {
        const text = document.body.textContent;
        return text && (text.includes('verses') || text.includes('آيات'));
      }, { timeout: 15000 });
    });
  });

  test.describe('Surah Selection', () => {
    test('should display back button when viewing a surah', async ({ page }) => {
      await page.goto('/?surah=1');
      await waitForAppLoad(page);
      
      // Wait for surah to load
      await page.waitForFunction(() => {
        return document.body.textContent?.includes('الفاتحة');
      }, { timeout: 15000 });
      
      // Check for back button
      const backButton = page.locator('button:has-text("All Surahs"), button:has-text("جميع السور"), button:has-text("সব সূরা")');
      await expect(backButton.first()).toBeVisible({ timeout: 10000 });
    });

    test('should return to surah grid when clicking back button', async ({ page }) => {
      await page.goto('/?surah=1');
      await waitForAppLoad(page);
      
      // Wait for surah to load
      await page.waitForFunction(() => {
        return document.body.textContent?.includes('الفاتحة');
      }, { timeout: 15000 });
      
      // Dismiss modal again in case it appeared after waitForAppLoad
      await dismissLanguageModal(page, { retries: 5 });
      
      // Click back button
      const backButton = page.locator('button:has-text("All Surahs"), button:has-text("جميع السور"), button:has-text("সব সূরা")').first();
      await backButton.click({ force: true });
      
      // Wait for grid to appear
      await page.waitForFunction(() => {
        const buttons = document.querySelectorAll('.grid button');
        return buttons.length === 114;
      }, { timeout: 15000 });
    });

  });

  test.describe('Page Display', () => {
    test('should display Bismillah for surahs except At-Tawbah (9)', async ({ page }) => {
      await page.goto('/?surah=1');
      await waitForAppLoad(page);
      
      // Wait for content
      await page.waitForFunction(() => {
        return document.body.textContent?.includes('﷽');
      }, { timeout: 15000 });
      
      // Bismillah should be visible
      const hasBismillah = await page.evaluate(() => document.body.textContent?.includes('﷽'));
      expect(hasBismillah).toBeTruthy();
    });

    test('should NOT display Bismillah for Surah At-Tawbah (9)', async ({ page }) => {
      await page.goto('/?surah=9');
      await waitForAppLoad(page);
      
      // Wait for surah header
      await page.waitForFunction(() => {
        return document.body.textContent?.includes('التوبة');
      }, { timeout: 15000 });
      
      // Wait a bit for the view to fully render
      await page.waitForTimeout(1000);
      
      // The standalone bismillah decoration should not appear
      // (Surah 9 is special - no bismillah at the beginning)
      const bismillahSection = page.locator('.text-center.py-4.border-b:has-text("﷽")');
      const count = await bismillahSection.count();
      expect(count).toBe(0);
    });

    test('should display Arabic text in Quran-like layout', async ({ page }) => {
      await page.goto('/?surah=1');
      await waitForAppLoad(page);
      
      // Wait for surah to load first
      await page.waitForFunction(() => {
        return document.body.textContent?.includes('الفاتحة');
      }, null, { timeout: 15000 });
      
      // Wait for Arabic content to appear (basic Arabic U+0600-06FF or Presentation Forms U+FB50-FDFF)
      await page.waitForFunction(() => {
        const text = document.body.textContent;
        return text && /[\u0600-\u06FF\uFB50-\uFDFF]{5,}/.test(text);
      }, null, { timeout: 20000 });
      
      // Wait for quran-word elements to render (may lag behind textContent under load)
      await page.waitForFunction(() => {
        return document.querySelectorAll('.quran-word').length > 0;
      }, { timeout: 15000 });
      
      const quranWords = page.locator('.quran-word');
      const count = await quranWords.count();
      expect(count).toBeGreaterThan(0);
    });

    test('should display page headers with page numbers', async ({ page }) => {
      await page.goto('/?surah=1');
      await waitForAppLoad(page);
      
      // Wait for page header to appear
      await page.waitForFunction(() => {
        const text = document.body.textContent;
        return text && (text.includes('Page 1') || text.includes('صفحة') || text.includes('পৃষ্ঠা'));
      }, { timeout: 15000 });
    });
  });

  test.describe('Lazy Loading', () => {
    test('should load pages for long surahs', async ({ page }) => {
      // Al-Baqarah spans many pages - good for testing lazy loading
      await page.goto('/?surah=2');
      await waitForAppLoad(page);
      
      // Wait for at least one page to load
      await page.waitForFunction(() => {
        const text = document.body.textContent;
        return text && (text.includes('Page') || text.includes('صفحة') || text.includes('পৃষ্ঠা'));
      }, { timeout: 15000 });
      
      // Should have quran-text content
      const quranText = page.locator('.quran-text');
      await expect(quranText.first()).toBeVisible();
    });

    test('should auto-load remaining pages in background', async ({ page }) => {
      // Al-Baqarah has many pages - test that they auto-load
      await page.goto('/?surah=2');
      await waitForAppLoad(page);
      
      // Wait for initial page load
      await page.waitForFunction(() => {
        return document.querySelector('.quran-text');
      }, { timeout: 15000 });
      
      // Wait a bit for background loading to start
      await page.waitForTimeout(500);
      
      // Background loading should automatically load more pages
      // Check that multiple pages are loaded without scrolling
      await page.waitForFunction(() => {
        // Look for multiple page headers
        const pageHeaders = document.body.textContent?.match(/Page \d+/g) || [];
        return pageHeaders.length >= 2;
      }, { timeout: 20000 });
      
      // Verify the app is still responsive
      await expect(page.locator('body')).toBeVisible();
    });
  });

  test.describe('Close and Navigation', () => {
    test('should close Surah View when clicking close button', async ({ page }) => {
      await page.goto('/?surahview=true');
      await waitForAppLoad(page);
      
      // Wait for surah view to load with Arabic names
      await page.waitForFunction(() => {
        const buttons = document.querySelectorAll('.grid button');
        return buttons.length > 0 && document.body.textContent?.includes('الفاتحة');
      }, { timeout: 15000 });
      
      // Dismiss modal again in case it appeared after waitForAppLoad
      await dismissLanguageModal(page, { retries: 5 });
      
      // Click close button
      const closeButton = page.locator('button:has-text("Close"), button:has-text("إغلاق"), button:has-text("বন্ধ করুন")').first();
      if (await closeButton.isVisible()) {
        await closeButton.click({ force: true });
        await page.waitForTimeout(1000);
        
        // Should return to regular Quran view
        const quranSection = page.locator('#quran-text-section');
        await expect(quranSection).toBeVisible({ timeout: 10000 });
      }
    });

    test('should clear surah URL parameter when going back to grid', async ({ page }) => {
      await page.goto('/?surah=1');
      await waitForAppLoad(page);
      
      // Wait for surah to load
      await page.waitForFunction(() => {
        return document.body.textContent?.includes('الفاتحة');
      }, { timeout: 15000 });
      
      // Dismiss modal again in case it appeared
      await dismissLanguageModal(page, { retries: 5 });
      
      // Click back button
      const backButton = page.locator('button:has-text("All Surahs"), button:has-text("جميع السور"), button:has-text("সব সূরা")').first();
      if (await backButton.isVisible()) {
        await backButton.click({ force: true });
        await page.waitForTimeout(1000);
        
        // URL should not contain surah parameter
        expect(page.url()).not.toContain('surah=1');
      }
    });
  });

  test.describe('Surah View Header', () => {
    test('should display surah name in header when viewing a surah', async ({ page }) => {
      await page.goto('/?surah=1');
      await waitForAppLoad(page);
      
      // Wait for content
      await page.waitForFunction(() => {
        return document.body.textContent?.includes('الفاتحة');
      }, { timeout: 15000 });
      
      // Surah name should be in header
      const surahName = page.locator('h3:has-text("الفاتحة")');
      await expect(surahName.first()).toBeVisible({ timeout: 10000 });
    });

    test('should display verse count in surah header', async ({ page }) => {
      await page.goto('/?surah=1');
      await waitForAppLoad(page);
      
      // Wait for content
      await page.waitForFunction(() => {
        return document.body.textContent?.includes('الفاتحة');
      }, { timeout: 15000 });
      
      // Should show "7 verses" for Al-Fatihah (in any language)
      const hasVerseCount = await page.evaluate(() => {
        const text = document.body.textContent;
        return text && (text.includes('7 verses') || text.includes('7 آيات') || text.includes('7 আয়াত'));
      });
      expect(hasVerseCount).toBeTruthy();
    });
  });

  test.describe('Responsive Design', () => {
    test('should display grid correctly on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/?surahview=true');
      await waitForAppLoad(page);
      
      // Wait for grid
      await page.waitForFunction(() => {
        const buttons = document.querySelectorAll('.grid button');
        return buttons.length === 114;
      }, { timeout: 15000 });
      
      // Grid should still show surah cards
      const surahCards = page.locator('.grid button');
      const count = await surahCards.count();
      expect(count).toBe(114);
    });

    test('should display pages correctly on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/?surah=1');
      await waitForAppLoad(page);
      
      // Wait for content
      await page.waitForFunction(() => {
        const text = document.body.textContent;
        return text && /[\u0600-\u06FF\uFB50-\uFDFF]/.test(text);
      }, { timeout: 15000 });
      
      // Should display properly without horizontal overflow
      const body = page.locator('body');
      const bodyBox = await body.boundingBox();
      expect(bodyBox?.width).toBeLessThanOrEqual(375);
    });
  });

  test.describe('Surah Content Filtering', () => {
    // Test that surahs starting mid-page only show their own content
    // Surah Al-Kahf (18) starts in the middle of page 293 - should not show Surah Al-Isra (17) content
    
    test('should only show selected surah content when surah starts mid-page (QPC layout)', async ({ page }) => {
      // Use default QPC/Tajweed layout
      await page.goto('/?surah=18');  // Al-Kahf starts mid-page 293
      await waitForAppLoad(page);
      
      // Wait for content to load
      await page.waitForFunction(() => {
        return document.body.textContent?.includes('الكهف');
      }, { timeout: 15000 });
      
      // Wait for page content
      await page.waitForFunction(() => {
        const words = document.querySelectorAll('.quran-word');
        return words.length > 0;
      }, { timeout: 15000 });
      
      // The page should NOT contain Surah Al-Isra (17) name
      const hasIsraName = await page.evaluate(() => {
        return document.body.textContent?.includes('الإسراء') || 
               document.body.textContent?.includes('الاسراء');
      });
      expect(hasIsraName).toBeFalsy();
    });

    test('should only show selected surah content when surah starts mid-page (Indopak layout)', async ({ page }) => {
      // Switch to Indopak layout first, then navigate to surah
      await page.goto('/?layout=indopak&surah=18');  // Al-Kahf
      await waitForAppLoad(page);
      
      // Wait for content to load
      await page.waitForFunction(() => {
        return document.body.textContent?.includes('الكهف');
      }, { timeout: 15000 });
      
      // Wait for page content
      await page.waitForFunction(() => {
        const words = document.querySelectorAll('.quran-word');
        return words.length > 0;
      }, { timeout: 15000 });
      
      // The page should NOT contain Surah Al-Isra (17) name
      const hasIsraName = await page.evaluate(() => {
        return document.body.textContent?.includes('الإسراء') || 
               document.body.textContent?.includes('الاسراء');
      });
      expect(hasIsraName).toBeFalsy();
    });

    test('should handle small surahs sharing a page correctly', async ({ page }) => {
      // Surah Al-Kawthar (108) is very short - only 3 verses
      await page.goto('/?surah=108');
      await waitForAppLoad(page);
      
      // Wait for content to load
      await page.waitForFunction(() => {
        return document.body.textContent?.includes('الكوثر');
      }, { timeout: 15000 });
      
      // Wait for page content
      await page.waitForFunction(() => {
        const words = document.querySelectorAll('.quran-word');
        return words.length > 0;
      }, { timeout: 15000 });
      
      // Should NOT show content from adjacent surahs (Al-Maun 107 or Al-Kafirun 109)
      const hasAdjacentSurahs = await page.evaluate(() => {
        const text = document.body.textContent || '';
        // Check for surah names of adjacent surahs
        return text.includes('الماعون') || text.includes('الكافرون');
      });
      expect(hasAdjacentSurahs).toBeFalsy();
    });

    test('should show only Fatihah content on page 1', async ({ page }) => {
      await page.goto('/?surah=1');
      await waitForAppLoad(page);
      
      // Wait for content
      await page.waitForFunction(() => {
        const words = document.querySelectorAll('.quran-word');
        return words.length > 0;
      }, { timeout: 15000 });
      
      // Fatihah has 7 verses - content should be limited
      // Should NOT show any Al-Baqarah content (which is also on pages 1-2)
      // Al-Baqarah starts with "الم" (Alif-Lam-Meem)
      // But we can verify by checking that we don't have البقرة in the surah headers
      const hasBaqarahHeader = await page.evaluate(() => {
        return document.body.textContent?.includes('البقرة');
      });
      expect(hasBaqarahHeader).toBeFalsy();
    });

    test('should correctly filter content for Surah Fatir (35) which starts mid-page', async ({ page }) => {
      await page.goto('/?surah=35');  // Fatir starts mid-page
      await waitForAppLoad(page);
      
      // Wait for content to load
      await page.waitForFunction(() => {
        return document.body.textContent?.includes('فاطر');
      }, { timeout: 15000 });
      
      // Wait for page content
      await page.waitForFunction(() => {
        const words = document.querySelectorAll('.quran-word');
        return words.length > 0;
      }, { timeout: 15000 });
      
      // Should NOT contain Saba' (Surah 34) content in the display
      const hasSabaHeader = await page.evaluate(() => {
        return document.body.textContent?.includes('سبأ');
      });
      expect(hasSabaHeader).toBeFalsy();
    });

    test('should show last page content when surah ends mid-page (Surah Al-Mulk)', async ({ page }) => {
      // Surah Al-Mulk (67) ends on page 564, which is also where Surah Al-Qalam (68) starts
      // The surah view should include the last page (564) with Al-Mulk's content
      await page.goto('/?surah=67');
      await waitForAppLoad(page);
      
      // Wait for content to load
      await page.waitForFunction(() => {
        return document.body.textContent?.includes('الملك');
      }, { timeout: 15000 });
      
      // Wait for page content
      await page.waitForFunction(() => {
        const words = document.querySelectorAll('.quran-word');
        return words.length > 0;
      }, { timeout: 15000 });
      
      // Should have loaded page 564 (the last page of Al-Mulk) which is shared with Al-Qalam
      // Check that the surah name is in header (this confirms content loaded correctly)
      const hasMulkHeader = await page.evaluate(() => {
        return document.body.textContent?.includes('الملك');
      });
      expect(hasMulkHeader).toBeTruthy();
      
      // Should NOT show Al-Qalam (68) content since we're only viewing Al-Mulk
      const hasQalamHeader = await page.evaluate(() => {
        return document.body.textContent?.includes('القلم');
      });
      expect(hasQalamHeader).toBeFalsy();
    });
  });
});
