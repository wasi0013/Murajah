# Legacy Hardcoded Per-Layout Tables — reference & reconciliation

**Why this exists:** the legacy app hardcoded several per-layout (QPC/Uthmani 604 vs Indopak 610) lookup tables — juz→page ranges, surah→start-page, page counts, verse counts. The redesign derives these from data instead (Phase 3 nav indexes). This doc records the legacy tables, **where they were wrong**, and the authoritative source going forward. Referenced by Phase 4 (memorization/juz progress) and Phase 5 (plans/scheduling), which both slice by juz/page per layout.

## Key finding — the legacy QPC tables are off-by-one (inaccurate)

Reconciled the derived nav indexes (`app/public/data/nav/{qpc,indopak}.json`, built from `quran.json`'s `page`/`indopak_page`) against the legacy hardcoded tables:

- **QPC surah→page: 18 mismatches** (e.g. surah 4 → legacy **76** vs actual **77**; 10 → 207 vs 208; 32 → 414 vs 415). Verified against the **actual QPC layout render** (`qpc-v2-15-lines.json` / the built page chunks): surah 4:1 renders on page **77**. So `quran.json` + the derived nav index are **correct**; the legacy `SURAH_PAGES_QPC` was **wrong** (~1 page low for 18 surahs).
- **QPC juz starts: 2 mismatches** (juz 7 → legacy 122 vs actual 121; juz 11 → 202 vs 201) — same legacy inaccuracy.
- **Indopak surah→page: 0 mismatches** — the derived nav index matches the legacy `SURAH_PAGES_INDOPAK` exactly (both correct).
- **Internal legacy contradiction**: `planManager.js` `INDOPAK_PAGES_PER_JUZ` juz 4 = `[62,81]`, but `index.html` `INDOPAK_JUZ_RANGES` juz 4 = `[63,82]`. The legacy app disagreed with itself on Indopak juz boundaries.

**Conclusion / rule for future phases:** **use the derived per-layout nav indexes** (`data/nav/{qpc,indopak}.json` → `ayahToPage` / `surahToPage` / `juzToPage`) as the source of truth for page/surah/juz lookups. **Do not port the legacy hardcoded juz/surah page tables** — they carried the off-by-one QPC bug ("the legacy implementation was not accurate"). Reconcile any new per-layout mapping against the layout render, not against `quran.json` alone if they ever diverge (here they agree; the layout is the ultimate authority for what page a word appears on).

## Page counts per layout (accurate)
`LAYOUT_TOTAL_PAGES = { qpc: 604, indopak: 610 }` (legacy `planManager.js`). The memorized grid, juz progress, and page clamps are **per-layout** — 604 for QPC/Uthmani (and the mushaf image scans), 610 for Indopak.

## Juz → page ranges (legacy, QPC has the off-by-one; prefer derived `juzToPage`)
Legacy `JUZ_RANGES` (QPC) and two conflicting Indopak sources. Recorded for reference only — **compute from `nav.juzToPage` per layout instead** (start = `juzToPage[j]`, end = `juzToPage[j+1] - 1`, last juz ends at the layout's page count).

## Surah → start page (legacy; QPC inaccurate — prefer derived `surahToPage`)
Legacy `SURAH_PAGES_QPC` / `SURAH_PAGES_INDOPAK` (114 entries each, in `source/index.html` ~line 9346). **Use `nav.surahToPage` per layout instead.**

## Verse counts per surah (accurate — reusable reference)
Legacy `verseCounts` (`source/index.html` ~8975). Useful for surah views / progress; verify against data (`quran.json` surah lengths) before relying on it:

```
1:7 2:286 3:200 4:176 5:120 6:165 7:206 8:75 9:129 10:109 11:123 12:111 13:43 14:52 15:99
16:128 17:111 18:110 19:98 20:135 21:112 22:78 23:118 24:64 25:77 26:227 27:93 28:88 29:69 30:60
31:34 32:30 33:73 34:54 35:45 36:83 37:182 38:88 39:75 40:85 41:54 42:53 43:89 44:59 45:37
46:35 47:38 48:29 49:18 50:45 51:60 52:49 53:62 54:55 55:78 56:96 57:29 58:22 59:24 60:13
61:14 62:11 63:11 64:18 65:12 66:12 67:30 68:52 69:52 70:44 71:28 72:28 73:20 74:56 75:40
76:31 77:50 78:40 79:46 80:42 81:29 82:19 83:36 84:25 85:22 86:17 87:19 88:26 89:30 90:20
91:15 92:21 93:11 94:8 95:8 96:19 97:5 98:8 99:8 100:11 101:11 102:8 103:3 104:9 105:5
106:4 107:7 108:3 109:6 110:3 111:5 112:4 113:5 114:6
```

## Other per-layout constants (already handled)
- **`LAYOUT_CONFIGS`** (`unifiedDataLoader.js`) — per-layout line-height/letter-spacing. Already carried into the new app as design tokens (`--qpc-*` / `--indopak-*`) in Phase 2/3.
- **`PAGE_HASANAH_VALUES`** (604, `pageHasanah.js`) — per-page reward weight; kept (Phase 4). For Indopak (610), sum the page's verses' `hasanah` from `quran.json` (same basis) — see phase-4 §4.1.2.

## Action items surfaced for later phases
- **Phase 4/5:** derive all juz/surah/page slicing from `nav.{qpc,indopak}.json` per layout; never hardcode. Grid/juz UI is 604 or 610 by active layout.
- **Phase 3b follow-up (verify):** confirm the mushaf **image scan** page numbering aligns 1:1 with the **QPC text** 604 scheme (the derived one, page 77 for surah 4 — not the legacy 76). If the scans were cut for the legacy off-by-one edition, quick-jump into the image view could be one page off for those ~18 surahs.
- **Phase 9:** the legacy tables live in `source/index.html` + `planManager.js` until the monolith is deleted; this doc preserves what's worth keeping (verse counts) and records what to discard (the inaccurate QPC page tables).
