/**
 * MorphologyPopupComponent
 * Displays word-by-word morphological analysis in a centered modal
 */

export default {
  name: 'MorphologyPopup',
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    word: {
      type: Object,
      default: null
    },
    morphology: {
      type: String,
      default: null
    },
    loading: {
      type: Boolean,
      default: false
    },
    error: {
      type: String,
      default: null
    },
    fontMode: {
      type: String,
      default: 'uthmani' // 'indopak', 'tajweed', 'uthmani'
    },
    currentPage: {
      type: Number,
      default: 1
    }
  },
  emits: ['close'],
  template: `
    <Teleport to="body">
      <Transition name="morphology-modal">
        <div 
          v-if="visible && word"
          class="morphology-modal-overlay"
          @click.self="$emit('close')"
          @keydown.escape="$emit('close')"
        >
          <div 
            class="morphology-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="morphology-title"
          >
            <!-- Header -->
            <div class="morphology-modal-header">
              <div class="morphology-word-info">
                <h2 id="morphology-title" class="morphology-title">Word Morphology</h2>
                <span class="morphology-word-ref">
                  Surah {{ word.surah }}, Ayah {{ word.ayah }}, Word {{ word.word }}
                </span>
              </div>
              <button 
                class="morphology-close-btn"
                @click="$emit('close')"
                aria-label="Close morphology modal"
              >
                <i class="fas fa-times"></i>
              </button>
            </div>

            <!-- Arabic Word Display -->
            <div class="morphology-word-display">
              <div 
                :class="arabicWordClass"
                :style="arabicWordStyle"
              >
                {{ word.text }}
              </div>
            </div>

            <!-- Content -->
            <div class="morphology-modal-content">
              <!-- Loading state -->
              <div v-if="loading" class="morphology-state morphology-loading">
                <i class="fas fa-spinner fa-spin fa-2x"></i>
                <span>Loading morphological analysis...</span>
              </div>

              <!-- Error state -->
              <div v-else-if="error" class="morphology-state morphology-error">
                <i class="fas fa-exclamation-circle fa-2x"></i>
                <span>{{ error }}</span>
              </div>

              <!-- Morphology content -->
              <div 
                v-else-if="morphology" 
                class="morphology-text"
                v-html="morphology"
              ></div>

              <!-- No data -->
              <div v-else class="morphology-state morphology-no-data">
                <i class="fas fa-info-circle fa-2x"></i>
                <span>No morphology data available for this word</span>
              </div>
            </div>

            <!-- Footer -->
            <div class="morphology-modal-footer">
              <button 
                class="morphology-done-btn"
                @click="$emit('close')"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  `,
  computed: {
    arabicWordClass() {
      const classes = ['morphology-arabic-word'];
      
      if (this.fontMode === 'indopak') {
        classes.push('font-indopak');
      } else if (this.fontMode === 'tajweed') {
        classes.push('font-tajweed');
      } else {
        classes.push('font-uthmani');
      }
      
      return classes;
    },
    arabicWordStyle() {
      // For QPC/Tajweed fonts, use the dynamically loaded font families
      // Note: The page font must be loaded via loadPageFont() before this modal is shown
      // TajweedPage and QPCPage are dynamically loaded @font-face definitions
      if (this.fontMode === 'tajweed') {
        return {
          fontFamily: "'TajweedPage', 'Traditional Arabic', 'Arial Unicode MS', serif"
        };
      } else if (this.fontMode === 'uthmani') {
        return {
          fontFamily: "'QPCPage', 'Traditional Arabic', 'Arial Unicode MS', serif"
        };
      }
      // Indopak uses CSS-defined font
      return {};
    }
  }
};
