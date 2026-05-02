# Tasks: Align Foundation Layer (USOM + Schema + Repository)

**Input**: Design documents from `/specs/001-align-foundation/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — no test tasks included.

**Organization**: All three user stories (USOM Types, Database Schema, Repository Layer) are P1 but have a strict dependency chain: US1 (types) → US2 (schema) → US3 (repositories). Tasks are ordered accordingly.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- All paths relative to `frontend/src/`
- USOM types: `usom/types/`
- Repository interfaces: `usom/interfaces/`
- Drizzle schema: `lib/db/schema.ts`
- Repository implementations: `lib/db/repositories/`

---

## Phase 1: Setup

**Purpose**: Create directory structure and prepare for type/schema/repository work.

- [x] T001 Create `frontend/src/lib/db/repositories/` directory for Repository implementations
- [x] T002 Delete `frontend/src/lib/db/queries.ts` (replaced by Repository pattern)

**Checkpoint**: Directory structure ready, old code removed

---

## Phase 2: Foundational — Shared Primitives & Status Enums

**Purpose**: Create the Shared Primitives file that ALL other types depend on. This MUST be complete before any US1/US2/US3 work can begin.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Create Shared Primitives file at `frontend/src/usom/types/primitives.ts` — define all types from `docs/usom-design.md` Section 2: `USOM_ID`, `Timestamp`, `DateOnly`, `Priority` enum, `EnergyLevel` enum, `EnergyScore`, `EnergySource`, `EnergyState` interface, `Chronotype`, `EnergyCurvePoint` interface, `EnergySensitivity`, `DurationMinutes`, `PeriodType` enum, `TimeOfDay`, `Tag`, `Notes`, and all status enums (`ObjectiveStatus`, `KeyResultStatus`, `TaskStatus`, `HabitStatus`, `HabitLogStatus`, `TimeboxStatus`, `ReviewStatus`, `IntentionStatus`)

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel

---

## Phase 3: User Story 1 — USOM Types Reflect Design Doc (Priority: P1)

**Goal**: All USOM type definitions match `docs/usom-design.md` field-by-field with zero discrepancies

**Independent Test**: Import each type from `usom/` and verify field names/types match the design doc sections

### Implementation for User Story 1

- [x] T004 [P] [US1] Rewrite Core Objects at `frontend/src/usom/types/objects.ts` — replace all existing types with design doc Section 3 definitions: `User`, `UserCalibration`, `RuleOverrideEntry`, `Intention`, `StructuredIntent`, `Objective`, `KeyResult`, `Task`, `Habit` (with `HabitFrequency`), `HabitLog`, `Timebox`, `Review` (with `ReviewSection`, `ReviewMetrics`), `RecurrenceRule` (MVP stub)
- [x] T005 [P] [US1] Create Process Objects at `frontend/src/usom/types/process.ts` — define all types from design doc Section 4: `ContextSnapshot`, `USOMSnapshot` (Readonly derived type), `DerivedSignals`, `DomainPlugin` (four-hook interface), `DomainManifest`, `MetricUpdate`, `ActionSurfaceSuggestion`, `StateProposal`, `USOMObjectType`, `SystemEvent`, `SystemEventType` (all event literals), `ActionCandidate`, `ActionCategory`, `ActionType`, `ExternalEvent`, `ExternalSourceType`
- [x] T006 [P] [US1] Create Summary subtypes at `frontend/src/usom/types/summaries.ts` — define from design doc Section 5: `TaskSummary`, `HabitSummary`, `TimeboxSummary`, `ObjectiveSummary`, `KeyResultSummary`, `IntentionSummary`
- [x] T007 [US1] Update barrel export at `frontend/src/usom/index.ts` — re-export from all four type files (`primitives.ts`, `objects.ts`, `process.ts`, `summaries.ts`) and from `interfaces/irepository.ts`
- [x] T008 [US1] Delete unused `frontend/src/usom/objects/` directory (empty, never used)

**Checkpoint**: All USOM types match design doc — `npm run build` should still pass (no consumers yet that break)

---

## Phase 4: User Story 2 — Database Schema Reflects Design Doc (Priority: P1)

**Goal**: Drizzle schema matches `docs/database-design.md` with all 15+ Day-1 tables, `user_id`, indexes, and constraints

**Independent Test**: Run `npm run db:generate` to produce migration; verify table/column/index definitions match design doc

### Implementation for User Story 2

- [x] T009 [US2] Rewrite full Drizzle schema at `frontend/src/lib/db/schema.ts` — delete all existing contents and define all Day-1 tables in dependency order: `users` (Section 3.1), `user_calibration` (Section 3.2 with unique user_id), `energy_logs` (Section 3.3), `objectives` (Section 4.1 with period_type/period_start/period_end and self-ref parent_id), `key_results` (Section 4.2 with target_value/current_value/progress_rate and FK to objectives), `tasks` (Section 4.3 with energy_required/estimated_duration and FK to key_results), `habits` (Section 4.4 with frequency_type/scheduled_time/days_of_week), `habit_logs` (Section 4.5 with unique habit_id+date), `timeboxes` (Section 4.6 with is_recurring), `reviews` (Section 4.7 with sections/metrics JSONB), `timebox_tasks` (Section 5.1 composite PK), `timebox_habits` (Section 5.2 composite PK), `intentions` (Section 6.1), `structured_intents` (Section 6.2 with FK to intentions), `state_proposals` (Section 6.3 MVP optional), `system_events` (Section 7.2 with FK to context_snapshots), `context_snapshots` (Section 7.1 with energy_state JSONB), `action_surfaces` (Section 7.3), `derived_signals` (Section 7.4 with unique user_id) — all tables include `user_id` FK to `users(id)` with `onDelete('cascade')`, `schema_version` integer default 1, all indexes from design doc, and CHECK constraints where specified
- [x] T010 [US2] Generate migration by running `cd frontend && npm run db:generate` and verify output SQL matches design doc expectations
- [x] T011 [US2] Fix `frontend/src/lib/db/pool.ts` — remove import of non-existent `@/env.mjs`, use `process.env.DATABASE_URL` directly for connection string (consistent with `index.ts`)
- [x] T012 [US2] Verify `frontend/src/lib/db/index.ts` still correctly exports `db` instance and re-exports from `schema.ts` (no reference to deleted `queries.ts`)

**Checkpoint**: Schema compiles, migration generates cleanly — ready for Repository implementations

---

## Phase 5: User Story 3 — Repository Layer Enforces Isolation (Priority: P1)

**Goal**: All Repository interfaces use USOM types, all implementations include `user_id` filtering, USOM-DB mapping handles structural differences, old `queries.ts` deleted

**Independent Test**: `npm run build` passes; grep confirms zero Drizzle imports outside `lib/db/repositories/` and `lib/db/schema.ts`

### Implementation for User Story 3

- [x] T013 [US3] Rewrite Repository interfaces at `frontend/src/usom/interfaces/irepository.ts` — delete all existing interfaces and define per contracts: `IUserRepository`, `IUserCalibrationRepository`, `ITaskRepository`, `IHabitRepository`, `IHabitLogRepository` (no update/delete), `ITimeboxRepository`, `IObjectiveRepository`, `IKeyResultRepository`, `IIntentionRepository`, `IStructuredIntentRepository`, `IReviewRepository`, `ISystemEventRepository` (append-only with `markProcessed`), `IContextSnapshotRepository`, `IActionSurfaceRepository`, `IDerivedSignalsRepository` (findByUser + upsert only), `IEnergyLogRepository` — all methods accept `userId: USOM_ID` where T-02 requires and return USOM types
- [x] T014 [US3] Create USOM-DB mapper functions at `frontend/src/lib/db/repositories/mappers.ts` — implement bidirectional conversion for each entity: timestamp `Date` ↔ ISO string, JSONB parse/stringify for tags/sections/metrics/curves, `HabitFrequency` ↔ frequency_type+days_of_week destructuring, numeric string ↔ number conversion for KeyResult values, omit/inject `userId` per T-03/T-04
- [x] T015 [P] [US3] Create UserRepository at `frontend/src/lib/db/repositories/user.repository.ts` implementing `IUserRepository` — `findById`, `findByEmail`, `save` using Drizzle queries against `users` table, with mapper conversions
- [x] T016 [P] [US3] CreateUserCalibrationRepository at `frontend/src/lib/db/repositories/user-calibration.repository.ts` implementing `IUserCalibrationRepository` — `findByUserId`, `save`, `initializeDefaults` with baselineCurve JSONB handling
- [x] T017 [P] [US3] Create TaskRepository at `frontend/src/lib/db/repositories/task.repository.ts` implementing `ITaskRepository` — `findById`, `findByStatus`, `findByTimebox`, `findActive`, `save`, `archive` with user_id filtering and mapper
- [x] T018 [P] [US3] Create HabitRepository at `frontend/src/lib/db/repositories/habit.repository.ts` implementing `IHabitRepository` — `findById`, `findActive`, `findByFrequency`, `save`, `archive` with HabitFrequency mapping and user_id filtering
- [x] T019 [P] [US3] Create HabitLogRepository at `frontend/src/lib/db/repositories/habit-log.repository.ts` implementing `IHabitLogRepository` — `findByHabitAndDate`, `findByUserAndDate`, `findByHabit`, `save` (NO update/delete methods)
- [x] T020 [P] [US3] Create TimeboxRepository at `frontend/src/lib/db/repositories/timebox.repository.ts` implementing `ITimeboxRepository` — `findById`, `findRunning`, `findUpcoming`, `findByDateRange`, `save`, `archive` with junction table queries for taskIds/habitIds aggregation
- [x] T021 [P] [US3] Create ObjectiveRepository at `frontend/src/lib/db/repositories/objective.repository.ts` implementing `IObjectiveRepository` — `findById`, `findActive`, `save`, `archive` with keyResultIds aggregation from key_results table
- [x] T022 [P] [US3] Create KeyResultRepository at `frontend/src/lib/db/repositories/key-result.repository.ts` implementing `IKeyResultRepository` — `findById`, `findByObjective`, `save`, `archive` with numeric value conversions
- [x] T023 [P] [US3] Create IntentionRepository at `frontend/src/lib/db/repositories/intention.repository.ts` implementing `IIntentionRepository` — `findById`, `findByStatus`, `save`, `dissolve`
- [x] T024 [P] [US3] Create StructuredIntentRepository at `frontend/src/lib/db/repositories/structured-intent.repository.ts` implementing `IStructuredIntentRepository` — `findByIntention`, `save` with JSONB fields
- [x] T025 [P] [US3] Create ReviewRepository at `frontend/src/lib/db/repositories/review.repository.ts` implementing `IReviewRepository` — `findById`, `findByPeriod`, `findByType`, `save`, `archive` with sections/metrics JSONB handling
- [x] T026 [P] [US3] Create SystemEventRepository at `frontend/src/lib/db/repositories/system-event.repository.ts` implementing `ISystemEventRepository` — `append`, `findByUserInRange`, `findUnprocessed`, `markProcessed` (NO update of event data, NO delete — append-only)
- [x] T027 [P] [US3] Create ContextSnapshotRepository at `frontend/src/lib/db/repositories/context-snapshot.repository.ts` implementing `IContextSnapshotRepository` — `findLatest`, `save` with full JSONB snapshot data
- [x] T028 [P] [US3] Create ActionSurfaceRepository at `frontend/src/lib/db/repositories/action-surface.repository.ts` implementing `IActionSurfaceRepository` — `findLatest`, `save` with guide/tiles/cues JSONB
- [x] T029 [P] [US3] Create DerivedSignalsRepository at `frontend/src/lib/db/repositories/derived-signals.repository.ts` implementing `IDerivedSignalsRepository` — `findByUser`, `upsert` with energy_pattern/habit JSONB handling
- [x] T030 [P] [US3] Create EnergyLogRepository at `frontend/src/lib/db/repositories/energy-log.repository.ts` implementing `IEnergyLogRepository` — `findByUserInRange`, `save` with context JSONB
- [x] T031 [US3] Create barrel export at `frontend/src/lib/db/repositories/index.ts` — re-export all Repository classes and mapper functions

**Checkpoint**: All Repository implementations complete — `npm run build` must pass

---

## Phase 6: Polish & Cross-Cutting Verification

**Purpose**: Final cleanup and constitutional compliance verification

- [x] T032 Verify zero Drizzle imports outside allowed files: run `grep -rn "from 'drizzle-orm'" frontend/src/usom/ frontend/src/nexus/ frontend/src/domains/` and `grep -rn "from.*lib/db/schema" frontend/src/usom/ frontend/src/nexus/ frontend/src/domains/` — both must return empty
- [x] T033 Verify all Repository methods include `userId` parameter: run `grep -rn "userId.*USOM_ID" frontend/src/usom/interfaces/irepository.ts` and confirm all non-user interfaces have userId params
- [x] T034 Verify append-only constraints: confirm `SystemEventRepository` has no update/delete and `HabitLogRepository` has no update/delete by reading the interface file
- [x] T035 Run `cd frontend && npm run db:migrate` to apply migration to PostgreSQL and verify clean execution
- [x] T036 Run `cd frontend && npm run build` to verify TypeScript compilation succeeds with zero errors
- [x] T037 Run quickstart.md validation — follow all steps in `specs/001-align-foundation/quickstart.md` and confirm each verification checkpoint passes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (primitives.ts must exist)
- **US2 (Phase 4)**: Depends on US1 (schema imports USOM types for `$type<>` annotations)
- **US3 (Phase 5)**: Depends on US1 + US2 (Repository interfaces use USOM types; implementations use Drizzle schema)
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

```
Phase 2 (Primitives) ──→ Phase 3 (US1: Types)
                              │
                              ├──→ Phase 4 (US2: Schema)
                              │          │
                              │          └──→ Phase 5 (US3: Repositories)
                              │                      │
                              │                      └──→ Phase 6 (Verification)
