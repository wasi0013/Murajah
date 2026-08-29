import type { StrengthRank } from './strengthBands'

/**
 * CSS custom-property values for a strength band (see `strengthBands.ts`) —
 * the single source every UI surface that colours by band reads from
 * (`MemorizedGrid.vue`'s cells/legend, `StatsSummary.vue`'s average-strength
 * gauge, ...), so the same rank always renders the same colour everywhere in
 * the app rather than each component keeping its own copy that can drift.
 *
 * Band 6 (Mutqan) is a fixed "ink" pair rather than a themed hue — a
 * deliberately different visual language for the top level — and carries its
 * own border var (visible in dark theme so it doesn't merge into the
 * already near-black surface).
 *
 * Unlike the old monotonic lightness ramp, the mid bands' hues vary widely in
 * contrast against a single blanket text colour. --color-danger/
 * --color-success are dark/saturated enough in every theme for
 * --color-on-status; the amber/teal/blue highlight tokens are light-to-mid
 * toned in every theme (light, dark, and sepia all pick pastel-ish hl-*
 * values), so they need a text colour that stays dark regardless of theme —
 * --color-band-ink, not --color-text (which itself flips to a near-white
 * value in dark theme and would fail contrast there). Verified against all
 * 3 themes.
 */
export function bandColorVars(rank: StrengthRank): { bg: string; text: string; border: string } {
  if (rank === 6) {
    return { bg: 'var(--color-mutqan-bg)', text: 'var(--color-mutqan-text)', border: 'var(--color-mutqan-border)' }
  }
  if (rank === 0) {
    return { bg: 'var(--color-surface)', text: 'var(--color-text-muted)', border: 'var(--color-border)' }
  }
  const vars: Record<Exclude<StrengthRank, 0 | 6>, { bg: string; text: string }> = {
    1: { bg: 'var(--hl-amber)', text: 'var(--color-band-ink)' },
    2: { bg: 'var(--color-danger)', text: 'var(--color-on-status)' },
    3: { bg: 'var(--hl-teal)', text: 'var(--color-band-ink)' },
    4: { bg: 'var(--hl-blue)', text: 'var(--color-band-ink)' },
    5: { bg: 'var(--color-success)', text: 'var(--color-on-status)' },
  }
  return { ...vars[rank as Exclude<StrengthRank, 0 | 6>], border: 'transparent' }
}

/** Just the bg colour, for callers that don't need text/border (e.g. a gauge arc). */
export function bandColor(rank: StrengthRank): string {
  return bandColorVars(rank).bg
}
