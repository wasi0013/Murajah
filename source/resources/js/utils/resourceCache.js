/**
 * Murajah Resource Cache Utility
 * Handles caching of all static resources (JS, CSS, JSON, fonts) in IndexedDB
 * Supports versioning and force refresh functionality
 */

import Logger from './logger.js';

// Current cache version - increment this to force cache refresh on update
export const CACHE_VERSION = '2.0.0';

// Cache names - must match service worker
const FONTS_CACHE_NAME = 'murajah-fonts-v2';

// Resource manifest - all cacheable resources with their types
export const RESOURCE_MANIFEST = {
  // JSON Data Files
  json: [
    { id: 'qpc-v2-15-lines', url: './resources/data/quran/qpc-v2-15-lines.json', critical: true },
    { id: 'qpc-v2-word-by-word', url: './resources/data/quran/qpc-v2-word-by-word.json', critical: true },
    { id: 'indopak-15-lines', url: './resources/data/quran/indopak-15-lines.json', critical: false },
    { id: 'indopak-nastaleeq', url: './resources/data/indopak/indopak-nastaleeq.json', critical: false },
    { id: 'quran-surah-names', url: './resources/data/quran/surah-names.json', critical: true },
    { id: 'english-wbw-translation', url: './resources/data/quran/english-wbw-translation.json', critical: true },
    { id: 'quran-en', url: './resources/data/quran/en.json', critical: false },
    { id: 'bangali-wbw-translation', url: './resources/data/quran/bangali-word-by-word-translation.json', critical: false },
    { id: 'bn-tafsir', url: './resources/data/tafsir/bn-tafsir.json', critical: false },
    { id: 'en-tafsir', url: './resources/data/tafsir/en-tafsir.json', critical: false },
    { id: 'qpc-page-tafsir-mapping', url: './resources/data/tafsir/qpc-page-tafsir-mapping.json', critical: false },
    { id: 'indopak-page-tafsir-mapping', url: './resources/data/tafsir/indopak-page-tafsir-mapping.json', critical: false },
    { id: 'quran-json', url: './resources/data/quran/quran.json', critical: true },
    { id: 'i18n-en', url: './resources/data/i18n/en.json', critical: true },
    { id: 'i18n-bn', url: './resources/data/i18n/bn.json', critical: false },
    { id: 'badges', url: './resources/data/badges.json', critical: false }
  ],
  
  // JavaScript Files (vendor and app modules)
  js: [
    { id: 'tailwind', url: './resources/js/vendor/tailwind.3.4.7.js', critical: true },
    { id: 'vue', url: './resources/js/vendor/vue.global.js', critical: true },
    { id: 'confetti', url: './resources/js/vendor/confetti-js.0.0.18.min.js', critical: false }
  ],
  
  // CSS Files
  css: [
    { id: 'fontawesome', url: './resources/js/vendor/fontawesome/all.min.css', critical: true },
    { id: 'qpc-font-css', url: './resources/styles/qpc-v2-font.css', critical: true },
    { id: 'main-style', url: './resources/styles/style.css', critical: false }
  ],
  
  // Font Files (base fonts only - page fonts are generated dynamically)
  fonts: [
    { id: 'indopak-font', url: './resources/styles/fonts/indopak/font.woff2', critical: false },
    { id: 'surah-names-font', url: './resources/styles/fonts/surah_names.woff2', critical: true }
  ]
};

// Generate page font resources (604 Quran pages)
export const generatePageFonts = () => {
  const pageFonts = [];
  for (let i = 1; i <= 604; i++) {
    pageFonts.push({
      id: `page-font-${i}`,
      url: `./resources/styles/fonts/qpc-v2/p${i}.woff2`,
      critical: false,
      isPageFont: true
    });
  }
  return pageFonts;
};

// Generate tajweed page font resources (604 Quran pages)
export const generateTajweedFonts = () => {
  const tajweedFonts = [];
  for (let i = 1; i <= 604; i++) {
    tajweedFonts.push({
      id: `tajweed-font-${i}`,
      url: `./resources/styles/fonts/tajweed/p${i}.woff2`,
      critical: false,
      isTajweedFont: true
    });
  }
  return tajweedFonts;
};

// Calculate total resources count (including page fonts)
export const getTotalResourceCount = (includePageFonts = false) => {
  const baseCount = Object.values(RESOURCE_MANIFEST).reduce((sum, arr) => sum + arr.length, 0);
  if (includePageFonts) {
    return baseCount + 604 + 604; // +604 qpc-v2 fonts +604 tajweed fonts
  }
  return baseCount;
};

