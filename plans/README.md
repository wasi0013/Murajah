# Plans

Design and implementation planning docs. Two tiers:

- **This directory** — active or recently-shipped feature plans still worth reading in full.
- **`archive/`** — the 2026 rewrite (Phase 0–11) and its supporting audits, plus later standalone plans that have fully shipped with nothing left open. Kept for history; source comments still cite a few of these by path (legacy migration, PWA cutover, design tokens), so don't rename or delete files under `archive/` without grepping the codebase for that path first.

## Active

| Doc | What it's for |
|---|---|
| [`partial-page-tracking.md`](./partial-page-tracking.md) | Sub-page memorization marking design. Built and shipped (see `../tasks/todo.md`); kept active because its "Key Assumptions to Validate" (line-fill legibility, the two-tap gesture, marking directly on the mushaf) are genuinely unresolved pending real usage. |
| [`phase-12-journal.md`](./phase-12-journal.md) | Practice Journal design + task log. Built and merged, marked "not yet reviewed or shipped to production." |

## Archive

The 2026 redesign (`archive/redesign-2026.md` is the master plan) that replaced the legacy `source/` app end to end, plus everything built after it that has fully shipped:

| Doc | What it's for |
|---|---|
| `redesign-2026.md` | Master plan and phase index for the whole rewrite. |
| `phase-0-foundations.md` … `phase-11-cutover-launch.md` | Per-phase task breakdowns (scaffold → design system → reader → memorization → plans/goals → quiz → audio → navigation/listen → routing/progress → PWA migration → cutover). All complete. |
| `audit-assets-data.md`, `domain-logic-port-map.md` | Phase 0 audit deliverables that grounded the rewrite's data and porting decisions. |
| `legacy-schema.md`, `legacy-hardcoded-tables.md` | Reference docs for the legacy data shapes and per-layout tables the migration/recovery code still has to reason about. |
| `design-direction.md` | Phase 2.1 design-language sign-off ("Mihrab") that `design/tokens.css` still cites. |
| `ux-audit-2026.md` | Post-launch navigation/layout audit — its P1/P2 recommendations (shell-level tab bar, desktop nav rail) are already implemented. |
| `preview-shareable-viewer.md` | `/preview` shareable verse-highlight viewer — fully shipped. |

Nothing in `archive/` is a live spec — treat it as a record of decisions made and why, not a todo list.
