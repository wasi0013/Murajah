/**
 * Plain Unicode Arabic verse text (with tashkeel), for anything that needs
 * real copy/paste-able Arabic rather than a per-page glyph font's presentation
 * forms. QPC's word `text` (chunk-quran.mjs) hijacks Arabic presentation-form
 * codepoints as glyph indices for its own font — it renders correctly only
 * through that font and is not meaningful Unicode text on its own, so it must
 * never be used for copy/paste or search.
 */

/**
 * Flatten `quran.json`'s `{ "<chapter>": [{ chapter, verse, text, ... }] }`
 * into `{ "s:a": { text } }`, matching the `TafsirChunk` shape so the app can
 * fetch + chunk it exactly like the existing tafsir datasets.
 */
export function buildQuranTextFlat(quran) {
  const flat = {}
  for (const chapter of Object.keys(quran)) {
    for (const v of quran[chapter]) {
      flat[`${chapter}:${v.verse}`] = { text: v.text }
    }
  }
  return flat
}
