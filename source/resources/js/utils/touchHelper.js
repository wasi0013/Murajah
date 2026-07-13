/**
 * touchHelper.js — Touch event utilities for Android WebView compatibility
 *
 * Solves: text selection on tap, double-tap zoom, unresponsive buttons in WebView.
 * 
 * Approach:
 * - On touchstart: record position + timestamp, call preventDefault to block selection
 * - On touchend: if short tap (<300ms) and small movement (<10px), fire callback
 * - Keep @click for non-touch (desktop) fallback
 */

/**
 * Detect if the current device supports touch input.
 * @returns {boolean}
 */
export function isTouchDevice() {
    return (
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (navigator.msMaxTouchPoints > 0) ||
        (typeof window.matchMedia === 'function' && window.matchMedia('(hover: none) and (pointer: coarse)').matches)
    );
}

/**
 * Create touch-safe event handlers for interactive elements in WebView.
 *
 * Usage in Vue template:
 *   @touchstart.prevent="handlers.onTouchStart"
 *   @touchend.prevent="handlers.onTouchEnd"
 *   @click="handlers.onClick"
 *
 * @param {Function} callback — called on valid tap with the original event
 * @param {Object} [options]
 * @param {number} [options.maxDuration=400] — max touch duration in ms to count as tap
 * @param {number} [options.maxDistance=15] — max finger movement in px to count as tap
 * @returns {{ onTouchStart: Function, onTouchEnd: Function, onClick: Function }}
 */
export function createTouchHandler(callback, options = {}) {
    const maxDuration = options.maxDuration || 400;
    const maxDistance = options.maxDistance || 15;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let touchHandled = false;

    function onTouchStart(event) {
        if (event.touches && event.touches.length > 0) {
            const touch = event.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            touchStartTime = Date.now();
            touchHandled = false;
        }
    }

    function onTouchEnd(event) {
        if (touchStartTime === 0) return;

        const duration = Date.now() - touchStartTime;
        if (duration > maxDuration) {
            // Long press — don't trigger
            touchStartTime = 0;
            return;
        }

        let distance = 0;
        if (event.changedTouches && event.changedTouches.length > 0) {
            const touch = event.changedTouches[0];
            const dx = touch.clientX - touchStartX;
            const dy = touch.clientY - touchStartY;
            distance = Math.sqrt(dx * dx + dy * dy);
        }

        if (distance > maxDistance) {
            // Swipe/scroll — don't trigger
            touchStartTime = 0;
            return;
        }

        // Valid tap detected
        touchHandled = true;
        touchStartTime = 0;
        callback(event);
    }

    function onClick(event) {
        // Only fire click handler if touch didn't already handle it.
        // This prevents double-firing on devices that fire both touch and click.
        if (touchHandled) {
            touchHandled = false;
            event.preventDefault();
            return;
        }
        // Desktop click — fire normally
        callback(event);
    }

    return { onTouchStart, onTouchEnd, onClick };
}

/**
 * Create a debounced version of a callback that ignores rapid repeated calls.
 * Useful for preventing double-tap on quiz answer buttons.
 *
 * @param {Function} callback
 * @param {number} [delay=300] — minimum ms between invocations
 * @returns {Function}
 */
export function debounceTouch(callback, delay = 300) {
    let lastCall = 0;
    return function (...args) {
        const now = Date.now();
        if (now - lastCall < delay) return;
        lastCall = now;
        return callback.apply(this, args);
    };
}

/**
 * Create swipe gesture handlers for horizontal navigation.
 *
 * Usage in Vue template:
 *   @touchstart="swipeHandlers.onTouchStart"
 *   @touchend="swipeHandlers.onTouchEnd"
 *
 * @param {Object} callbacks
 * @param {Function} callbacks.onSwipeLeft — called when user swipes left
 * @param {Function} callbacks.onSwipeRight — called when user swipes right
 * @param {Object} [options]
 * @param {number} [options.threshold=50] — minimum horizontal distance in px to count as swipe
 * @param {number} [options.maxDuration=500] — max touch duration in ms
 * @param {number} [options.ratioThreshold=1.5] — minimum horizontal:vertical ratio to distinguish from scroll
 * @param {Function} [options.shouldIgnore] — return true to skip swipe detection (e.g. on interactive elements)
 * @returns {{ onTouchStart: Function, onTouchMove: Function, onTouchEnd: Function }}
 */
export function createSwipeHandler(callbacks, options = {}) {
    const threshold = options.threshold || 50;
    const maxDuration = options.maxDuration || 500;
    const ratioThreshold = options.ratioThreshold || 1.5;
    const shouldIgnore = options.shouldIgnore || (() => false);

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    // True once a second finger has been involved in the current gesture (e.g. a
    // pinch-to-zoom) — cancels swipe detection so the first finger's own movement
    // isn't misread as a page-flip swipe.
    let multiTouch = false;

    function onTouchStart(event) {
        if (shouldIgnore(event)) return;

        if (event.touches && event.touches.length > 1) {
            // A second finger joined — this is a pinch/multi-touch gesture, not a swipe.
            multiTouch = true;
            startTime = 0;
            return;
        }

        if (event.touches && event.touches.length === 1) {
            const touch = event.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            startTime = Date.now();
            multiTouch = false;
        }
    }

    function onTouchMove(event) {
        if (event.touches && event.touches.length > 1) {
            multiTouch = true;
        }
    }

    function onTouchEnd(event) {
        if (startTime === 0) return;

        // Gesture involved (or still involves) more than one touch point — never a swipe.
        if (multiTouch || (event.touches && event.touches.length > 0)) {
            multiTouch = false;
            startTime = 0;
            return;
        }

        const duration = Date.now() - startTime;
        startTime = 0;

        if (duration > maxDuration) return;

        if (!event.changedTouches || event.changedTouches.length === 0) return;

        const touch = event.changedTouches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // Must exceed minimum threshold
        if (absDx < threshold) return;

        // Must be primarily horizontal (not a vertical scroll)
        if (absDy > 0 && absDx / absDy < ratioThreshold) return;

        if (dx < 0 && callbacks.onSwipeLeft) {
            callbacks.onSwipeLeft(event);
        } else if (dx > 0 && callbacks.onSwipeRight) {
            callbacks.onSwipeRight(event);
        }
    }

    return { onTouchStart, onTouchMove, onTouchEnd };
}
