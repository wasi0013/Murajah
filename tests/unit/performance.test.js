/**
 * Performance regression tests
 * Ensures performance optimizations remain in place and are not accidentally reverted.
 * 
 * These tests verify:
 * - No render-blocking scripts in HTML
 * - Module imports are parallelized
 * - Tafsir data loads lazily (not during initial startup)
 * - ResourceCache avoids expensive JSON.stringify for size estimation
 * - ResourceCache debounces IndexedDB stats writes
 * - ResourceCache uses browser HTTP caching
 * - Logo uses optimized WebP format
 * - FontAwesome uses font-display: swap (not block)
 * - wordById lookup is cached to avoid O(n) rebuilds
 * - Background resource refresh has adequate delay
 * - Page line index avoids O(9000) filter per page navigation
 * - Verse text index avoids O(77k) scan per verse lookup
 * - Touch scroll is not blocked by @touchstart.prevent on word elements
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// === File content helpers ===

const ROOT = path.resolve(import.meta.dirname, '../..');
const SOURCE = path.join(ROOT, 'source');

const readSource = (relPath) => fs.readFileSync(path.join(SOURCE, relPath), 'utf-8');

// === HTML Performance Tests ===

describe('index.html performance', () => {
  let html;

  beforeEach(() => {
    html = readSource('index.html');
  });

  describe('render-blocking scripts', () => {
    it('should load Tailwind with defer', () => {
      const tailwindTag = html.match(/<script[^>]*tailwind[^>]*>/i);
      expect(tailwindTag).not.toBeNull();
      expect(tailwindTag[0]).toMatch(/\bdefer\b/);
    });

    it('should load Vue with defer', () => {
      const vueTag = html.match(/<script[^>]*vue\.global[^>]*>/i);
      expect(vueTag).not.toBeNull();
      expect(vueTag[0]).toMatch(/\bdefer\b/);
    });

    it('should load marked.js with defer', () => {
      const markedTag = html.match(/<script[^>]*marked\.min[^>]*>/i);
      expect(markedTag).not.toBeNull();
      expect(markedTag[0]).toMatch(/\bdefer\b/);
    });

    it('should not have any synchronous script tags for vendor libraries', () => {
      // Match script tags with src that DON'T have defer or async
      const scriptTags = html.match(/<script\s+src="[^"]*vendor[^"]*"[^>]*>/gi) || [];
      const blockingScripts = scriptTags.filter(
        tag => !tag.match(/\b(defer|async)\b/)
      );
      expect(blockingScripts).toEqual([]);
    });
  });

  describe('resource preloading', () => {
    it('should preload Vue.js', () => {
      expect(html).toMatch(/<link[^>]*rel="preload"[^>]*vue\.global[^>]*>/i);
    });

    it('should preload surah_names font', () => {
      expect(html).toMatch(/<link[^>]*rel="preload"[^>]*surah_names[^>]*>/i);
    });
  });

  describe('parallel module imports', () => {
    it('should use Promise.all for module imports instead of sequential awaits', () => {
      // Verify Promise.all pattern exists
      expect(html).toMatch(/Promise\.all\s*\(\s*\[[\s\S]*?import\s*\(/);
    });

    it('should import at least 10 modules in parallel', () => {
      // Find the Promise.all block and count imports inside it
      const promiseAllMatch = html.match(/Promise\.all\s*\(\s*\[([\s\S]*?)\]\s*\)/);
      expect(promiseAllMatch).not.toBeNull();
      const importCount = (promiseAllMatch[1].match(/import\s*\(/g) || []).length;
      expect(importCount).toBeGreaterThanOrEqual(10);
    });
  });

  describe('lazy data loading', () => {
    it('should defer cache stats update to requestIdleCallback', () => {
      expect(html).toMatch(/requestIdleCallback\s*\(\s*\(\)\s*=>\s*\{?\s*updateCacheStats/);
    });

    it('should delay alternate layout preload by at least 5 seconds', () => {
      // Match: setTimeout(() => { ... preloadLayout ... }, 10000)
      const preloadMatch = html.match(/setTimeout\s*\([\s\S]*?preloadLayout[\s\S]*?\}\s*,\s*(\d+)\s*\)/);
      expect(preloadMatch).not.toBeNull();
      const delay = parseInt(preloadMatch[1], 10);
      expect(delay).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('image optimization', () => {
    it('should use <picture> element with WebP source for logo', () => {
      expect(html).toMatch(/<picture>[\s\S]*?<source[^>]*srcset="[^"]*logo-bg\.webp"[^>]*type="image\/webp"[^>]*>/);
    });

    it('should have width and height attributes on logo images', () => {
      const logoImgs = html.match(/<img[^>]*logo-bg[^>]*>/gi) || [];
      expect(logoImgs.length).toBeGreaterThanOrEqual(1);
      for (const img of logoImgs) {
        expect(img).toMatch(/width="\d+"/);
        expect(img).toMatch(/height="\d+"/);
      }
    });
  });
});

// === ResourceCache Performance Tests ===

describe('resourceCache.js performance', () => {
  let cacheSource;

  beforeEach(() => {
    cacheSource = readSource('resources/js/utils/resourceCache.js');
  });

  describe('no expensive JSON.stringify for size estimation', () => {
    it('should not use JSON.stringify for size calculation in active code', () => {
      // Split source into lines, filter out comments
      const activeLines = cacheSource.split('\n').filter(line => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
      });
      const activeCode = activeLines.join('\n');

      // JSON.stringify should not appear in active code paths
      // (it may exist in comments explaining why it was removed)
      const jsonStringifyUsages = activeCode.match(/JSON\.stringify\s*\(/g) || [];
      expect(jsonStringifyUsages.length).toBe(0);
    });
  });

  describe('debounced IndexedDB stats writes', () => {
    it('should have a debouncedSaveCacheStats method', () => {
      expect(cacheSource).toMatch(/debouncedSaveCacheStats\s*\(\)/);
    });

    it('should use a timer-based debounce with at least 1 second delay', () => {
      const delayMatch = cacheSource.match(/_statsSaveDelay\s*=\s*(\d+)/);
      expect(delayMatch).not.toBeNull();
      const delay = parseInt(delayMatch[1], 10);
      expect(delay).toBeGreaterThanOrEqual(1000);
    });

    it('should call debouncedSaveCacheStats instead of setCacheStatsToDB in loadResource', () => {
      // Find loadResource method and check it uses debounced version
      const loadResourceMatch = cacheSource.match(/async\s+loadResource\s*\([\s\S]*?(?=\n\s{2}\w|\n\s{2}\/\*\*|\n\s{2}async\s)/);
      if (loadResourceMatch) {
        expect(loadResourceMatch[0]).toMatch(/debouncedSaveCacheStats/);
        // Should not directly call setCacheStatsToDB (except in the deprecated wrapper)
      }
    });
  });

  describe('browser HTTP caching', () => {
    it('should not use cache: no-cache in fetch calls', () => {
      const activeLines = cacheSource.split('\n').filter(line => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && !trimmed.startsWith('*');
      });
      const activeCode = activeLines.join('\n');
      expect(activeCode).not.toMatch(/cache\s*:\s*['"]no-cache['"]/);
    });
  });

  describe('efficient cache stats retrieval', () => {
    it('should use store.count() instead of store.getAll() for stats', () => {
      expect(cacheSource).toMatch(/store\.count\s*\(\)/);
    });

    it('should estimate size from memory cache rather than serializing all records', () => {
      // getCacheStats (the full version, not getCacheStatsFromDB) should reference memoryCache
      const getCacheStatsMatch = cacheSource.match(/async\s+getCacheStats\s*\(\)[\s\S]*?(?=\n\s{2}async\s|\n\s{2}\/\*\*)/);
      if (getCacheStatsMatch) {
        expect(getCacheStatsMatch[0]).toMatch(/memoryCache/);
      }
    });
  });
});

// === UnifiedDataLoader Performance Tests ===

describe('unifiedDataLoader.js performance', () => {
  let loaderSource;

  beforeEach(() => {
    loaderSource = readSource('resources/js/utils/unifiedDataLoader.js');
  });

  describe('lazy tafsir loading', () => {
    it('should defer tafsir loading to requestIdleCallback or setTimeout', () => {
      // Tafsir loading should be wrapped in requestIdleCallback or setTimeout
      expect(loaderSource).toMatch(/requestIdleCallback|setTimeout[\s\S]*?tafsir/i);
    });

    it('should not load tafsir in the critical loadSharedResources path', () => {
      // Find the main Promise.all in loadSharedResources — it should only contain
      // surahNames and translations, not tafsir
      const loadSharedMatch = loaderSource.match(
        /loadSharedResources[\s\S]*?Promise\.all\s*\(\s*\[([\s\S]*?)\]\s*\)/
      );
      expect(loadSharedMatch).not.toBeNull();
      const criticalPromises = loadSharedMatch[1];
      expect(criticalPromises.toLowerCase()).not.toMatch(/tafsir/);
    });
  });

  describe('background refresh delay', () => {
    it('should delay resource refresh by at least 10 seconds', () => {
      // Match the setTimeout delay in scheduleResourceRefresh
      const refreshMatch = loaderSource.match(
        /scheduleResourceRefresh[\s\S]*?setTimeout\s*\([\s\S]*?\}\s*,\s*(\d+)\s*\)/
      );
      expect(refreshMatch).not.toBeNull();
      const delay = parseInt(refreshMatch[1], 10);
      expect(delay).toBeGreaterThanOrEqual(10000);
    });
  });

  describe('wordById cache', () => {
    it('should have a wordById cache object', () => {
      expect(loaderSource).toMatch(/wordByIdCache\s*=\s*\{/);
    });

    it('should have a getWordByIdLookup function', () => {
      expect(loaderSource).toMatch(/const\s+getWordByIdLookup\s*=/);
    });

    it('should use reference equality check to skip rebuilds', () => {
      // The function should compare wordsData reference identity
      const lookupFn = loaderSource.match(/getWordByIdLookup[\s\S]*?return\s+wordById/);
      expect(lookupFn).not.toBeNull();
      expect(lookupFn[0]).toMatch(/===\s*wordsData/);
    });
  });

  describe('no expensive operations', () => {
    it('should not use JSON.stringify for size estimation in active code', () => {
      const activeLines = loaderSource.split('\n').filter(line => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
      });
      const activeCode = activeLines.join('\n');
      expect(activeCode).not.toMatch(/JSON\.stringify\s*\(/);
    });

    it('should not use cache: no-cache in fetch calls', () => {
      const activeLines = loaderSource.split('\n').filter(line => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && !trimmed.startsWith('*');
      });
      const activeCode = activeLines.join('\n');
      expect(activeCode).not.toMatch(/cache\s*:\s*['"]no-cache['"]/);
    });
  });
});

// === FontAwesome Performance Tests ===

describe('FontAwesome CSS performance', () => {
  let fontAwesomeCss;

  beforeEach(() => {
    fontAwesomeCss = readSource('resources/js/vendor/fontawesome/all.min.css');
  });

  it('should use font-display: swap for all @font-face declarations', () => {
    const swapCount = (fontAwesomeCss.match(/font-display\s*:\s*swap/g) || []).length;
    expect(swapCount).toBeGreaterThanOrEqual(5); // Multiple font families
  });

  it('should not use font-display: block anywhere', () => {
    expect(fontAwesomeCss).not.toMatch(/font-display\s*:\s*block/);
  });
});

// === Image Asset Tests ===

describe('Image asset optimization', () => {
  it('should have a WebP version of the logo', () => {
    const webpPath = path.join(SOURCE, 'resources/assets/images/logo-bg.webp');
    expect(fs.existsSync(webpPath)).toBe(true);
  });

  it('should have a WebP logo smaller than 10KB', () => {
    const webpPath = path.join(SOURCE, 'resources/assets/images/logo-bg.webp');
    const stats = fs.statSync(webpPath);
    expect(stats.size).toBeLessThan(10 * 1024); // < 10KB
  });
});

// === ResourceCache Runtime Behavior Tests ===

describe('ResourceCache runtime behavior', () => {
  let ResourceCache;

  beforeEach(async () => {
    const mod = await import('../../source/resources/js/utils/resourceCache.js');
    ResourceCache = mod.ResourceCache;
  });

  it('should initialize with debounce timer set to null', () => {
    const mockDb = { db: null };
    const cache = new ResourceCache(mockDb);
    expect(cache._statsSaveTimer).toBeNull();
    expect(cache._statsSaveDelay).toBeGreaterThanOrEqual(1000);
  });

  it('should debounce multiple stat save calls into one timer', () => {
    vi.useFakeTimers();
    const mockDb = { db: null };
    const cache = new ResourceCache(mockDb);

    // Call debounced save multiple times
    cache.debouncedSaveCacheStats();
    cache.debouncedSaveCacheStats();
    cache.debouncedSaveCacheStats();

    // Only one timer should be pending (first call sets it, others bail out)
    expect(cache._statsSaveTimer).not.toBeNull();

    vi.useRealTimers();
  });
});

// === wordById Cache Runtime Tests ===

describe('wordById cache runtime behavior', () => {
  let getWordByIdLookup, wordByIdCache;

  beforeEach(async () => {
    // Reset module state by re-importing
    // Note: Vitest caches modules, so we use dynamic import with cache bust
    const mod = await import('../../source/resources/js/utils/unifiedDataLoader.js');
    // getWordByIdLookup is not exported, so we test through getPageText behavior
    // Instead, test the source code pattern
  });

  it('should export getWordByIdLookup from the module scope', () => {
    // Verify the function exists in source (it's module-scoped, not exported)
    const source = readSource('resources/js/utils/unifiedDataLoader.js');
    expect(source).toMatch(/const\s+getWordByIdLookup\s*=\s*\(wordsData/);
  });

  it('should cache results per layout type', () => {
    const source = readSource('resources/js/utils/unifiedDataLoader.js');
    // Verify cache has slots for both layouts
    expect(source).toMatch(/wordByIdCache\s*=\s*\{[\s\S]*?qpc\s*:/);
    expect(source).toMatch(/wordByIdCache\s*=\s*\{[\s\S]*?indopak\s*:/);
  });

  it('should be used by getPageText instead of inline wordById construction', () => {
    const source = readSource('resources/js/utils/unifiedDataLoader.js');
    // Find getPageText function and verify it calls getWordByIdLookup
    const getPageTextMatch = source.match(/getPageText[\s\S]*?return\s+pageText/);
    if (getPageTextMatch) {
      expect(getPageTextMatch[0]).toMatch(/getWordByIdLookup/);
      // Should NOT have Object.values(wordsData).forEach for building wordById inline
      expect(getPageTextMatch[0]).not.toMatch(/Object\.values\(wordsData\)\.forEach/);
    }
  });
});

// === Page Line Index Performance Tests ===

describe('pageLineIndex cache', () => {
  let loaderSource;

  beforeEach(() => {
    loaderSource = readSource('resources/js/utils/unifiedDataLoader.js');
  });

  it('should have a pageLineIndexCache object', () => {
    expect(loaderSource).toMatch(/pageLineIndexCache\s*=\s*\{/);
  });

  it('should have a getPageLineIndex function', () => {
    expect(loaderSource).toMatch(/const\s+getPageLineIndex\s*=/);
  });

  it('should use reference equality check for layout cache', () => {
    const fn = loaderSource.match(/getPageLineIndex[\s\S]*?return\s+index/);
    expect(fn).not.toBeNull();
    expect(fn[0]).toMatch(/===\s*layoutData/);
  });

  it('should be used by getPageText instead of .filter()', () => {
    const getPageTextMatch = loaderSource.match(/getPageText[\s\S]*?return\s+pageText/);
    if (getPageTextMatch) {
      expect(getPageTextMatch[0]).toMatch(/getPageLineIndex/);
      expect(getPageTextMatch[0]).not.toMatch(/\.filter\s*\(\s*line\s*=>/);
    }
  });

  it('should be used by getPageWordsDetailed instead of .filter() on layoutData.pages', () => {
    const match = loaderSource.match(/getPageWordsDetailed[\s\S]*?return\s+pageWords/);
    if (match) {
      expect(match[0]).toMatch(/getPageLineIndex/);
      // Should not filter layoutData.pages directly (the O(9000) scan)
      expect(match[0]).not.toMatch(/layoutData\.pages\.filter/);
    }
  });
});

// === Page Line Index Runtime Tests ===

describe('pageLineIndex runtime behavior', () => {
  let mod;

  beforeEach(async () => {
    mod = await import('../../source/resources/js/utils/unifiedDataLoader.js');
  });

  it('getPageWordsDetailed should return correct words for a mock page', () => {
    const layoutData = {
      pages: [
        { page_number: 1, line_number: 1, first_word_id: '1', last_word_id: '3' },
        { page_number: 1, line_number: 2, first_word_id: '4', last_word_id: '5' },
        { page_number: 2, line_number: 1, first_word_id: '6', last_word_id: '7' }
      ]
    };
    const wordsData = {
      w1: { id: 1, text: 'بِسْمِ', surah: 1, ayah: 1, position: 1 },
      w2: { id: 2, text: 'اللَّهِ', surah: 1, ayah: 1, position: 2 },
      w3: { id: 3, text: 'الرَّحْمَٰنِ', surah: 1, ayah: 1, position: 3 },
      w4: { id: 4, text: 'الرَّحِيمِ', surah: 1, ayah: 1, position: 4 },
      w5: { id: 5, text: 'الْحَمْدُ', surah: 1, ayah: 2, position: 1 },
      w6: { id: 6, text: 'لِلَّهِ', surah: 1, ayah: 2, position: 2 },
      w7: { id: 7, text: 'رَبِّ', surah: 1, ayah: 2, position: 3 }
    };

    const page1 = mod.getPageWordsDetailed(1, layoutData, wordsData);
    expect(page1.length).toBe(2); // Two lines for page 1
    expect(page1[0].words.length).toBe(3); // Words 1-3
    expect(page1[1].words.length).toBe(2); // Words 4-5

    const page2 = mod.getPageWordsDetailed(2, layoutData, wordsData);
    expect(page2.length).toBe(1); // One line for page 2
    expect(page2[0].words.length).toBe(2); // Words 6-7
  });
});

// === Verse Text Index Performance Tests ===

describe('verseTextIndex cache', () => {
  let loaderSource;

  beforeEach(() => {
    loaderSource = readSource('resources/js/utils/unifiedDataLoader.js');
  });

  it('should have a verseTextIndexCache object', () => {
    expect(loaderSource).toMatch(/verseTextIndexCache\s*=\s*\{/);
  });

  it('should have a getVerseTextIndex function', () => {
    expect(loaderSource).toMatch(/const\s+getVerseTextIndex\s*=/);
  });

  it('should export a getVerseText function', () => {
    expect(loaderSource).toMatch(/export\s+const\s+getVerseText\s*=/);
  });

  it('getVerseText should use the cached verseTextIndex', () => {
    const fn = loaderSource.match(/export\s+const\s+getVerseText[\s\S]*?\};/);
    expect(fn).not.toBeNull();
    expect(fn[0]).toMatch(/getVerseTextIndex/);
  });
});

// === Verse Text Index Runtime Tests ===

describe('getVerseText runtime behavior', () => {
  let mod;

  beforeEach(async () => {
    mod = await import('../../source/resources/js/utils/unifiedDataLoader.js');
  });

  it('should return joined text for a known surah/ayah', () => {
    const wordsData = {
      w1: { id: 1, text: 'بِسْمِ', surah: 1, ayah: 1, position: 1 },
      w2: { id: 2, text: 'اللَّهِ', surah: 1, ayah: 1, position: 2 },
      w3: { id: 3, text: 'الرَّحْمَٰنِ', surah: 1, ayah: 1, position: 3 },
      w4: { id: 4, text: 'الرَّحِيمِ', surah: 1, ayah: 1, position: 4 },
      w5: { id: 5, text: 'الْحَمْدُ', surah: 1, ayah: 2, position: 1 }
    };

    const result = mod.getVerseText(1, 1, wordsData);
    expect(result).toBe('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ');
  });

  it('should return empty string for missing verse', () => {
    const wordsData = {
      w1: { id: 1, text: 'بِسْمِ', surah: 1, ayah: 1, position: 1 }
    };
    expect(mod.getVerseText(99, 99, wordsData)).toBe('');
  });

  it('should return empty string when wordsData is null', () => {
    expect(mod.getVerseText(1, 1, null)).toBe('');
  });
});

// === Touch Scroll Performance Tests ===

describe('touch scroll not blocked', () => {
  let indexHtml;

  beforeEach(() => {
    indexHtml = readSource('index.html');
  });

  it('should NOT use @touchstart.prevent on word elements', () => {
    // @touchstart.prevent blocks native scroll — words should use plain @touchstart
    const wordTouchPatterns = indexHtml.match(/@touchstart\.prevent="handleWordTouchStart/g);
    expect(wordTouchPatterns).toBeNull();
  });

  it('should use @touchstart (without .prevent) on word elements', () => {
    const wordTouchPatterns = indexHtml.match(/@touchstart="handleWordTouchStart/g);
    expect(wordTouchPatterns).not.toBeNull();
    expect(wordTouchPatterns.length).toBeGreaterThanOrEqual(2);
  });
});

// === clearDataCache clears all lookup caches ===

describe('clearDataCache resets all caches', () => {
  let loaderSource;

  beforeEach(() => {
    loaderSource = readSource('resources/js/utils/unifiedDataLoader.js');
  });

  it('should reset pageLineIndexCache in clearDataCache', () => {
    const clearFn = loaderSource.match(/clearDataCache[\s\S]*?\n\};/);
    expect(clearFn).not.toBeNull();
    expect(clearFn[0]).toMatch(/pageLineIndexCache/);
  });

  it('should reset verseTextIndexCache in clearDataCache', () => {
    const clearFn = loaderSource.match(/clearDataCache[\s\S]*?\n\};/);
    expect(clearFn).not.toBeNull();
    expect(clearFn[0]).toMatch(/verseTextIndexCache/);
  });
});
