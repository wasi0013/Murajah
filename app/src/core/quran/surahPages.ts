/**
 * Surah → QPC page ranges (Phase 8; promoted out of `core/audio/reciters.ts`).
 *
 * Which of the 604 QPC pages each surah occupies, `[startPage, endPage]` inclusive.
 * Two consumers share this one source: the multi-part page reciter (Alafasy) uses
 * it to compute a per-surah file offset on a page, and the Listen scope builder
 * (`core/audio/scope`) uses it to walk a surah's pages and tell a wholly-within
 * page (play the page file) from a shared boundary page (needs verse audio).
 */

/** `[startPage, endPage]` inclusive, per surah. QPC 604-page scheme. */
export const SURAH_PAGE_RANGES_QPC: Record<number, [number, number]> = {
  1: [1, 1], 2: [2, 49], 3: [50, 76], 4: [77, 106], 5: [106, 127],
  6: [128, 150], 7: [151, 176], 8: [177, 186], 9: [187, 207], 10: [208, 221],
  11: [221, 235], 12: [235, 248], 13: [249, 255], 14: [255, 261], 15: [262, 267],
  16: [267, 281], 17: [282, 293], 18: [293, 304], 19: [305, 312], 20: [312, 321],
  21: [322, 331], 22: [332, 341], 23: [342, 349], 24: [350, 359], 25: [359, 366],
  26: [367, 376], 27: [377, 385], 28: [385, 396], 29: [396, 404], 30: [404, 410],
  31: [411, 414], 32: [415, 417], 33: [418, 427], 34: [428, 434], 35: [434, 440],
  36: [440, 445], 37: [446, 452], 38: [453, 458], 39: [458, 467], 40: [467, 476],
  41: [477, 482], 42: [483, 489], 43: [489, 495], 44: [496, 498], 45: [499, 502],
  46: [502, 506], 47: [507, 510], 48: [511, 515], 49: [515, 517], 50: [518, 520],
  51: [520, 523], 52: [523, 525], 53: [526, 528], 54: [528, 531], 55: [531, 534],
  56: [534, 537], 57: [537, 541], 58: [542, 545], 59: [545, 548], 60: [549, 551],
  61: [551, 552], 62: [553, 554], 63: [554, 555], 64: [556, 557], 65: [558, 559],
  66: [560, 561], 67: [562, 564], 68: [564, 566], 69: [566, 568], 70: [568, 570],
  71: [570, 571], 72: [572, 573], 73: [574, 575], 74: [575, 577], 75: [577, 578],
  76: [578, 580], 77: [580, 581], 78: [582, 583], 79: [583, 584], 80: [585, 586],
  81: [586, 586], 82: [587, 587], 83: [587, 589], 84: [589, 590], 85: [590, 590],
  86: [591, 591], 87: [591, 592], 88: [592, 593], 89: [593, 594], 90: [594, 595],
  91: [595, 595], 92: [595, 596], 93: [596, 596], 94: [596, 597], 95: [597, 597],
  96: [597, 598], 97: [598, 598], 98: [598, 599], 99: [599, 599], 100: [599, 600],
  101: [600, 600], 102: [600, 600], 103: [601, 601], 104: [601, 601], 105: [601, 601],
  106: [602, 602], 107: [602, 602], 108: [602, 602], 109: [603, 603], 110: [603, 603],
  111: [603, 603], 112: [604, 604], 113: [604, 604], 114: [604, 604],
}

export const PAGE_COUNT_QPC = 604

/** A surah's `[startPage, endPage]` (QPC). */
export function surahPageRange(surah: number): [number, number] {
  return SURAH_PAGE_RANGES_QPC[surah]
}

/**
 * Which surahs have verses on a QPC page, ascending. Length 1 ⇒ the page is wholly
 * within that surah; >1 ⇒ a shared page where a surah ends and the next begins (or,
 * near the end of the mushaf, several short surahs share a page).
 */
export function surahsOnPage(page: number): number[] {
  const out: number[] = []
  for (let s = 1; s <= 114; s++) {
    const [start, end] = SURAH_PAGE_RANGES_QPC[s]
    if (start <= page && page <= end) out.push(s)
  }
  return out
}

/** True when `page` holds verses of `surah` only (no shared boundary). */
export function pageIsWhollyWithin(surah: number, page: number): boolean {
  const on = surahsOnPage(page)
  return on.length === 1 && on[0] === surah
}

/**
 * Expand surah numbers to the pages that are **fully covered** by the
 * selection, sorted ascending. Unlike `getPagesForJuz` (whose page ranges
 * never overlap), a surah's boundary page can carry a large chunk of a
 * *different*, unselected surah — marking it memorized on that basis alone
 * would be wrong. So a shared page (`surahsOnPage(page).length > 1`) is only
 * included once **every** surah on it is in `surahNumbers`; a surah selected
 * on its own contributes only its wholly-owned interior pages, and a boundary
 * page joins the result the moment its last neighbour is also selected (e.g.
 * page 604 needs surahs 112, 113 *and* 114; page 578 needs both 75 and 76).
 * Out-of-range surah numbers are silently ignored.
 */
export function getPagesForSurah(surahNumbers: number[]): number[] {
  const selected = new Set(surahNumbers.filter((s) => SURAH_PAGE_RANGES_QPC[s] != null))
  const candidates = new Set<number>()
  for (const s of selected) {
    const [start, end] = SURAH_PAGE_RANGES_QPC[s]
    for (let p = start; p <= end; p++) candidates.add(p)
  }
  return [...candidates]
    .filter((p) => surahsOnPage(p).every((s) => selected.has(s)))
    .sort((a, b) => a - b)
}
