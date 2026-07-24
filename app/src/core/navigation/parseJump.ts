// Pure parser for the command palette's quick-jump input. Turns a query into
// ordered navigation candidates. Data resolution (does page N exist for this
// layout, what's the surah name) happens later in the reader — this only parses.

export type Jump =
  | { type: 'ayah'; surah: number; ayah: number }
  | { type: 'page'; page: number }
  | { type: 'juz'; juz: number }
  | { type: 'surah'; surah: number }
  | { type: 'name'; query: string }

const MAX_SURAH = 114
const MAX_JUZ = 30

/** Parse a quick-jump query into candidate targets (best-first). */
export function parseJump(input: string): Jump[] {
  const q = input.trim().toLowerCase()
  if (!q) return []

  // surah:ayah  →  e.g. 2:255
  const ayah = q.match(/^(\d+)\s*:\s*(\d+)$/)
  if (ayah) {
    const surah = Number(ayah[1])
    const verse = Number(ayah[2])
    if (surah >= 1 && surah <= MAX_SURAH && verse >= 1) {
      return [{ type: 'ayah', surah, ayah: verse }]
    }
    return []
  }

  // page N  →  "p 50", "page50"
  const page = q.match(/^(?:p|page)\s*(\d+)$/)
  if (page) {
    const n = Number(page[1])
    return n >= 1 ? [{ type: 'page', page: n }] : []
  }

  // juz N  →  "j 5", "juz5"
  const juz = q.match(/^(?:j|juz)\s*(\d+)$/)
  if (juz) {
    const n = Number(juz[1])
    return n >= 1 && n <= MAX_JUZ ? [{ type: 'juz', juz: n }] : []
  }

  // surah N  →  "surah 1", "surah2", "s 114" (unambiguous — unlike a bare number,
  // which could mean page or surah)
  const surah = q.match(/^(?:s|surah)\s*(\d+)$/)
  if (surah) {
    const n = Number(surah[1])
    return n >= 1 && n <= MAX_SURAH ? [{ type: 'surah', surah: n }] : []
  }

  // bare number → page, and (if plausible) surah
  if (/^\d+$/.test(q)) {
    const n = Number(q)
    const out: Jump[] = [{ type: 'page', page: n }]
    if (n >= 1 && n <= MAX_SURAH) out.push({ type: 'surah', surah: n })
    return out
  }

  // otherwise a name search (resolved against surah names by the reader)
  if (/[a-z؀-ۿ]/.test(q)) return [{ type: 'name', query: q }]
  return []
}
