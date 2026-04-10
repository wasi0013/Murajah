/**
 * PlanProgressView Component
 * Shows milestones, juz coverage, cycle count, and overall plan progress.
 */
import { getJuzPagesForLayout } from '../utils/planManager.js';

export default {
  name: 'PlanProgressView',
  props: {
    plan: { type: Object, required: true },
    t: { type: Function, required: true },
  },
  emits: ['change-pace', 'pause-plan', 'resume-plan', 'abandon-plan'],
  template: `
    <div class="space-y-4">
      <!-- Overall Progress Card -->
      <div class="bg-white rounded-xl border border-gray-200 p-4">
        <h3 class="text-sm font-semibold text-gray-900 mb-3">{{ t('plan.progress.title') }}</h3>

        <!-- Circular progress -->
        <div class="flex items-center gap-6">
          <div class="relative w-20 h-20 flex-shrink-0">
            <svg class="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
              <path class="text-gray-200" stroke="currentColor" stroke-width="3" fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path class="text-blue-500" stroke="currentColor" stroke-width="3" fill="none"
                :stroke-dasharray="progressPercent + ', 100'"
                stroke-linecap="round"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            </svg>
            <span class="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-900">
              {{ progressPercent }}%
            </span>
          </div>

          <div class="flex-1 space-y-2">
            <div class="flex justify-between text-xs">
              <span class="text-gray-500">{{ t('plan.progress.pagesReviewed') }}</span>
              <span class="font-medium text-gray-900">{{ plan.stats.pagesReviewed }}/{{ plan.stats.totalPagesInPlan }}</span>
            </div>
            <div v-if="plan.type === 'beginner'" class="flex justify-between text-xs">
              <span class="text-gray-500">{{ t('plan.progress.pagesMemorized') }}</span>
              <span class="font-medium text-gray-900">{{ plan.stats.pagesMemorized }}/{{ plan.stats.totalPagesInPlan }}</span>
            </div>
            <div v-if="plan.type === 'hafiz'" class="flex justify-between text-xs">
              <span class="text-gray-500">{{ t('plan.progress.cyclesCompleted') }}</span>
              <span class="font-medium text-gray-900">{{ plan.stats.revisionCyclesCompleted }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-500">{{ t('plan.progress.daysActive') }}</span>
              <span class="font-medium text-gray-900">{{ plan.stats.totalDaysActive }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Streak & Stats -->
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <div class="text-xl font-bold text-orange-500">{{ plan.stats.currentStreak }}</div>
          <div class="text-xs text-gray-500 mt-0.5">{{ t('plan.progress.currentStreak') }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <div class="text-xl font-bold text-blue-500">{{ plan.stats.longestStreak }}</div>
          <div class="text-xs text-gray-500 mt-0.5">{{ t('plan.progress.longestStreak') }}</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <div class="text-xl font-bold text-red-400">{{ plan.stats.missedDays }}</div>
          <div class="text-xs text-gray-500 mt-0.5">{{ t('plan.progress.daysMissed') }}</div>
        </div>
      </div>

      <!-- Milestones -->
      <div class="bg-white rounded-xl border border-gray-200 p-4">
        <h3 class="text-sm font-semibold text-gray-900 mb-3">{{ t('plan.progress.milestones') }}</h3>
        <div v-if="plan.milestones && plan.milestones.length > 0" class="space-y-3">
          <div v-for="m in plan.milestones" :key="m.id" class="flex items-center gap-3">
            <div :class="['w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
              m.completedDate ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400']">
              <i :class="['text-xs', m.completedDate ? 'fas fa-check' : 'fas fa-clock']"></i>
            </div>
            <div class="flex-1 min-w-0">
              <p :class="['text-sm', m.completedDate ? 'text-gray-400 line-through' : 'text-gray-800']">
                {{ milestoneLabel(m) }}
              </p>
              <p class="text-xs text-gray-400">
                {{ m.completedDate ? t('plan.progress.completedOn').replace('{date}', formatDate(m.completedDate)) : t('plan.progress.targetDate').replace('{date}', formatDate(m.targetDate)) }}
              </p>
            </div>
          </div>
        </div>
        <p v-else class="text-xs text-gray-400">{{ t('plan.progress.noMilestones') }}</p>
      </div>

      <!-- Juz Coverage (hafiz mode) -->
      <div v-if="plan.type === 'hafiz' && plan.targetJuz.length > 1" class="bg-white rounded-xl border border-gray-200 p-4">
        <h3 class="text-sm font-semibold text-gray-900 mb-3">{{ t('plan.progress.juzCoverage') }}</h3>
        <div class="grid grid-cols-6 gap-1.5">
          <div v-for="j in plan.targetJuz" :key="j"
            :class="['aspect-square rounded flex items-center justify-center text-xs font-medium',
              juzReviewPercent(j) >= 100 ? 'bg-green-500 text-white' :
              juzReviewPercent(j) > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500']"
            :title="'Juz ' + j + ': ' + juzReviewPercent(j) + '%'"
          >{{ j }}</div>
        </div>
      </div>

      <!-- Plan Actions -->
      <div class="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
        <h3 class="text-sm font-semibold text-gray-900 mb-2">{{ t('plan.actions.title') }}</h3>

        <button v-if="plan.status === 'active'" @click="$emit('pause-plan')"
          class="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-gray-700 flex items-center gap-2">
          <i class="fas fa-pause text-gray-400 w-5"></i> {{ t('plan.actions.pause') }}
        </button>
        <button v-if="plan.status === 'paused'" @click="$emit('resume-plan')"
          class="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-blue-600 flex items-center gap-2">
          <i class="fas fa-play text-blue-400 w-5"></i> {{ t('plan.actions.resume') }}
        </button>
        <button @click="$emit('change-pace')"
          class="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-gray-700 flex items-center gap-2">
          <i class="fas fa-sliders-h text-gray-400 w-5"></i> {{ t('plan.actions.adjustPace') }}
        </button>
        <button @click="confirmAbandoning ? $emit('abandon-plan') : confirmAbandoning = true"
          class="w-full text-left px-3 py-2 rounded-lg hover:bg-red-50 text-sm text-red-500 flex items-center gap-2">
          <i class="fas fa-trash text-red-300 w-5"></i>
          {{ confirmAbandoning ? t('plan.actions.confirmAbandon') : t('plan.actions.abandon') }}
        </button>
      </div>
    </div>
  `,

  setup(props) {
    const { ref, computed } = Vue;

    const confirmAbandoning = ref(false);

    // Juz → page mapping (layout-aware from plan)
    const JUZ_PAGES = computed(() => getJuzPagesForLayout(props.plan.layout || 'qpc'));

    const progressPercent = computed(() => {
      const stats = props.plan.stats;
      if (props.plan.type === 'beginner') {
        return stats.totalPagesInPlan > 0
          ? Math.round((stats.pagesMemorized / stats.totalPagesInPlan) * 100)
          : 0;
      }
      // Hafiz: progress based on reviewed pages this cycle
      return stats.totalPagesInPlan > 0
        ? Math.round((stats.pagesReviewed / stats.totalPagesInPlan) * 100)
        : 0;
    });

    function juzReviewPercent(juzNum) {
      const [start, end] = JUZ_PAGES.value[juzNum - 1] || [0, 0];
      const pageReviewData = props.plan.schedulerState?.pageReviewData || {};
      let reviewed = 0;
      let total = 0;
      for (let p = start; p <= end; p++) {
        if (props.plan.targetPages.includes(p)) {
          total++;
          if (pageReviewData[p]?.reviewCount > 0) reviewed++;
        }
      }
      return total > 0 ? Math.round((reviewed / total) * 100) : 0;
    }

    function milestoneLabel(m) {
      if (m.type === 'surah_complete') return (props.t('plan.progress.surahComplete') || 'Surah ' + m.surah + ' Complete').replace('{surah}', m.surah);
      if (m.type === 'juz_complete') return props.t('plan.progress.juzComplete').replace('{juz}', m.juz);
      if (m.type === 'cycle_complete') return props.t('plan.progress.cycleComplete').replace('{cycle}', m.cycle);
      return m.type;
    }

    function formatDate(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    return { confirmAbandoning, progressPercent, JUZ_PAGES, juzReviewPercent, milestoneLabel, formatDate };
  },
};
