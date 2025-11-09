/**
 * Achievement Store
 * Manages all badge/achievement state and operations
 */

const { reactive, computed } = Vue;

export const achievementStore = reactive({
  unlockedBadges: new Set(),        // Set<badgeId>
  badgesData: new Map(),             // Map<badgeId, badgeObject> - cached badge definitions
  badgesList: [],                   // Array of badge definitions for easy iteration
  lastUnlockedBadgeId: null,         // Last unlocked badge ID (for celebration animation)
  lastUnlockedTime: null,            // Timestamp of last unlock
  totalUnlocked: 0,                  // Count of unlocked badges - REACTIVE TRIGGER
  completionPercentage: 0,           // 0-100% - REACTIVE TRIGGER
  lastUpdated: null
});

/**
 * Load all badge definitions from badges.json
 */
export const loadBadgesData = async () => {
  try {
    const response = await fetch('./resources/data/badges.json');
    const data = await response.json();
    
    // Reset existing data structures
    achievementStore.badgesData = new Map();
    achievementStore.badgesList = Array.isArray(data.badges) ? data.badges : [];
    
    // Populate lookup map for fast access
    achievementStore.badgesList.forEach(badge => {
      achievementStore.badgesData.set(badge.id, badge);
    });
    
    console.log(`[Murajah] Loaded ${achievementStore.badgesList.length} badge definitions`);
    return achievementStore.badgesList;
  } catch (error) {
    console.error('[Murajah] Failed to load badges.json:', error);
    return [];
  }
};

/**
 * Get badge definition by ID
 */
export const getBadgeData = (badgeId) => {
  return achievementStore.badgesData.get(badgeId);
};

/**
 * Load unlocked badges from IndexedDB
 */
export const loadUnlockedBadges = async (murajahDB) => {
  try {
    console.log('[Murajah] loadUnlockedBadges: Starting...');
    const data = await murajahDB.loadData();
    console.log('[Murajah] loadUnlockedBadges: Loaded data from DB:', data);
    
    if (data && data.unlockedBadges && Array.isArray(data.unlockedBadges)) {
      console.log('[Murajah] loadUnlockedBadges: Found unlockedBadges array:', data.unlockedBadges);
      // Clear existing set and add items (preserves reactivity)
      achievementStore.unlockedBadges.clear();
      console.log('[Murajah] loadUnlockedBadges: Cleared existing set');
      
      data.unlockedBadges.forEach(badgeId => {
        achievementStore.unlockedBadges.add(badgeId);
      });
      console.log('[Murajah] loadUnlockedBadges: Added all badges, set size:', achievementStore.unlockedBadges.size);
      
      // Update reactive properties to trigger Vue reactivity
      achievementStore.totalUnlocked = achievementStore.unlockedBadges.size;
      achievementStore.completionPercentage = Math.round((achievementStore.totalUnlocked / 100) * 100);
      
  // lastUpdated acts as an additional reactive ping
  achievementStore.lastUpdated = Date.now();
      console.log('[Murajah] Updated unlockedBadgesArray in-place:', achievementStore.unlockedBadgesArray);
      
      console.log(`[Murajah] Loaded ${achievementStore.totalUnlocked} unlocked badges, store state:`, {
        size: achievementStore.unlockedBadges.size,
        totalUnlocked: achievementStore.totalUnlocked,
        completionPercentage: achievementStore.completionPercentage,
        setContents: Array.from(achievementStore.unlockedBadges),
        arrayLength: achievementStore.unlockedBadgesArray.length
      });
    } else {
      console.log('[Murajah] loadUnlockedBadges: No unlockedBadges data found', {
        hasData: !!data,
        hasUnlockedBadges: data?.unlockedBadges,
        isArray: Array.isArray(data?.unlockedBadges)
      });
    }
  } catch (error) {
    console.error('[Murajah] Failed to load unlocked badges:', error);
  }
};

/**
 * Save unlocked badges to IndexedDB
 */
export const saveUnlockedBadges = async (murajahDB) => {
  try {
    const data = await murajahDB.loadData() || {};
    data.unlockedBadges = Array.from(achievementStore.unlockedBadges);
    await murajahDB.saveData(data);
    console.log(`[Murajah] Saved ${achievementStore.unlockedBadges.size} unlocked badges`);
  } catch (error) {
    console.error('[Murajah] Failed to save unlocked badges:', error);
  }
};

/**
 * Unlock a single badge
 * Returns true if badge was newly unlocked, false if already unlocked
 */
export const unlockBadge = (badgeId) => {
  if (achievementStore.unlockedBadges.has(badgeId)) {
    return false; // Already unlocked
  }
  
  achievementStore.unlockedBadges.add(badgeId);
  achievementStore.lastUnlockedBadgeId = badgeId;
  achievementStore.lastUnlockedTime = new Date().toISOString();
  achievementStore.totalUnlocked = achievementStore.unlockedBadges.size;
  achievementStore.completionPercentage = Math.round((achievementStore.totalUnlocked / 100) * 100);
  achievementStore.lastUpdated = Date.now();
  
  console.log(`[Murajah] Badge unlocked: ${badgeId} (${achievementStore.totalUnlocked}/100)`);
  return true;
};

