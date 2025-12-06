import json
from pathlib import Path
from collections import defaultdict
import re

# Add resources directory to path
resources_dir = Path(__file__).parent.parent / 'source' / "resources"
data_dir = resources_dir / "data" / "quran"

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

def build_page_to_ayahs_mapping(page_data, surah_ayah_to_word_ids):
    """Build mapping of page numbers to ayahs for a given layout."""
    page_to_ayahs = defaultdict(set)
    
    for page_entry in page_data["pages"]:
        page_number = page_entry.get("page_number")
        line_type = page_entry.get("line_type")
        first_word_id = page_entry.get("first_word_id")
        last_word_id = page_entry.get("last_word_id")
        
        # Skip if not an ayah line or if no word IDs
        if line_type != "ayah" or not first_word_id or not last_word_id:
            continue
        
        # Handle string word IDs (convert to int if needed)
        if isinstance(first_word_id, str):
            if first_word_id == "":
                continue
            first_word_id = int(first_word_id)
        if isinstance(last_word_id, str):
            if last_word_id == "":
                continue
            last_word_id = int(last_word_id)
        
        # Find all ayahs in this word ID range
        for key, word_ids in surah_ayah_to_word_ids.items():
            # Check if any word ID in this ayah falls within the page's range
            ayah_min_id = min(word_ids) if word_ids else float('inf')
            ayah_max_id = max(word_ids) if word_ids else float('-inf')
            
            # If ayah overlaps with page range, add it to this page
            if ayah_min_id <= last_word_id and ayah_max_id >= first_word_id:
                page_to_ayahs[page_number].add(key)
    
    return page_to_ayahs

print("Loading data files...")

# Load qpc-v2-15-lines.json (page structure with word ranges)
with open(data_dir / "qpc-v2-15-lines.json", "r", encoding="utf-8") as f:
    qpc_data = json.load(f)

# Load indopak-15-lines.json (page structure with word ranges)
with open(data_dir / "indopak-15-lines.json", "r", encoding="utf-8") as f:
    indopak_data = json.load(f)

# Load qpc-v2-word-by-word.json (word ID to surah:ayah mapping)
with open(data_dir / "qpc-v2-word-by-word.json", "r", encoding="utf-8") as f:
    word_by_word = json.load(f)

# Load quran.json (surah and ayah texts)
with open(data_dir / "quran.json", "r", encoding="utf-8") as f:
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

# Build page-to-ayahs mappings for both layouts
print("Mapping QPC v2 pages to ayahs...")
qpc_page_to_ayahs = build_page_to_ayahs_mapping(qpc_data, surah_ayah_to_word_ids)
print(f"QPC v2: Found {len(qpc_page_to_ayahs)} pages with ayahs")

print("Mapping Indopak pages to ayahs...")
indopak_page_to_ayahs = build_page_to_ayahs_mapping(indopak_data, surah_ayah_to_word_ids)
print(f"Indopak: Found {len(indopak_page_to_ayahs)} pages with ayahs")

# Create reverse mappings: ayah -> page number (use first page where ayah appears)
qpc_ayah_to_page = {}
for page_number in sorted(qpc_page_to_ayahs.keys()):
    for surah_ayah in qpc_page_to_ayahs[page_number]:
        if surah_ayah not in qpc_ayah_to_page:
            qpc_ayah_to_page[surah_ayah] = page_number

indopak_ayah_to_page = {}
for page_number in sorted(indopak_page_to_ayahs.keys()):
    for surah_ayah in indopak_page_to_ayahs[page_number]:
        if surah_ayah not in indopak_ayah_to_page:
            indopak_ayah_to_page[surah_ayah] = page_number

print(f"QPC v2 ayah mappings: {len(qpc_ayah_to_page)}")
print(f"Indopak ayah mappings: {len(indopak_ayah_to_page)}")

# Build the detailed quran structure
print("Building detailed_quran.json structure...")

result = {}

# Get all unique ayahs from both mappings
all_ayahs = set(qpc_ayah_to_page.keys()) | set(indopak_ayah_to_page.keys())

for surah_ayah_str in sorted(all_ayahs, key=lambda x: (int(x.split(":")[0]), int(x.split(":")[1]))):
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
            
            # Get page numbers from both layouts
            qpc_page = qpc_ayah_to_page.get(surah_ayah_str)
            indopak_page = indopak_ayah_to_page.get(surah_ayah_str)
            
            # Add ayah to result
            ayah_data = {
                "chapter": surah,
                "verse": ayah,
                "text": text,
                "hasanah": hasanah
            }
            
            if qpc_page is not None:
                ayah_data["page"] = qpc_page
            if indopak_page is not None:
                ayah_data["indopak_page"] = indopak_page
            
            result[surah_str].append(ayah_data)
            ayah_found = True
            break
    
    if not ayah_found:
        print(f"Warning: Verse {surah}:{ayah} not found in quran.json")

print(f"Result has {len(result)} surahs")

# Save the result
output_path = data_dir / "detailed_quran.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f"\n✅ Successfully created detailed_quran.json at {output_path}")
print(f"Total verses: {sum(len(verses) for verses in result.values())}")

# Show sample data
print("\nSample data:")
for i, (surah_num, verses) in enumerate(result.items()):
    if i < 2:
        print(f"\nSurah {surah_num}:")
        for verse in verses[:3]:
            page_info = f"QPC Page {verse.get('page', 'N/A')}, Indopak Page {verse.get('indopak_page', 'N/A')}"
            print(f"  Verse {verse['verse']} ({page_info}): Hasanah = {verse['hasanah']}")

# Show some stats about page differences
print("\n📊 Page mapping comparison:")
diff_count = 0
same_count = 0
for surah_str, verses in result.items():
    for v in verses:
        qpc = v.get('page')
        indo = v.get('indopak_page')
        if qpc and indo:
            if qpc != indo:
                diff_count += 1
            else:
                same_count += 1

print(f"  Verses on same page in both layouts: {same_count}")
print(f"  Verses on different pages: {diff_count}")
