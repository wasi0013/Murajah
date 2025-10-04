# Murajah: Quran Memorization App Specification


## Core Features

1. Quran

A 15 line quran layout based on the library. https://github.com/TarteelAI/quranic-universal-library/tree/main
We need a full page view of 604 pages of Quran in a layout where user can click on each quranic word. This layout must follow the standard Madinah Mushaf style for example see this: https://qul.tarteel.ai/mushaf_layouts/19


Completed Tasks

* write a python script to convert the sqlite db to json
* analyze the resources/qpc-v1-15-lines.json and find the necessary data element that are needed to download for viewing the quran page properly

```
"pages": [
    {
      "page_number": 1,
      "line_number": 1,
      "line_type": "surah_name",
      "is_centered": 1,
      "first_word_id": "",
      "last_word_id": "",
      "surah_number": 1
    },
    ...
]
```


 and qpc-v2 for word by word json.

 ```
 {"1:1:1":{"id":1,"surah":"1","ayah":"1","word":"1","location":"1:1:1","text":"ﱁ"},"1:1:2":{"id":2,"surah":"1","ayah":"1","word":"2","location":"1:1:2","text":"ﱂ"},"1:1:3":{"id":3,"surah":"1","ayah":"1","word":"3","location":"1:1:3","text":"ﱃ"},"1:1:4":{"id":4,"surah":"1","ayah":"1","word":"4","location":"1:1:4","text":"ﱄ"},"1:1:5":{"id":5,"surah":"1","ayah":"1","word":"5","location":"1:1:5","text":"ﱅ"},"2:1:1":{"id":37,"surah":"2","ayah":"1","word":"1","location":"2:1:1","text":"ﱁ"},...}
 ```

Produce actionable steps for producing the Quran layout page by page:

---
**Next Actionable Steps for Producing the Quran Layout Page by Page:**
The layout that we are recreating is available here: https://qul.tarteel.ai/resources/mushaf-layout/10
Inspect this page strucutre and complete the below steps, create a source folder with quran.html that renders the layout
1. **Load Layout and Word Data**
  - Load `qpc-v2-15-lines.json` for page/line structure.
  - Load `qpc-v2-word-by-word.json` (or equivalent) for word text and metadata.

2. **For Each Page (1 to 604):**
  - For each line in the page, get `first_word_id` and `last_word_id`.
  - For each word ID in this range:
    - Retrieve word data (text, surah, ayah, position, etc.) from the word-by-word JSON.

3. **Render the Page:**
  - Display each line with its words in correct order.
  - Use the provided font `resources/QPC V2 Font` for rendering.
  - For each word, render as a clickable element (using its text and any positional info).

4. **Handle Special Line Types:**
  - If `line_type` is `surah_name` or `basmallah`, render accordingly (may not have word IDs).

5. **Implement Navigation:**

---
**Technical Specification for Quran Layout Rendering**

### 1. Load Layout and Word Data

- **Data Sources:**
  - `qpc-v2-15-lines.json`: Contains an array of page objects, each with 15 lines, specifying line type, word ID ranges, and surah info.
  - `qpc-v2-word-by-word.json`: Contains a mapping of word locations (e.g., `1:1:1`) to word objects with text, surah, ayah, and other metadata.
- **Implementation:**
  - Use a JSON parser to load both files into memory at app startup or on demand.
  - Store the layout data as a list of pages, each page as a list of lines.
  - Store the word-by-word data as a dictionary for fast lookup by word ID or location.
  - Validate that all word IDs referenced in the layout exist in the word-by-word data.

### 2. For Each Page (1 to 604)

- **Page Structure:**
  - Each page contains 15 lines. Each line has `first_word_id`, `last_word_id`, and `line_type`.
- **Line Processing:**
  - For each line, if `first_word_id` and `last_word_id` are present:
    - Iterate from `first_word_id` to `last_word_id` (inclusive).
    - For each word ID, retrieve the corresponding word object from the word-by-word data.
    - Collect all word objects for the line in order.
  - If line type is `surah_name` or `basmallah`, handle as a special case (see below).

### 3. Render the Page

- **Line Rendering:**
  - For each line, render the words in order, using the text from the word object.
  - Use the provided font (`resources/QPC V2 Font`) for all Quranic text.
  - Apply line-level formatting (centered, justified, etc.) based on `is_centered` and `line_type`.
- **Word Rendering:**
  - Each word should be rendered as a separate clickable element (e.g., `<span>` in web, or equivalent in native UI).
  - Optionally, use bounding box or position info from word metadata for advanced layouts.
  - Attach event listeners to each word for click/tap interactions.
- **Accessibility:**
  - Ensure text is readable and supports screen readers.
  - Provide ARIA labels or semantic tags for each word.

### 4. Handle Special Line Types

- **Surah Name:**
  - If `line_type` is `surah_name`, render the surah name (from surah metadata or a lookup table) in a distinct style, centered.
- **Basmallah:**
  - If `line_type` is `basmallah`, render the Basmallah phrase in its own style, centered.
- **Other Types:**
  - Support additional line types as needed (e.g., pause marks, sajdah, etc.).


Task: Add page jump

a goto input box (1-604) and a clickable button if the user clicks it the page renders.


Task: add surah names
Currently, the surah name is shown as number, we need to replace it with actual surah name.