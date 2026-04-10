/**
 * Murajah Service Worker v26.04.03
 * Implements Stale-While-Revalidate pattern with proper font handling
 * - Serves cached resources immediately for instant loading
 * - Fetches fresh copies in background and updates cache
 * - Properly handles QPC vs Tajweed fonts (same filename, different folders)
 * - Handles redirected responses properly
 */

const CACHE_VERSION = '26.04.03';
const CACHE_NAME = `murajah-cache-v${CACHE_VERSION}`;
const FONTS_CACHE_NAME = 'murajah-fonts-v2'; // Separate cache for fonts

// Static assets to cache on install (app shell)
const APP_SHELL = [
  './',
  './index.html',
  './quiz.html',
  './plan.html',
  './privacy.html',
  './manifest.json',
  './resources/favicon.ico',
  './resources/assets/images/logo.png',
  './resources/assets/images/logo-bg.png',
  
  // Vendor JS
  './resources/js/vendor/vue.global.js',
  './resources/js/vendor/tailwind.3.4.7.js',
  './resources/js/vendor/marked.min.js',
  
  // Vendor CSS
  './resources/js/vendor/fontawesome/all.min.css',
  
  // FontAwesome webfonts (pre-cache to avoid 404 on first load)
  './resources/js/vendor/fontawesome/webfonts/fa-brands-400.woff2',
  './resources/js/vendor/fontawesome/webfonts/fa-brands-400.ttf',
  './resources/js/vendor/fontawesome/webfonts/fa-solid-900.woff2',
  './resources/js/vendor/fontawesome/webfonts/fa-solid-900.ttf',
  './resources/js/vendor/fontawesome/webfonts/fa-regular-400.woff2',
  './resources/js/vendor/fontawesome/webfonts/fa-regular-400.ttf',
  
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
  './resources/js/utils/morphologyLoader.js',
  './resources/js/utils/pageHasanah.js',
  './resources/js/utils/weaknessScorer.js',
  './resources/js/utils/planScheduler.js',
  './resources/js/utils/planManager.js',
  
  // App JS modules - Stores
  './resources/js/stores/i18nStore.js',
  './resources/js/stores/notesStore.js',
  
  // App JS modules - Components
  './resources/js/components/QuranAudioPlayerComponent.js',
  './resources/js/components/FloatingAudioPlayerComponent.js',
  './resources/js/components/LanguageSelectionModal.js',
  './resources/js/components/MorphologyPopupComponent.js',
  './resources/js/components/NotesComponent.js',
  './resources/js/components/PlanSetupWizard.js',
  './resources/js/components/PlanTodayCard.js',
  './resources/js/components/PlanCalendarComponent.js',
  './resources/js/components/PlanProgressView.js',
  
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
  './resources/data/i18n/ar.json',
  './resources/data/indopak/indopak-nastaleeq.json',
  './resources/data/tafsir/qpc-page-tafsir-mapping.json',
  './resources/data/tafsir/indopak-page-tafsir-mapping.json',
  './resources/data/tafsir/bn-tafsir.json',
  './resources/data/tafsir/en-tafsir.json',
  './resources/data/tafsir/ar-tafsir.json'
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
  let cachedResponse = await cache.match(request);
  
  // For navigation requests (HTML pages), handle specially
  const isNavigation = request.mode === 'navigate';
  
  // Don't return redirected responses for navigation requests (Safari strict)
  if (cachedResponse && isNavigation && cachedResponse.redirected) {
    console.log('[SW] Skipping redirected cached response for navigation:', request.url);
    cachedResponse = null;
  }
  
  // For navigation to root/directory, also try index.html as fallback
  if (!cachedResponse && isNavigation) {
    const urlPath = new URL(request.url).pathname;
    if (urlPath.endsWith('/')) {
      const indexUrl = new URL('index.html', request.url).href;
      const indexResponse = await cache.match(indexUrl);
      if (indexResponse && !indexResponse.redirected) {
        cachedResponse = indexResponse;
      }
    }
  }
  
  // Start fetching fresh copy in background
  const fetchPromise = (async () => {
    try {
      // For navigation, create a new request with redirect: 'follow'
      const fetchRequest = isNavigation 
        ? new Request(request.url, {
            method: request.method,
            headers: request.headers,
            redirect: 'follow',
            credentials: request.credentials,
          })
        : request;
      
      const networkResponse = await fetch(fetchRequest);
      
      // Only cache successful, non-opaque responses
      if (networkResponse.ok && networkResponse.type !== 'opaqueredirect') {
        try {
          // For redirected responses, we need to create a new response to cache
          const responseToCache = networkResponse.redirected 
            ? new Response(await networkResponse.clone().blob(), {
                status: networkResponse.status,
                statusText: networkResponse.statusText,
                headers: networkResponse.headers
              })
            : networkResponse.clone();
          
          await cache.put(request, responseToCache);
          
          // For HTML files, notify clients only if content actually changed
          if (request.destination === 'document' || request.url.endsWith('.html')) {
            const newEtag = networkResponse.headers.get('etag');
            const oldEtag = cachedResponse?.headers?.get('etag');
            const newLength = networkResponse.headers.get('content-length');
            const oldLength = cachedResponse?.headers?.get('content-length');
            
            const contentChanged = !cachedResponse 
              || (newEtag && oldEtag && newEtag !== oldEtag)
              || (newLength && oldLength && newLength !== oldLength)
              || (!newEtag && !newLength); // Can't tell — notify to be safe
            
            if (contentChanged) {
              const clients = await self.clients.matchAll();
              clients.forEach(client => {
                client.postMessage({
                  type: 'CONTENT_UPDATED',
                  url: request.url
                });
              });
            }
          }
        } catch (e) {
          console.warn('[SW] Failed to cache response:', e.message);
        }
      }
      return networkResponse;
    } catch (e) {
      return null; // Fail silently if offline
    }
  })();
  
  // Return cached response immediately if available
  if (cachedResponse) {
    // Still fetch in background to update cache
    fetchPromise.catch(() => {});
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
  const fetchPromise = (async () => {
    try {
      const networkResponse = await fetch(request);
      
      // Only cache if response is OK
      if (networkResponse.ok) {
        try {
          // For redirected responses, create a new response
          const responseToCache = networkResponse.redirected
            ? new Response(await networkResponse.clone().blob(), {
                status: networkResponse.status,
                statusText: networkResponse.statusText,
                headers: networkResponse.headers
              })
            : networkResponse.clone();
          
          // Cache with multiple keys for flexible matching
          const absoluteUrl = request.url;
          const urlWithoutQuery = absoluteUrl.split('?')[0];
          
          await fontsCache.put(absoluteUrl, responseToCache.clone());
          await fontsCache.put(urlWithoutQuery, responseToCache.clone());
          
          // Also cache by pathname
          try {
            const urlObj = new URL(absoluteUrl);
            await fontsCache.put(urlObj.pathname, responseToCache);
          } catch (e) {}
        } catch (e) {
          console.warn('[SW] Failed to cache font:', e.message);
        }
      }
      return networkResponse;
    } catch (e) {
      return null;
    }
  })();
  
  // Return cached response immediately if available
  if (cachedResponse) {
    fetchPromise.catch(() => {}); // Fire and forget background fetch
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

// Critical resources that MUST be cached for the app to work.
// If any of these fail during install, skipWaiting() is NOT called
// so the old SW continues serving until a successful install occurs.
const CRITICAL_RESOURCES = [
  './',
  './index.html',
  './quiz.html',
  './plan.html',
  // Core vendor
  './resources/js/vendor/vue.global.js',
  // Core utils
  './resources/js/utils/logger.js',
  './resources/js/utils/resourceCache.js',
  './resources/js/utils/unifiedDataLoader.js',
  './resources/js/utils/dataLoader.js',
  './resources/js/utils/calculations.js',
  './resources/js/utils/audioRecorder.js',
  './resources/js/utils/dailyGoalsManager.js',
  './resources/js/utils/morphologyLoader.js',
  // Core stores
  './resources/js/stores/i18nStore.js',
  './resources/js/stores/notesStore.js',
  // Core components
  './resources/js/components/QuranAudioPlayerComponent.js',
  './resources/js/components/FloatingAudioPlayerComponent.js',
  './resources/js/components/LanguageSelectionModal.js',
  './resources/js/components/MorphologyPopupComponent.js',
  './resources/js/components/NotesComponent.js',
  // Critical JSON data
  './resources/data/quran/qpc-v2-15-lines.json',
  './resources/data/quran/qpc-v2-word-by-word.json',
  './resources/data/quran/surah-names.json',
  './resources/data/quran/english-wbw-translation.json',
  // Core CSS
  './resources/styles/style.css',
  './resources/styles/qpc-v2-font.css',
  // Core i18n
  './resources/data/i18n/en.json'
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker v' + CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('[SW] Caching app shell');
        
        const failedCritical = [];
        const failedNonCritical = [];

        for (const url of APP_SHELL) {
          try {
            const response = await fetch(url);
            if (response.ok) {
              // For redirected responses, create a new response to avoid redirect issues
              const responseToCache = response.redirected
                ? new Response(await response.blob(), {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers
                  })
                : response;
              await cache.put(url, responseToCache);
              // For root URL, also cache under ./index.html for Safari compatibility
              if (url === './' && response.redirected) {
                const indexCached = await cache.match('./index.html');
                if (!indexCached) {
                  await cache.put('./index.html', responseToCache.clone());
                }
              }
            } else {
              console.warn(`[SW] Got status ${response.status} for: ${url}`);
              if (CRITICAL_RESOURCES.includes(url)) {
                failedCritical.push(url);
              } else {
                failedNonCritical.push(url);
              }
            }
          } catch (err) {
            console.warn(`[SW] Failed to cache: ${url}`, err.message);
            if (CRITICAL_RESOURCES.includes(url)) {
              failedCritical.push(url);
            } else {
              failedNonCritical.push(url);
            }
          }
        }

        if (failedNonCritical.length > 0) {
          console.warn(`[SW] ${failedNonCritical.length} non-critical resources failed to cache (app will still work)`);
        }

        return { failedCritical };
      })
      .then(({ failedCritical }) => {
        if (failedCritical.length > 0) {
          console.error(`[SW] ${failedCritical.length} CRITICAL resources failed to cache. NOT activating new SW.`, failedCritical);
          // Do NOT call skipWaiting() — let the old SW continue serving
          // The browser will retry installation on next page load
          return;
        }
        console.log('[SW] App shell cached — all critical resources OK');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Install failed:', err);
      })
  );
});