// ResourceCache class for managing cached resources
export class ResourceCache {
  constructor(db) {
    this.db = db;
    this.memoryCache = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      lastUpdated: null
    };
  }

  /**
   * Get the stored cache version
   */
  async getCacheVersion() {
    if (!this.db?.db) return null;
    try {
      const tx = this.db.db.transaction(['appData'], 'readonly');
      const store = tx.objectStore('appData');
      return new Promise((resolve, reject) => {
        const request = store.get('cache-version');
        request.onsuccess = () => resolve(request.result?.value || null);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      Logger.warn(Logger.MODULES.CACHE, 'Failed to get cache version', error);
      return null;
    }
  }

  /**
   * Set the cache version
   */
  async setCacheVersion(version) {
    if (!this.db?.db) return;
    try {
      const tx = this.db.db.transaction(['appData'], 'readwrite');
      const store = tx.objectStore('appData');
      store.put({ id: 'cache-version', value: version, updatedAt: new Date().toISOString() });
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      Logger.warn(Logger.MODULES.CACHE, 'Failed to set cache version', error);
    }
  }

  /**
   * Check if cache needs refresh due to version change
   */
  async needsVersionRefresh() {
    const storedVersion = await this.getCacheVersion();
    if (!storedVersion) return true;
    return storedVersion !== CACHE_VERSION;
  }

  /**
   * Get cache statistics (includes both IndexedDB and Cache API)
   */
  async getCacheStats() {
    let indexedDBCached = 0;
    let indexedDBSize = 0;
    let fontsCached = 0;
    let fontsSize = 0;

    // Count IndexedDB cached resources
    if (this.db?.db) {
      try {
        const tx = this.db.db.transaction(['resourceCache'], 'readonly');
        const store = tx.objectStore('resourceCache');
        
        const records = await new Promise((resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
        });
        
        indexedDBCached = records.length;
        records.forEach(r => {
          if (r.data) {
            indexedDBSize += typeof r.data === 'string' ? r.data.length : JSON.stringify(r.data).length;
          }
        });
      } catch (error) {
        Logger.warn(Logger.MODULES.CACHE, 'Failed to get IndexedDB cache stats', error);
      }
    }

    // Count fonts from Cache API
    if ('caches' in window) {
      try {
        const fontsCache = await caches.open(FONTS_CACHE_NAME);
        const fontKeys = await fontsCache.keys();
        
        // Count unique fonts (each font is cached under 2 URLs: absolute + pathname)
        // Filter to count only unique font files by filename pattern
        const uniqueFonts = new Set();
        fontKeys.forEach(request => {
          // Extract the font filename pattern (e.g., "qpc-v2/p1.woff2" or "tajweed/p1.woff2")
          const match = request.url.match(/(qpc-v2|tajweed)\/p\d+\.woff2/);
          if (match) {
            uniqueFonts.add(match[0]);
          } else if (request.url.includes('.woff2')) {
            // For other fonts like indopak/font.woff2 or surah_names.woff2
            const fontName = request.url.split('/').pop();
            uniqueFonts.add(fontName);
          }
        });
        fontsCached = uniqueFonts.size;
        
        // Estimate font size (actual size would require reading all responses)
        // Average font file is ~80KB, so estimate based on count
        fontsSize = fontsCached * 80 * 1024;
      } catch (error) {
        Logger.warn(Logger.MODULES.CACHE, 'Failed to get fonts cache stats', error);
      }
    }

    const totalCached = indexedDBCached + fontsCached;
    const totalSize = indexedDBSize + fontsSize;
    // Total resources = base manifest + 604 qpc fonts + 604 tajweed fonts
    const totalResources = getTotalResourceCount(false) + 604 + 604;

    return {
      totalCached,
      totalResources,
      totalSize,
      formattedSize: this.formatBytes(totalSize),
      version: CACHE_VERSION,
      indexedDBCached,
      fontsCached,
      ...this.cacheStats
    };
  }

  /**
   * Format bytes to human readable string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Save resource to cache
   */
  async saveResource(id, url, data, type = 'json') {
    if (!this.db?.db) return;
    
    // Store in memory cache
    this.memoryCache.set(id, data);
    
    try {
      const tx = this.db.db.transaction(['resourceCache'], 'readwrite');
      const store = tx.objectStore('resourceCache');
      const record = {
        id,
        url,
        type,
        data,
        cachedAt: new Date().toISOString(),
        version: CACHE_VERSION
      };
      store.put(record);
      
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => {
          Logger.debug(Logger.MODULES.CACHE, `Cached resource: ${id}`);
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      Logger.warn(Logger.MODULES.CACHE, `Failed to cache ${id}`, error);
    }
  }

  /**
   * Load resource from cache
   */
  async loadResource(id) {
    // Check memory cache first
    if (this.memoryCache.has(id)) {
      this.cacheStats.hits++;
      return this.memoryCache.get(id);
    }

    if (!this.db?.db) return null;
    
    try {
      const tx = this.db.db.transaction(['resourceCache'], 'readonly');
      const store = tx.objectStore('resourceCache');
      
      return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => {
          const record = request.result;
          if (record?.data) {
            this.cacheStats.hits++;
            // Store in memory cache for faster subsequent access
            this.memoryCache.set(id, record.data);
            resolve(record.data);
          } else {
            this.cacheStats.misses++;
            resolve(null);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      Logger.warn(Logger.MODULES.CACHE, `Failed to load cached ${id}`, error);
      this.cacheStats.misses++;
      return null;
    }
  }

  /**
   * Check if resource is cached
   */
  async isResourceCached(id) {
    if (this.memoryCache.has(id)) return true;
    const data = await this.loadResource(id);
    return data !== null;
  }

  /**
   * Delete a specific resource from cache
   */
  async deleteResource(id) {
    this.memoryCache.delete(id);
    
    if (!this.db?.db) return;
    
    try {
      const tx = this.db.db.transaction(['resourceCache'], 'readwrite');
      const store = tx.objectStore('resourceCache');
      store.delete(id);
      
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => {
          Logger.debug(Logger.MODULES.CACHE, `Deleted cached resource: ${id}`);
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      Logger.warn(Logger.MODULES.CACHE, `Failed to delete ${id}`, error);
    }
  }

  /**
   * Clear all cached resources (IndexedDB + Cache API)
   */
  async clearAll() {
    this.memoryCache.clear();
    this.cacheStats = { hits: 0, misses: 0, lastUpdated: null };
    
    // Clear Cache API fonts caches (both old and new versions)
    if ('caches' in window) {
      try {
        await caches.delete('murajah-fonts-v1'); // Old cache
        await caches.delete(FONTS_CACHE_NAME);   // Current cache
        Logger.info(Logger.MODULES.CACHE, 'Fonts cache (Cache API) cleared');
      } catch (error) {
        Logger.warn(Logger.MODULES.CACHE, 'Failed to clear fonts cache', error);
      }
    }
    
    if (!this.db?.db) return;
    
    try {
      const tx = this.db.db.transaction(['resourceCache'], 'readwrite');
      const store = tx.objectStore('resourceCache');
      store.clear();
      
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => {
          Logger.info(Logger.MODULES.CACHE, 'IndexedDB resource cache cleared');
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      Logger.warn(Logger.MODULES.CACHE, 'Failed to clear IndexedDB cache', error);
    }
  }

  /**
   * Fetch resource from network
   */
  async fetchResource(url, type = 'json') {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url} (${response.status})`);
    }

    switch (type) {
      case 'json':
        return response.json();
      case 'js':
      case 'css':
      case 'text':
        return response.text();
      case 'blob':
      case 'fonts':
        return response.blob();
      default:
        return response.text();
    }
  }

  /**
   * Load resource with cache-first strategy
   */
  async loadWithCache(id, url, type = 'json', forceRefresh = false) {
    // If not forcing refresh, try cache first
    if (!forceRefresh) {
      const cached = await this.loadResource(id);
      if (cached !== null) {
        Logger.debug(Logger.MODULES.CACHE, `Cache hit: ${id}`);
        return cached;
      }
    }

    // Fetch from network
    Logger.debug(Logger.MODULES.CACHE, `Fetching: ${id} from ${url}`);
    const data = await this.fetchResource(url, type);
    
    // Cache the result (skip very large files)
    const dataSize = typeof data === 'string' ? data.length : JSON.stringify(data).length;
    if (dataSize < 10000000) { // 10MB limit
      await this.saveResource(id, url, data, type);
    }
    
    return data;
  }

  /**
   * Preload all critical resources
   */
  async preloadCriticalResources(onProgress) {
    const criticalResources = [];
    
    Object.entries(RESOURCE_MANIFEST).forEach(([type, resources]) => {
      resources.forEach(resource => {
        if (resource.critical) {
          criticalResources.push({ ...resource, type });
        }
      });
    });

    let loaded = 0;
    const total = criticalResources.length;

    for (const resource of criticalResources) {
      try {
        await this.loadWithCache(resource.id, resource.url, resource.type === 'fonts' ? 'blob' : resource.type);
        loaded++;
        if (typeof onProgress === 'function') {
          onProgress({ loaded, total, current: resource.id });
        }
      } catch (error) {
        Logger.warn(Logger.MODULES.CACHE, `Failed to preload ${resource.id}`, error);
      }
    }

    return { loaded, total };
  }

  /**
   * Preload all resources (for manual cache refresh)
   * @param {Function} onProgress - Progress callback
   * @param {Object} options - Options: { includePageFonts: boolean }
   */
  async preloadAllResources(onProgress, options = {}) {
    const { includePageFonts = true } = options;
    const allResources = [];
    
    // Add base resources from manifest
    Object.entries(RESOURCE_MANIFEST).forEach(([type, resources]) => {
      resources.forEach(resource => {
        allResources.push({ ...resource, type });
      });
    });

    // Add page fonts if requested (for full offline support)
    if (includePageFonts) {
      allResources.push(...generatePageFonts());
      allResources.push(...generateTajweedFonts());
    }

    let loaded = 0;
    let failed = 0;
    const total = allResources.length;
    const errors = [];

    // Process resources in batches for better performance
    const batchSize = 10;
    for (let i = 0; i < allResources.length; i += batchSize) {
      const batch = allResources.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (resource) => {
        try {
          // For page fonts, use Service Worker cache directly (more efficient)
          if (resource.isPageFont || resource.isTajweedFont) {
            await this.cacheViaServiceWorker(resource.url);
          } else {
            const resourceType = resource.type === 'fonts' ? 'blob' : 
                                (resource.type === 'json' ? 'json' : 'text');
            await this.loadWithCache(resource.id, resource.url, resourceType, true);
          }
          loaded++;
        } catch (error) {
          failed++;
          errors.push({ id: resource.id, error: error.message });
          // Only log non-font failures (fonts will fall back gracefully)
          if (!resource.isPageFont && !resource.isTajweedFont) {
            Logger.warn(Logger.MODULES.CACHE, `Failed to preload ${resource.id}`, error);
          }
        }
        
        if (typeof onProgress === 'function') {
          onProgress({ loaded, failed, total, current: resource.id || resource.url });
        }
      }));
    }

    // Update cache version after full refresh
    await this.setCacheVersion(CACHE_VERSION);
    this.cacheStats.lastUpdated = new Date().toISOString();

    return { loaded, failed, total, errors };
  }

  /**
   * Cache a resource via Service Worker (for fonts)
   * Caches fonts with multiple URL formats for reliable offline matching
   */
  async cacheViaServiceWorker(url) {
    // Use Cache API directly if available
    if ('caches' in window) {
      const cache = await caches.open(FONTS_CACHE_NAME);
      // Resolve relative URL to absolute for consistent caching
      const absoluteUrl = new URL(url, window.location.href).href;
      const response = await fetch(absoluteUrl);
      if (response.ok) {
        // Cache with multiple URL formats for flexible matching
        // 1. Absolute URL
        await cache.put(absoluteUrl, response.clone());
        
        // 2. URL without query string
        const urlWithoutQuery = absoluteUrl.split('?')[0];
        await cache.put(urlWithoutQuery, response.clone());
        
        // 3. Pathname only
        const urlObj = new URL(absoluteUrl);
        await cache.put(urlObj.pathname, response.clone());
        
        return true;
      }
      throw new Error(`Failed to fetch ${url}`);
    }
    // Fallback: just fetch to let SW handle caching
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}`);
    }
    return true;
  }

  /**
   * Get list of cached resources
   */
  async getCachedResourcesList() {
    if (!this.db?.db) return [];
    
    try {
      const tx = this.db.db.transaction(['resourceCache'], 'readonly');
      const store = tx.objectStore('resourceCache');
      
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const records = request.result || [];
          resolve(records.map(r => ({
            id: r.id,
            type: r.type,
            cachedAt: r.cachedAt,
            size: r.data ? (typeof r.data === 'string' ? r.data.length : JSON.stringify(r.data).length) : 0
          })));
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      Logger.warn(Logger.MODULES.CACHE, 'Failed to get cached resources list', error);
      return [];
    }
  }
}

// Singleton instance (will be initialized with DB reference)
let resourceCacheInstance = null;

export const initResourceCache = (db) => {
  resourceCacheInstance = new ResourceCache(db);
  return resourceCacheInstance;
};

export const getResourceCache = () => resourceCacheInstance;

export default ResourceCache;
