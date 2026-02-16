/**
 * Achievement Navbar Icon Component
 * Displays trophy icon with badge count and percentage in the navbar
 */

import Logger from '../utils/logger.js';

// Use global Vue instance (already loaded in index.html) to ensure single reactivity system
const { computed } = Vue;
import { achievementStore } from '../stores/achievementStore.js';

export default {
  template: `
    <button 
      @click="openAchievementsModal"
      class="achievement-navbar-btn relative group"
      title="Achievements"
      aria-label="Open achievements"
    >
      <!-- Trophy Icon -->
      <svg class="w-6 h-6 text-amber-600 group-hover:text-amber-700 transition-colors" 
           fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C11.5 2 11 2.19 10.59 2.59L8 5.18V4C8 3.45 7.55 3 7 3C6.45 3 6 3.45 6 4V7C6 7.55 6.45 8 7 8H10C10.55 8 11 7.55 11 7C11 6.45 10.55 6 10 6H9.41L12 3.41L14.59 6H14C13.45 6 13 6.45 13 7C13 7.55 13.45 8 14 8H17C17.55 8 18 7.55 18 7V4C18 3.45 17.55 3 17 3C16.45 3 16 3.45 16 4V5.18L13.41 2.59C13 2.19 12.5 2 12 2M7 9C5.9 9 5 9.9 5 11V15C5 16.1 5.9 17 7 17H17C18.1 17 19 16.1 19 15V11C19 9.9 18.1 9 17 9H16V10C16 11.1 15.1 12 14 12C12.9 12 12 11.1 12 10V9H12V10C12 11.1 11.1 12 10 12C8.9 12 8 11.1 8 10V9H7M12 18C11.4 18 11 18.45 11 19V21H13V19C13 18.45 12.6 18 12 18Z"/>
      </svg>
      
      <!-- Badge Counter Badge -->
      <span class="absolute top-0 right-0 flex items-center justify-center min-w-[24px] h-6 px-1.5 
                   bg-gradient-to-br from-amber-500 to-orange-600 text-white text-xs font-bold 
                   rounded-full shadow-lg ring-1 ring-amber-300">
        {{ totalUnlocked }}/100
      </span>
      
      <!-- Completion Percentage Progress Ring (optional visual) -->
      <div class="absolute inset-0 pointer-events-none">
        <svg class="w-6 h-6" viewBox="0 0 24 24" style="opacity: 0.1">
          <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
          <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="1.5" 
                  stroke-dasharray="69.1" 
                  :stroke-dashoffset="69.1 - (69.1 * completionPercentage / 100)"
                  transform="rotate(-90 12 12)"
                  stroke-linecap="round"
                  style="transition: stroke-dashoffset 0.3s ease-out"
                  opacity="0.5"/>
        </svg>
      </div>
      
      <!-- Hover Tooltip -->
      <div class="absolute bottom-full right-0 mb-2 bg-gray-900 text-white text-xs py-2 px-3 
                  rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 
                  transition-opacity duration-200 z-40">
  {{ completionPercentage }}% Complete
        <div class="absolute top-full right-3 border-4 border-transparent border-t-gray-900"></div>
      </div>
    </button>
  `,
  
  setup() {
    const openAchievementsModal = () => {
      // Dispatch custom event to trigger modal opening
      // This will be listened to by the main app
      const event = new CustomEvent('open-achievements-modal', {
        detail: { achievements: achievementStore },
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(event);
      
      // Also log for debugging
      Logger.log('[Murajah] Opening achievements modal', {
        totalUnlocked: achievementStore.totalUnlocked,
        completionPercentage: achievementStore.completionPercentage
      });
    };

    // Compute total unlocked from unlockedBadgesArray for proper Vue reactivity
    const totalUnlocked = computed(() => {
      // Direct primitive dependency
      const val = achievementStore.totalUnlocked;
      Logger.log('[Murajah] Navbar totalUnlocked recomputed primitive value:', val);
      return val;
    });

    // Compute completion percentage
    const completionPercentage = computed(() => achievementStore.completionPercentage);

    return {
      achievementStore,
      totalUnlocked,
      completionPercentage,
      openAchievementsModal
    };
  }
};
