/**
 * PlanCalendarComponent
 * Week/month view showing plan task history and future schedule.
 * Supports day expansion and week/month toggling.
 */

export default {
  name: 'PlanCalendarComponent',
  props: {
    plan: { type: Object, required: true },
    history: { type: Array, default: () => [] },
    todayTasks: { type: Object, default: null },
    t: { type: Function, required: true },
  },
  emits: ['select-day', 'open-page'],
  template: `
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <!-- Header -->
      <div class="px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <button @click="navigate(-1)" class="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" :aria-label="t('plan.calendar.prev')">
          <i class="fas fa-chevron-left text-gray-500 text-sm"></i>
        </button>
        <div class="text-center">
          <h3 class="text-sm font-semibold text-gray-900">{{ headerLabel }}</h3>
        </div>
        <button @click="navigate(1)" class="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" :aria-label="t('plan.calendar.next')">
          <i class="fas fa-chevron-right text-gray-500 text-sm"></i>
        </button>
      </div>

      <!-- View toggle -->
      <div class="px-4 py-2 flex gap-2 border-b border-gray-50">
        <button @click="viewMode = 'week'"
          :class="['text-xs px-3 py-1 rounded-full font-medium transition-colors',
            viewMode === 'week' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200']"
        >{{ t('plan.calendar.week') }}</button>
        <button @click="viewMode = 'month'"
          :class="['text-xs px-3 py-1 rounded-full font-medium transition-colors',
            viewMode === 'month' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200']"
        >{{ t('plan.calendar.month') }}</button>
      </div>

      <!-- Day headers -->
      <div class="grid grid-cols-7 border-b border-gray-100">
        <div v-for="(d, i) in shortDayNames" :key="i" class="text-center py-2 text-xs font-medium text-gray-400">
          {{ d }}
        </div>
      </div>

      <!-- Calendar grid -->
      <div class="grid grid-cols-7">
        <button v-for="(day, i) in calendarDays" :key="i"
          @click="day.date && selectDay(day)"
          :disabled="!day.date"
          :class="[
            'relative p-1 min-h-[3.5rem] border-b border-r border-gray-50 transition-colors text-left',
            day.date ? 'hover:bg-gray-50 cursor-pointer' : 'bg-gray-25',
            day.isToday ? 'bg-blue-50' : '',
            selectedDate === day.dateStr ? 'ring-2 ring-blue-400 ring-inset' : '',
          ]"
        >
          <span v-if="day.date" :class="[
            'text-xs font-medium block',
            day.isToday ? 'text-blue-600 font-bold' : day.isCurrentMonth === false ? 'text-gray-300' : 'text-gray-700'
          ]">{{ day.dayNum }}</span>
          <!-- Status dot -->
          <span v-if="day.status" :class="['absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full', statusDotClass(day.status)]"></span>
        </button>
      </div>

      <!-- Selected day detail -->
      <div v-if="selectedDayData" class="px-4 py-3 border-t border-gray-200 bg-gray-50">
        <h4 class="text-sm font-semibold text-gray-800 mb-2">{{ selectedDateLabel }}</h4>
        <div v-if="selectedDayData.isOffDay" class="text-xs text-gray-500">
          <i class="fas fa-moon mr-1"></i>{{ t('plan.today.offDay') }}
        </div>
        <div v-else-if="selectedDayData.tasks" class="space-y-1.5">
          <div v-if="selectedDayData.tasks.newMemorization" class="flex items-center gap-2 text-xs">
            <span :class="['w-4 h-4 rounded flex items-center justify-center flex-shrink-0',
              selectedDayData.tasks.newMemorization.completed ? 'bg-green-500 text-white' : 'bg-gray-200']">
              <i v-if="selectedDayData.tasks.newMemorization.completed" class="fas fa-check text-[8px]"></i>
            </span>
            <span class="text-green-700">{{ t('plan.today.newLabel') }}:</span>
            <span class="text-gray-600">{{ selectedDayData.tasks.newMemorization.pages.join(', ') }}</span>
          </div>
          <div v-if="selectedDayData.tasks.revision" class="flex items-center gap-2 text-xs">
            <span :class="['w-4 h-4 rounded flex items-center justify-center flex-shrink-0',
              selectedDayData.tasks.revision.completed ? 'bg-green-500 text-white' : 'bg-gray-200']">
              <i v-if="selectedDayData.tasks.revision.completed" class="fas fa-check text-[8px]"></i>
            </span>
            <span class="text-blue-700">{{ t('plan.today.revisionLabel') }}:</span>
            <span class="text-gray-600">{{ selectedDayData.tasks.revision.pages.join(', ') }}</span>
          </div>
          <div v-if="selectedDayData.tasks.weakReinforcement" class="flex items-center gap-2 text-xs">
            <span :class="['w-4 h-4 rounded flex items-center justify-center flex-shrink-0',
              selectedDayData.tasks.weakReinforcement.completed ? 'bg-green-500 text-white' : 'bg-gray-200']">
              <i v-if="selectedDayData.tasks.weakReinforcement.completed" class="fas fa-check text-[8px]"></i>
            </span>
            <span class="text-orange-700">{{ t('plan.today.weakLabel') }}:</span>
            <span class="text-gray-600">{{ selectedDayData.tasks.weakReinforcement.pages.join(', ') }}</span>
          </div>
        </div>
        <div v-else class="text-xs text-gray-400">{{ t('plan.calendar.noTasks') }}</div>
      </div>
    </div>
  `,

  setup(props, { emit }) {
    const { ref, computed, watch } = Vue;

    const viewMode = ref('week');
    const offset = ref(0); // weeks or months offset from current
    const selectedDate = ref(null);

    const today = new Date();
    const todayStr = formatDateStr(today);

    const shortDayNames = computed(() => [
      props.t('plan.days.sun'), props.t('plan.days.mon'), props.t('plan.days.tue'),
      props.t('plan.days.wed'), props.t('plan.days.thu'), props.t('plan.days.fri'),
      props.t('plan.days.sat'),
    ]);

    // Build lookup map of history by date
    const historyMap = computed(() => {
      const map = {};
      for (const record of props.history) {
        map[record.date] = record;
      }
      return map;
    });

    const headerLabel = computed(() => {
      if (viewMode.value === 'week') {
        const start = getWeekStart(offset.value);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return formatRange(start, end);
      } else {
        const d = new Date(today.getFullYear(), today.getMonth() + offset.value, 1);
        return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      }
    });

    const calendarDays = computed(() => {
      if (viewMode.value === 'week') {
        return buildWeekDays(offset.value);
      } else {
        return buildMonthDays(offset.value);
      }
    });

    const selectedDayData = computed(() => {
      if (!selectedDate.value) return null;
      // Today's tasks from live data
      if (selectedDate.value === todayStr && props.todayTasks) {
        return {
          isOffDay: props.todayTasks.metadata?.isOffDay,
          tasks: {
            newMemorization: props.todayTasks.newMemorization,
            revision: props.todayTasks.revision,
            weakReinforcement: props.todayTasks.weakReinforcement,
          },
        };
      }
      // Historical data
      const record = historyMap.value[selectedDate.value];
      if (record) {
        return {
          isOffDay: false,
          tasks: record.tasks,
        };
      }
      // Check if it's an off day
      const d = new Date(selectedDate.value + 'T00:00:00');
      if (props.plan.pace.offDays?.includes(d.getDay())) {
        return { isOffDay: true, tasks: null };
      }
      return null;
    });

    const selectedDateLabel = computed(() => {
      if (!selectedDate.value) return '';
      const d = new Date(selectedDate.value + 'T00:00:00');
      return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    });

    function getWeekStart(weekOffset) {
      const d = new Date(today);
      d.setDate(d.getDate() - d.getDay() + weekOffset * 7);
      d.setHours(0, 0, 0, 0);
      return d;
    }

    function buildWeekDays(weekOffset) {
      const start = getWeekStart(weekOffset);
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        days.push(makeDayObj(d, true));
      }
      return days;
    }

    function buildMonthDays(monthOffset) {
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
      const startDay = firstOfMonth.getDay(); // 0=Sun
      const daysInMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0).getDate();

      const days = [];
      // Empty cells before month start
      for (let i = 0; i < startDay; i++) {
        const d = new Date(firstOfMonth);
        d.setDate(d.getDate() - (startDay - i));
        days.push({ ...makeDayObj(d, false), isCurrentMonth: false });
      }
      // Month days
      for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), i);
        days.push(makeDayObj(d, true));
      }
      // Fill to complete last row
      while (days.length % 7 !== 0) {
        const d = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, days.length - startDay - daysInMonth + 1);
        days.push({ ...makeDayObj(d, false), isCurrentMonth: false });
      }
      return days;
    }

    function makeDayObj(d, isCurrentMonth) {
      const dateStr = formatDateStr(d);
      const isToday = dateStr === todayStr;
      const isOff = props.plan.pace.offDays?.includes(d.getDay());

      let status = null;
      if (dateStr < props.plan.startDate) {
        status = null;
      } else if (isToday) {
        if (props.todayTasks?.metadata?.isOffDay) status = 'off';
        else if (props.todayTasks) {
          const tt = props.todayTasks;
          const total = (tt.newMemorization ? 1 : 0) + (tt.revision ? 1 : 0) + (tt.weakReinforcement ? 1 : 0);
          const done = (tt.newMemorization?.completed ? 1 : 0) + (tt.revision?.completed ? 1 : 0) + (tt.weakReinforcement?.completed ? 1 : 0);
          status = done === total && total > 0 ? 'complete' : done > 0 ? 'partial' : 'today';
        } else {
          status = 'today';
        }
      } else if (dateStr > todayStr) {
        status = isOff ? 'off' : 'future';
      } else {
        // Past day — look up in history
        const record = historyMap.value[dateStr];
        if (record) {
          const s = record.summary?.status;
          if (s === 'complete') status = 'complete';
          else if (s === 'partial') status = 'partial';
          else if (s === 'missed') status = 'missed';
          else status = 'partial';
        } else if (isOff) {
          status = 'off';
        } else if (dateStr >= props.plan.startDate) {
          status = 'missed';
        }
      }

      return {
        date: d,
        dateStr,
        dayNum: d.getDate(),
        isToday,
        isCurrentMonth,
        status,
      };
    }

    function statusDotClass(status) {
      switch (status) {
        case 'complete': return 'bg-green-500';
        case 'partial': return 'bg-yellow-500';
        case 'missed': return 'bg-red-400';
        case 'off': return 'bg-gray-300';
        case 'today': return 'bg-blue-500';
        case 'future': return 'bg-gray-200';
        default: return '';
      }
    }

    function selectDay(day) {
      selectedDate.value = day.dateStr;
      emit('select-day', day.dateStr);
    }

    function navigate(dir) {
      offset.value += dir;
    }

    function formatDateStr(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    }

    function formatRange(start, end) {
      const opts = { month: 'short', day: 'numeric' };
      const s = start.toLocaleDateString(undefined, opts);
      const e = end.toLocaleDateString(undefined, { ...opts, year: 'numeric' });
      return `${s} – ${e}`;
    }

    // Reset offset when view mode changes
    watch(viewMode, () => { offset.value = 0; });

    return {
      viewMode, offset, selectedDate, shortDayNames,
      headerLabel, calendarDays, selectedDayData, selectedDateLabel,
      statusDotClass, selectDay, navigate,
    };
  },
};