// Minimum resources that must exist in the new cache before old caches are deleted
const MINIMUM_CACHE_RESOURCES = ['./index.html', './resources/js/vendor/vue.global.js'];

// Activate event - clean up old caches (with safety check)
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker v' + CACHE_VERSION);
  
  event.waitUntil(
    (async () => {
      // Safety check: verify new cache has minimum required resources
      const newCache = await caches.open(CACHE_NAME);
      const missingMinimum = [];
      for (const url of MINIMUM_CACHE_RESOURCES) {
        const match = await newCache.match(url);
        if (!match) missingMinimum.push(url);
      }

      if (missingMinimum.length > 0) {
        console.warn('[SW] New cache missing minimum resources — keeping old caches as fallback:', missingMinimum);
        // Still claim clients but DON'T delete old caches
        return self.clients.claim();
      }

      // Safe to delete old caches
      const allCacheNames = await caches.keys();
      await Promise.all(
        allCacheNames
          .filter((cacheName) => {
            return (cacheName.startsWith('murajah-cache-') && cacheName !== CACHE_NAME) ||
                   (cacheName.startsWith('murajah-fonts-') && cacheName !== FONTS_CACHE_NAME);
          })
          .map((cacheName) => {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );

      console.log('[SW] Claiming clients');
      return self.clients.claim();
    })()
  );
});