/**
 * Unlock multiple badges at once
 * Returns array of newly unlocked badge IDs
 */
export const unlockBadges = (badgeIds) => {
  const newlyUnlocked = [];
  
  for (const badgeId of badgeIds) {
    if (!achievementStore.unlockedBadges.has(badgeId)) {
      achievementStore.unlockedBadges.add(badgeId);
      newlyUnlocked.push(badgeId);
    }
  }
  
  if (newlyUnlocked.length > 0) {
    achievementStore.lastUnlockedBadgeId = newlyUnlocked[newlyUnlocked.length - 1];
    achievementStore.lastUnlockedTime = new Date().toISOString();
    achievementStore.totalUnlocked = achievementStore.unlockedBadges.size;
    achievementStore.completionPercentage = Math.round((achievementStore.totalUnlocked / 100) * 100);
  achievementStore.lastUpdated = Date.now();
    
    console.log(`[Murajah] ${newlyUnlocked.length} badges unlocked:`, newlyUnlocked);
  }
  
  return newlyUnlocked;
};

/**
 * Check if a badge is unlocked
 */
export const isBadgeUnlocked = (badgeId) => {
  return achievementStore.unlockedBadges.has(badgeId);
};

/**
 * Get all unlocked badges (as array of badge objects with data)
 */
export const getUnlockedBadgesWithData = () => {
  const badgesWithData = [];
  for (const badgeId of achievementStore.unlockedBadges) {
    const badgeData = getBadgeData(badgeId);
    if (badgeData) {
      badgesWithData.push(badgeData);
    }
  }
  return badgesWithData.sort((a, b) => a.id - b.id);
};

/**
 * Get all badge data (unlocked and locked)
 */
export const getAllBadges = () => {
  const allBadges = [];
  for (let i = 1; i <= 100; i++) {
    const badgeData = getBadgeData(i);
    if (badgeData) {
      allBadges.push({
        ...badgeData,
        unlocked: achievementStore.unlockedBadges.has(i)
      });
    }
  }
  return allBadges;
};

/**
 * Clear all unlocked badges (debug/reset)
 */
export const clearAllBadges = () => {
  achievementStore.unlockedBadges.clear();
  achievementStore.totalUnlocked = 0;
  achievementStore.completionPercentage = 0;
  achievementStore.lastUnlockedBadgeId = null;
  achievementStore.lastUnlockedTime = null;
  console.log('[Murajah] All badges cleared');
};

/**
 * Unlock all badges (debug only)
 */
export const unlockAllBadges = () => {
  for (let i = 1; i <= 100; i++) {
    achievementStore.unlockedBadges.add(i);
  }
  achievementStore.totalUnlocked = 100;
  achievementStore.completionPercentage = 100;
  console.log('[Murajah] All badges unlocked (debug)');
};

/**
 * Get badges by category
 */
export const getBadgesByCategory = (category) => {
  const badges = [];
  for (const badgeData of achievementStore.badgesData.values()) {
    if (badgeData.category === category) {
      badges.push({
        ...badgeData,
        unlocked: achievementStore.unlockedBadges.has(badgeData.id)
      });
    }
  }
  return badges.sort((a, b) => a.id - b.id);
};

/**
 * Get badges by rarity
 */
export const getBadgesByRarity = (rarity) => {
  const badges = [];
  for (const badgeData of achievementStore.badgesData.values()) {
    if (badgeData.rarity === rarity) {
      badges.push({
        ...badgeData,
        unlocked: achievementStore.unlockedBadges.has(badgeData.id)
      });
    }
  }
  return badges.sort((a, b) => a.id - b.id);
};

/**
 * Get rarity border color
 */
export const getRarityBorderColor = (rarity) => {
  const colors = {
    'common': '#9CA3AF',       // Gray
    'uncommon': '#3B82F6',     // Blue
    'rare': '#10B981',         // Green
    'legendary': '#8B5CF6'     // Purple
  };
  return colors[rarity] || '#9CA3AF';
};

/**
 * Get rarity glow effect
 */
export const getRarityGlowClass = (rarity) => {
  const glowMap = {
    'common': '',
    'uncommon': 'shadow-md',
    'rare': 'shadow-lg shadow-green-400',
    'legendary': 'shadow-2xl shadow-purple-500'
  };
  return glowMap[rarity] || '';
};

/**
 * Computed: Get random unlocked badge (for display)
 */
export const getRandomUnlockedBadge = () => {
  if (achievementStore.unlockedBadges.size === 0) return null;
  const badgeIds = Array.from(achievementStore.unlockedBadges);
  const randomId = badgeIds[Math.floor(Math.random() * badgeIds.length)];
  return getBadgeData(randomId);
};

/**
 * Computed: Get recent unlocks (last 5)
 */
export const getRecentUnlocks = () => {
  // Note: This would need to track unlock times in IndexedDB for full functionality
  // For now, return the last unlocked badge if available
  if (achievementStore.lastUnlockedBadgeId) {
    return [getBadgeData(achievementStore.lastUnlockedBadgeId)];
  }
  return [];
};
