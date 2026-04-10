/**
 * PlanTodayCard Component
 * Shows today's plan tasks with completion toggles and links to Quran pages.
 */

export default {
  name: 'PlanTodayCard',
  props: {
    plan: { type: Object, required: true },
    todayTasks: { type: Object, default: null },
    dayNumber: { type: Number, default: 1 },
    t: { type: Function, required: true },
  },
  emits: ['complete-task', 'rate-task', 'open-page', 'open-quiz'],
  template: `
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <!-- Header -->
      <div class="px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-semibold text-sm">{{ t('plan.today.title') }}</h3>
            <p class="text-xs text-blue-100 mt-0.5">{{ plan.name }}</p>
          </div>
          <div class="text-right">
            <span class="text-xs text-blue-100">{{ t('plan.today.day') }} {{ dayNumber }}</span>
            <div class="flex items-center gap-1 mt-0.5">
              <span :class="['w-2 h-2 rounded-full', healthColor]"></span>
              <span class="text-xs">{{ healthLabel }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Off day / no tasks -->
      <div v-if="!todayTasks || todayTasks.metadata?.isOffDay" class="p-6 text-center">
        <div class="text-3xl mb-2">🌙</div>
        <p class="text-sm text-gray-600">{{ t('plan.today.offDay') }}</p>
      </div>

      <!-- Task list -->
      <div v-else class="divide-y divide-gray-100">
        <!-- New Memorization -->
        <div v-if="todayTasks.newMemorization" class="p-4">
          <div class="flex items-start gap-3">
            <button @click="toggleTask('newMemorization')"
              :class="['mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                todayTasks.newMemorization.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-blue-400']">
              <i v-if="todayTasks.newMemorization.completed" class="fas fa-check text-xs"></i>
            </button>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded">{{ t('plan.today.newLabel') }}</span>
                <span :class="['text-sm font-medium', todayTasks.newMemorization.completed ? 'line-through text-gray-400' : 'text-gray-900']">
                  {{ t('plan.today.memorize') }}
                </span>
              </div>
              <p class="text-xs text-gray-500 mt-1">
                {{ t('plan.today.pages') }}: {{ todayTasks.newMemorization.pages.join(', ') }}
              </p>
              <div class="flex gap-2 mt-2">
                <button v-for="page in todayTasks.newMemorization.pages" :key="page"
                  @click="$emit('open-page', page)"
                  class="text-xs text-blue-600 hover:text-blue-800 hover:underline">
                  {{ t('plan.today.openPage') }} {{ page }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Revision -->
        <div v-if="todayTasks.revision" class="p-4">
          <div class="flex items-start gap-3">
            <button @click="toggleTask('revision')"
              :class="['mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                todayTasks.revision.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-blue-400']">
              <i v-if="todayTasks.revision.completed" class="fas fa-check text-xs"></i>
            </button>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{{ t('plan.today.revisionLabel') }}</span>
                <span :class="['text-sm font-medium', todayTasks.revision.completed ? 'line-through text-gray-400' : 'text-gray-900']">
                  {{ t('plan.today.review') }} ({{ todayTasks.revision.pages.length }} {{ t('plan.today.pagesUnit') }})
                </span>
              </div>
              <p class="text-xs text-gray-500 mt-1">
                {{ t('plan.today.pages') }}: {{ todayTasks.revision.pages.join(', ') }}
              </p>
              <div class="flex gap-2 mt-2 flex-wrap">
                <button v-for="page in todayTasks.revision.pages.slice(0, 5)" :key="page"
                  @click="$emit('open-page', page)"
                  class="text-xs text-blue-600 hover:text-blue-800 hover:underline">
                  {{ t('plan.today.openPage') }} {{ page }}
                </button>
                <span v-if="todayTasks.revision.pages.length > 5" class="text-xs text-gray-400">
                  +{{ todayTasks.revision.pages.length - 5 }} {{ t('plan.today.more') }}
                </span>
              </div>
              <!-- Performance rating (shown after completion) -->
              <div v-if="todayTasks.revision.completed && !todayTasks.revision.performance" class="flex gap-2 mt-2">
                <button @click="$emit('rate-task', 'revision', 'perfect')"
                  class="text-xs px-3 py-1 rounded-full bg-green-50 text-green-700 hover:bg-green-100">{{ t('plan.today.ratePerfect') }}</button>
                <button @click="$emit('rate-task', 'revision', 'good')"
                  class="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100">{{ t('plan.today.rateGood') }}</button>
                <button @click="$emit('rate-task', 'revision', 'needs_work')"
                  class="text-xs px-3 py-1 rounded-full bg-orange-50 text-orange-700 hover:bg-orange-100">{{ t('plan.today.rateNeedsWork') }}</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Weak Reinforcement -->
        <div v-if="todayTasks.weakReinforcement" class="p-4">
          <div class="flex items-start gap-3">
            <button @click="toggleTask('weakReinforcement')"
              :class="['mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                todayTasks.weakReinforcement.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-blue-400']">
              <i v-if="todayTasks.weakReinforcement.completed" class="fas fa-check text-xs"></i>
            </button>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded">{{ t('plan.today.weakLabel') }}</span>
                <span :class="['text-sm font-medium', todayTasks.weakReinforcement.completed ? 'line-through text-gray-400' : 'text-gray-900']">
                  {{ t('plan.today.reinforce') }}
                </span>
              </div>
              <p class="text-xs text-gray-500 mt-1">
                {{ t('plan.today.pages') }}: {{ todayTasks.weakReinforcement.pages.join(', ') }}
              </p>
              <div class="flex gap-2 mt-2">
                <button v-for="page in todayTasks.weakReinforcement.pages" :key="page"
                  @click="$emit('open-page', page)"
                  class="text-xs text-blue-600 hover:text-blue-800 hover:underline">
                  {{ t('plan.today.openPage') }} {{ page }}
                </button>
                <button @click="$emit('open-quiz', todayTasks.weakReinforcement.pages[0])"
                  class="text-xs text-purple-600 hover:text-purple-800 hover:underline">
                  <i class="fas fa-question-circle mr-0.5"></i>{{ t('plan.today.quiz') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Progress Footer -->
      <div v-if="todayTasks && !todayTasks.metadata?.isOffDay" class="px-4 py-3 bg-gray-50 border-t border-gray-100">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs text-gray-500">{{ t('plan.today.progress') }}: {{ completedCount }}/{{ totalCount }}</span>
          <span v-if="plan.stats.currentStreak > 0" class="text-xs text-orange-500 font-medium">
            🔥 {{ plan.stats.currentStreak }} {{ t('plan.today.streak') }}
          </span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-1.5">
          <div class="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
            :style="{ width: progressPercent + '%' }"></div>
        </div>
      </div>
    </div>
  `,

  setup(props, { emit }) {
    const { computed } = Vue;

    const totalCount = computed(() => {
      if (!props.todayTasks) return 0;
      let count = 0;
      if (props.todayTasks.newMemorization) count++;
      if (props.todayTasks.revision) count++;
      if (props.todayTasks.weakReinforcement) count++;
      return count;
    });

    const completedCount = computed(() => {
      if (!props.todayTasks) return 0;
      let count = 0;
      if (props.todayTasks.newMemorization?.completed) count++;
      if (props.todayTasks.revision?.completed) count++;
      if (props.todayTasks.weakReinforcement?.completed) count++;
      return count;
    });

    const progressPercent = computed(() => {
      return totalCount.value > 0 ? Math.round((completedCount.value / totalCount.value) * 100) : 0;
    });

    const healthColor = computed(() => {
      const backlog = props.todayTasks?.metadata?.backlogSize || 0;
      if (backlog > 10) return 'bg-red-400';
      if (backlog > 5) return 'bg-yellow-400';
      return 'bg-green-400';
    });

    const healthLabel = computed(() => {
      const backlog = props.todayTasks?.metadata?.backlogSize || 0;
      if (backlog > 10) return props.t('plan.today.healthBehind');
      if (backlog > 5) return props.t('plan.today.healthSlipping');
      return props.t('plan.today.healthOnTrack');
    });

    function toggleTask(taskType) {
      emit('complete-task', taskType);
    }

    return { totalCount, completedCount, progressPercent, healthColor, healthLabel, toggleTask };
  },
};
