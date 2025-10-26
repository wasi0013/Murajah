/**
 * Centralized Logger Utility
 * Provides consistent, formatted logging with severity levels and module context
 */

const LOG_LEVELS = {
  DEBUG: { level: 0, prefix: '🔧', name: 'DEBUG' },
  INFO: { level: 1, prefix: 'ℹ️', name: 'INFO' },
  WARN: { level: 2, prefix: '⚠️', name: 'WARN' },
  ERROR: { level: 3, prefix: '❌', name: 'ERROR' }
};

const MODULES = {
  CORE: 'CORE',
  DATA: 'DATA',
  AUDIO: 'AUDIO',
  DAILY_GOALS: 'GOALS',
  UI: 'UI',
  PERFORMANCE: 'PERF',
  DB: 'DB'
};

let enabledLevels = new Set([LOG_LEVELS.INFO.name, LOG_LEVELS.WARN.name, LOG_LEVELS.ERROR.name]);

export const Logger = {
  /**
   * Set minimum log level (DEBUG, INFO, WARN, ERROR)
   */
  setLevel(levelName) {
    const level = Object.entries(LOG_LEVELS).find(([_, v]) => v.name === levelName);
    if (!level) return;
    
    const minLevel = LOG_LEVELS[level[0]].level;
    enabledLevels.clear();
    Object.entries(LOG_LEVELS)
      .filter(([_, v]) => v.level >= minLevel)
      .forEach(([key]) => enabledLevels.add(key));
  },

  /**
   * Format and output log message
   */
  _log(levelKey, module, message, data) {
    if (!enabledLevels.has(levelKey)) return;

    const level = LOG_LEVELS[levelKey];
    const timestamp = new Date().toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
    
    const logPrefix = `${level.prefix} [${timestamp}] [${module}]`;
    
    if (data !== undefined) {
      console[levelKey.toLowerCase()](logPrefix, message, data);
    } else {
      console[levelKey.toLowerCase()](logPrefix, message);
    }
  },

  /**
   * Debug - Detailed diagnostic information (dev only)
   */
  debug(module, message, data) {
    this._log('DEBUG', module, message, data);
  },

  /**
   * Info - General informational messages (app flow)
   */
  info(module, message, data) {
    this._log('INFO', module, message, data);
  },

  /**
   * Warn - Warning messages (potential issues, degraded behavior)
   */
  warn(module, message, data) {
    this._log('WARN', module, message, data);
  },

  /**
   * Error - Error messages (exceptions, failed operations)
   */
  error(module, message, data) {
    this._log('ERROR', module, message, data);
  },

  /**
   * Performance - Log operation duration
   */
  perf(operation, durationMs, threshold = 100) {
    if (durationMs > threshold) {
      this.warn(MODULES.PERFORMANCE, `${operation} took ${durationMs.toFixed(2)}ms`, { 
        threshold: `${threshold}ms` 
      });
    } else {
      this.debug(MODULES.PERFORMANCE, `${operation} completed in ${durationMs.toFixed(2)}ms`);
    }
  },

  // Convenience shortcuts
  MODULES
};

export default Logger;
