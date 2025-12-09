/**
 * Murajah Service Worker v2.0.0
 * Implements Stale-While-Revalidate pattern with proper font handling
 * - Serves cached resources immediately for instant loading
 * - Fetches fresh copies in background and updates cache
 * - Properly handles QPC vs Tajweed fonts (same filename, different folders)
 */

const CACHE_VERSION = '2.0.0';
const CACHE_NAME = `murajah-cache-v${CACHE_VERSION}`;
const FONTS_CACHE_NAME = 'murajah-fonts-v2'; // Separate cache for fonts

// Static assets to cache on install (app shell)
const APP_SHELL = [
  './',
  './index.html',
  './quiz.html',
  './privacy.html',
  './manifest.json',
  './resources/favicon.ico',
  './resources/assets/images/logo.png',
  './resources/assets/images/logo-bg.png',
  
  // Vendor JS
  './resources/js/vendor/vue.global.js',
  './resources/js/vendor/tailwind.3.4.7.js',
  './resources/js/vendor/confetti-js.0.0.18.min.js',
  
  // Vendor CSS
  './resources/js/vendor/fontawesome/all.min.css',
  
  // App CSS
  './resources/styles/style.css',
  './resources/styles/qpc-v2-font.css',
  
  // Core fonts
  './resources/styles/fonts/surah_names.woff2',
  './resources/styles/fonts/indopak/font.woff2',
  
  // App JS modules - Utils
  './resources/js/utils/logger.js',
  './resources/js/utils/resourceCache.js',
  './resources/js/utils/unifiedDataLoader.js',
  './resources/js/utils/dataLoader.js',
  './resources/js/utils/indopakDataLoader.js',
  './resources/js/utils/calculations.js',
  './resources/js/utils/scoreFormatter.js',
  './resources/js/utils/audioRecorder.js',
  './resources/js/utils/audioLoader.js',
  './resources/js/utils/dailyGoalsManager.js',
  './resources/js/utils/pageHasanah.js',
  './resources/js/utils/achievementLogic.js',
  './resources/js/utils/badgeShareUtil.js',
  './resources/js/utils/badgeSVGGenerator.js',
  
  // App JS modules - Stores
  './resources/js/stores/i18nStore.js',
  './resources/js/stores/achievementStore.js',
  
  // App JS modules - Components
  './resources/js/components/QuranAudioPlayerComponent.js',
  './resources/js/components/AchievementGridComponent.js',
  './resources/js/components/AchievementDetailComponent.js',
  './resources/js/components/AchievementNavbarComponent.js',
  './resources/js/components/BadgeShareCardComponent.js',
  './resources/js/components/ShareBadgeModal.js',
  
  // Critical JSON data
  './resources/data/quran/qpc-v2-15-lines.json',
  './resources/data/quran/qpc-v2-word-by-word.json',
  './resources/data/quran/surah-names.json',
  './resources/data/quran/english-wbw-translation.json',
  './resources/data/quran/quran.json',
  './resources/data/quran/indopak-15-lines.json',
  './resources/data/quran/bangali-word-by-word-translation.json',
  './resources/data/quran/en.json',
  './resources/data/i18n/en.json',
  './resources/data/i18n/bn.json',
  './resources/data/indopak/indopak-nastaleeq.json',
  './resources/data/tafsir/qpc-page-tafsir-mapping.json',
  './resources/data/tafsir/indopak-page-tafsir-mapping.json',
  './resources/data/tafsir/bn-tafsir.json',
  './resources/data/tafsir/en-tafsir.json',
  './resources/data/badges.json'
];

// Patterns to never cache (audio files, external resources)
const NEVER_CACHE_PATTERNS = [
  /\.mp3$/i,
  /\/audio\//i,
  /googletagmanager\.com/,
  /google-analytics\.com/,
  /gtag/
];

/**
 * Check if a URL should never be cached
 */
