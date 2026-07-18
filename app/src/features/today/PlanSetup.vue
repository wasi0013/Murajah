<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Sparkles } from 'lucide-vue-next'
import { usePlanStore } from '@/stores/plan'
import { useProgressStore } from '@/stores/progress'
import { useMistakesStore } from '@/stores/mistakes'
import { useReaderStore } from '@/stores/reader'
import { generateSmartPlan, totalPagesForLayout } from '@/core/memorization/planBuilder'
import { getTodayDate, HABIT_CATALOG } from '@/core/memorization/streaks'
import { serializePlan, type PlanConfig } from '@/core/storage/userData'
import BottomSheet from '@/components/BottomSheet.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import Toggle from '@/components/Toggle.vue'
import Icon from '@/components/Icon.vue'

/**
 * Plan setup — one sheet for both creating and editing, replacing the legacy 24KB
 * multi-step wizard. There's only one plan, and it's four questions: what you're
 * maintaining, whether you're still adding new pages, how much per day, and which
 * days you rest. **Smart defaults** fills all of it from the user's own data.
 *
 * Edits are held in a draft and only committed on save, so an abandoned sheet can't
 * half-rewrite a live plan (the queue regenerates the moment the config changes).
 */
const open = defineModel<boolean>('open', { default: false })

const plan = usePlanStore()
const progress = useProgressStore()
const mistakes = useMistakesStore()
const reader = useReaderStore()

const WEEKDAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

const scopeOptions = [
  { value: 'all-memorized', label: 'All I know' },
  { value: 'juz', label: 'Pick juz' },
]

/** A plain starting point for someone setting up by hand. */
function blankPlan(): PlanConfig {
  const now = new Date()
  return {
    scope: { kind: 'all-memorized' },
    newFront: null,
    pace: {
      newPagesPerDay: 1,
      revisionPagesPerDay: 5,
      weakPagesPerDay: 2,
      daysPerWeek: 7,
      offDays: [],
    },
    habits: [],
    startDate: getTodayDate(now),
    createdAt: now.toISOString(),
  }
}

const draft = ref<PlanConfig>(blankPlan())

// Reset the draft each time the sheet opens: editing starts from the live plan,
// creating from a blank one. `serializePlan` gives a proxy-free deep copy.
watch(open, (isOpen) => {
  if (!isOpen) return
  draft.value = plan.config ? serializePlan(plan.config)! : blankPlan()
})

/** Where to start new memorization if the user turns it on without a preference. */
function suggestedFront(): number {
  const max = progress.memorized.size ? Math.max(...progress.memorized) : 0
  return Math.min(max + 1, totalPagesForLayout('qpc'))
}

const scopeKind = computed<string>({
  get: () => draft.value.scope.kind,
  set: (kind) => {
    draft.value.scope = kind === 'juz' ? { kind: 'juz', juz: [] } : { kind: 'all-memorized' }
  },
})

const selectedJuz = computed(() =>
  draft.value.scope.kind === 'juz' ? draft.value.scope.juz : [],
)
function toggleJuz(j: number) {
  const scope = draft.value.scope
  if (scope.kind !== 'juz') return
  const i = scope.juz.indexOf(j)
  if (i === -1) scope.juz.push(j)
  else scope.juz.splice(i, 1)
}

const addNew = computed<boolean>({
  get: () => draft.value.newFront !== null,
  set: (on) => {
    if (!on) {
      draft.value.newFront = null
      return
    }
    // New memorization uses the reader's default script (decision 7). Turning it on
    // must also give it a daily budget — a front with 0 new pages/day schedules
    // nothing, which is why the toggle used to look like it did nothing (9.3.1).
    draft.value.newFront = { layout: reader.layout, nextPage: suggestedFront() }
    if (draft.value.pace.newPagesPerDay < 1) draft.value.pace.newPagesPerDay = 1
  },
})

function toggleOffDay(d: number) {
  const off = draft.value.pace.offDays
  const i = off.indexOf(d)
  if (i === -1) off.push(d)
  else off.splice(i, 1)
  // Kept consistent so the two never contradict each other.
  draft.value.pace.daysPerWeek = 7 - off.length
}

function toggleHabit(id: string) {
  const h = draft.value.habits
  const i = h.indexOf(id)
  if (i === -1) h.push(id)
  else h.splice(i, 1)
}

const navReady = computed(() => Object.keys(plan.juzToPage).length > 0)

/** Fill the whole form from the user's existing data — still fully editable after. */
function applySmartDefaults() {
  if (!navReady.value) return
  draft.value = generateSmartPlan({
    memorized: progress.memorized,
    strength: progress.strength,
    mistakes: mistakes.byPage,
    reviewData: progress.reviewData,
    juzToPage: plan.juzToPage,
  }).config
}

/** A juz scope with no juz picked would maintain nothing at all. */
const invalid = computed(() => draft.value.scope.kind === 'juz' && selectedJuz.value.length === 0)

