import sqlite3
import json

db_path = "/Volumes/Main/personal_projects/Murajah/source/resources/data/indopak_15lines/qudratullah-indopak-15-lines.db"
output_path = "/Volumes/Main/personal_projects/Murajah/source/resources/data/quran/indopak-15-lines.json"

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# Get metadata
cursor.execute("SELECT name, number_of_pages, lines_per_page, font_name FROM info;")
info = cursor.fetchone()

# Get all pages data
cursor.execute("""
    SELECT page_number, line_number, line_type, is_centered, 
           first_word_id, last_word_id, surah_number 
    FROM pages 
    ORDER BY page_number, line_number
""")

pages = []
for row in cursor.fetchall():
    page_obj = {
        "page_number": row["page_number"],
        "line_number": row["line_number"],
        "line_type": row["line_type"],
        "is_centered": bool(row["is_centered"]),
    }
    
    # Only include word_id fields if they have values
    if row["first_word_id"] is not None:
        page_obj["first_word_id"] = row["first_word_id"]
    if row["last_word_id"] is not None:
        page_obj["last_word_id"] = row["last_word_id"]
    if row["surah_number"] is not None and row["surah_number"] != "":
        page_obj["surah_number"] = row["surah_number"]
    
    pages.append(page_obj)

output = {
    "name": info["name"].strip(),
    "number_of_pages": info["number_of_pages"],
    "lines_per_page": info["lines_per_page"],
    "font_name": info["font_name"],
    "pages": pages
}

conn.close()

with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"✅ Successfully converted to JSON!")
print(f"📁 Output: {output_path}")
print(f"📊 Total pages: {len(pages)}")
print(f"📄 Sample (first 5 entries):")
print(json.dumps(pages[:5], indent=2, ensure_ascii=False))
