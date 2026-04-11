/**
 * PlanSettingsModal Component
 * Comprehensive settings for tweaking the active plan:
 * new pages/day, revision pages/day, weak reinforcement pages, off days.
 */

export default {
  name: 'PlanSettingsModal',
  props: {
    plan: { type: Object, required: true },
    t: { type: Function, required: true },
  },
  emits: ['save', 'close'],
  template: `
    <div class="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4" @click.self="$emit('close')">
      <div class="bg-white rounded-xl p-5 max-w-sm w-full shadow-xl max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-base font-bold text-gray-900">{{ t('plan.settings.title') }}</h2>
          <button @click="$emit('close')" class="p-1 hover:bg-gray-100 rounded-lg">
            <i class="fas fa-times text-gray-400"></i>
          </button>
        </div>

        <!-- Daily Pages -->
        <div class="space-y-4">
          <!-- New pages per day (beginner/mixed only) -->
          <div v-if="plan.type !== 'hafiz'">
            <label class="text-xs font-medium text-gray-600 block mb-1">{{ t('plan.settings.newPagesPerDay') }}</label>
            <div class="flex items-center gap-3">
              <button @click="form.newPagesPerDay = Math.max(0, form.newPagesPerDay - 1)"
                class="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-50">
                <i class="fas fa-minus text-xs"></i>
              </button>
              <span class="text-lg font-semibold text-gray-900 w-8 text-center">{{ form.newPagesPerDay }}</span>
              <button @click="form.newPagesPerDay = Math.min(5, form.newPagesPerDay + 1)"
                class="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-50">
                <i class="fas fa-plus text-xs"></i>
              </button>
              <span class="text-xs text-gray-400 ml-1">{{ t('plan.settings.pagesUnit') }}</span>
            </div>
          </div>

          <!-- Revision pages per day -->
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1">{{ t('plan.settings.revisionPagesPerDay') }}</label>
            <div class="flex items-center gap-3">
              <button @click="form.revisionPagesPerDay = Math.max(1, form.revisionPagesPerDay - 1)"
                class="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-50">
                <i class="fas fa-minus text-xs"></i>
              </button>
              <span class="text-lg font-semibold text-gray-900 w-8 text-center">{{ form.revisionPagesPerDay }}</span>
              <button @click="form.revisionPagesPerDay = Math.min(50, form.revisionPagesPerDay + 1)"
                class="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-50">
                <i class="fas fa-plus text-xs"></i>
              </button>
              <span class="text-xs text-gray-400 ml-1">{{ t('plan.settings.pagesUnit') }}</span>
            </div>
          </div>

          <!-- Weak reinforcement pages per day -->
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-1">{{ t('plan.settings.weakPagesPerDay') }}</label>
            <div class="flex items-center gap-3">
              <button @click="form.weakPagesPerDay = Math.max(0, form.weakPagesPerDay - 1)"
                class="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-50">
                <i class="fas fa-minus text-xs"></i>
              </button>
              <span class="text-lg font-semibold text-gray-900 w-8 text-center">{{ form.weakPagesPerDay }}</span>
              <button @click="form.weakPagesPerDay = Math.min(10, form.weakPagesPerDay + 1)"
                class="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-50">
                <i class="fas fa-plus text-xs"></i>
              </button>
              <span class="text-xs text-gray-400 ml-1">{{ t('plan.settings.pagesUnit') }}</span>
            </div>
          </div>

          <!-- Off Days -->
          <div>
            <label class="text-xs font-medium text-gray-600 block mb-2">{{ t('plan.settings.offDays') }}</label>
            <p class="text-xs text-gray-400 mb-2">{{ t('plan.settings.offDaysHint') }}</p>
            <div class="flex flex-wrap gap-2">
              <button v-for="(dayName, dayIdx) in dayNames" :key="dayIdx"
                @click="toggleOffDay(dayIdx)"
                :class="['px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  form.offDays.includes(dayIdx)
                    ? 'bg-gray-700 text-white border-gray-700'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400']">
                {{ dayName }}
              </button>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-2 mt-6">
          <button @click="$emit('close')"
            class="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-200">
            {{ t('plan.settings.cancel') }}
          </button>
          <button @click="save"
            class="flex-1 bg-blue-500 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-600">
            {{ t('plan.settings.save') }}
          </button>
        </div>
      </div>
    </div>
  `,

  setup(props, { emit }) {
    const { reactive, computed } = Vue;

    const form = reactive({
      newPagesPerDay: props.plan.pace?.newPagesPerDay ?? 1,
      revisionPagesPerDay: props.plan.pace?.revisionPagesPerDay ?? 5,
      weakPagesPerDay: props.plan.pace?.weakPagesPerDay ?? (props.plan.type === 'hafiz' ? 3 : 2),
      offDays: [...(props.plan.pace?.offDays || [])],
    });

    const dayNames = computed(() => [
      props.t('plan.days.sun'), props.t('plan.days.mon'), props.t('plan.days.tue'),
      props.t('plan.days.wed'), props.t('plan.days.thu'), props.t('plan.days.fri'),
      props.t('plan.days.sat'),
    ]);

    function toggleOffDay(dayIdx) {
      const idx = form.offDays.indexOf(dayIdx);
      if (idx >= 0) {
        form.offDays.splice(idx, 1);
      } else {
        // Don't allow all 7 days off
        if (form.offDays.length < 6) {
          form.offDays.push(dayIdx);
        }
      }
    }

    function save() {
      emit('save', {
        newPagesPerDay: form.newPagesPerDay,
        revisionPagesPerDay: form.revisionPagesPerDay,
        weakPagesPerDay: form.weakPagesPerDay,
        offDays: [...form.offDays].sort((a, b) => a - b),
      });
    }

    return { form, dayNames, toggleOffDay, save };
  },
};
