/**
 * Unit tests for QuranAudioPlayerComponent
 * Covers: A-B repeat logic, page-mode playlist labels, abRegionStyle computed
 */

import { describe, it, expect } from 'vitest';

// ─── Helpers extracted from component logic ────────────────────────────────

/**
 * Mirror of abRegionStyle computed property.
 */
function abRegionStyle(abRepeatA, abRepeatB, duration) {
  if (abRepeatA === null || abRepeatB === null || duration <= 0) return {};
  const a = Math.min(abRepeatA, abRepeatB);
  const b = Math.max(abRepeatA, abRepeatB);
  return {
    left: (a / duration * 100) + '%',
    width: ((b - a) / duration * 100) + '%'
  };
}

/**
 * Mirror of A-B repeat check in updateProgress.
 * Returns new currentTime after applying A-B repeat (or unchanged if not triggered).
 */
function applyAbRepeat(currentTime, abRepeatEnabled, abRepeatA, abRepeatB) {
  if (!abRepeatEnabled || abRepeatA === null || abRepeatB === null) {
    return currentTime;
  }
  const a = Math.min(abRepeatA, abRepeatB);
  const b = Math.max(abRepeatA, abRepeatB);
  if (currentTime >= b) {
    return a;
  }
  return currentTime;
}

/**
 * Mirror of getPageAudioPartLabel.
 */
function getPageAudioPartLabel(idx, pageAudioUrls, currentPage) {
  if (pageAudioUrls.length === 1) return `Audio of Page ${currentPage}`;
  const url = pageAudioUrls[idx];
  const match = url && url.match(/page\d{3}-(\d{3})\d{3}\.mp3/);
  if (match) {
    const surahNum = parseInt(match[1], 10);
    return `Part ${idx + 1} · Surah ${surahNum}`;
  }
  return `Part ${idx + 1}`;
}

// ─── abRegionStyle ─────────────────────────────────────────────────────────

describe('abRegionStyle()', () => {
  it('returns empty object when A is null', () => {
    expect(abRegionStyle(null, 30, 100)).toEqual({});
  });

  it('returns empty object when B is null', () => {
    expect(abRegionStyle(10, null, 100)).toEqual({});
  });

  it('returns empty object when both null', () => {
    expect(abRegionStyle(null, null, 100)).toEqual({});
  });

  it('returns empty object when duration is 0', () => {
    expect(abRegionStyle(10, 30, 0)).toEqual({});
  });

  it('returns empty object when duration is negative', () => {
    expect(abRegionStyle(10, 30, -5)).toEqual({});
  });

  it('computes correct style for A=10, B=30, duration=100', () => {
    const style = abRegionStyle(10, 30, 100);
    expect(style.left).toBe('10%');
    expect(style.width).toBe('20%');
  });

  it('computes correct style for A=0, B=100, duration=100 (full range)', () => {
    const style = abRegionStyle(0, 100, 100);
    expect(style.left).toBe('0%');
    expect(style.width).toBe('100%');
  });

  it('normalises when A > B (swaps so A is always left boundary)', () => {
    const style = abRegionStyle(70, 20, 100);
    expect(style.left).toBe('20%');
    expect(style.width).toBe('50%');
  });

  it('handles fractional seconds', () => {
    const style = abRegionStyle(1.5, 3.0, 10);
    expect(style.left).toBe('15%');
    expect(style.width).toBe('15%');
  });

  it('handles A === B (zero-width region)', () => {
    const style = abRegionStyle(25, 25, 100);
    expect(style.left).toBe('25%');
    expect(style.width).toBe('0%');
  });
});

// ─── applyAbRepeat ─────────────────────────────────────────────────────────

