#!/usr/bin/env python3
"""
Generate page-to-tafsir mappings for both QPC (604 pages) and Indopak (610 pages) layouts.
This creates JSON files that map each page number to the list of ayah references (surah:verse)
that have tafsir available on that page.
"""

import json
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).parent.parent / "source" / "resources" / "data"
QURAN_FILE = BASE_DIR / "quran" / "quran.json"
TAFSIR_FILE = BASE_DIR / "tafsir" / "bn-tafsir.json"
QPC_OUTPUT = BASE_DIR / "tafsir" / "qpc-page-tafsir-mapping.json"
INDOPAK_OUTPUT = BASE_DIR / "tafsir" / "indopak-page-tafsir-mapping.json"


def main():
    # Load the data files
    print("Loading quran.json...")
    with open(QURAN_FILE, 'r', encoding='utf-8') as f:
        quran_data = json.load(f)

    print("Loading bn-tafsir.json...")
    with open(TAFSIR_FILE, 'r', encoding='utf-8') as f:
        tafsir_data = json.load(f)

    print(f"Tafsir entries: {len(tafsir_data)}")

    # Build page mappings
    qpc_page_to_ayahs = {}
    indopak_page_to_ayahs = {}

    for surah_num, verses in quran_data.items():
        for verse in verses:
            chapter = verse['chapter']
            verse_num = verse['verse']
            qpc_page = verse['page']
            indopak_page = verse['indopak_page']
            
            ayah_ref = f"{chapter}:{verse_num}"
            
            # Only add if tafsir exists for this ayah
            if ayah_ref in tafsir_data:
                # QPC mapping
                if qpc_page not in qpc_page_to_ayahs:
                    qpc_page_to_ayahs[qpc_page] = []
                qpc_page_to_ayahs[qpc_page].append(ayah_ref)
                
                # Indopak mapping
                if indopak_page not in indopak_page_to_ayahs:
                    indopak_page_to_ayahs[indopak_page] = []
                indopak_page_to_ayahs[indopak_page].append(ayah_ref)

    # Convert to final format (string keys, unique ayahs)
    qpc_tafsir_mapping = {}
    for page, ayahs in sorted(qpc_page_to_ayahs.items()):
        unique_ayahs = list(dict.fromkeys(ayahs))
        qpc_tafsir_mapping[str(page)] = unique_ayahs

    indopak_tafsir_mapping = {}
    for page, ayahs in sorted(indopak_page_to_ayahs.items()):
        unique_ayahs = list(dict.fromkeys(ayahs))
        indopak_tafsir_mapping[str(page)] = unique_ayahs

    # Save QPC mapping
    print(f"\nSaving QPC mapping to {QPC_OUTPUT}...")
    with open(QPC_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(qpc_tafsir_mapping, f, ensure_ascii=False, indent=2)

    # Save Indopak mapping  
    print(f"Saving Indopak mapping to {INDOPAK_OUTPUT}...")
    with open(INDOPAK_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(indopak_tafsir_mapping, f, ensure_ascii=False, indent=2)

    # Summary
    print(f"\n✓ QPC mapping: {len(qpc_tafsir_mapping)} pages (1-604)")
    print(f"✓ Indopak mapping: {len(indopak_tafsir_mapping)} pages (1-610)")
    print(f"\nSample QPC page 1: {qpc_tafsir_mapping.get('1', [])}")
    print(f"Sample Indopak page 610: {indopak_tafsir_mapping.get('610', [])}")


if __name__ == "__main__":
    main()
