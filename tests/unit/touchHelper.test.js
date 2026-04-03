/**
 * Unit tests for touchHelper.js
 * Tests touch event utilities for Android WebView compatibility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { isTouchDevice, createTouchHandler, debounceTouch, createSwipeHandler } = await import(
    '../../source/resources/js/utils/touchHelper.js'
);


// ─── Helper: create synthetic touch events ───────────────────────────────────

function makeTouchEvent(type, x = 0, y = 0) {
    const touch = { clientX: x, clientY: y };
    return {
        type,
        touches: type === 'touchstart' ? [touch] : [],
        changedTouches: type === 'touchend' ? [touch] : [],
        preventDefault: vi.fn()
    };
}


// ─── isTouchDevice ───────────────────────────────────────────────────────────

describe('isTouchDevice()', () => {
    const originalOntouchstart = window.ontouchstart;
    const originalMaxTouchPoints = navigator.maxTouchPoints;

    afterEach(() => {
        // Restore originals
        if (originalOntouchstart === undefined) {
            delete window.ontouchstart;
        } else {
            window.ontouchstart = originalOntouchstart;
        }
        Object.defineProperty(navigator, 'maxTouchPoints', {
            value: originalMaxTouchPoints,
            writable: true,
            configurable: true
        });
    });

    it('should return true when ontouchstart exists', () => {
        window.ontouchstart = null;
        expect(isTouchDevice()).toBe(true);
    });

    it('should return true when maxTouchPoints > 0', () => {
        delete window.ontouchstart;
        Object.defineProperty(navigator, 'maxTouchPoints', {
            value: 5,
            writable: true,
            configurable: true
        });
        expect(isTouchDevice()).toBe(true);
    });
});


// ─── createTouchHandler ──────────────────────────────────────────────────────

describe('createTouchHandler()', () => {
    let callback;
    let handlers;

    beforeEach(() => {
        callback = vi.fn();
        handlers = createTouchHandler(callback);
    });

    it('should return an object with onTouchStart, onTouchEnd, onClick', () => {
        expect(handlers).toHaveProperty('onTouchStart');
        expect(handlers).toHaveProperty('onTouchEnd');
        expect(handlers).toHaveProperty('onClick');
        expect(typeof handlers.onTouchStart).toBe('function');
        expect(typeof handlers.onTouchEnd).toBe('function');
        expect(typeof handlers.onClick).toBe('function');
    });

    it('should fire callback on valid tap (short duration, small movement)', () => {
        const startEvt = makeTouchEvent('touchstart', 100, 200);
        handlers.onTouchStart(startEvt);

        // Simulate a quick tap — end at same position
        const endEvt = makeTouchEvent('touchend', 100, 200);
        handlers.onTouchEnd(endEvt);

        expect(callback).toHaveBeenCalledOnce();
        expect(callback).toHaveBeenCalledWith(endEvt);
    });

    it('should NOT fire callback on long press (> maxDuration)', () => {
        const h = createTouchHandler(callback, { maxDuration: 100 });

        const startEvt = makeTouchEvent('touchstart', 100, 200);
        h.onTouchStart(startEvt);

        // Simulate time passing
        vi.useFakeTimers();
        vi.advanceTimersByTime(200);

        const endEvt = makeTouchEvent('touchend', 100, 200);
        h.onTouchEnd(endEvt);

        expect(callback).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('should NOT fire callback on scroll/swipe (distance > maxDistance)', () => {
        const h = createTouchHandler(callback, { maxDistance: 10 });

        const startEvt = makeTouchEvent('touchstart', 100, 200);
        h.onTouchStart(startEvt);

        // End position is 50px away
        const endEvt = makeTouchEvent('touchend', 150, 200);
        h.onTouchEnd(endEvt);

        expect(callback).not.toHaveBeenCalled();
    });

    it('should fire callback for movement within threshold', () => {
        const h = createTouchHandler(callback, { maxDistance: 15 });

        const startEvt = makeTouchEvent('touchstart', 100, 200);
        h.onTouchStart(startEvt);

        // Move 10px (within 15px threshold)
        const endEvt = makeTouchEvent('touchend', 106, 208);
        h.onTouchEnd(endEvt);

        expect(callback).toHaveBeenCalledOnce();
    });

    it('should block click after touch already handled (no double-fire)', () => {
        const startEvt = makeTouchEvent('touchstart', 100, 200);
        handlers.onTouchStart(startEvt);

        const endEvt = makeTouchEvent('touchend', 100, 200);
        handlers.onTouchEnd(endEvt);

        expect(callback).toHaveBeenCalledOnce();

        // Now click fires (browser sends click after touch on some devices)
        const clickEvt = { preventDefault: vi.fn() };
        handlers.onClick(clickEvt);

        // Should not fire callback again
        expect(callback).toHaveBeenCalledOnce();
        expect(clickEvt.preventDefault).toHaveBeenCalled();
    });

    it('should fire callback on desktop click (no touch events)', () => {
        const clickEvt = { preventDefault: vi.fn() };
        handlers.onClick(clickEvt);
        expect(callback).toHaveBeenCalledOnce();
        expect(callback).toHaveBeenCalledWith(clickEvt);
    });

    it('should handle touchEnd without prior touchStart gracefully', () => {
        const endEvt = makeTouchEvent('touchend', 100, 200);
        handlers.onTouchEnd(endEvt);
        // Should not throw or call callback
        expect(callback).not.toHaveBeenCalled();
    });

    it('should handle event with no touches array', () => {
        handlers.onTouchStart({ touches: [] });
        const endEvt = makeTouchEvent('touchend', 100, 200);
        handlers.onTouchEnd(endEvt);
        expect(callback).not.toHaveBeenCalled();
    });
});


// ─── debounceTouch ───────────────────────────────────────────────────────────

describe('debounceTouch()', () => {
    it('should call the callback on first invocation', () => {
        const fn = vi.fn();
        const debounced = debounceTouch(fn, 300);
        debounced('arg1');
        expect(fn).toHaveBeenCalledOnce();
        expect(fn).toHaveBeenCalledWith('arg1');
    });

    it('should block rapid repeated calls within delay', () => {
        vi.useFakeTimers();
        const fn = vi.fn();
        const debounced = debounceTouch(fn, 300);

        debounced();
        expect(fn).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(100);
        debounced(); // 100ms later — blocked
        expect(fn).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(100);
        debounced(); // 200ms later — still blocked
        expect(fn).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
    });

    it('should allow call after delay has passed', () => {
        vi.useFakeTimers();
        const fn = vi.fn();
        const debounced = debounceTouch(fn, 300);

        debounced();
        expect(fn).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(350);
        debounced(); // 350ms later — allowed
        expect(fn).toHaveBeenCalledTimes(2);

        vi.useRealTimers();
    });

    it('should pass through arguments and this context', () => {
        const fn = vi.fn();
        const debounced = debounceTouch(fn, 300);
        debounced('a', 'b', 'c');
        expect(fn).toHaveBeenCalledWith('a', 'b', 'c');
    });

    it('should use default 300ms delay', () => {
        vi.useFakeTimers();
        const fn = vi.fn();
        const debounced = debounceTouch(fn);

        debounced();
        vi.advanceTimersByTime(250);
        debounced(); // 250ms — blocked
        expect(fn).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(100);
        debounced(); // 350ms total — allowed
        expect(fn).toHaveBeenCalledTimes(2);

        vi.useRealTimers();
    });
});


// ─── createSwipeHandler ──────────────────────────────────────────────────────

describe('createSwipeHandler()', () => {
    let onSwipeLeft;
    let onSwipeRight;
    let handlers;

    beforeEach(() => {
        onSwipeLeft = vi.fn();
        onSwipeRight = vi.fn();
        handlers = createSwipeHandler({ onSwipeLeft, onSwipeRight });
    });

    it('should return onTouchStart and onTouchEnd functions', () => {
        expect(typeof handlers.onTouchStart).toBe('function');
        expect(typeof handlers.onTouchEnd).toBe('function');
    });

    it('should detect left swipe (finger moves left)', () => {
        handlers.onTouchStart(makeTouchEvent('touchstart', 200, 100));
        handlers.onTouchEnd(makeTouchEvent('touchend', 100, 100)); // dx = -100
        expect(onSwipeLeft).toHaveBeenCalledOnce();
        expect(onSwipeRight).not.toHaveBeenCalled();
    });

    it('should detect right swipe (finger moves right)', () => {
        handlers.onTouchStart(makeTouchEvent('touchstart', 100, 100));
        handlers.onTouchEnd(makeTouchEvent('touchend', 200, 100)); // dx = +100
        expect(onSwipeRight).toHaveBeenCalledOnce();
        expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it('should NOT fire on short horizontal movement below threshold', () => {
        handlers.onTouchStart(makeTouchEvent('touchstart', 100, 100));
        handlers.onTouchEnd(makeTouchEvent('touchend', 130, 100)); // dx = 30, below 50
        expect(onSwipeLeft).not.toHaveBeenCalled();
        expect(onSwipeRight).not.toHaveBeenCalled();
    });

    it('should NOT fire on vertical scroll (dy > dx / ratio)', () => {
        handlers.onTouchStart(makeTouchEvent('touchstart', 100, 100));
        handlers.onTouchEnd(makeTouchEvent('touchend', 160, 200)); // dx=60, dy=100, ratio=0.6
        expect(onSwipeLeft).not.toHaveBeenCalled();
        expect(onSwipeRight).not.toHaveBeenCalled();
    });

    it('should NOT fire on slow swipe (exceeds maxDuration)', () => {
        vi.useFakeTimers();
        const h = createSwipeHandler({ onSwipeLeft, onSwipeRight }, { maxDuration: 200 });
        h.onTouchStart(makeTouchEvent('touchstart', 200, 100));
        vi.advanceTimersByTime(300);
        h.onTouchEnd(makeTouchEvent('touchend', 100, 100));
        expect(onSwipeLeft).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('should respect custom threshold', () => {
        const h = createSwipeHandler({ onSwipeLeft, onSwipeRight }, { threshold: 100 });
        h.onTouchStart(makeTouchEvent('touchstart', 200, 100));
        h.onTouchEnd(makeTouchEvent('touchend', 120, 100)); // dx = -80, below 100
        expect(onSwipeLeft).not.toHaveBeenCalled();

        h.onTouchStart(makeTouchEvent('touchstart', 200, 100));
        h.onTouchEnd(makeTouchEvent('touchend', 50, 100)); // dx = -150, above 100
        expect(onSwipeLeft).toHaveBeenCalledOnce();
    });

    it('should skip when shouldIgnore returns true', () => {
        const h = createSwipeHandler(
            { onSwipeLeft, onSwipeRight },
            { shouldIgnore: () => true }
        );
        h.onTouchStart(makeTouchEvent('touchstart', 200, 100));
        h.onTouchEnd(makeTouchEvent('touchend', 100, 100));
        expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it('should ignore multi-touch gestures', () => {
        const multiTouchStart = {
            type: 'touchstart',
            touches: [
                { clientX: 100, clientY: 100 },
                { clientX: 200, clientY: 200 }
            ],
            changedTouches: [],
            preventDefault: vi.fn()
        };
        handlers.onTouchStart(multiTouchStart);
        handlers.onTouchEnd(makeTouchEvent('touchend', 50, 100));
        expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it('should handle touchEnd without prior touchStart gracefully', () => {
        handlers.onTouchEnd(makeTouchEvent('touchend', 100, 100));
        expect(onSwipeLeft).not.toHaveBeenCalled();
        expect(onSwipeRight).not.toHaveBeenCalled();
    });

    it('should work with only onSwipeLeft callback', () => {
        const h = createSwipeHandler({ onSwipeLeft });
        h.onTouchStart(makeTouchEvent('touchstart', 200, 100));
        h.onTouchEnd(makeTouchEvent('touchend', 100, 100));
        expect(onSwipeLeft).toHaveBeenCalledOnce();
    });

    it('should work with only onSwipeRight callback', () => {
        const h = createSwipeHandler({ onSwipeRight });
        h.onTouchStart(makeTouchEvent('touchstart', 100, 100));
        h.onTouchEnd(makeTouchEvent('touchend', 200, 100));
        expect(onSwipeRight).toHaveBeenCalledOnce();
    });
});
