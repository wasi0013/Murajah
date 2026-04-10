/**
 * PlanSetupWizard Component
 * 3-step wizard: User Type → Scope → Pace
 * Creates a guided memorization/revision plan.
 */

export default {
  name: 'PlanSetupWizard',
  props: {
    memorizedPages: { type: Set, default: () => new Set() },
    t: { type: Function, required: true },
  },
  emits: ['plan-created', 'cancel'],
  template: `
    <div class="max-w-lg mx-auto">
      <!-- Progress Steps -->
      <div class="flex items-center justify-center mb-8 gap-2">
        <template v-for="s in 3" :key="s">
          <div class="flex items-center gap-2">
            <div :class="[
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
              step >= s ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
            ]">{{ s }}</div>
            <span :class="['text-sm font-medium hidden sm:inline', step >= s ? 'text-gray-900' : 'text-gray-400']">
              {{ s === 1 ? t('plan.setup.step1Title') : s === 2 ? t('plan.setup.step2Title') : t('plan.setup.step3Title') }}
            </span>
          </div>
          <div v-if="s < 3" :class="['w-8 h-0.5', step > s ? 'bg-blue-500' : 'bg-gray-200']"></div>
        </template>
      </div>

      <!-- Step 1: User Type -->
      <div v-if="step === 1" class="space-y-4">
        <h2 class="text-xl font-bold text-gray-900 text-center">{{ t('plan.setup.userTypeQuestion') }}</h2>
        <p class="text-sm text-gray-500 text-center">{{ t('plan.setup.userTypeHint') }}</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <button
            @click="form.type = 'beginner'; nextStep()"
            :class="['p-6 rounded-xl border-2 text-left transition-all hover:shadow-md',
              form.type === 'beginner' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300']"
          >
            <div class="text-2xl mb-2">🌱</div>
            <div class="font-semibold text-gray-900">{{ t('plan.setup.beginnerLabel') }}</div>
            <div class="text-sm text-gray-500 mt-1">{{ t('plan.setup.beginnerDesc') }}</div>
          </button>
          <button
            @click="form.type = 'hafiz'; nextStep()"
            :class="['p-6 rounded-xl border-2 text-left transition-all hover:shadow-md',
              form.type === 'hafiz' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300']"
          >
            <div class="text-2xl mb-2">📖</div>
            <div class="font-semibold text-gray-900">{{ t('plan.setup.hafizLabel') }}</div>
            <div class="text-sm text-gray-500 mt-1">{{ t('plan.setup.hafizDesc') }}</div>
          </button>
        </div>
      </div>

      <!-- Step 2: Scope -->
      <div v-if="step === 2" class="space-y-4">
        <h2 class="text-xl font-bold text-gray-900 text-center">
          {{ form.type === 'beginner' ? t('plan.setup.scopeQuestionBeginner') : t('plan.setup.scopeQuestionHafiz') }}
        </h2>

        <!-- Scope type selection -->
        <div class="flex gap-2 justify-center mt-4">
          <button v-if="form.type === 'hafiz'"
            @click="form.scopeType = 'full'"
            :class="['px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              form.scopeType === 'full' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200']"
          >{{ t('plan.setup.fullQuran') }}</button>
          <button
            @click="form.scopeType = 'juz'"
            :class="['px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              form.scopeType === 'juz' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200']"
          >{{ t('plan.setup.specificJuz') }}</button>
          <button
            @click="form.scopeType = 'pages'"
            :class="['px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              form.scopeType === 'pages' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200']"
          >{{ t('plan.setup.customPages') }}</button>
        </div>

        <!-- Full Quran (auto-selects all 604 pages) -->
        <div v-if="form.scopeType === 'full'" class="bg-green-50 border border-green-200 rounded-lg p-4 text-center mt-4">
          <i class="fas fa-check-circle text-green-500 text-xl mb-2"></i>
          <p class="text-sm text-green-800">{{ t('plan.setup.fullQuranSelected') }}</p>
        </div>

        <!-- Juz multi-select -->
        <div v-if="form.scopeType === 'juz'" class="mt-4">
          <p class="text-sm text-gray-500 mb-3">{{ t('plan.setup.selectJuz') }}</p>
          <div class="grid grid-cols-5 sm:grid-cols-6 gap-2 max-h-60 overflow-y-auto p-1">
            <button v-for="j in 30" :key="j"
              @click="toggleJuz(j)"
              :class="['w-full aspect-square rounded-lg text-sm font-medium transition-colors flex items-center justify-center',
                form.selectedJuz.includes(j) ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200']"
            >{{ j }}</button>
          </div>
        </div>

        <!-- Page range -->
        <div v-if="form.scopeType === 'pages'" class="mt-4 space-y-3">
          <div class="flex items-center gap-3">
            <label class="text-sm text-gray-600 w-16">{{ t('plan.setup.fromPage') }}</label>
            <input v-model.number="form.startPage" type="number" min="1" max="604"
              class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
          </div>
          <div class="flex items-center gap-3">
            <label class="text-sm text-gray-600 w-16">{{ t('plan.setup.toPage') }}</label>
            <input v-model.number="form.endPage" type="number" min="1" max="604"
              class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
          </div>
        </div>

        <!-- Already memorized indicator -->
        <div v-if="memorizedInScope > 0" class="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
          <p class="text-sm text-blue-800">
            <i class="fas fa-info-circle mr-1"></i>
            {{ t('plan.setup.alreadyMemorized').replace('{count}', memorizedInScope).replace('{total}', scopePageCount) }}
          </p>
        </div>

        <!-- Validation error -->
        <p v-if="scopeError" class="text-sm text-red-500 text-center mt-2">{{ scopeError }}</p>

        <!-- Nav buttons -->
        <div class="flex justify-between mt-6">
          <button @click="prevStep" class="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
            <i class="fas fa-arrow-left mr-1"></i> {{ t('plan.setup.back') }}
          </button>
          <button @click="nextStep" :disabled="!isScopeValid"
            :class="['px-6 py-2 rounded-lg text-sm font-medium transition-colors',
              isScopeValid ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-200 text-gray-400 cursor-not-allowed']"
          >{{ t('plan.setup.next') }} <i class="fas fa-arrow-right ml-1"></i></button>
        </div>
      </div>

      <!-- Step 3: Pace -->
      <div v-if="step === 3" class="space-y-5">
        <h2 class="text-xl font-bold text-gray-900 text-center">{{ t('plan.setup.paceTitle') }}</h2>

        <!-- New pages/day (beginner only) -->
        <div v-if="form.type === 'beginner'" class="flex items-center justify-between">
          <label class="text-sm text-gray-700">{{ t('plan.setup.newPagesPerDay') }}</label>
          <div class="flex items-center gap-2">
            <button @click="form.newPagesPerDay = Math.max(1, form.newPagesPerDay - 1)"
              class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700">−</button>
            <span class="w-8 text-center font-semibold">{{ form.newPagesPerDay }}</span>
            <button @click="form.newPagesPerDay = Math.min(5, form.newPagesPerDay + 1)"
              class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700">+</button>
          </div>
        </div>

        <!-- Revision pages/day -->
        <div class="flex items-center justify-between">
          <label class="text-sm text-gray-700">{{ t('plan.setup.revisionPagesPerDay') }}</label>
          <div class="flex items-center gap-2">
            <button @click="form.revisionPagesPerDay = Math.max(1, form.revisionPagesPerDay - 1)"
              class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700">−</button>
            <span class="w-8 text-center font-semibold">{{ form.revisionPagesPerDay }}</span>
            <button @click="form.revisionPagesPerDay = Math.min(200, form.revisionPagesPerDay + 1)"
              class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700">+</button>
          </div>
        </div>

        <!-- Off days -->
        <div>
          <label class="text-sm text-gray-700 block mb-2">{{ t('plan.setup.offDays') }}</label>
          <div class="flex gap-2">
            <button v-for="(dayName, dayIdx) in dayNames" :key="dayIdx"
              @click="toggleOffDay(dayIdx)"
              :class="['w-10 h-10 rounded-full text-xs font-medium transition-colors',
                form.offDays.includes(dayIdx) ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200']"
            >{{ dayName }}</button>
          </div>
        </div>

        <!-- Estimated completion -->
        <div class="bg-gray-50 rounded-lg p-4 mt-4">
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-600">{{ t('plan.setup.estimatedDuration') }}</span>
            <span class="font-semibold text-gray-900">{{ estimatedDays }} {{ t('plan.setup.days') }}</span>
          </div>
          <div class="flex items-center justify-between mt-1">
            <span class="text-sm text-gray-600">{{ t('plan.setup.estimatedEnd') }}</span>
            <span class="font-semibold text-gray-900">{{ estimatedEndStr }}</span>
          </div>
        </div>

        <!-- Nav buttons -->
        <div class="flex justify-between mt-6">
          <button @click="prevStep" class="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
            <i class="fas fa-arrow-left mr-1"></i> {{ t('plan.setup.back') }}
          </button>
          <button @click="createPlanHandler" :disabled="creating"
            class="px-6 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            <i v-if="creating" class="fas fa-spinner fa-spin mr-1"></i>
            {{ t('plan.setup.createPlan') }}
          </button>
        </div>
      </div>
    </div>
  `,

  setup(props, { emit }) {
    const { ref, reactive, computed } = Vue;

    const step = ref(1);
    const creating = ref(false);

    const form = reactive({
      type: 'beginner',
      scopeType: 'juz',
      selectedJuz: [],
      startPage: 1,
      endPage: 20,
      newPagesPerDay: 1,
      revisionPagesPerDay: 5,
      offDays: [5], // Friday
    });

    const dayNames = computed(() => [
      props.t('plan.days.sun'),
      props.t('plan.days.mon'),
      props.t('plan.days.tue'),
      props.t('plan.days.wed'),
      props.t('plan.days.thu'),
      props.t('plan.days.fri'),
      props.t('plan.days.sat'),
    ]);

    // Juz → page mapping (same as planManager.js)
    const JUZ_PAGES = [
      [1, 21], [22, 41], [42, 61], [62, 81], [82, 101],
      [102, 121], [122, 141], [142, 161], [162, 181], [182, 201],
      [202, 221], [222, 241], [242, 261], [262, 281], [282, 301],
      [302, 321], [322, 341], [342, 361], [362, 381], [382, 401],
      [402, 421], [422, 441], [442, 461], [462, 481], [482, 501],
      [502, 521], [522, 541], [542, 561], [562, 581], [582, 604],
    ];

    const scopePages = computed(() => {
      if (form.scopeType === 'full') {
        return Array.from({ length: 604 }, (_, i) => i + 1);
      }
      if (form.scopeType === 'juz') {
        const pages = [];
        for (const j of form.selectedJuz) {
          const [start, end] = JUZ_PAGES[j - 1];
          for (let p = start; p <= end; p++) pages.push(p);
        }
        return [...new Set(pages)].sort((a, b) => a - b);
      }
      if (form.scopeType === 'pages') {
        const s = Math.max(1, Math.min(604, form.startPage || 1));
        const e = Math.max(s, Math.min(604, form.endPage || s));
        return Array.from({ length: e - s + 1 }, (_, i) => s + i);
      }
      return [];
    });

    const scopePageCount = computed(() => scopePages.value.length);

    const memorizedInScope = computed(() => {
      let count = 0;
      for (const p of scopePages.value) {
        if (props.memorizedPages.has(p)) count++;
      }
      return count;
    });

    const scopeError = computed(() => {
      if (form.scopeType === 'juz' && form.selectedJuz.length === 0) return props.t('plan.setup.selectAtLeastOne');
      if (form.scopeType === 'pages' && scopePageCount.value === 0) return props.t('plan.setup.invalidRange');
      if (form.scopeType === 'pages' && (form.startPage < 1 || form.endPage > 604 || form.startPage > form.endPage)) return props.t('plan.setup.invalidRange');
      return null;
    });

    const isScopeValid = computed(() => scopePageCount.value > 0 && !scopeError.value);

    const estimatedDays = computed(() => {
      const totalPages = scopePageCount.value;
      const activeDaysPerWeek = 7 - form.offDays.length;
      if (activeDaysPerWeek <= 0) return Infinity;

      if (form.type === 'beginner') {
        const newPerDay = form.newPagesPerDay || 1;
        const unmemorized = totalPages - memorizedInScope.value;
        const memorizationDays = Math.ceil(Math.max(0, unmemorized) / newPerDay);
        const totalActiveDays = memorizationDays + 7; // +7 for final revision cycle
        return Math.ceil(totalActiveDays * (7 / activeDaysPerWeek));
      } else {
        const revPerDay = form.revisionPagesPerDay || 20;
        const cycleDays = Math.ceil(totalPages / revPerDay);
        return Math.ceil(cycleDays * (7 / activeDaysPerWeek));
      }
    });

    const estimatedEndStr = computed(() => {
      if (estimatedDays.value === Infinity) return '—';
      const end = new Date();
      end.setDate(end.getDate() + estimatedDays.value);
      return end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    });

    function toggleJuz(j) {
      const idx = form.selectedJuz.indexOf(j);
      if (idx >= 0) form.selectedJuz.splice(idx, 1);
      else form.selectedJuz.push(j);
    }

    function toggleOffDay(d) {
      const idx = form.offDays.indexOf(d);
      if (idx >= 0) form.offDays.splice(idx, 1);
      else form.offDays.push(d);
    }

    function nextStep() {
      if (step.value === 2 && !isScopeValid.value) return;
      if (step.value < 3) step.value++;
    }

    function prevStep() {
      if (step.value > 1) step.value--;
    }

    function createPlanHandler() {
      if (creating.value) return;
      creating.value = true;

      const pace = {
        newPagesPerDay: form.type === 'beginner' ? form.newPagesPerDay : 0,
        revisionPagesPerDay: form.revisionPagesPerDay,
        daysPerWeek: 7 - form.offDays.length,
        offDays: [...form.offDays],
      };

      emit('plan-created', {
        type: form.type,
        targetPages: scopePages.value,
        pace,
      });
    }

    return {
      step, form, creating, dayNames,
      scopePages, scopePageCount, memorizedInScope,
      scopeError, isScopeValid, estimatedDays, estimatedEndStr,
      toggleJuz, toggleOffDay, nextStep, prevStep, createPlanHandler,
    };
  },
};
