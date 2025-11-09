/**
 * Achievement Grid Component
 * Displays all 100 badges in a responsive grid layout
 */

const { ref, computed } = Vue;
import { achievementStore } from '../stores/achievementStore.js';
import { generateBadgeSVG, generateLockedBadgeSVG, getRarityColorScheme } from '../utils/badgeSVGGenerator.js';

export default {
  emits: ['badge-selected'],
  template: `
    <div class="achievement-grid-container w-full max-h-[80vh] overflow-y-auto bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 rounded-lg">
      <!-- Filter/Sort Controls -->
      <div class="sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border-b dark:border-gray-700 p-3 sm:p-4 z-10 shadow-sm">
        <div class="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-center justify-between">
          <!-- Category Filters -->
          <div class="flex gap-2 flex-wrap w-full sm:w-auto">
            <button 
              v-for="category in categoryOptions"
              :key="category"
              @click="selectCategory(category)"
              :class="[
                'px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium transition-all duration-200',
                'hover:scale-105 active:scale-95',
                (!selectedCategory && category === 'All') || selectedCategory === category
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md scale-105'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              ]"
            >
              {{ category }}
            </button>
          </div>
          
          <!-- Sort Controls -->
          <div class="flex gap-2 items-center w-full sm:w-auto">
            <span class="text-xs font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">
              {{ filteredBadges.length }}/{{ totalBadges }}
            </span>
            <select 
              :value="sortBy"
              @change="(e) => setSortBy(e.target.value)"
              class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 
                     rounded border dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500
                     transition-all"
            >
              <option value="id">Sort: ID</option>
              <option value="rarity">Sort: Rarity</option>
              <option value="unlocked">Sort: Status</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Badge Grid -->
      <div class="grid gap-2 sm:gap-3 p-3 sm:p-4 transition-all duration-300" :class="gridColsClass">
        <div 
          v-for="badge in filteredBadges"
          :key="badge.id"
          @click="selectBadge(badge)"
          class="badge-grid-item cursor-pointer transition-all duration-200 
                 hover:scale-110 hover:z-10 group relative
                 transform active:scale-95"
          :class="[
            badge.unlocked ? 'opacity-100' : 'opacity-70 hover:opacity-90',
            selectedBadge?.id === badge.id ? 'ring-2 ring-offset-2 ring-amber-500 scale-110' : ''
          ]"
        >
          <!-- Badge SVG Container -->
          <div class="relative w-full aspect-square rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-200">
            <div 
              v-if="badge.unlocked"
              class="w-full h-full"
              :style="getBadgeShadow(badge.rarity)"
              v-html="generateBadgeSVG(badge.id, badge.rarity, badge.name, badge.category)"
            ></div>
            <div 
              v-else
              class="w-full h-full bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700
                     flex items-center justify-center relative overflow-hidden"
            >
              <!-- Locked badge pattern -->
              <div class="absolute inset-0 opacity-20" v-html="generateLockedBadgeSVG()"></div>
              <svg class="w-8 h-8 sm:w-10 sm:h-10 text-gray-700 dark:text-gray-300 relative z-10" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/>
              </svg>
            </div>
            
            <!-- Status Indicator -->
            <div v-if="badge.unlocked" class="absolute top-1 left-1 z-20">
              <svg class="w-4 h-4 sm:w-5 sm:h-5 text-green-500 drop-shadow-lg" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
              </svg>
            </div>

            <!-- Unlock Hint Tooltip (for locked badges) -->
            <div v-if="!badge.unlocked && badge.backstory"
                 class="absolute -top-10 sm:-top-12 left-1/2 transform -translate-x-1/2 
                        bg-gray-900 text-white text-xs py-1 px-2 rounded whitespace-nowrap 
                        opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50
                        max-w-xs text-center">
              {{ getHintText(badge) }}
              <div class="absolute top-full left-1/2 transform -translate-x-1/2 
                         border-4 border-transparent border-t-gray-900"></div>
            </div>
            
            <!-- Badge ID/Number -->
            <div class="absolute top-1 right-1 bg-black/60 text-white text-xs font-bold 
                       px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-20">
              #{{ badge.id }}
            </div>
            
            <!-- Rarity Label Badge -->
            <div class="absolute -bottom-2 -right-2 px-1.5 sm:px-2 py-0.5 rounded-full text-xs font-bold 
                        text-white opacity-0 group-hover:opacity-100 transition-opacity z-20
                        text-shadow"
                 :style="{ backgroundColor: getRarityColorScheme(badge.rarity).border }">
              {{ badge.rarity }}
            </div>
          </div>
          
          <!-- Badge Name (shortened for grid) -->
          <div class="text-center mt-1 px-0.5">
            <p class="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate line-clamp-2 leading-tight">
              {{ badge.name }}
            </p>
            <p v-if="badge.unlocked" class="text-xs text-green-600 dark:text-green-400 font-medium">
              ✓ Unlocked
            </p>
            <p v-else class="text-xs text-gray-500 dark:text-gray-400">
              🔒 Locked
            </p>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="filteredBadges.length === 0" class="flex flex-col items-center justify-center py-12 px-4">
        <svg class="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p class="text-gray-500 dark:text-gray-400 text-sm text-center">No badges match this filter</p>
      </div>
    </div>
  `,

  setup(_, { emit }) {
    const selectedCategory = ref(null);
    const selectedBadge = ref(null);
    const sortBy = ref('id');
    // Responsive grid: Mobile (3 cols) → Tablet (5 cols) → Desktop (10 cols)
    const gridColsClass = 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-10';
    const totalBadges = computed(() => achievementStore.badgesList.length || 0);

    const categoryOptions = computed(() => {
      const categories = new Set(achievementStore.badgesList.map(badge => badge.category));
      return ['All', ...Array.from(categories).sort((a, b) => a.localeCompare(b))];
    });

    const selectCategory = (category) => {
      selectedCategory.value = category === 'All' ? null : category;
    };

    const setSortBy = (value) => {
      sortBy.value = value;
    };

    const filteredBadges = computed(() => {
      let badges = achievementStore.badgesList.map(badge => ({
        ...badge,
        unlocked: achievementStore.unlockedBadges.has(badge.id)
      }));

      // Filter by category
      if (selectedCategory.value) {
        badges = badges.filter(b => b.category === selectedCategory.value);
      }

      // Sort
      if (sortBy.value === 'rarity') {
        const rarityOrder = { 'common': 1, 'uncommon': 2, 'rare': 3, 'legendary': 4 };
        badges.sort((a, b) => rarityOrder[b.rarity] - rarityOrder[a.rarity]);
      } else if (sortBy.value === 'unlocked') {
        badges.sort((a, b) => {
          const aUnlocked = achievementStore.unlockedBadges.has(a.id) ? 1 : 0;
          const bUnlocked = achievementStore.unlockedBadges.has(b.id) ? 1 : 0;
          return bUnlocked - aUnlocked;
        });
      } else {
        badges.sort((a, b) => a.id - b.id);
      }

      return badges;
    });

    const selectBadge = (badge) => {
      selectedBadge.value = badge;
      emit('badge-selected', {
        badge,
        isUnlocked: achievementStore.unlockedBadges.has(badge.id)
      });
    };

    const getBadgeShadow = (rarity) => {
      const colorScheme = getRarityColorScheme(rarity);
      if (rarity === 'legendary') {
        return {
          boxShadow: `0 0 20px ${colorScheme.border}, 0 0 40px rgba(139, 92, 246, 0.4)`,
          borderRadius: '0.5rem'
        };
      } else if (rarity === 'rare') {
        return {
          boxShadow: `0 0 15px ${colorScheme.border}, 0 0 30px rgba(16, 185, 129, 0.3)`,
          borderRadius: '0.5rem'
        };
      } else if (rarity === 'uncommon') {
        return {
          boxShadow: `0 0 10px ${colorScheme.border}`,
          borderRadius: '0.5rem'
        };
      }
      return { borderRadius: '0.5rem' };
    };

    const shouldShowHint = (badge) => {
      return badge.backstory && badge.backstory.length > 0;
    };

    const getHintText = (badge) => {
      if (!badge.backstory) return 'Hidden Badge';
      // Extract first sentence or truncate
      const hint = badge.backstory.split('.')[0];
      return hint.length > 50 ? hint.substring(0, 47) + '...' : hint;
    };

    return {
      achievementStore,
      selectedCategory,
      selectedBadge,
      sortBy,
      filteredBadges,
      selectBadge,
      selectCategory,
      setSortBy,
      categoryOptions,
      getBadgeShadow,
      shouldShowHint,
      getHintText,
      gridColsClass,
      totalBadges,
      generateBadgeSVG,
      generateLockedBadgeSVG,
      getRarityColorScheme
    };
  }
};