describe('applyAbRepeat()', () => {
  it('does not seek when disabled', () => {
    expect(applyAbRepeat(50, false, 10, 40)).toBe(50);
  });

  it('does not seek when A is null', () => {
    expect(applyAbRepeat(50, true, null, 40)).toBe(50);
  });

  it('does not seek when B is null', () => {
    expect(applyAbRepeat(50, true, 10, null)).toBe(50);
  });

  it('does not seek when currentTime < B', () => {
    expect(applyAbRepeat(25, true, 10, 40)).toBe(25);
  });

  it('seeks to A when currentTime === B', () => {
    expect(applyAbRepeat(40, true, 10, 40)).toBe(10);
  });

  it('seeks to A when currentTime > B', () => {
    expect(applyAbRepeat(42, true, 10, 40)).toBe(10);
  });

  it('uses correct boundaries when A > B (B is treated as left, A as right)', () => {
    // A=70, B=20 → left=20, right=70
    // currentTime=70 should trigger loop back to 20
    expect(applyAbRepeat(70, true, 70, 20)).toBe(20);
  });

  it('does not loop when inside the A-B region with A > B', () => {
    // A=70, B=20 → region is [20,70]; currentTime=50 → no seek
    expect(applyAbRepeat(50, true, 70, 20)).toBe(50);
  });

  it('seeks to A=0 (start of track)', () => {
    expect(applyAbRepeat(20, true, 0, 20)).toBe(0);
  });

  it('handles fractional time values', () => {
    expect(applyAbRepeat(3.01, true, 1.0, 3.0)).toBe(1.0);
    expect(applyAbRepeat(2.99, true, 1.0, 3.0)).toBe(2.99);
  });
});

// ─── getPageAudioPartLabel ─────────────────────────────────────────────────

describe('getPageAudioPartLabel()', () => {
  const BASE = 'https://wasi0013.github.io/VerseSplitterAI/examples/page_by_page/alafasy';

  it('returns page audio label when only one URL', () => {
    const urls = [`${BASE}/page001-001000.mp3`];
    expect(getPageAudioPartLabel(0, urls, 1)).toBe('Audio of Page 1');
  });

  it('returns "Part 1 · Surah 1" for first alafasy multi-part URL', () => {
    const urls = [
      `${BASE}/page106-004029.mp3`,
      `${BASE}/page106-005000.mp3`
    ];
    expect(getPageAudioPartLabel(0, urls, 106)).toBe('Part 1 · Surah 4');
    expect(getPageAudioPartLabel(1, urls, 106)).toBe('Part 2 · Surah 5');
  });

  it('handles 3-part pages (e.g. page 604 with surahs 112, 113, 114)', () => {
    const urls = [
      `${BASE}/page604-112000.mp3`,
      `${BASE}/page604-113000.mp3`,
      `${BASE}/page604-114000.mp3`
    ];
    expect(getPageAudioPartLabel(0, urls, 604)).toBe('Part 1 · Surah 112');
    expect(getPageAudioPartLabel(1, urls, 604)).toBe('Part 2 · Surah 113');
    expect(getPageAudioPartLabel(2, urls, 604)).toBe('Part 3 · Surah 114');
  });

  it('returns generic "Part N" label for non-multipart URL format', () => {
    const urls = [
      'https://everyayah.com/data/Alafasy_128kbps/PageMp3s/Page106.mp3',
      'https://everyayah.com/data/Alafasy_128kbps/PageMp3s/Page107.mp3'
    ];
    expect(getPageAudioPartLabel(0, urls, 106)).toBe('Part 1');
    expect(getPageAudioPartLabel(1, urls, 107)).toBe('Part 2');
  });

  it('handles null URL gracefully', () => {
    const urls = [null, `${BASE}/page106-005000.mp3`];
    expect(getPageAudioPartLabel(0, urls, 106)).toBe('Part 1');
    expect(getPageAudioPartLabel(1, urls, 106)).toBe('Part 2 · Surah 5');
  });

  it('extracts correct surah from zero-padded numbers', () => {
    // page002-002000.mp3 → surah 2
    const urls = [
      `${BASE}/page002-002000.mp3`,
      `${BASE}/page002-003000.mp3`
    ];
    expect(getPageAudioPartLabel(0, urls, 2)).toBe('Part 1 · Surah 2');
    expect(getPageAudioPartLabel(1, urls, 2)).toBe('Part 2 · Surah 3');
  });
});

// ─── formatTime helper (used in both modes) ────────────────────────────────

describe('formatTime()', () => {
  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  it('formats 0 as 0:00', () => expect(formatTime(0)).toBe('0:00'));
  it('formats null as 0:00', () => expect(formatTime(null)).toBe('0:00'));
  it('formats NaN as 0:00', () => expect(formatTime(NaN)).toBe('0:00'));
  it('formats 30s as 0:30', () => expect(formatTime(30)).toBe('0:30'));
  it('formats 65s as 1:05', () => expect(formatTime(65)).toBe('1:05'));
  it('formats 3600s as 60:00', () => expect(formatTime(3600)).toBe('60:00'));
  it('pads single-digit seconds', () => expect(formatTime(61)).toBe('1:01'));
});
