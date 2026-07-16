import { computed, ref } from 'vue'

const MAX_SCALE = 3
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)

/**
 * Pinch / double-tap zoom + pan state for a mushaf page. Transform is
 * `translate(tx,ty) scale(s)` about the element centre (default transform-origin),
 * so the focal math keeps the pinched/tapped point fixed. Pan is clamped to the
 * scaled bounds. The view routes gestures here; `reset()` is called on page
 * change so zoom never carries across pages. Reduced-motion is handled by the
 * view (it omits the toggle transition), so the maths here is motion-agnostic.
 */
export function useMushafZoom() {
  const scale = ref(1)
  const tx = ref(0)
  const ty = ref(0)

  const zoomed = computed(() => scale.value > 1.01)
  const transformStyle = computed(() => ({
    transform: `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`,
  }))

  function reset(): void {
    scale.value = 1
    tx.value = 0
    ty.value = 0
  }

  /** Keep translate within the scaled overflow so no gap shows at the edges. */
  function clampPan(rect: { width: number; height: number }): void {
    const maxX = (rect.width * (scale.value - 1)) / 2
    const maxY = (rect.height * (scale.value - 1)) / 2
    tx.value = clamp(tx.value, -maxX, maxX)
    ty.value = clamp(ty.value, -maxY, maxY)
  }

  function panBy(dx: number, dy: number, rect: DOMRect): void {
    if (!zoomed.value) return
    tx.value += dx
    ty.value += dy
    clampPan(rect)
  }

  /** Zoom to `next`, keeping the focal screen point (focalX/Y) fixed. */
  function zoomTo(next: number, focalX: number, focalY: number, rect: DOMRect): void {
    const s = clamp(next, 1, MAX_SCALE)
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    // Focal point in the element's local (unscaled) coords, relative to centre.
    const fx = (focalX - cx - tx.value) / scale.value
    const fy = (focalY - cy - ty.value) / scale.value
    tx.value += fx * (scale.value - s)
    ty.value += fy * (scale.value - s)
    scale.value = s
    if (s === 1) {
      tx.value = 0
      ty.value = 0
    } else {
      clampPan(rect)
    }
  }

  /** Double-tap: zoom to 2× at the tap point, or back to fit if already zoomed. */
  function toggleAt(focalX: number, focalY: number, rect: DOMRect): void {
    zoomTo(zoomed.value ? 1 : 2, focalX, focalY, rect)
  }

  return { scale, tx, ty, zoomed, transformStyle, reset, panBy, zoomTo, toggleAt, MAX_SCALE }
}
