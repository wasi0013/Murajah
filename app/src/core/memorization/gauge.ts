/**
 * Stroke-dasharray/dashoffset for an SVG semicircle gauge (StatsSummary.vue's
 * average-strength meter). Deliberately avoids per-value arc endpoint
 * trigonometry (computing the {cx,cy} of a point at a given sweep angle and
 * picking large-arc/sweep flags) — that math has a genuinely ambiguous edge
 * case exactly at 0%/100% (a semicircle's endpoints are diametrically
 * opposite, where the "large arc" flag's two solutions coincide in length).
 * Instead the component draws ONE fixed, static semicircle `<path>` and
 * reveals a `percent`-sized portion of it purely via the dash pattern — the
 * standard technique for circular/semicircular progress indicators, and one
 * that never has a degenerate case because the path itself never changes.
 */
export interface GaugeDash {
  /** SVG `stroke-dasharray` — always the full arc length (one dash exactly the path's length, so the pattern never repeats). */
  dasharray: number
  /** SVG `stroke-dashoffset` for the given (clamped 0–100) percent — full length hides everything, 0 shows everything. */
  dashoffset: number
}

/** A semicircle's arc length (half a circle's circumference), radius `radius`. */
export function semicircleLength(radius: number): number {
  return Math.PI * radius
}

export function semicircleGaugeDash(percent: number, radius: number): GaugeDash {
  const clamped = Math.max(0, Math.min(100, percent))
  const length = semicircleLength(radius)
  return { dasharray: length, dashoffset: length * (1 - clamped / 100) }
}
