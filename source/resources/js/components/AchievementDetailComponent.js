/**
 * Achievement Detail Component (Modal)
 * Displays detailed information about a selected badge
 */

import { generateBadgeSVG, generateLockedBadgeSVG, getRarityColorScheme } from '../utils/badgeSVGGenerator.js';
import ShareBadgeModal from './ShareBadgeModal.js';

export default {
  template: `
    <div v-if="badge" class="achievement-detail-modal fixed inset-0 bg-black/50 dark:bg-black/70 
                            flex items-center justify-center z-50 p-4 transition-opacity"
         @click.self="closeModal">
      <div class="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] 
                  overflow-y-auto shadow-2xl transform transition-all">
        
        <!-- Modal Header with Close Button -->
        <div class="sticky top-0 flex items-center justify-between p-6 border-b dark:border-gray-700 
                    bg-gradient-to-r from-amber-50 dark:from-gray-700 to-orange-50 dark:to-gray-700">
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ badge.name }}
          </h2>
          <button @click="closeModal" class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 
                                          transition-colors p-1">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Modal Content -->
        <div class="p-6 space-y-6">
          <!-- Badge Display Section -->
          <div class="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
            <!-- Badge SVG -->
            <div class="flex-shrink-0 w-40 h-40 mx-auto sm:mx-0">
              <div 
                v-if="isUnlocked"
                class="w-full h-full rounded-lg overflow-hidden transition-all"
                :style="getBadgeShadow(badge.rarity)"
                v-html="generateBadgeSVG(badge.id, badge.rarity, badge.name, badge.category, badge.ar)"
              ></div>
              <div 
                v-else
                class="w-full h-full rounded-lg overflow-hidden bg-gradient-to-br 
                       from-gray-300 to-gray-400 flex items-center justify-center"
                v-html="generateLockedBadgeSVG()"
              ></div>
            </div>

            <!-- Badge Info Panel -->
            <div class="flex-1 space-y-3">
              <!-- Status -->
              <div class="flex items-center gap-2">
                <span class="text-lg font-bold"
                      :class="isUnlocked ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'">
                  {{ isUnlocked ? '✓ UNLOCKED' : '🔒 LOCKED' }}
                </span>
              </div>

              <!-- Category Badge -->
              <div class="flex gap-2 flex-wrap">
                <span class="inline-block px-3 py-1 rounded-full text-sm font-semibold text-white"
                      :style="{ backgroundColor: getCategoryColor(badge.category) }">
                  {{ badge.category }}
                </span>
                <span class="inline-block px-3 py-1 rounded-full text-sm font-semibold text-white"
                      :style="{ backgroundColor: getRarityColorScheme(badge.rarity).border }">
                  {{ badge.rarity.toUpperCase() }}
                </span>
              </div>

              <!-- Quick Stats -->
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="bg-gray-100 dark:bg-gray-700 p-2 rounded">
                  <p class="text-gray-600 dark:text-gray-400 text-xs">Badge ID</p>
                  <p class="font-bold text-gray-900 dark:text-white">#{{ badge.id }}</p>
                </div>
                <div class="bg-gray-100 dark:bg-gray-700 p-2 rounded">
                  <p class="text-gray-600 dark:text-gray-400 text-xs">Category</p>
                  <p class="font-bold text-gray-900 dark:text-white">{{ badge.category }}</p>
                </div>
              </div>

              <!-- Unlock Time (if unlocked) -->
              <div v-if="isUnlocked && unlockedTime" class="text-xs text-gray-600 dark:text-gray-400 italic">
                Unlocked on {{ formatUnlockTime(unlockedTime) }}
              </div>
            </div>
          </div>

          <!-- Unlock Condition Section -->
          <div class="border-t dark:border-gray-700 pt-6 space-y-3">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">
              How to Unlock
            </h3>
            
            <div v-if="badge.unlockCondition" class="bg-gradient-to-br from-blue-50 dark:from-blue-900/30 
                                                    to-cyan-50 dark:to-cyan-900/30 rounded-lg p-4">
              <p class="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                {{ badge.unlockCondition.description }}
              </p>
              
              <!-- Condition Details -->
              <div class="text-xs text-gray-700 dark:text-gray-300 space-y-1">
                <p v-if="badge.unlockCondition.threshold">
                  <strong>Requirement:</strong> {{ getConditionDetails(badge.unlockCondition) }}
                </p>
                <p v-if="badge.unlockCondition.type">
                  <strong>Type:</strong> {{ formatConditionType(badge.unlockCondition.type) }}
                </p>
              </div>
            </div>
          </div>

          <!-- Backstory/Description Section -->
          <div class="border-t dark:border-gray-700 pt-6 space-y-3">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">
              Backstory
            </h3>
            
            <div v-if="badge.backstory" class="bg-gradient-to-br from-amber-50 dark:from-amber-900/30 
                                              to-orange-50 dark:to-orange-900/30 rounded-lg p-4">
              <p class="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                {{ badge.backstory }}
              </p>
            </div>
            <div v-else class="text-sm text-gray-500 dark:text-gray-400 italic">
              This badge's secret is yet to be discovered...
            </div>
          </div>

          <!-- Hadith Reference Section -->
          <div v-if="badge.hadithReference" class="border-t dark:border-gray-700 pt-6 space-y-3">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">
              Quranic Reference
            </h3>
            
            <div class="bg-gradient-to-br from-purple-50 dark:from-purple-900/30 
                        to-pink-50 dark:to-pink-900/30 rounded-lg p-4">
              <p class="text-sm text-gray-800 dark:text-gray-200 italic leading-relaxed">
                "{{ badge.hadithReference }}"
              </p>
            </div>
          </div>

          <!-- Action Buttons -->
          <div v-if="isUnlocked" class="border-t dark:border-gray-700 pt-6 flex gap-3">
            <button @click="shareBadge" class="flex-1 flex items-center justify-center gap-2 
                                            bg-gradient-to-r from-amber-500 to-orange-600 
                                            hover:from-amber-600 hover:to-orange-700 
                                            text-white font-bold py-2 px-4 rounded-lg 
                                            transition-all shadow-md hover:shadow-lg">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M15 8a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
              Share Achievement
            </button>
            
            <button @click="copyBadgeInfo" class="flex items-center justify-center gap-2 
                                             bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 
                                             dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 
                                             font-bold py-2 px-4 rounded-lg transition-all">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
              Copy
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Share Badge Modal -->
    <ShareBadgeModal v-if="showShareModal" :badge="badge" @close="showShareModal = false" />
  `,

  components: {
    ShareBadgeModal
  },

  props: {
    badge: {
      type: Object,
      default: null
    },
    isUnlocked: {
      type: Boolean,
      default: false
    }
  },

  emits: ['close', 'share'],

  setup(props, { emit }) {
    const { ref } = Vue;
    const showShareModal = ref(false);
    
    const closeModal = () => {
      emit('close');
    };

    const shareBadge = () => {
      showShareModal.value = true;
    };

    const copyBadgeInfo = () => {
      const text = `🏆 Achievement Unlocked: ${props.badge.name}\n\n${props.badge.backstory}\n\nCategory: ${props.badge.category}\nRarity: ${props.badge.rarity}`;
      navigator.clipboard.writeText(text).then(() => {
        console.log('[Murajah] Badge info copied to clipboard');
        // Show toast notification
        alert('Achievement copied to clipboard!');
      });
    };

    const getBadgeShadow = (rarity) => {
      const colorScheme = getRarityColorScheme(rarity);
      if (rarity === 'legendary') {
        return {
          boxShadow: `0 0 30px ${colorScheme.border}, 0 0 60px rgba(139, 92, 246, 0.5)`,
          borderRadius: '0.5rem'
        };
      } else if (rarity === 'rare') {
        return {
          boxShadow: `0 0 20px ${colorScheme.border}, 0 0 40px rgba(16, 185, 129, 0.4)`,
          borderRadius: '0.5rem'
        };
      } else if (rarity === 'uncommon') {
        return {
          boxShadow: `0 0 15px ${colorScheme.border}`,
          borderRadius: '0.5rem'
        };
      }
      return { borderRadius: '0.5rem' };
    };

    const getCategoryColor = (category) => {
      const colors = {
        'General': '#F59E0B',
        'Virtue': '#8B5CF6',
        'Performance': '#EC4899',
        'Special': '#06B6D4'
      };
      return colors[category] || '#6B7280';
    };

    const getConditionDetails = (condition) => {
      if (condition.threshold) {
        return `Achieve ${condition.threshold} or more`;
      }
      return condition.description;
    };

    const formatConditionType = (type) => {
      return type
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
    };

    const formatUnlockTime = (timestamp) => {
      if (!timestamp) return 'Recently';
      const date = new Date(timestamp);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    };

    const unlockedTime = props.isUnlocked ? new Date() : null;

    return {
      closeModal,
      shareBadge,
      copyBadgeInfo,
      getBadgeShadow,
      getCategoryColor,
      getConditionDetails,
      formatConditionType,
      formatUnlockTime,
      unlockedTime,
      generateBadgeSVG,
      generateLockedBadgeSVG,
      getRarityColorScheme,
      showShareModal
    };
  }
};