```

### Within Each User Story

- Types before schema (schema may reference type definitions)
- Schema before repositories (repositories import schema tables)
- Interfaces before implementations (implementations implement interfaces)
- Mappers before individual repositories (repositories use mapper functions)

### Parallel Opportunities

**Phase 3 (US1)**: Tasks T004, T005, T006 can run in parallel (different files)
**Phase 5 (US3)**: Tasks T015-T030 can all run in parallel after T013 (interfaces) and T014 (mappers) are complete — each repository is an independent file

---

## Parallel Example: Phase 5 (US3 Repositories)

```bash
# After T013 (interfaces) and T014 (mappers) are complete,
# launch all repository implementations in parallel:

Task T015: "Create UserRepository at frontend/src/lib/db/repositories/user.repository.ts"
Task T016: "Create UserCalibrationRepository at frontend/src/lib/db/repositories/user-calibration.repository.ts"
Task T017: "Create TaskRepository at frontend/src/lib/db/repositories/task.repository.ts"
Task T018: "Create HabitRepository at frontend/src/lib/db/repositories/habit.repository.ts"
Task T019: "Create HabitLogRepository at frontend/src/lib/db/repositories/habit-log.repository.ts"
Task T020: "Create TimeboxRepository at frontend/src/lib/db/repositories/timebox.repository.ts"
Task T021: "Create ObjectiveRepository at frontend/src/lib/db/repositories/objective.repository.ts"
Task T022: "Create KeyResultRepository at frontend/src/lib/db/repositories/key-result.repository.ts"
Task T023: "Create IntentionRepository at frontend/src/lib/db/repositories/intention.repository.ts"
Task T024: "Create StructuredIntentRepository at frontend/src/lib/db/repositories/structured-intent.repository.ts"
Task T025: "Create ReviewRepository at frontend/src/lib/db/repositories/review.repository.ts"
Task T026: "Create SystemEventRepository at frontend/src/lib/db/repositories/system-event.repository.ts"
Task T027: "Create ContextSnapshotRepository at frontend/src/lib/db/repositories/context-snapshot.repository.ts"
Task T028: "Create ActionSurfaceRepository at frontend/src/lib/db/repositories/action-surface.repository.ts"
Task T029: "Create DerivedSignalsRepository at frontend/src/lib/db/repositories/derived-signals.repository.ts"
Task T030: "Create EnergyLogRepository at frontend/src/lib/db/repositories/energy-log.repository.ts"
```

---

## Implementation Strategy

### MVP First (All Three Stories Required)

All three user stories are foundational — none is optional. The "MVP" is completing all three because they form a single coherent data layer.

1. Complete Phase 1: Setup (delete old code, create dirs)
2. Complete Phase 2: Foundational (primitives.ts)
3. Complete Phase 3: US1 — USOM Types
4. Complete Phase 4: US2 — Database Schema + Migration
5. Complete Phase 5: US3 — Repositories (16 implementations in parallel)
6. Complete Phase 6: Verification
7. **STOP and VALIDATE**: Full build + migration + grep checks

### Execution Order (Sequential)

Since all three stories are P1 and have strict dependencies, the recommended execution is sequential:
1. T001-T002 (Setup, ~5 min)
2. T003 (Primitives, ~15 min)
3. T004-T008 (USOM Types, ~30 min)
4. T009-T012 (Schema, ~30 min)
5. T013-T031 (Repositories, ~60 min — or parallelized across agents)
6. T032-T037 (Verification, ~15 min)

**Total estimated effort**: ~2.5 hours sequential, ~1.5 hours with parallelization

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All three stories (US1, US2, US3) are P1 but have strict sequential dependencies
- Commit after each phase completion
- Stop at any checkpoint to validate independently
- The `domains/tasks/` handler references old USOM types and will break — this is expected and will be fixed in a follow-up task when Domain Plugin interfaces are finalized
