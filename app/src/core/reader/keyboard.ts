/**
 * Map a keyboard key to a page delta. RTL-aware: because the mushaf reads
 * right-to-left, the right arrow goes to the *previous* page and the left arrow
 * to the next, matching the swipe direction. PageUp/PageDown are semantic
 * (previous/next) and not mirrored.
 */
export function keyToPageDelta(key: string, rtl: boolean): -1 | 0 | 1 {
  switch (key) {
    case 'ArrowLeft':
      return rtl ? 1 : -1
    case 'ArrowRight':
      return rtl ? -1 : 1
    case 'PageDown':
      return 1
    case 'PageUp':
      return -1
    default:
      return 0
  }
}
