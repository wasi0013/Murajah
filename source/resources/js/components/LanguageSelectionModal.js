const LanguageSelectionModal = {
  props: {
    isOpen: {
      type: Boolean,
      required: true
    },
    languages: {
      type: Array,
      required: true
    },
    currentLocale: {
      type: String,
      required: true
    }
  },
  emits: ['select', 'close'],
  template: `
    <div v-if="isOpen" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <!-- Header -->
        <div class="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-500 px-6 py-8 text-center">
          <i class="fas fa-globe text-white text-4xl mb-3"></i>
          <h2 class="text-2xl font-bold text-white">{{ $t('languageModal.title') || 'Select Your Language' }}</h2>
          <p class="text-blue-100 text-sm mt-2">{{ $t('languageModal.subtitle') || 'Choose your preferred language to get started' }}</p>
        </div>

        <!-- Language Options -->
        <div class="px-6 py-8 space-y-3">
          <button
            v-for="lang in languages"
            :key="lang"
            @click="selectLanguage(lang)"
            :class="[
              'w-full flex items-center justify-between px-4 py-4 rounded-lg border-2 transition-all font-medium text-left',
              currentLocale === lang
                ? 'border-blue-600 bg-blue-50 text-blue-900'
                : 'border-gray-200 bg-white text-gray-800 hover:border-blue-300 hover:bg-blue-50'
            ]"
          >
            <div class="flex items-center gap-3">
              <i class="fas fa-check-circle" :class="[currentLocale === lang ? 'text-blue-600' : 'text-gray-300']"></i>
              <span class="text-lg">{{ $t(getLanguageLabel(lang)) }}</span>
            </div>
            <span class="text-xs font-semibold px-2 py-1 rounded bg-gray-100 text-gray-600">{{ getLanguageCode(lang) }}</span>
          </button>
        </div>

        <!-- Footer -->
        <div class="bg-gray-50 px-6 py-4 border-t border-gray-200">
          <button
            @click="confirmSelection"
            :disabled="!currentLocale"
            class="w-full px-4 py-2.5 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <i class="fas fa-arrow-right"></i>
            {{ $t('languageModal.confirm') || 'Continue' }}
          </button>
        </div>
      </div>
    </div>
  `,
  setup(props, { emit }) {
    const selectLanguage = (lang) => {
      emit('select', lang);
    };

    const confirmSelection = () => {
      emit('close');
    };

    const getLanguageLabel = (locale) => {
      const labels = {
        'en': 'languages.english',
        'ar': 'languages.arabic',
        'bn': 'languages.bengali'
      };
      return labels[locale] || locale;
    };

    const getLanguageCode = (locale) => {
      const codes = {
        'en': 'EN',
        'ar': 'AR',
        'bn': 'BN'
      };
      return codes[locale] || locale.toUpperCase();
    };

    return {
      selectLanguage,
      confirmSelection,
      getLanguageLabel,
      getLanguageCode
    };
  }
};

export default LanguageSelectionModal;