function shouldNeverCache(url) {
  return NEVER_CACHE_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Check if a URL is a page font (qpc-v2 or tajweed)
 */
function isPageFont(url) {
  return /\/(qpc-v2|tajweed)\/p\d+\.woff2/.test(url);
}

/**
 * Extract font identifier from URL (e.g., "qpc-v2/p1" or "tajweed/p1")
 * This ensures qpc-v2/p1.woff2 and tajweed/p1.woff2 are treated as DIFFERENT fonts
 */
function getFontIdentifier(url) {
  const match = url.match(/\/(qpc-v2|tajweed)\/(p\d+)\.woff2/);
  if (match) {
    return `${match[1]}/${match[2]}`; // e.g., "qpc-v2/p1" or "tajweed/p1"
  }
  // For other fonts, use the filename
  const filename = url.split('/').pop().split('?')[0];
  return filename;
}

/**
 * Find cached font by its identifier (folder + page number)
 */
async function findCachedFont(request) {
  const fontsCache = await caches.open(FONTS_CACHE_NAME);
  const requestedFontId = getFontIdentifier(request.url);
  
  // Try exact URL match first
  let cached = await fontsCache.match(request);
  if (cached) return cached;
  
  // Try URL without query string
  const urlWithoutQuery = request.url.split('?')[0];
  cached = await fontsCache.match(urlWithoutQuery);
  if (cached) return cached;
  
  // Try pathname
  try {
    const urlObj = new URL(request.url);
    cached = await fontsCache.match(urlObj.pathname);
    if (cached) return cached;
  } catch (e) {}
  
  // Search through cached fonts for matching identifier
  const keys = await fontsCache.keys();
  for (const cachedRequest of keys) {
    const cachedFontId = getFontIdentifier(cachedRequest.url);
    // IMPORTANT: Only match if the font identifier matches exactly
    // This prevents qpc-v2/p1 from matching tajweed/p1
    if (cachedFontId === requestedFontId) {
      return await fontsCache.match(cachedRequest);
    }
  }
  
  return null;
}

/**
 * Stale-While-Revalidate: Return cached response immediately,
 * then fetch fresh copy and update cache in background
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  // Start fetching fresh copy in background (don't await)
  const fetchPromise = fetch(request, { redirect: 'follow' })
    .then(async (networkResponse) => {
      // Check if response is OK (status 200-299) and not a redirect
      if (networkResponse.ok && networkResponse.status !== 301 && networkResponse.status !== 302 && networkResponse.status !== 303 && networkResponse.status !== 307 && networkResponse.status !== 308) {
        try {
          // Update cache with fresh response (clone it as we're using it)
          await cache.put(request, networkResponse.clone());
          
          // For HTML files, notify clients about the update
          if (request.destination === 'document' || request.url.endsWith('.html')) {
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
              client.postMessage({
                type: 'CONTENT_UPDATED',
                url: request.url
              });
            });
          }
        } catch (e) {
          console.warn('[SW] Failed to cache response:', e);
        }
      }
      return networkResponse;
    })
    .catch(() => null); // Fail silently if offline
  
  // Return cached response immediately if available
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // No cache, wait for network
  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }
  
  // Both cache and network failed
  return new Response('Offline - Resource not cached', { 
    status: 503,
    statusText: 'Service Unavailable'
  });
}

/**
 * Stale-While-Revalidate for fonts with proper folder-aware matching
 */
async function staleWhileRevalidateFont(request) {
  const fontsCache = await caches.open(FONTS_CACHE_NAME);
  
  // Try to find cached font with proper identifier matching
  const cachedResponse = await findCachedFont(request);
  
  // Start fetching fresh copy in background
  const fetchPromise = fetch(request, { redirect: 'follow' })
    .then(async (networkResponse) => {
      // Only cache if response is OK and not a redirect status
      if (networkResponse.ok && networkResponse.status !== 301 && networkResponse.status !== 302 && networkResponse.status !== 303 && networkResponse.status !== 307 && networkResponse.status !== 308) {
        try {
          // Cache with multiple keys for flexible matching
          const absoluteUrl = request.url;
          const urlWithoutQuery = absoluteUrl.split('?')[0];
          
          await fontsCache.put(absoluteUrl, networkResponse.clone());
          await fontsCache.put(urlWithoutQuery, networkResponse.clone());
          
          // Also cache by pathname
          try {
            const urlObj = new URL(absoluteUrl);
            await fontsCache.put(urlObj.pathname, networkResponse.clone());
          } catch (e) {}
        } catch (e) {
          console.warn('[SW] Failed to cache font:', e);
        }
      }
      return networkResponse;
    })
    .catch(() => null);
  
  // Return cached response immediately if available
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // No cache, wait for network
  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }
  
  // Font not available - return 404 (not empty response to avoid decode errors)
  return new Response(null, { status: 404, statusText: 'Font not cached' });
}

