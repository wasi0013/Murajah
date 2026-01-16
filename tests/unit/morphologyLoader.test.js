/**
 * Unit tests for Morphology Loader
 * Tests the lazy-loading morphology data system
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the logger first
vi.mock('../../source/resources/js/utils/logger.js', () => ({
  default: {
    MODULES: { DATA: 'DATA' },
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock fetch for testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Morphology Loader', () => {
  let morphologyLoader;

  beforeEach(async () => {
    // Reset all mocks before each test
    vi.resetModules();
    mockFetch.mockReset();
    
    // Dynamically import to get fresh module state
    morphologyLoader = await import('../../source/resources/js/utils/morphologyLoader.js');
    morphologyLoader.clearMorphologyCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('loadMorphologyForSurah', () => {
    it('should load morphology data for a valid surah', async () => {
      const mockData = {
        data: {
          '1:1:1': 'Test morphology for word 1',
          '1:1:2': 'Test morphology for word 2'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData
      });

      const result = await morphologyLoader.loadMorphologyForSurah(1);

      expect(mockFetch).toHaveBeenCalledWith('./resources/data/morphology/1.json');
      expect(result).toEqual(mockData.data);
    });

    it('should return empty object for invalid surah number (0)', async () => {
      const result = await morphologyLoader.loadMorphologyForSurah(0);
      
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toEqual({});
    });

    it('should return empty object for invalid surah number (115)', async () => {
      const result = await morphologyLoader.loadMorphologyForSurah(115);
      
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toEqual({});
    });

    it('should cache loaded data and return from cache on second call', async () => {
      const mockData = {
        data: {
          '2:1:1': 'First word of Al-Baqarah'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData
      });

      // First call - should fetch
      const result1 = await morphologyLoader.loadMorphologyForSurah(2);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await morphologyLoader.loadMorphologyForSurah(2);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1, not 2
      
      expect(result1).toEqual(result2);
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const result = await morphologyLoader.loadMorphologyForSurah(1);

      expect(result).toEqual({});
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await morphologyLoader.loadMorphologyForSurah(1);

      expect(result).toEqual({});
    });
  });

  describe('getMorphologyForWord', () => {
    it('should return morphology for a specific word', async () => {
      const mockData = {
        data: {
          '1:1:1': 'Morphology for bismillah',
          '1:1:2': 'Morphology for allah'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData
      });

      const result = await morphologyLoader.getMorphologyForWord(1, 1, 2);

      expect(result).toBe('Morphology for allah');
    });

    it('should return null for non-existent word', async () => {
      const mockData = {
        data: {
          '1:1:1': 'Morphology for word 1'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData
      });

      const result = await morphologyLoader.getMorphologyForWord(1, 1, 99);

      expect(result).toBeNull();
    });
  });

  describe('getMorphologyForWords (batch loading)', () => {
    it('should load morphology for multiple words efficiently', async () => {
      const mockSurah1 = {
        data: {
          '1:1:1': 'Word 1',
          '1:1:2': 'Word 2'
        }
      };
      const mockSurah2 = {
        data: {
          '2:1:1': 'Word from surah 2'
        }
      };

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockSurah1 })
        .mockResolvedValueOnce({ ok: true, json: async () => mockSurah2 });

      const wordRefs = [
        { surah: 1, ayah: 1, word: 1 },
        { surah: 1, ayah: 1, word: 2 },
        { surah: 2, ayah: 1, word: 1 }
      ];

      const result = await morphologyLoader.getMorphologyForWords(wordRefs);

      expect(result.get('1:1:1')).toBe('Word 1');
      expect(result.get('1:1:2')).toBe('Word 2');
      expect(result.get('2:1:1')).toBe('Word from surah 2');
      expect(result.size).toBe(3);
    });

    it('should batch by surah to minimize fetches', async () => {
      const mockSurah1 = {
        data: {
          '1:1:1': 'Word 1',
          '1:2:1': 'Word 2',
          '1:3:1': 'Word 3'
        }
      };

      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockSurah1 });

      const wordRefs = [
        { surah: 1, ayah: 1, word: 1 },
        { surah: 1, ayah: 2, word: 1 },
        { surah: 1, ayah: 3, word: 1 }
      ];

      await morphologyLoader.getMorphologyForWords(wordRefs);

      // Should only fetch once since all words are from same surah
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('isSurahMorphologyCached', () => {
    it('should return false for uncached surah', () => {
      expect(morphologyLoader.isSurahMorphologyCached(1)).toBe(false);
    });

    it('should return true after loading', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { '1:1:1': 'test' } })
      });

      await morphologyLoader.loadMorphologyForSurah(1);

      expect(morphologyLoader.isSurahMorphologyCached(1)).toBe(true);
    });
  });

  describe('getMorphologyCacheStats', () => {
    it('should return empty stats initially', () => {
      const stats = morphologyLoader.getMorphologyCacheStats();
      
      expect(stats.cachedSurahs).toBe(0);
      expect(stats.totalCachedWords).toBe(0);
      expect(stats.cachedSurahNumbers).toEqual([]);
    });

    it('should track cached data correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { '1:1:1': 'a', '1:1:2': 'b', '1:1:3': 'c' } })
      });

      await morphologyLoader.loadMorphologyForSurah(1);

      const stats = morphologyLoader.getMorphologyCacheStats();
      
      expect(stats.cachedSurahs).toBe(1);
      expect(stats.totalCachedWords).toBe(3);
      expect(stats.cachedSurahNumbers).toContain(1);
    });
  });

  describe('clearMorphologyCache', () => {
    it('should clear all cache', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { '1:1:1': 'a' } }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { '2:1:1': 'b' } }) });

      await morphologyLoader.loadMorphologyForSurah(1);
      await morphologyLoader.loadMorphologyForSurah(2);

      expect(morphologyLoader.getMorphologyCacheStats().cachedSurahs).toBe(2);

      morphologyLoader.clearMorphologyCache();

      expect(morphologyLoader.getMorphologyCacheStats().cachedSurahs).toBe(0);
    });

    it('should clear specific surah cache', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { '1:1:1': 'a' } }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { '2:1:1': 'b' } }) });

      await morphologyLoader.loadMorphologyForSurah(1);
      await morphologyLoader.loadMorphologyForSurah(2);

      morphologyLoader.clearMorphologyCache(1);

      expect(morphologyLoader.isSurahMorphologyCached(1)).toBe(false);
      expect(morphologyLoader.isSurahMorphologyCached(2)).toBe(true);
    });
  });
});
