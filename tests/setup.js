/**
 * Global test setup for Vitest
 * This file runs before all tests
 */

import 'fake-indexeddb/auto';
import { beforeAll, afterEach, afterAll } from 'vitest';

// Mock localStorage
const localStorageMock = {
  store: {},
  getItem: function(key) {
    return this.store[key] || null;
  },
  setItem: function(key, value) {
    this.store[key] = String(value);
  },
  removeItem: function(key) {
    delete this.store[key];
  },
  clear: function() {
    this.store = {};
  }
};

// Mock sessionStorage
const sessionStorageMock = {
  store: {},
  getItem: function(key) {
    return this.store[key] || null;
  },
  setItem: function(key, value) {
    this.store[key] = String(value);
  },
  removeItem: function(key) {
    delete this.store[key];
  },
  clear: function() {
    this.store = {};
  }
};

// Vue CDN global mock — needed by i18nStore.js which uses `const { reactive } = Vue`
global.Vue = {
  reactive: (obj) => obj,
  ref: (val) => ({ value: val }),
  computed: (fn) => ({ value: fn() })
};

// Setup globals
beforeAll(() => {
  // Setup storage mocks
  global.localStorage = localStorageMock;
  global.sessionStorage = sessionStorageMock;
  
  // Mock URL and location
  global.URL = URL;
  
  // Mock console to reduce noise (but keep errors)
  global.console = {
    ...console,
    log: () => {},
    info: () => {},
    warn: () => {},
    // Keep error for debugging
    error: console.error
  };
});

// Reset state after each test
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  
  // Clear all IndexedDB databases
  if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
    // Note: fake-indexeddb handles cleanup automatically
  }
});

// Cleanup after all tests
afterAll(() => {
  // Any global cleanup
});

// Helper to wait for IndexedDB operations
global.waitForDB = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to create a fresh IndexedDB instance
global.createFreshDB = async (dbName = 'test-db') => {
  return new Promise((resolve, reject) => {
    const deleteRequest = indexedDB.deleteDatabase(dbName);
    deleteRequest.onsuccess = () => resolve();
    deleteRequest.onerror = () => reject(deleteRequest.error);
  });
};
