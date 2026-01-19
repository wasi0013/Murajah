/**
 * Unit Tests: Surah View
 * Tests for surah data loading, verse pagination, and related utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch for testing data loading
const mockDetailedQuranData = {
  "1": [
    { chapter: 1, verse: 1, text: "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ", hasanah: 190, page: 1 },
    { chapter: 1, verse: 2, text: "ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَٰلَمِينَ", hasanah: 170, page: 1 },
    { chapter: 1, verse: 3, text: "ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ", hasanah: 120, page: 1 },
    { chapter: 1, verse: 4, text: "مَٰلِكِ يَوۡمِ ٱلدِّينِ", hasanah: 110, page: 1 },
    { chapter: 1, verse: 5, text: "إِيَّاكَ نَعۡبُدُ وَإِيَّاكَ نَسۡتَعِينُ", hasanah: 190, page: 1 },
    { chapter: 1, verse: 6, text: "ٱهۡدِنَا ٱلصِّرَٰطَ ٱلۡمُسۡتَقِيمَ", hasanah: 180, page: 1 },
    { chapter: 1, verse: 7, text: "صِرَٰطَ ٱلَّذِينَ أَنۡعَمۡتَ عَلَيۡهِمۡ غَيۡرِ ٱلۡمَغۡضُوبِ عَلَيۡهِمۡ وَلَا ٱلضَّآلِّينَ", hasanah: 430, page: 1 }
  ],
  "2": Array.from({ length: 286 }, (_, i) => ({
    chapter: 2,
    verse: i + 1,
    text: `Verse ${i + 1} of Al-Baqarah`,
    hasanah: 100,
    page: 2 + Math.floor(i / 10)
  })),
  "9": [
    { chapter: 9, verse: 1, text: "بَرَآءَةٞ مِّنَ ٱللَّهِ وَرَسُولِهِۦٓ", hasanah: 200, page: 187 }
  ],
  "114": [
    { chapter: 114, verse: 1, text: "قُلۡ أَعُوذُ بِرَبِّ ٱلنَّاسِ", hasanah: 140, page: 604 },
    { chapter: 114, verse: 2, text: "مَلِكِ ٱلنَّاسِ", hasanah: 80, page: 604 },
    { chapter: 114, verse: 3, text: "إِلَٰهِ ٱلنَّاسِ", hasanah: 80, page: 604 },
    { chapter: 114, verse: 4, text: "مِن شَرِّ ٱلۡوَسۡوَاسِ ٱلۡخَنَّاسِ", hasanah: 170, page: 604 },
    { chapter: 114, verse: 5, text: "ٱلَّذِي يُوَسۡوِسُ فِي صُدُورِ ٱلنَّاسِ", hasanah: 200, page: 604 },
    { chapter: 114, verse: 6, text: "مِنَ ٱلۡجِنَّةِ وَٱلنَّاسِ", hasanah: 130, page: 604 }
  ]
};

describe('Surah View - Verse Count Utility', () => {
  // Standard verse counts for all 114 surahs
  const verseCounts = {
    1: 7, 2: 286, 3: 200, 4: 176, 5: 120, 6: 165, 7: 206, 8: 75, 9: 129, 10: 109,
    11: 123, 12: 111, 13: 43, 14: 52, 15: 99, 16: 128, 17: 111, 18: 110, 19: 98, 20: 135,
    21: 112, 22: 78, 23: 118, 24: 64, 25: 77, 26: 227, 27: 93, 28: 88, 29: 69, 30: 60,
    31: 34, 32: 30, 33: 73, 34: 54, 35: 45, 36: 83, 37: 182, 38: 88, 39: 75, 40: 85,
    41: 54, 42: 53, 43: 89, 44: 59, 45: 37, 46: 35, 47: 38, 48: 29, 49: 18, 50: 45,
    51: 60, 52: 49, 53: 62, 54: 55, 55: 78, 56: 96, 57: 29, 58: 22, 59: 24, 60: 13,
    61: 14, 62: 11, 63: 11, 64: 18, 65: 12, 66: 12, 67: 30, 68: 52, 69: 52, 70: 44,
    71: 28, 72: 28, 73: 20, 74: 56, 75: 40, 76: 31, 77: 50, 78: 40, 79: 46, 80: 42,
    81: 29, 82: 19, 83: 36, 84: 25, 85: 22, 86: 17, 87: 19, 88: 26, 89: 30, 90: 20,
    91: 15, 92: 21, 93: 11, 94: 8, 95: 8, 96: 19, 97: 5, 98: 8, 99: 8, 100: 11,
    101: 11, 102: 8, 103: 3, 104: 9, 105: 5, 106: 4, 107: 7, 108: 3, 109: 6, 110: 3,
    111: 5, 112: 4, 113: 5, 114: 6
  };

  const getSurahVerseCount = (surahNum) => verseCounts[surahNum] || 0;

  it('should return correct verse count for Al-Fatihah (7 verses)', () => {
    expect(getSurahVerseCount(1)).toBe(7);
  });

  it('should return correct verse count for Al-Baqarah (286 verses)', () => {
    expect(getSurahVerseCount(2)).toBe(286);
  });

  it('should return correct verse count for Al-Kawthar (3 verses)', () => {
    expect(getSurahVerseCount(108)).toBe(3);
  });

  it('should return correct verse count for An-Nas (6 verses)', () => {
    expect(getSurahVerseCount(114)).toBe(6);
  });

  it('should return 0 for invalid surah number', () => {
    expect(getSurahVerseCount(0)).toBe(0);
    expect(getSurahVerseCount(115)).toBe(0);
    expect(getSurahVerseCount(-1)).toBe(0);
  });

  it('should have 114 surahs defined', () => {
    expect(Object.keys(verseCounts).length).toBe(114);
  });

  it('should have total of 6236 verses in the Quran', () => {
    const total = Object.values(verseCounts).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(6236);
  });
});

describe('Surah View - Surah State Management', () => {
  let surahViewState;

  beforeEach(() => {
    // Reset state before each test - now page-based structure
    surahViewState = {
      selectedSurah: null,
      pages: [],           // Loaded pages with their lines
      allPages: [],        // All page numbers for this surah
      loadedPageCount: 0,
      pageBatchSize: 1,    // Load 1 page at a time
      isLoading: false,
      hasMore: true,
      loadedFonts: new Set(),
      totalVerseCount: 0
    };
  });

  it('should initialize with null selected surah', () => {
    expect(surahViewState.selectedSurah).toBeNull();
  });

  it('should initialize with empty pages array', () => {
    expect(surahViewState.pages).toEqual([]);
    expect(surahViewState.allPages).toEqual([]);
  });

  it('should initialize with correct page batch size', () => {
    expect(surahViewState.pageBatchSize).toBe(1);
  });

  it('should initialize with hasMore true', () => {
    expect(surahViewState.hasMore).toBe(true);
  });
});

describe('Surah View - Page Loading Logic', () => {
  let surahViewState;
  
  // Mock page data (simulating getPageWordsDetailed output)
  const mockPageLines = (pageNum) => [
    { type: 'line', words: [{ id: `${pageNum}:1`, text: 'Word 1' }, { id: `${pageNum}:2`, text: 'Word 2' }] },
    { type: 'line', words: [{ id: `${pageNum}:3`, text: 'Word 3' }, { id: `${pageNum}:4`, text: 'Word 4' }] }
  ];
  
  const loadMoreSurahPages = () => {
    if (!surahViewState.hasMore || surahViewState.isLoading) {
      return;
    }
    
    const currentCount = surahViewState.loadedPageCount;
    const totalPages = surahViewState.allPages.length;
    const nextPageNumbers = surahViewState.allPages.slice(
      currentCount, 
      currentCount + surahViewState.pageBatchSize
    );
    
    if (nextPageNumbers.length > 0) {
      nextPageNumbers.forEach(pageNum => {
        surahViewState.pages.push({
          pageNum,
          lines: mockPageLines(pageNum)
        });
      });
      surahViewState.loadedPageCount += nextPageNumbers.length;
    }
    
    surahViewState.hasMore = surahViewState.loadedPageCount < totalPages;
  };

  beforeEach(() => {
    surahViewState = {
      selectedSurah: null,
      pages: [],
      allPages: [],
      loadedPageCount: 0,
      pageBatchSize: 1,
      isLoading: false,
      hasMore: true,
      loadedFonts: new Set(),
      totalVerseCount: 0
    };
  });

  it('should load first page', () => {
    // Simulate Al-Fatihah (1 page)
    surahViewState.allPages = [1];
    
    loadMoreSurahPages();
    
    expect(surahViewState.pages.length).toBe(1);
    expect(surahViewState.loadedPageCount).toBe(1);
    expect(surahViewState.hasMore).toBe(false);
  });

  it('should load pages one at a time for multi-page surahs', () => {
    // Simulate Al-Baqarah (pages 2-49)
    surahViewState.allPages = Array.from({ length: 48 }, (_, i) => i + 2);
    surahViewState.pageBatchSize = 1;
    
    loadMoreSurahPages();
    
    expect(surahViewState.pages.length).toBe(1);
    expect(surahViewState.loadedPageCount).toBe(1);
    expect(surahViewState.hasMore).toBe(true);
  });

  it('should load additional pages on subsequent calls', () => {
    surahViewState.allPages = Array.from({ length: 10 }, (_, i) => i + 1);
    surahViewState.pageBatchSize = 1;
    
    // Load first page
    loadMoreSurahPages();
    expect(surahViewState.loadedPageCount).toBe(1);
    
    // Load second page
    loadMoreSurahPages();
    expect(surahViewState.loadedPageCount).toBe(2);
    expect(surahViewState.pages.length).toBe(2);
    
    // Load third page
    loadMoreSurahPages();
    expect(surahViewState.loadedPageCount).toBe(3);
  });

  it('should set hasMore to false when all pages are loaded', () => {
    surahViewState.allPages = [1, 2, 3]; // 3 pages
    surahViewState.pageBatchSize = 5; // Larger than total
    
    loadMoreSurahPages();
    
    expect(surahViewState.hasMore).toBe(false);
    expect(surahViewState.loadedPageCount).toBe(3);
  });

  it('should not load more when already loading', () => {
    surahViewState.allPages = [1, 2, 3, 4, 5];
    surahViewState.isLoading = true;
    
    loadMoreSurahPages();
    
    expect(surahViewState.pages.length).toBe(0);
    expect(surahViewState.loadedPageCount).toBe(0);
  });

  it('should not load more when hasMore is false', () => {
    surahViewState.allPages = [1];
    surahViewState.hasMore = false;
    
    loadMoreSurahPages();
    
    expect(surahViewState.pages.length).toBe(0);
  });
});

describe('Surah View - Back Navigation', () => {
  let surahViewState;
  
  const backToSurahGrid = () => {
    surahViewState.selectedSurah = null;
    surahViewState.pages = [];
    surahViewState.allPages = [];
    surahViewState.loadedPageCount = 0;
    surahViewState.hasMore = true;
    surahViewState.loadedFonts = new Set();
    surahViewState.totalVerseCount = 0;
  };

  beforeEach(() => {
    // Simulate a loaded surah with page-based structure
    surahViewState = {
      selectedSurah: 1,
      pages: [{ pageNum: 1, lines: [] }],
      allPages: [1],
      loadedPageCount: 1,
      pageBatchSize: 1,
      isLoading: false,
      hasMore: false,
      loadedFonts: new Set([1]),
      totalVerseCount: 7
    };
  });

  it('should reset selectedSurah to null', () => {
    backToSurahGrid();
    expect(surahViewState.selectedSurah).toBeNull();
  });

  it('should clear all pages', () => {
    backToSurahGrid();
    expect(surahViewState.pages).toEqual([]);
    expect(surahViewState.allPages).toEqual([]);
  });

  it('should reset loadedPageCount to 0', () => {
    backToSurahGrid();
    expect(surahViewState.loadedPageCount).toBe(0);
  });

  it('should reset hasMore to true', () => {
    backToSurahGrid();
    expect(surahViewState.hasMore).toBe(true);
  });

  it('should clear loadedFonts set', () => {
    backToSurahGrid();
    expect(surahViewState.loadedFonts.size).toBe(0);
  });
});

describe('Surah View - Surah Validation', () => {
  it('should validate surah number is between 1 and 114', () => {
    const isValidSurah = (num) => num >= 1 && num <= 114;
    
    expect(isValidSurah(1)).toBe(true);
    expect(isValidSurah(57)).toBe(true);
    expect(isValidSurah(114)).toBe(true);
    expect(isValidSurah(0)).toBe(false);
    expect(isValidSurah(115)).toBe(false);
    expect(isValidSurah(-1)).toBe(false);
  });
});

describe('Surah View - Bismillah Logic', () => {
  it('should show Bismillah for all surahs except At-Tawbah (9)', () => {
    const shouldShowBismillah = (surahNum) => surahNum !== 9;
    
    expect(shouldShowBismillah(1)).toBe(true);
    expect(shouldShowBismillah(2)).toBe(true);
    expect(shouldShowBismillah(8)).toBe(true);
    expect(shouldShowBismillah(9)).toBe(false); // At-Tawbah
    expect(shouldShowBismillah(10)).toBe(true);
    expect(shouldShowBismillah(114)).toBe(true);
  });
});

describe('Surah View - Data Structure Validation', () => {
  it('should have correct page structure', () => {
    // Page-based structure: each page has pageNum and lines
    const page = { pageNum: 1, lines: [{ words: [{ text: 'word' }] }] };
    
    expect(page).toHaveProperty('pageNum');
    expect(page).toHaveProperty('lines');
    expect(page.lines[0]).toHaveProperty('words');
  });

  it('should have lines with correct word structure', () => {
    const line = { words: [{ text: 'بِسْمِ', id: '1:1:1' }] };
    
    expect(line.words).toBeInstanceOf(Array);
    expect(line.words[0]).toHaveProperty('text');
  });

  it('should have pages in correct order', () => {
    const pages = [
      { pageNum: 1, lines: [] },
      { pageNum: 2, lines: [] },
      { pageNum: 3, lines: [] }
    ];
    
    for (let i = 0; i < pages.length; i++) {
      expect(pages[i].pageNum).toBe(i + 1);
    }
  });
});

describe('Surah View - Scroll Detection for Lazy Loading', () => {
  it('should trigger load when near bottom of scroll', () => {
    const shouldLoadMore = (scrollHeight, scrollTop, clientHeight, threshold = 200) => {
      const scrollBottom = scrollHeight - scrollTop - clientHeight;
      return scrollBottom < threshold;
    };
    
    // Container: 1000px height, content: 3000px, scrolled to bottom
    expect(shouldLoadMore(3000, 2000, 1000)).toBe(true);
    
    // Scrolled to top
    expect(shouldLoadMore(3000, 0, 1000)).toBe(false);
    
    // Scrolled to middle
    expect(shouldLoadMore(3000, 1000, 1000)).toBe(false);
    
    // Near bottom (within 200px)
    expect(shouldLoadMore(3000, 1850, 1000)).toBe(true);
  });
});

describe('Surah View - URL Parameter Handling', () => {
  it('should parse surah number from URL', () => {
    const parseSurahFromUrl = (url) => {
      const params = new URLSearchParams(new URL(url).search);
      const surahParam = params.get('surah');
      if (surahParam) {
        const num = parseInt(surahParam, 10);
        if (num >= 1 && num <= 114) {
          return num;
        }
      }
      return null;
    };
    
    expect(parseSurahFromUrl('http://localhost/?surah=1')).toBe(1);
    expect(parseSurahFromUrl('http://localhost/?surah=114')).toBe(114);
    expect(parseSurahFromUrl('http://localhost/?surah=0')).toBeNull();
    expect(parseSurahFromUrl('http://localhost/?surah=115')).toBeNull();
    expect(parseSurahFromUrl('http://localhost/?page=1')).toBeNull();
  });

  it('should parse surahview flag from URL', () => {
    const parseSurahViewFromUrl = (url) => {
      const params = new URLSearchParams(new URL(url).search);
      return params.get('surahview') === 'true';
    };
    
    expect(parseSurahViewFromUrl('http://localhost/?surahview=true')).toBe(true);
    expect(parseSurahViewFromUrl('http://localhost/?surahview=false')).toBe(false);
    expect(parseSurahViewFromUrl('http://localhost/?page=1')).toBe(false);
  });
});

describe('Surah View - Surah Content Filtering', () => {
  // This tests the filtering logic that shows only selected surah content
  // when a page contains multiple surahs (e.g., surah starts mid-page)
  
  const filterLinesForSurah = (pageLines, selectedSurah) => {
    const selectedSurahStr = String(selectedSurah);
    
    return pageLines.map(line => {
      // Skip surah_name decoration lines
      if (line.type === 'surah_name') {
        return null;
      }
      
      // For ayah lines, filter words to only include those from the selected surah
      if (line.type === 'ayah' && line.words && line.words.length > 0) {
        const filteredWords = line.words.filter(word => String(word.surah) === selectedSurahStr);
        
        // If no words from this surah, skip the line
        if (filteredWords.length === 0) {
          return null;
        }
        
        return {
          ...line,
          words: filteredWords
        };
      }
      
      return line;
    }).filter(line => line !== null);
  };

  it('should filter out surah_name decoration lines', () => {
    const pageLines = [
      { type: 'surah_name', text: 'Surah 1' },
      { type: 'ayah', words: [{ id: 1, text: 'word1', surah: '1' }] }
    ];
    
    const filtered = filterLinesForSurah(pageLines, 1);
    
    expect(filtered.length).toBe(1);
    expect(filtered[0].type).toBe('ayah');
  });

  it('should keep lines that belong to the selected surah', () => {
    const pageLines = [
      { type: 'ayah', words: [
        { id: 1, text: 'word1', surah: '1' },
        { id: 2, text: 'word2', surah: '1' }
      ]}
    ];
    
    const filtered = filterLinesForSurah(pageLines, 1);
    
    expect(filtered.length).toBe(1);
    expect(filtered[0].words.length).toBe(2);
  });

  it('should filter out lines from other surahs', () => {
    const pageLines = [
      { type: 'ayah', words: [
        { id: 1, text: 'word1', surah: '17' },  // Surah Al-Isra
        { id: 2, text: 'word2', surah: '17' }
      ]},
      { type: 'ayah', words: [
        { id: 3, text: 'word3', surah: '18' },  // Surah Al-Kahf
        { id: 4, text: 'word4', surah: '18' }
      ]}
    ];
    
    const filtered = filterLinesForSurah(pageLines, 18);  // Only want Al-Kahf
    
    expect(filtered.length).toBe(1);
    expect(filtered[0].words[0].surah).toBe('18');
    expect(filtered[0].words[1].surah).toBe('18');
  });

  it('should handle mixed lines with words from multiple surahs', () => {
    // This simulates a line that spans surah boundary
    const pageLines = [
      { type: 'ayah', words: [
        { id: 1, text: 'end-of-17', surah: '17' },
        { id: 2, text: 'start-of-18', surah: '18' }
      ]}
    ];
    
    const filtered = filterLinesForSurah(pageLines, 18);
    
    expect(filtered.length).toBe(1);
    expect(filtered[0].words.length).toBe(1);
    expect(filtered[0].words[0].text).toBe('start-of-18');
  });

  it('should handle surah number as number type', () => {
    const pageLines = [
      { type: 'ayah', words: [
        { id: 1, text: 'word1', surah: 1 },  // Number type
        { id: 2, text: 'word2', surah: 1 }
      ]}
    ];
    
    const filtered = filterLinesForSurah(pageLines, 1);
    
    expect(filtered.length).toBe(1);
    expect(filtered[0].words.length).toBe(2);
  });

  it('should handle surah number as string type', () => {
    const pageLines = [
      { type: 'ayah', words: [
        { id: 1, text: 'word1', surah: '108' },  // String type
        { id: 2, text: 'word2', surah: '108' }
      ]}
    ];
    
    const filtered = filterLinesForSurah(pageLines, 108);
    
    expect(filtered.length).toBe(1);
    expect(filtered[0].words.length).toBe(2);
  });

  it('should return empty array when no content matches selected surah', () => {
    const pageLines = [
      { type: 'surah_name', text: 'Surah 17' },
      { type: 'ayah', words: [
        { id: 1, text: 'word1', surah: '17' }
      ]}
    ];
    
    const filtered = filterLinesForSurah(pageLines, 18);
    
    expect(filtered.length).toBe(0);
  });

  it('should handle empty page lines array', () => {
    const filtered = filterLinesForSurah([], 1);
    expect(filtered).toEqual([]);
  });

  it('should preserve line properties when filtering', () => {
    const pageLines = [
      { 
        type: 'ayah', 
        lineNumber: 5,
        words: [
          { id: 1, text: 'word1', surah: '1', ayah: 1, position: 1 }
        ]
      }
    ];
    
    const filtered = filterLinesForSurah(pageLines, 1);
    
    expect(filtered[0].lineNumber).toBe(5);
    expect(filtered[0].type).toBe('ayah');
  });

  it('should filter correctly for small surahs on shared pages', () => {
    // Simulating a page with Al-Kawthar (108), Al-Kafirun (109) content
    const pageLines = [
      { type: 'surah_name', text: 'Surah 108' },
      { type: 'ayah', words: [
        { id: 1, text: 'إِنَّا', surah: '108' },
        { id: 2, text: 'أَعْطَيْنَاكَ', surah: '108' }
      ]},
      { type: 'surah_name', text: 'Surah 109' },
      { type: 'ayah', words: [
        { id: 3, text: 'قُلْ', surah: '109' },
        { id: 4, text: 'يَا', surah: '109' }
      ]}
    ];
    
    const filtered = filterLinesForSurah(pageLines, 108);
    
    expect(filtered.length).toBe(1);
    expect(filtered[0].words.every(w => w.surah === '108')).toBe(true);
  });
});
