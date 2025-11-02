/**
 * Score Formatter Utilities
 * Converts large numerical scores into human-readable formats (100K, 1M, 1B, 1T, etc)
 */

/**
 * Format a large number into human-readable format
 * Examples: 1000 -> "1K", 1000000 -> "1M", 1500000 -> "1.5M"
 * 
 * @param {number} num - The number to format
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted number string
 */
export const formatScore = (num, decimals = 1) => {
  if (num === null || num === undefined || isNaN(num)) {
    return '0';
  }

  const absNum = Math.abs(num);
  
  // Define thresholds and suffixes
  const tiers = [
    { threshold: 1e12, suffix: 'T' },  // Trillion
    { threshold: 1e9, suffix: 'B' },   // Billion
    { threshold: 1e6, suffix: 'M' },   // Million
    { threshold: 1e3, suffix: 'K' }    // Thousand
  ];

  for (const tier of tiers) {
    if (absNum >= tier.threshold) {
      const scaled = num / tier.threshold;
      const sign = num < 0 ? '-' : '';
      
      // Round to specified decimals
      const rounded = Math.round(scaled * Math.pow(10, decimals)) / Math.pow(10, decimals);
      
      // Remove unnecessary trailing zeros
      return sign + rounded.toFixed(decimals).replace(/\.?0+$/, '') + tier.suffix;
    }
  }

  // For numbers less than 1000, return as is
  return num.toString();
};

/**
 * Format score with full details (shows both formatted and exact)
 * Example: "1.5M (1,500,000)"
 * 
 * @param {number} num - The number to format
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted string with details
 */
export const formatScoreDetailed = (num, decimals = 1) => {
  if (num === null || num === undefined || isNaN(num)) {
    return '0';
  }

  const formatted = formatScore(num, decimals);
  const exact = Math.floor(num).toLocaleString();
  
  // If formatted version is not significantly different from exact, just return formatted
  if (formatted === num.toString()) {
    return exact;
  }
  
  return `${formatted} (${exact})`;
};

/**
 * Get color class based on score magnitude
 * Useful for styling score displays
 * 
 * @param {number} num - The score value
 * @returns {string} Tailwind color class
 */
export const getScoreMagnitudeColor = (num) => {
  if (num === 0) return 'text-gray-400';
  if (num < 1000) return 'text-gray-600';
  if (num < 1000000) return 'text-blue-500';        // K
  if (num < 1000000000) return 'text-green-500';    // M
  if (num < 1000000000000) return 'text-purple-500'; // B
  return 'text-yellow-500';                          // T+
};

/**
 * Get background color class based on score magnitude
 * Useful for badges or highlights
 * 
 * @param {number} num - The score value
 * @returns {string} Tailwind background color class
 */
export const getScoreMagnitudeBgColor = (num) => {
  if (num === 0) return 'bg-gray-100 text-gray-700';
  if (num < 1000) return 'bg-gray-100 text-gray-700';
  if (num < 1000000) return 'bg-blue-100 text-blue-700';        // K
  if (num < 1000000000) return 'bg-green-100 text-green-700';    // M
  if (num < 1000000000000) return 'bg-purple-100 text-purple-700'; // B
  return 'bg-yellow-100 text-yellow-700';                         // T+
};

/**
 * Calculate percentage of target score
 * Useful for progress bars
 * 
 * @param {number} current - Current score
 * @param {number} target - Target score
 * @returns {number} Percentage (0-100)
 */
export const calculateScoreProgress = (current, target) => {
  if (target === 0 || target === null) return 0;
  return Math.min(100, Math.round((current / target) * 100));
};

/**
 * Format score with a label
 * Example: "Score: 1.5M"
 * 
 * @param {number} num - The score value
 * @param {string} label - Label prefix (default: 'Score')
 * @returns {string} Formatted label with score
 */
export const formatScoreWithLabel = (num, label = 'Score') => {
  return `${label}: ${formatScore(num)}`;
};

/**
 * Parse a formatted score back to a number (reverse operation)
 * Example: "1.5M" -> 1500000
 * 
 * @param {string} formatted - Formatted score string
 * @returns {number} Parsed number or 0 if invalid
 */
export const parseFormattedScore = (formatted) => {
  if (!formatted || typeof formatted !== 'string') return 0;
  
  const trimmed = formatted.toUpperCase().trim();
  
  // Define multipliers
  const multipliers = {
    'T': 1e12,
    'B': 1e9,
    'M': 1e6,
    'K': 1e3
  };

  for (const [suffix, multiplier] of Object.entries(multipliers)) {
    if (trimmed.endsWith(suffix)) {
      const numPart = parseFloat(trimmed.slice(0, -1));
      return isNaN(numPart) ? 0 : Math.round(numPart * multiplier);
    }
  }

  // Try parsing as regular number
  const num = parseFloat(trimmed);
  return isNaN(num) ? 0 : num;
};

export default {
  formatScore,
  formatScoreDetailed,
  getScoreMagnitudeColor,
  getScoreMagnitudeBgColor,
  calculateScoreProgress,
  formatScoreWithLabel,
  parseFormattedScore
};