function save() {
  if (invalid.value) return
  plan.create(draft.value)
  open.value = false
}
</script>

<template>
  <BottomSheet v-model:open="open" label="Your plan">
    <div class="setup">
      <div class="head">
        <h2 class="setup-title">Your plan</h2>
        <button
          class="smart"
          type="button"
          :disabled="!navReady"
          @click="applySmartDefaults"
        >
          <Icon :icon="Sparkles" :size="14" />
          <span>Smart defaults</span>
        </button>
      </div>

      <section class="field">
        <span class="field-label" id="f-scope">What are you maintaining?</span>
        <SegmentedControl
          v-model="scopeKind"
          :options="scopeOptions"
          label="What are you maintaining?"
        />
        <div v-if="scopeKind === 'juz'" class="juz-grid" role="group" aria-labelledby="f-scope">
          <button
            v-for="j in 30"
            :key="j"
            type="button"
            class="juz"
            :class="{ 'juz-on': selectedJuz.includes(j) }"
            :aria-pressed="selectedJuz.includes(j)"
            :aria-label="`Juz ${j}`"
            @click="toggleJuz(j)"
          >
            {{ j }}
          </button>
        </div>
        <p v-if="invalid" class="error">Pick at least one juz to maintain.</p>
      </section>

      <section class="field">
        <div class="row">
          <span class="field-label">Memorizing new pages?</span>
          <Toggle v-model="addNew" label="Memorizing new pages?" />
        </div>
        <div v-if="draft.newFront" class="sub">
          <label class="row">
            <span class="sub-label">Start at page</span>
            <input
              v-model.number="draft.newFront.nextPage"
              type="number"
              min="1"
              :max="totalPagesForLayout('qpc')"
              class="num"
            />
          </label>
        </div>
      </section>

      <section class="field">
        <span class="field-label">How much a day?</span>
        <label class="row">
          <span class="sub-label">Pages to revise</span>
          <input
            v-model.number="draft.pace.revisionPagesPerDay"
            type="number"
            min="0"
            max="30"
            class="num"
          />
        </label>
        <label v-if="draft.newFront" class="row">
          <span class="sub-label">New pages</span>
          <input v-model.number="draft.pace.newPagesPerDay" type="number" min="0" max="10" class="num" />
        </label>
        <label class="row">
          <span class="sub-label">Weak pages to reinforce</span>
          <input v-model.number="draft.pace.weakPagesPerDay" type="number" min="0" max="10" class="num" />
        </label>
      </section>

      <section class="field">
        <span class="field-label" id="f-off">Rest days</span>
        <p class="hint">New memorization pauses; revision carries on — hifz fades on days off too.</p>
        <div class="days" role="group" aria-labelledby="f-off">
          <button
            v-for="d in WEEKDAYS"
            :key="d.value"
            type="button"
            class="day"
            :class="{ 'day-on': draft.pace.offDays.includes(d.value) }"
            :aria-pressed="draft.pace.offDays.includes(d.value)"
            :aria-label="`Rest on ${d.label}`"
            @click="toggleOffDay(d.value)"
          >
            {{ d.label }}
          </button>
        </div>
      </section>

      <section class="field">
        <span class="field-label">Daily habits</span>
        <label v-for="h in HABIT_CATALOG" :key="h.id" class="row">
          <span class="sub-label">{{ h.name }}</span>
          <Toggle
            :model-value="draft.habits.includes(h.id)"
            :label="h.name"
            @update:model-value="toggleHabit(h.id)"
          />
        </label>
      </section>

      <button class="save" type="button" :disabled="invalid" @click="save">
        {{ plan.hasPlan ? 'Save changes' : 'Create plan' }}
      </button>
    </div>
  </BottomSheet>
</template>

<style scoped>
.setup {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding-bottom: 0.5rem;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.setup-title {
  font-size: var(--text-base);
  font-weight: 600;
}
.smart {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  height: 2rem;
  padding: 0 0.7rem;
  border-radius: var(--radius-full);
  background: color-mix(in oklab, var(--color-accent) 12%, transparent);
  color: var(--color-accent);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
}
.smart:disabled {
  opacity: 0.5;
  cursor: default;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.field-label {
  font-size: var(--text-sm);
  font-weight: 600;
}
.hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.sub {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-left: 0.75rem;
  border-left: 2px solid var(--color-border);
}
.sub-label {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.num {
  width: 4.5rem;
  height: 2.25rem;
  padding: 0 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
  text-align: end;
}
.juz-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(2.25rem, 1fr));
  gap: 0.35rem;
}
.juz,
.day {
  height: 2.25rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.juz-on,
.day-on {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-accent-contrast);
}
.days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.35rem;
}
.error {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-danger);
}
.save {
  height: 2.75rem;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}
.save:disabled {
  opacity: 0.5;
  cursor: default;
}
.smart:focus-visible,
.juz:focus-visible,
.day:focus-visible,
.num:focus-visible,
.save:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>
