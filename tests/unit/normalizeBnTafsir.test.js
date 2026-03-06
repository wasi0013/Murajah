/**
 * Unit tests for normalizeBnTafsir
 *
 * This pure function lives inside source/quiz.html. It converts the bn-tafsir.json format:
 *   { "1:1": { "text": "..." }, "1:2": { "text": "..." }, ... }
 * into the same shape used by the English translation lookup:
 *   { "1": [{ chapter, verse, text }, ...], ... }
 *
 * Tests are isolated: the function is redeclared here so no HTML parsing is required.
 */

import { describe, it, expect } from 'vitest';

// ─── Function under test (copied from source/quiz.html) ─────────────────────

function normalizeBnTafsir(raw) {
  const result = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!val || !val.text) continue; // skip gaps
    const colonIdx = key.indexOf(':');
    const surahStr = key.slice(0, colonIdx);
    const verseStr = key.slice(colonIdx + 1);
    const surah = parseInt(surahStr, 10);
    const verse = parseInt(verseStr, 10);
    if (isNaN(surah) || isNaN(verse)) continue;
    if (!result[surahStr]) result[surahStr] = [];
    result[surahStr].push({ chapter: surah, verse, text: val.text });
  }
  // Sort each surah array by verse number ascending
  for (const surahKey of Object.keys(result)) {
    result[surahKey].sort((a, b) => a.verse - b.verse);
  }
  return result;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('normalizeBnTafsir()', () => {
  it('returns an empty object for empty input', () => {
    expect(normalizeBnTafsir({})).toEqual({});
  });

  it('converts a single entry correctly', () => {
    const raw = { '1:1': { text: 'পরম করুণাময়, অতি দয়ালু আল্লাহর নামে' } };
    const result = normalizeBnTafsir(raw);
    expect(result['1']).toHaveLength(1);
    expect(result['1'][0]).toEqual({
      chapter: 1,
      verse: 1,
      text: 'পরম করুণাময়, অতি দয়ালু আল্লাহর নামে'
    });
  });

  it('groups multiple verses under the same surah key', () => {
    const raw = {
      '2:1': { text: 'আলিফ-লাম-মীম' },
      '2:2': { text: 'এই সেই কিতাব' },
      '2:3': { text: 'যারা গায়েবে বিশ্বাস করে' }
    };
    const result = normalizeBnTafsir(raw);
    expect(result['2']).toHaveLength(3);
    expect(result['2'].map(v => v.verse)).toEqual([1, 2, 3]);
  });

  it('sorts verses in ascending order when raw input is out of order', () => {
    const raw = {
      '3:5': { text: 'verse 5' },
      '3:2': { text: 'verse 2' },
      '3:9': { text: 'verse 9' },
      '3:1': { text: 'verse 1' }
    };
    const result = normalizeBnTafsir(raw);
    const verses = result['3'].map(v => v.verse);
    expect(verses).toEqual([1, 2, 5, 9]);
  });

  it('stores chapter and verse as integers', () => {
    const raw = { '4:10': { text: 'some text' } };
    const result = normalizeBnTafsir(raw);
    const entry = result['4'][0];
    expect(typeof entry.chapter).toBe('number');
    expect(typeof entry.verse).toBe('number');
    expect(entry.chapter).toBe(4);
    expect(entry.verse).toBe(10);
  });

  it('keeps the surah key as a string (matching en.json format)', () => {
    const raw = { '36:1': { text: 'ইয়া-সীন' } };
    const result = normalizeBnTafsir(raw);
    expect(Object.keys(result)).toContain('36');
    expect(typeof Object.keys(result)[0]).toBe('string');
  });

  it('skips entries with missing text field', () => {
    const raw = {
      '5:1': { text: 'valid text' },
      '5:2': {},              // missing text
      '5:3': { text: null },  // null text
      '5:4': null             // null value
    };
    const result = normalizeBnTafsir(raw);
    expect(result['5']).toHaveLength(1);
    expect(result['5'][0].verse).toBe(1);
  });

  it('skips entries with non-numeric surah or verse', () => {
    const raw = {
      'abc:1': { text: 'bad surah' },
      '1:xyz': { text: 'bad verse' },
      '1:1': { text: 'valid' }
    };
    const result = normalizeBnTafsir(raw);
    expect(Object.keys(result)).toEqual(['1']);
    expect(result['1']).toHaveLength(1);
  });

  it('handles multiple surahs independently', () => {
    const raw = {
      '1:1': { text: 'al-fatiha verse 1' },
      '1:7': { text: 'al-fatiha verse 7' },
      '112:1': { text: 'al-ikhlas verse 1' },
      '112:4': { text: 'al-ikhlas verse 4' }
    };
    const result = normalizeBnTafsir(raw);
    expect(Object.keys(result).sort()).toEqual(['1', '112']);
    expect(result['1']).toHaveLength(2);
    expect(result['112']).toHaveLength(2);
  });

  it('preserves the original text content without modification', () => {
    const banglaText = 'বিসমিল্লাহির রাহমানির রাহিম';
    const raw = { '1:1': { text: banglaText } };
    const result = normalizeBnTafsir(raw);
    expect(result['1'][0].text).toBe(banglaText);
  });

  it('handles large surah numbers (e.g. 114)', () => {
    const raw = {
      '114:1': { text: 'মানুষের প্রতিপালকের নামে আশ্রয় প্রার্থনা করি' },
      '114:6': { text: 'জিন ও মানুষের মধ্যে হতে' }
    };
    const result = normalizeBnTafsir(raw);
    expect(result['114']).toHaveLength(2);
    expect(result['114'][0].verse).toBe(1);
    expect(result['114'][1].verse).toBe(6);
  });
});