// Install event - cache app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker v' + CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell');
        return Promise.allSettled(
          APP_SHELL.map(url => {
            // Use fetch with redirect: 'follow' to handle redirects properly
            return fetch(url, { redirect: 'follow', mode: 'no-cors' })
              .then(response => {
                if (response.ok || response.status === 0) { // 0 status is for opaque responses (no-cors)
                  return cache.put(url, response);
                } else {
                  console.warn(`[SW] Got status ${response.status} for: ${url}`);
                }
              })
              .catch(err => {
                console.warn(`[SW] Failed to cache: ${url}`, err.message);
              });
          })
        );
      })
      .then(() => {
        console.log('[SW] App shell cached');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Install failed:', err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker v' + CACHE_VERSION);
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Delete old caches (except current ones)
              return (cacheName.startsWith('murajah-cache-') && cacheName !== CACHE_NAME) ||
                     (cacheName.startsWith('murajah-fonts-') && cacheName !== FONTS_CACHE_NAME);
            })
            .map((cacheName) => {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event - Stale-While-Revalidate strategy
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Skip requests that should never be cached
  if (shouldNeverCache(request.url)) return;
  
  // Skip cross-origin requests (except fonts)
  if (url.origin !== location.origin && !request.url.includes('.woff')) return;
  
  // Handle page fonts (qpc-v2 and tajweed) with special matching
  if (isPageFont(request.url)) {
    event.respondWith(staleWhileRevalidateFont(request));
    return;
  }
  
  // Handle other fonts
  if (request.destination === 'font' || request.url.includes('.woff2')) {
    event.respondWith(staleWhileRevalidateFont(request));
    return;
  }
  
  // Handle all other requests with stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
});

// Message handler for communication with main thread
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CACHE_FONTS':
      // Cache specific font pages
      if (payload?.pages) {
        const fontsCache = caches.open(FONTS_CACHE_NAME);
        payload.pages.forEach((page) => {
          const qpcUrl = `./resources/styles/fonts/qpc-v2/p${page}.woff2`;
          const tajweedUrl = `./resources/styles/fonts/tajweed/p${page}.woff2`;
          fetch(qpcUrl).then(r => r.ok && fontsCache.then(c => c.put(qpcUrl, r)));
          fetch(tajweedUrl).then(r => r.ok && fontsCache.then(c => c.put(tajweedUrl, r)));
        });
      }
      break;
      
    case 'GET_CACHE_STATUS':
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        event.ports[0].postMessage({
          type: 'CACHE_STATUS',
          payload: {
            version: CACHE_VERSION,
            cachedCount: keys.length,
            cacheName: CACHE_NAME
          }
        });
      })();
      break;
      
    case 'CLEAR_CACHE':
      Promise.all([
        caches.delete(CACHE_NAME),
        caches.delete(FONTS_CACHE_NAME)
      ]).then(() => {
        event.ports[0].postMessage({ type: 'CACHE_CLEARED' });
      });
      break;
      
    case 'DEBUG_FONT_CACHE':
      (async () => {
        const fontsCache = await caches.open(FONTS_CACHE_NAME);
        const keys = await fontsCache.keys();
        const fontUrls = keys.map(r => ({
          url: r.url,
          id: getFontIdentifier(r.url)
        })).slice(0, 50);
        event.ports[0].postMessage({
          type: 'FONT_CACHE_DEBUG',
          payload: {
            totalFonts: keys.length,
            sampleUrls: fontUrls
          }
        });
      })();
      break;
      
    case 'TEST_FONT_MATCH':
      (async () => {
        const testUrl = event.data.url;
        const mockRequest = new Request(testUrl);
        const matched = await findCachedFont(mockRequest);
        event.ports[0].postMessage({
          type: 'FONT_MATCH_RESULT',
          payload: {
            testUrl,
            requestedId: getFontIdentifier(testUrl),
            matched: !!matched
          }
        });
      })();
      break;
  }
});

console.log('[SW] Service Worker loaded v' + CACHE_VERSION);
