# Implementation Plan: Align Foundation Layer (USOM + Schema + Repository)

**Branch**: `001-align-foundation` | **Date**: 2026-05-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-align-foundation/spec.md`

## Summary

Align three foundation layers with their authoritative design documents:
1. **USOM types** — rewrite `usom/types/objects.ts` to match `docs/usom-design.md` field-by-field
2. **Drizzle schema** — rewrite `lib/db/schema.ts` to match `docs/database-design.md` with all 15 Day-1 tables, `user_id`, indexes, and constraints
3. **Repository layer** — replace `queries.ts` with proper interfaces in `usom/interfaces/` and implementations with USOM-DB mapping in `lib/db/repositories/`, enforcing R-01~R-04 and T-01~T-04

## Technical Context

**Language/Version**: TypeScript 5, running on Next.js 16.1.6
**Primary Dependencies**: Drizzle ORM 0.45.1, drizzle-kit 0.31.9, postgres.js (postgres driver)
**Storage**: PostgreSQL via Docker Compose
**Testing**: `npm run build` (TypeScript compilation) + `npm run db:generate` / `npm run db:migrate` (migration validation)
**Target Platform**: Web application (Next.js SSR/CSR)
**Project Type**: Web application (monorepo structure with `frontend/` as the app)
**Performance Goals**: N/A (this is a structural alignment, no runtime performance changes)
**Constraints**: Zero functional regressions; all changes must compile cleanly; migration must apply to fresh DB
**Scale/Scope**: ~15 DB tables, ~30 USOM types/interfaces, ~10 Repository interfaces + implementations

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Constraint | Status | Notes |
|---|---|---|
| I. Intent-Driven (Intent Engine sole entry point) | **PASS** | This spec is data layer only; no write paths are being created. |
| II. Energy-First Scheduling | **PASS** | Schema includes energy fields; no scheduling logic in scope. |
| III. Single-Writer Invariant | **PASS** | No component writes are being created; only data structures. |
| IV. USOM Sovereignty | **PASS** | This is the *implementation* of USOM sovereignty — aligning code to docs. |
| V. Repository Interface Isolation (R-01~R-04) | **PASS** | This is the *primary target* — enforcing all four R constraints. |
| VI. Domain Plugin Passivity | **PASS** | No Domain Plugin changes in this spec. |
| VII. Bridge Layer Readiness (A-D) | **PASS** | Repository signatures use USOM types, not HTTP context (constraint D). |
| VIII. AI/Rule Boundary | **PASS** | No AI or Rule Engine code in scope. |
| T-01 (all tables have user_id) | **ENFORCING** | This spec adds `user_id` to all tables. |
| T-02 (all queries filter by user_id) | **ENFORCING** | This spec adds `userId` to all Repository methods. |
| T-03 (Nexus unaware of user_id) | **PASS** | Repository hides `user_id` from USOM objects per design. |
| T-04 (snapshots include userId) | **PASS** | ContextSnapshot/USOMSnapshot will include `userId` field. |
| G-01~G-08 | **PASS** | All governance rules respected; no violations. |

**Gate Result**: PASS — no violations. This feature *enforces* constitutional constraints rather than introducing new patterns.

## Project Structure

### Documentation (this feature)

```text
specs/001-align-foundation/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
frontend/src/
├── usom/
│   ├── index.ts                          # Re-exports (update)
│   ├── types/
│   │   ├── primitives.ts                 # NEW: Shared Primitives (Section 2)
│   │   ├── objects.ts                    # REWRITE: Core Objects (Section 3)
│   │   ├── process.ts                    # NEW: Process Objects (Section 4)
│   │   └── summaries.ts                  # NEW: Summary subtypes (Section 5)
│   └── interfaces/
│       └── irepository.ts                # REWRITE: All Repository interfaces
├── lib/
│   └── db/
│       ├── index.ts                      # KEEP: DB instance export
│       ├── pool.ts                       # KEEP: Connection pool
│       ├── schema.ts                     # REWRITE: Full Drizzle schema
│       ├── queries.ts                    # DELETE: Replace with repositories/
│       └── repositories/                 # NEW: Repository implementations
│           ├── index.ts                  # Re-exports
│           ├── mappers.ts                # NEW: USOM ↔ DB mapping functions
│           ├── task.repository.ts        # NEW
│           ├── habit.repository.ts       # NEW
│           ├── habit-log.repository.ts   # NEW
│           ├── timebox.repository.ts     # NEW
│           ├── objective.repository.ts   # NEW
│           ├── key-result.repository.ts  # NEW
│           ├── intention.repository.ts   # NEW
│           ├── review.repository.ts      # NEW
│           ├── user.repository.ts        # NEW
│           ├── user-calibration.repository.ts # NEW
│           ├── system-event.repository.ts     # NEW (append-only)
│           ├── context-snapshot.repository.ts # NEW
│           ├── action-surface.repository.ts   # NEW
│           ├── derived-signals.repository.ts  # NEW
│           └── energy-log.repository.ts       # NEW
├── nexus/                                # UNTOUCHED: Empty dirs, no changes
├── domains/                              # UNTOUCHED: Existing task handler stays
└── app/                                  # UNTOUCHED: Default Next.js pages
```

**Structure Decision**: All changes are within the existing `frontend/src/` structure. The key additions are `usom/types/primitives.ts`, `usom/types/process.ts`, `usom/types/summaries.ts` (splitting the monolithic `objects.ts`), and `lib/db/repositories/` (replacing `queries.ts`).

## Implementation Phases

### Phase A: USOM Types Rewrite

**Files**: `usom/types/primitives.ts`, `usom/types/objects.ts`, `usom/types/process.ts`, `usom/types/summaries.ts`, `usom/index.ts`

1. Create `primitives.ts` — all Shared Primitives from USOM design doc Section 2:
   - `USOM_ID`, `Timestamp`, `DateOnly`, `DurationMinutes`
   - Enums: `Priority`, `EnergyLevel`, `PeriodType`, `TimeOfDay`
   - Energy types: `EnergyScore`, `EnergySource`, `EnergyState`, `Chronotype`, `EnergyCurvePoint`, `EnergySensitivity`
   - Utility: `Tag`, `Notes`
   - Status enums: `ObjectiveStatus`, `KeyResultStatus`, `TaskStatus`, `HabitStatus`, `HabitLogStatus`, `TimeboxStatus`, `ReviewStatus`, `IntentionStatus`

2. Rewrite `objects.ts` — Core Objects from Section 3:
   - `User`, `UserCalibration`, `RuleOverrideEntry`
   - `Intention`, `StructuredIntent`
   - `Objective`, `KeyResult`
   - `Task`, `Habit` (with `HabitFrequency`), `HabitLog`
   - `Timebox`, `Review` (with `ReviewSection`, `ReviewMetrics`)
   - `RecurrenceRule` (MVP stub, type only)

3. Create `process.ts` — Process Objects from Section 4:
   - `ContextSnapshot`, `USOMSnapshot`
   - `DerivedSignals`
   - `DomainPlugin` (four-hook interface), `DomainManifest`, `MetricUpdate`, `ActionSurfaceSuggestion`
   - `StateProposal`, `USOMObjectType`
   - `SystemEvent`, `SystemEventType` (with all event type literals)
   - `ActionCandidate`, `ActionCategory`, `ActionType`
   - `ExternalEvent`, `ExternalSourceType`

4. Create `summaries.ts` — Summary subtypes from Section 5:
   - `TaskSummary`, `HabitSummary`, `TimeboxSummary`
   - `ObjectiveSummary`, `KeyResultSummary`, `IntentionSummary`

5. Update `usom/index.ts` — re-export from all four type files.

### Phase B: Drizzle Schema Rewrite

**Files**: `lib/db/schema.ts`

1. Delete entire contents of `schema.ts` — all existing tables are incorrect.
2. Rewrite with 15 Day-1 tables in dependency order:
   - `users` — Section 3.1
   - `user_calibration` — Section 3.2 (unique on `user_id`)
   - `energy_logs` — Section 3.3
   - `objectives` — Section 4.1
   - `key_results` — Section 4.2 (FK to objectives)
   - `tasks` — Section 4.3 (FK to key_results, soft ref timebox_id)
   - `habits` — Section 4.4 (FK to key_results)
   - `habit_logs` — Section 4.5 (FK to habits, unique on habit_id+date)
   - `timeboxes` — Section 4.6
   - `reviews` — Section 4.7
   - `timebox_tasks` — Section 5.1 (composite PK)
   - `timebox_habits` — Section 5.2 (composite PK)
   - `intentions` — Section 6.1
   - `structured_intents` — Section 6.2 (FK to intentions)
   - `system_events` — Section 7.2 (FK to context_snapshots)
   - `context_snapshots` — Section 7.1
   - `action_surfaces` — Section 7.3 (FK to context_snapshots)
   - `derived_signals` — Section 7.4 (unique on user_id)

3. Add `state_proposals` — Section 6.3 (MVP optional but included since it's just a table def).

4. All tables include:
   - `user_id` UUID FK to `users(id)` with `onDelete('cascade')` (except `users` itself)
   - `schema_version` integer default 1 (where applicable)
   - Audit timestamps (`created_at`, `updated_at`, etc.)
   - Drizzle `.index()` calls for all indexes from design doc

5. Remove dead code: `tasksRelations`, `okrsRelations`, `timeboxesRelations`, `indexes` exports (Drizzle 0.45 uses `relations()` API or inline index definitions).

### Phase C: Repository Interfaces

**Files**: `usom/interfaces/irepository.ts`

1. Delete entire contents — all existing interfaces are incorrect.
2. Define typed Repository interfaces matching design doc Section 11:
   - `ITaskRepository`: `findById`, `findByStatus`, `findByTimebox`, `save`, `archive`
   - `IHabitRepository`: `findById`, `findActive`, `findByFrequency`, `save`, `archive`
   - `IHabitLogRepository`: `findByHabitAndDate`, `findByUserAndDate`, `save` (no update/delete)
   - `ITimeboxRepository`: `findById`, `findRunning`, `findUpcoming`, `save`, `archive`
   - `IObjectiveRepository`: `findById`, `findActive`, `save`, `archive`
   - `IKeyResultRepository`: `findById`, `findByObjective`, `save`, `archive`
   - `IIntentionRepository`: `findById`, `findByStatus`, `save`, `archive`
   - `IReviewRepository`: `findById`, `findByPeriod`, `save`, `archive`
   - `IUserRepository`: `findById`, `findByEmail`, `save`
   - `IUserCalibrationRepository`: `findByUserId`, `save`, `initializeDefaults`
   - `ISystemEventRepository`: `append`, `findByUserInRange` (no update/delete)
   - `IContextSnapshotRepository`: `findLatest`, `save`
   - `IActionSurfaceRepository`: `findLatest`, `save`
   - `IDerivedSignalsRepository`: `findByUser`, `upsert`
   - `IEnergyLogRepository`: `findByUserInRange`, `save`
3. All methods use USOM types as parameters/returns and accept `userId: USOM_ID` where T-02 requires.

### Phase D: Repository Implementations

**Files**: `lib/db/repositories/*.ts`

1. Create `mappers.ts` — bidirectional USOM ↔ DB mapping functions:
   - `taskRowToUSOM(row): Task`, `taskUSOMToRow(task): InsertTask`
   - Same for Habit (with frequency_type/days_of_week destructuring)
   - Same for Timebox (with junction table aggregation for taskIds/habitIds)
   - Same for Objective (with keyResultIds aggregation from key_results)
   - Same for all other objects
   - Handle JSONB parsing/serialization for tags, sections, metrics, curves, etc.

2. Create individual Repository files — each imports `db` from `../index`, `schema` from `../schema`, mapper functions from `./mappers`, and implements the corresponding interface.

3. Create `repositories/index.ts` — exports all Repository classes.

### Phase E: Cleanup & Migration

1. Delete `lib/db/queries.ts` entirely.
2. Fix `lib/db/index.ts` if it re-exports from `queries.ts`.
3. Fix `lib/db/pool.ts` — remove reference to `@/env.mjs` (file doesn't exist); use `process.env.DATABASE_URL` directly or keep consistent with `index.ts`.
4. Generate migration: `npm run db:generate`
5. Verify: `npm run build` compiles without errors.

### Phase F: Verification

1. Grep for Drizzle imports in `nexus/`, `domains/`, `usom/` — must be zero.
2. Verify all Repository methods include `userId` parameter.
3. Verify SystemEventRepository and HabitLogRepository have no update/delete methods.
4. Verify TypeScript compilation succeeds.

## Dependency Order

```
Phase A (USOM Types) ──→ Phase C (Repository Interfaces)
                                │
Phase B (Drizzle Schema) ──→ Phase D (Repository Implementations)
                                │
                                ├──→ Phase E (Cleanup & Migration)
                                │           │
                                │           └──→ Phase F (Verification)
```

Phases A and B can be done in parallel since they are independent (types vs schema). Phase C depends on A (interfaces use USOM types). Phase D depends on B and C (implementations use schema and implement interfaces). Phase E depends on D. Phase F depends on E.

## Complexity Tracking

No constitutional violations — this feature enforces constraints rather than introducing exceptions.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| N/A | N/A | N/A |
