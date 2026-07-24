# Domain-Logic Port Map (Phase 0 deliverable)

**Parent:** [redesign-2026.md](./redesign-2026.md) · [phase-0-foundations.md](./phase-0-foundations.md) task 0.7.
Classifies every module under `source/resources/js` for the greenfield `app/`.

**Key finding:** the `utils/*` modules are **already ESM (`export`) with zero Vue-runtime references** — pure, testable logic. They **port as-is** into `app/src/core/`. Stores carry light Vue coupling (port + adapt into Pinia). Components are Vue objects with inline `template:` strings + hardcoded old-Tailwind classes — they are **rewritten** as SFCs against the new design system.

Legend: **PORT** = move as-is (typing only) · **ADAPT** = move, decouple from Vue/globals · **REWRITE** = rebuild as Vue SFC · **DROP** = superseded by build tooling.

---

## utils/ → mostly `app/src/core/`
| Module | KB | Class | Target | Notes |
|---|---|---|---|---|
| `calculations.js` | 12 | PORT | `core/memorization/` | pure math |
| `pageHasanah.js` | 16 | PORT | `core/memorization/` | scoring |
| `weaknessScorer.js` | 8 | PORT | `core/memorization/` | scoring |
| `scoreFormatter.js` | 8 | PORT | `core/memorization/` | formatting |
| `planManager.js` | 36 | PORT | `core/memorization/` | largest logic unit; has tests |
| `planScheduler.js` | 28 | PORT | `core/memorization/` | scheduling; has tests |
| `dailyGoalsManager.js` | 16 | PORT | `core/memorization/` | streaks/goals |
| `quizHelpers.js` | 12 | PORT | `core/quiz/` | quiz logic (Phase 6) |
| `logger.js` | 4 | PORT | `core/` | tiny util |
| `resourceCache.js` | 28 | ADAPT | `core/storage/` | **rework** into IndexedDB cache v2 (Phase 1.7) |
| `unifiedDataLoader.js` | 28 | ADAPT | `core/data/` | becomes chunk-aware + worker-backed loader (Phase 1) |
| `dataLoader.js` | 12 | ADAPT | `core/data/` | fold into new data layer |
| `indopakDataLoader.js` | 16 | ADAPT | `core/data/` | fold into new data layer |
| `morphologyLoader.js` | 8 | ADAPT | `core/data/` | per-surah lazy loader |
| `audioLoader.js` | 12 | ADAPT | `core/audio/` | Phase 7 |
| `audioRecorder.js` | 12 | ADAPT | `core/audio/` | Phase 7 |
| `touchHelper.js` | 8 | ADAPT | `core/` or composable | gestures → likely a Vue composable |

## stores/ → `app/src/stores/` (Pinia)
| Module | KB | Class | Notes |
|---|---|---|---|
| `notesStore.js` | 12 | ADAPT | logic + IndexedDB → Pinia store over new storage layer |
| `i18nStore.js` | 8 | ADAPT | → Pinia i18n store; consider `vue-i18n` |
| `morphologyStore.js` | 4 | ADAPT | → Pinia, backed by `core/data` morphology loader |

## components/ → `app/src/features/**` (REWRITE as SFCs)
All are Vue option objects with inline templates and hardcoded Tailwind (e.g. `bg-white`, `from-blue-500`) — rebuilt against new tokens/design system, feature by feature.
| Component | KB | Target feature / phase |
|---|---|---|
| `QuranAudioPlayerComponent.js` | 72 | audio / Phase 7 (largest; split up) |
| `FloatingAudioPlayerComponent.js` | 16 | audio / Phase 7 |
| `PlanAudioCard.js` | 16 | audio+plans / Phase 7 |
| `NotesComponent.js` | 32 | notes / Phase 8 |
| `PlanSetupWizard.js` | 24 | plans / Phase 5 |
| `PlanCalendarComponent.js` | 16 | plans / Phase 5 |
| `PlanProgressView.js` | 12 | plans / Phase 5 |
| `PlanTodayCard.js` | 12 | plans / Phase 5 |
| `PlanSettingsModal.js` | 8 | plans / Phase 5 |
| `MorphologyPopupComponent.js` | 8 | reader / Phase 3 |
| `LanguageSelectionModal.js` | 4 | settings / Phase 8 |

## DROP (handled by the build / replaced)
- `vendor/tailwind.3.4.7.js` (runtime JIT → compiled Tailwind)
- `vendor/vue.global.js` (→ bundled Vue)
- `vendor/marked.min.js` (→ npm `marked`, lazy in notes)
- `vendor/hls.min.js` (→ npm `hls.js`, lazy in audio, only if still needed)
- `vendor/fontawesome/*` (→ tree-shaken `lucide-vue-next`)

---

## Reusable tests (the safety net)
Move existing unit tests alongside their ported modules — they validate PORT correctness with zero rewrite. Confirm coverage for: `planManager`, `planScheduler`, `dailyGoalsManager`, `weaknessScorer`, `pageHasanah`, `calculations`. Locate under `tests/unit` (root) during Phase 1.8 and port to `app/tests/unit`.

## Port order (follows the phase roadmap)
1. **Phase 1:** PORT the memorization/scoring core + ADAPT the data/storage loaders.
2. **Phase 3:** REWRITE reader + morphology popup SFCs.
3. **Phases 4–8:** REWRITE remaining feature components in phase order; ADAPT their stores as reached.
