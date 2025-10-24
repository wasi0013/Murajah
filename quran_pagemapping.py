import json
from pathlib import Path
from collections import defaultdict
import re

# Add resources directory to path
resources_dir = Path(__file__).parent / "source" / "resources"

def count_arabic_characters(text: str) -> int:
    """Count the number of base Arabic letters in the given text."""
    text_without_diacritics = re.sub(r'[\u064B-\u0652\u0640\u06E1\u0670]', '', text)
    text_without_diacritics = re.sub(r'[\s\u0020]', '', text_without_diacritics)
    arabic_pattern = re.compile(r'[\u0621-\u064A\u0671]')
    matches = arabic_pattern.findall(text_without_diacritics)
    return len(matches)

def calculate_hasanah(text: str) -> int:
    """Calculate hasanah based on Arabic character count."""
    char_count = count_arabic_characters(text)
    return char_count * 10

print("Loading data files...")

# Load qpc-v2-15-lines.json (page structure with word ranges)
with open(resources_dir / "qpc-v2-15-lines.json", "r", encoding="utf-8") as f:
    qpc_data = json.load(f)

# Load qpc-v2-word-by-word.json (word ID to surah:ayah mapping)
with open(resources_dir / "qpc-v2-word-by-word.json", "r", encoding="utf-8") as f:
    word_by_word = json.load(f)

# Load quran.json (surah and ayah texts)
with open(resources_dir / "quran.json", "r", encoding="utf-8") as f:
    quran_data = json.load(f)

print("Processing data...")

# Create a mapping of surah:ayah to word ID range
surah_ayah_to_word_ids = {}
for key, value in word_by_word.items():
    surah = value.get("surah")
    ayah = value.get("ayah")
    word_id = value.get("id")
    
    surah_ayah_key = f"{surah}:{ayah}"
    if surah_ayah_key not in surah_ayah_to_word_ids:
        surah_ayah_to_word_ids[surah_ayah_key] = []
    surah_ayah_to_word_ids[surah_ayah_key].append(word_id)

print(f"Found {len(surah_ayah_to_word_ids)} unique ayahs")

# Create result structure: surah_number -> [ayah_data, ...]
result = {}

# Process each page
page_to_ayahs = defaultdict(set)

print("Mapping pages to ayahs...")

for page_entry in qpc_data["pages"]:
    page_number = page_entry.get("page_number")
    line_type = page_entry.get("line_type")
    first_word_id = page_entry.get("first_word_id")
    last_word_id = page_entry.get("last_word_id")
    
    # Skip if not an ayah line or if no word IDs
    if line_type != "ayah" or not first_word_id or not last_word_id:
        continue
    
    # Find all ayahs in this word ID range
    for key, word_ids in surah_ayah_to_word_ids.items():
        # Check if any word ID in this ayah falls within the page's range
        ayah_min_id = min(word_ids) if word_ids else float('inf')
        ayah_max_id = max(word_ids) if word_ids else float('-inf')
        
        # If ayah overlaps with page range, add it to this page
        if ayah_min_id <= last_word_id and ayah_max_id >= first_word_id:
            page_to_ayahs[page_number].add(key)

print(f"Found pages: {sorted(page_to_ayahs.keys())[:10]}...")  # Show first 10

# Build the detailed quran structure
print("Building detailed_quran.json structure...")

for page_number in sorted(page_to_ayahs.keys()):
    page_ayahs = page_to_ayahs[page_number]
    
    for surah_ayah_str in sorted(page_ayahs):
        surah_str, ayah_str = surah_ayah_str.split(":")
        surah = int(surah_str)
        ayah = int(ayah_str)
        
        # Get ayah text from quran.json
        if surah_str not in quran_data:
            print(f"Warning: Surah {surah} not found in quran.json")
            continue
        
        ayah_found = False
        for verse_data in quran_data[surah_str]:
            if verse_data["verse"] == ayah:
                text = verse_data["text"]
                hasanah = calculate_hasanah(text)
                
                # Initialize surah array if needed
                if surah_str not in result:
                    result[surah_str] = []
                
                # Add ayah to result
                result[surah_str].append({
                    "chapter": surah,
                    "verse": ayah,
                    "text": text,
                    "page": page_number,
                    "hasanah": hasanah
                })
                ayah_found = True
                break
        
        if not ayah_found:
            print(f"Warning: Verse {surah}:{ayah} not found in quran.json")

print(f"Result has {len(result)} surahs")

# Save the result
output_path = resources_dir / "detailed_quran.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f"\n✅ Successfully created detailed_quran.json at {output_path}")
print(f"Total verses: {sum(len(verses) for verses in result.values())}")

# Show sample data
print("\nSample data:")
for i, (surah_num, verses) in enumerate(result.items()):
    if i < 2:
        print(f"\nSurah {surah_num}:")
        for verse in verses[:2]:
            print(f"  Verse {verse['verse']} (Page {verse['page']}): Hasanah = {verse['hasanah']}")
