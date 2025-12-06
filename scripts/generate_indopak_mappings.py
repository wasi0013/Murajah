import json
from pathlib import Path
from collections import defaultdict

resources_dir = Path(__file__).parent.parent / 'source' / 'resources' / 'data' / 'quran'

# Load detailed_quran.json
with open(resources_dir / "detailed_quran.json", "r", encoding="utf-8") as f:
    detailed_quran = json.load(f)

# Extract Indopak surah start pages
print("// Indopak Surah starting pages (surah number -> starting page)")
print("const SURAH_PAGES = {")
surah_pages = {}
for surah_str in sorted(detailed_quran.keys(), key=int):
    verses = detailed_quran[surah_str]
    if verses:
        # Get the first verse's indopak_page
        first_page = verses[0].get("indopak_page", verses[0].get("page"))
        surah_pages[int(surah_str)] = first_page

# Format output nicely
lines = []
for i in range(1, 115, 10):
    chunk = []
    for j in range(i, min(i+10, 115)):
        if j in surah_pages:
            chunk.append(f"{j}: {surah_pages[j]}")
    if chunk:
        lines.append("  " + ", ".join(chunk))
print(",\n".join(lines))
print("};")

# Now calculate Juz ranges based on Indopak pages
# Juz boundaries are based on specific ayahs - we need to find which Indopak pages they fall on
print("\n// Indopak Juz page ranges")
print("const JUZ_RANGES = {")

# Standard Juz boundaries (surah:ayah for start of each juz)
juz_starts = {
    1: (1, 1),      # Al-Fatiha 1:1
    2: (2, 142),    # Al-Baqarah 2:142
    3: (2, 253),    # Al-Baqarah 2:253
    4: (3, 93),     # Ali 'Imran 3:93
    5: (4, 24),     # An-Nisa 4:24
    6: (4, 148),    # An-Nisa 4:148
    7: (5, 82),     # Al-Ma'idah 5:82
    8: (6, 111),    # Al-An'am 6:111
    9: (7, 88),     # Al-A'raf 7:88
    10: (8, 41),    # Al-Anfal 8:41
    11: (9, 93),    # At-Tawbah 9:93
    12: (11, 6),    # Hud 11:6
    13: (12, 53),   # Yusuf 12:53
    14: (15, 1),    # Al-Hijr 15:1
    15: (17, 1),    # Al-Isra 17:1
    16: (18, 75),   # Al-Kahf 18:75
    17: (21, 1),    # Al-Anbya 21:1
    18: (23, 1),    # Al-Mu'minun 23:1
    19: (25, 21),   # Al-Furqan 25:21
    20: (27, 56),   # An-Naml 27:56
    21: (29, 46),   # Al-'Ankabut 29:46
    22: (33, 31),   # Al-Ahzab 33:31
    23: (36, 28),   # Ya-Sin 36:28
    24: (39, 32),   # Az-Zumar 39:32
    25: (41, 47),   # Fussilat 41:47
    26: (46, 1),    # Al-Ahqaf 46:1
    27: (51, 31),   # Adh-Dhariyat 51:31
    28: (58, 1),    # Al-Mujadila 58:1
    29: (67, 1),    # Al-Mulk 67:1
    30: (78, 1),    # An-Naba 78:1
}

def get_indopak_page_for_ayah(surah, ayah):
    """Get the Indopak page number for a specific surah:ayah"""
    surah_str = str(surah)
    if surah_str in detailed_quran:
        for verse in detailed_quran[surah_str]:
            if verse["verse"] == ayah:
                return verse.get("indopak_page", verse.get("page"))
    return None

# Calculate Juz ranges
juz_ranges = {}
for juz_num in range(1, 31):
    start_surah, start_ayah = juz_starts[juz_num]
    start_page = get_indopak_page_for_ayah(start_surah, start_ayah)
    
    if juz_num < 30:
        next_start_surah, next_start_ayah = juz_starts[juz_num + 1]
        # End page is the page before the next juz starts, or the same page if different ayah
        end_page = get_indopak_page_for_ayah(next_start_surah, next_start_ayah)
        # Get the actual end by checking the previous ayah
        if end_page and start_page:
            # Find the last ayah of this juz
            end_page = end_page  # The next juz might start on the same page
    else:
        end_page = 610  # Last page of Indopak
    
    if start_page:
        juz_ranges[juz_num] = (start_page, end_page if end_page else 610)

# Calculate proper end pages (end of juz is page before next juz or last page)
for juz_num in range(1, 30):
    start_page = juz_ranges[juz_num][0]
    next_start = juz_ranges[juz_num + 1][0]
    # End page should be one less than next juz start, unless they share a page
    juz_ranges[juz_num] = (start_page, next_start - 1 if next_start > start_page else next_start)

# Ensure juz 30 ends at 610
juz_ranges[30] = (juz_ranges[30][0], 610)

# Print Juz ranges
for juz_num in range(1, 31):
    start, end = juz_ranges[juz_num]
    comma = "," if juz_num < 30 else ""
    print(f"  {juz_num}: [{start}, {end}]{comma}")
print("};")

# Summary
print(f"\n// Total Indopak pages: 610")
print(f"// Juz ranges calculated from detailed_quran.json indopak_page values")
