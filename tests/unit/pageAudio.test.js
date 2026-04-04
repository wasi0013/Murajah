/**
 * Unit tests for page-by-page audio feature
 * Tests getPageAudioUrls and related functionality
 */

import { describe, it, expect } from 'vitest';
import { getPageAudioUrls, PAGE_RECITERS } from '../../source/resources/js/utils/audioLoader.js';

const BASE_URL = 'https://wasi0013.github.io/VerseSplitterAI/examples/page_by_page/alafasy';

describe('getPageAudioUrls', () => {
  describe('basic page audio URL generation', () => {
    it('should return audio URL for page 1 (Al-Fatiha)', () => {
      const urls = getPageAudioUrls(1);
      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe(`${BASE_URL}/page001-001000.mp3`);
    });

    it('should return audio URL for page 2 (start of Al-Baqara)', () => {
      const urls = getPageAudioUrls(2);
      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe(`${BASE_URL}/page002-002000.mp3`);
    });

    it('should return audio URL for page 3 (continuation of Al-Baqara)', () => {
      const urls = getPageAudioUrls(3);
      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe(`${BASE_URL}/page003-002001.mp3`);
    });

    it('should return correct offset for page deep into Al-Baqara', () => {
      // Al-Baqara starts on page 2, page 49 is offset 47
      const urls = getPageAudioUrls(49);
      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe(`${BASE_URL}/page049-002047.mp3`);
    });
  });

  describe('multi-surah pages', () => {
    it('should return multiple URLs for page 106 (end of An-Nisa + start of Al-Maida)', () => {
      // An-Nisa starts on page 77, Al-Maida starts on page 106
      const urls = getPageAudioUrls(106);
      expect(urls).toHaveLength(2);
      expect(urls[0]).toBe(`${BASE_URL}/page106-004029.mp3`); // An-Nisa offset = 106-77 = 29
      expect(urls[1]).toBe(`${BASE_URL}/page106-005000.mp3`); // Al-Maida starts
    });

    it('should return 3 URLs for page 604 (last page: Al-Ikhlas, Al-Falaq, An-Nas)', () => {
      const urls = getPageAudioUrls(604);
      expect(urls).toHaveLength(3);
      expect(urls[0]).toBe(`${BASE_URL}/page604-112000.mp3`);
      expect(urls[1]).toBe(`${BASE_URL}/page604-113000.mp3`);
      expect(urls[2]).toBe(`${BASE_URL}/page604-114000.mp3`);
    });

    it('should return 3 URLs for page 601 (Al-Humazah, Al-Fil, Quraysh)', () => {
      // Surahs 103, 104, 105 all start on page 601
      const urls = getPageAudioUrls(601);
      expect(urls).toHaveLength(3);
      expect(urls[0]).toBe(`${BASE_URL}/page601-103000.mp3`);
      expect(urls[1]).toBe(`${BASE_URL}/page601-104000.mp3`);
      expect(urls[2]).toBe(`${BASE_URL}/page601-105000.mp3`);
    });

    it('should return 2 URLs for page 595 (end of Al-Balad + Ash-Shams + Al-Lail)', () => {
      // Surah 90 starts page 594, 91 and 92 start on 595
      const urls = getPageAudioUrls(595);
      expect(urls).toHaveLength(3);
      expect(urls[0]).toBe(`${BASE_URL}/page595-090001.mp3`); // Al-Balad continuation
      expect(urls[1]).toBe(`${BASE_URL}/page595-091000.mp3`); // Ash-Shams starts
      expect(urls[2]).toBe(`${BASE_URL}/page595-092000.mp3`); // Al-Lail starts
    });
  });

  describe('edge cases', () => {
    it('should return empty array for page 0', () => {
      const urls = getPageAudioUrls(0);
      expect(urls).toEqual([]);
    });

    it('should return empty array for negative page', () => {
      const urls = getPageAudioUrls(-1);
      expect(urls).toEqual([]);
    });

    it('should return empty array for page 605 (beyond last page)', () => {
      const urls = getPageAudioUrls(605);
      expect(urls).toEqual([]);
    });

    it('should return empty array for very large page number', () => {
      const urls = getPageAudioUrls(9999);
      expect(urls).toEqual([]);
    });

    it('should return URLs for page 604 (last valid page)', () => {
      const urls = getPageAudioUrls(604);
      expect(urls.length).toBeGreaterThan(0);
    });

    it('should always return valid URL strings', () => {
      for (let page = 1; page <= 604; page++) {
        const urls = getPageAudioUrls(page);
        for (const url of urls) {
          expect(url).toMatch(/^https:\/\/.+\.mp3$/);
        }
      }
    });

    it('should return at least 1 URL for every page from 1 to 604', () => {
      for (let page = 1; page <= 604; page++) {
        const urls = getPageAudioUrls(page);
        expect(urls.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('URL format consistency', () => {
    it('should zero-pad page numbers to 3 digits', () => {
      const urls1 = getPageAudioUrls(1);
      expect(urls1[0]).toContain('/page001-');

      const urls99 = getPageAudioUrls(99);
      expect(urls99[0]).toContain('/page099-');

      const urls100 = getPageAudioUrls(100);
      expect(urls100[0]).toContain('/page100-');
    });

    it('should zero-pad surah numbers to 3 digits', () => {
      // Page 1 = Surah 1
      const urls1 = getPageAudioUrls(1);
      expect(urls1[0]).toContain('-001');

      // Page 604 = Surah 112, 113, 114
      const urls604 = getPageAudioUrls(604);
      expect(urls604[0]).toContain('-112');
      expect(urls604[1]).toContain('-113');
      expect(urls604[2]).toContain('-114');
    });

    it('should zero-pad offset to 3 digits', () => {
      // First page of surah = offset 000
      const urls = getPageAudioUrls(2); // Start of Al-Baqara
      expect(urls[0]).toMatch(/page002-002000\.mp3$/);

      // Continuation page = offset > 000
      const urls3 = getPageAudioUrls(3);
      expect(urls3[0]).toMatch(/page003-002001\.mp3$/);
    });
  });

  describe('surah boundary detection', () => {
    it('should detect surah start correctly (first page of a surah has offset 000)', () => {
      // Al-Baqara starts on page 2
      const urls = getPageAudioUrls(2);
      expect(urls.some(u => u.includes('-002000.mp3'))).toBe(true);

      // Aal-e-Imran starts on page 50
      const urls50 = getPageAudioUrls(50);
      expect(urls50.some(u => u.includes('-003000.mp3'))).toBe(true);
    });

    it('should handle pages where two surahs both share page 587 (Al-Infitar + Al-Mutaffifin)', () => {
      // Both surah 82 (Al-Infitar) and 83 (Al-Mutaffifin) start on page 587
      // Surah 81 (At-Takwir) ends on page 586
      const urls = getPageAudioUrls(587);
      expect(urls).toHaveLength(2);
      expect(urls[0]).toBe(`${BASE_URL}/page587-082000.mp3`);
      expect(urls[1]).toBe(`${BASE_URL}/page587-083000.mp3`);
    });
  });
});

describe('getPageAudioUrls with reciters', () => {
  it('should default to alafasy when no reciter specified', () => {
    const urls = getPageAudioUrls(1);
    expect(urls[0]).toContain('VerseSplitterAI');
    expect(urls[0]).toContain('alafasy');
  });

  it('should return simple PageXXX.mp3 format for non-alafasy reciters', () => {
    const urls = getPageAudioUrls(1, 'abdul_basit');
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://everyayah.com/data/Abdul_Basit_Murattal_192kbps/PageMp3s/Page001.mp3');
  });

  it('should return single URL for any page with non-alafasy reciter', () => {
    const urls = getPageAudioUrls(604, 'husary');
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://everyayah.com/data/Husary_128kbps/PageMp3s/Page604.mp3');
  });

  it('should still return multi-part URLs for alafasy on multi-surah pages', () => {
    const urls = getPageAudioUrls(604, 'alafasy');
    expect(urls).toHaveLength(3);
  });

  it('should fall back to alafasy for unknown reciter', () => {
    const urls = getPageAudioUrls(1, 'unknown_reciter');
    expect(urls[0]).toContain('alafasy');
  });

  it('should return empty array for out-of-range pages regardless of reciter', () => {
    expect(getPageAudioUrls(0, 'abdul_basit')).toEqual([]);
    expect(getPageAudioUrls(605, 'husary')).toEqual([]);
  });

  it('should have all expected reciters in PAGE_RECITERS', () => {
    const ids = PAGE_RECITERS.map(r => r.id);
    expect(ids).toContain('alafasy');
    expect(ids).toContain('abdul_basit');
    expect(ids).toContain('husary');
    expect(ids).toContain('ahmed_al_ajmi');
    expect(ids).toContain('shuraim');
    expect(ids).toContain('ayyoub');
    expect(ids).toContain('minshawy');
    expect(ids).toContain('abdur_rahman_as_sudais');
    expect(ids).toContain('hudhaify');
    expect(ids).toContain('juhaynee');
    expect(ids).toContain('abu_bakr');
  });

  it('should only have alafasy as multiPart reciter', () => {
    const multiPart = PAGE_RECITERS.filter(r => r.multiPart);
    expect(multiPart).toHaveLength(1);
    expect(multiPart[0].id).toBe('alafasy');
  });

  it('should zero-pad page numbers for non-alafasy reciters', () => {
    expect(getPageAudioUrls(1, 'shuraim')[0]).toContain('/Page001.mp3');
    expect(getPageAudioUrls(99, 'shuraim')[0]).toContain('/Page099.mp3');
    expect(getPageAudioUrls(100, 'shuraim')[0]).toContain('/Page100.mp3');
  });
});