// Fetch event - Stale-While-Revalidate strategy
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Always serve hotfix.html from network (never cached) to ensure latest recovery logic
  if (url.pathname.endsWith('/hotfix.html')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
          '<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem">' +
          '<div style="text-align:center;max-width:400px"><h2>Recovery Page Unavailable Offline</h2>' +
          '<p style="color:#64748b;margin:1rem 0">Please connect to the internet and try again.</p>' +
          '<button onclick="location.reload()" style="padding:0.75rem 1.5rem;background:#3b82f6;color:#fff;border:none;border-radius:0.5rem;font-size:1rem;cursor:pointer">Retry</button>' +
          '</div></body></html>',
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      })
    );
    return;
  }
  
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

    case 'CACHE_APP_SHELL':
      (async () => {
        try {
          const cache = await caches.open(CACHE_NAME);
          let cached = 0;
          for (const url of APP_SHELL) {
            try {
              const response = await fetch(url);
              if (response.ok) {
                const toCache = response.redirected
                  ? new Response(await response.blob(), {
                      status: response.status,
                      statusText: response.statusText,
                      headers: response.headers
                    })
                  : response;
                await cache.put(url, toCache);
                cached++;
              }
            } catch (e) {
              // Non-fatal — skip individual failures
            }
          }
          event.ports[0].postMessage({ type: 'APP_SHELL_CACHED', payload: { cached, total: APP_SHELL.length } });
        } catch (e) {
          event.ports[0].postMessage({ type: 'APP_SHELL_CACHED', payload: { error: e.message } });
        }
      })();
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

    case 'EMERGENCY_RESET':
      (async () => {
        try {
          // Clear all caches
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
          // Unregister this service worker
          await self.registration.unregister();
          if (event.ports[0]) {
            event.ports[0].postMessage({ type: 'EMERGENCY_RESET_DONE' });
          }
        } catch (e) {
          console.error('[SW] Emergency reset failed:', e);
          if (event.ports[0]) {
            event.ports[0].postMessage({ type: 'EMERGENCY_RESET_FAILED', error: e.message });
          }
        }
      })();
      break;
  }
});

console.log('[SW] Service Worker loaded v' + CACHE_VERSION);
