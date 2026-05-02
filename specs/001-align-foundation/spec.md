# Feature Specification: Align Foundation Layer (USOM + Schema + Repository)

**Feature Branch**: `001-align-foundation`
**Created**: 2026-05-02
**Status**: Draft
**Input**: Align USOM types, database schema, and repository layer with authoritative design docs (`docs/usom-design.md`, `docs/database-design.md`) and constitution constraints (R-01~R-04, T-01~T-04).

## User Scenarios & Testing

### User Story 1 - USOM Types Reflect Design Doc (Priority: P1)

As a developer building Nexus components, I need all USOM type definitions to match the authoritative `docs/usom-design.md` exactly, so that I can implement Intent Engine, Rule Engine, State Machine, and Domain plugins against a correct and complete type contract.

**Why this priority**: USOM types are the shared language of the entire system. Every component depends on them. Incorrect types propagate bugs across all layers.

**Independent Test**: Can be fully tested by comparing each exported type from `usom/types/` against the corresponding section in `docs/usom-design.md` and verifying field-for-field alignment.

**Acceptance Scenarios**:

1. **Given** the current simplified USOM types, **When** we align with the design doc, **Then** all Shared Primitives (USOM_ID, EnergyLevel, EnergyScore, EnergyState, Chronotype, EnergyCurvePoint, EnergySensitivity, DurationMinutes, PeriodType, TimeOfDay, Tag, Notes) exist as defined in Section 2.
2. **Given** the current Task type uses `estimatedTime`/`actualTime`, **When** aligned, **Then** Task uses `energyRequired`, `estimatedDuration`, `actualDuration`, `keyResultId`, `timeboxId`, `tags`, `notes` per Section 3.7.
3. **Given** ContextSnapshot currently has flat arrays, **When** aligned, **Then** it uses Summary subtypes (TaskSummary, HabitSummary, TimeboxSummary, ObjectiveSummary, KeyResultSummary, IntentionSummary) per Sections 4.1 and 5.
4. **Given** USOMSnapshot does not exist in code, **When** aligned, **Then** USOMSnapshot is defined as a `Readonly<>` derived type from ContextSnapshot per Section 4.2.
5. **Given** DerivedSignals is a generic record in code, **When** aligned, **Then** it matches the structured interface with energyPattern, activeTaskCount, habitStreaks, timeboxAdherence7d, isOvercommitted per Section 4.3.
6. **Given** DomainPlugin four-hook signature is incomplete, **When** aligned, **Then** all four hooks (onValidate, onEvent, onActionSurfaceRequest, onOutboundRequest) have correct signatures per Section 4.4.

---

### User Story 2 - Database Schema Reflects Design Doc (Priority: P1)

As a developer, I need the Drizzle schema to match `docs/database-design.md` exactly, including `user_id` on all tables, proper field types, junction tables, and indexes, so that the data layer correctly supports multi-tenancy and the full object model.

**Why this priority**: Database schema is the physical foundation. Without `user_id` and correct field structures, no Nexus component can operate correctly. Constitution constraints T-01~T-04 and the Repository pattern depend on this.

**Independent Test**: Can be fully tested by generating a migration and verifying the resulting PostgreSQL schema matches all table definitions in `docs/database-design.md` Sections 3-7, including indexes and constraints.

**Acceptance Scenarios**:

1. **Given** no `users` table exists, **When** schema is aligned, **Then** `users` table exists with `id`, `email`, `created_at`, `updated_at` per Section 3.1.
2. **Given** no `user_calibration` table exists, **When** schema is aligned, **Then** it exists with all energy/calibration fields per Section 3.2.
3. **Given** no `energy_logs` table exists, **When** schema is aligned, **Then** it exists with `level`, `source`, `context`, `logged_at` per Section 3.3.
4. **Given** no business table has `user_id`, **When** schema is aligned, **Then** all 14 business tables contain `user_id` foreign key referencing `users(id)` with `on delete cascade` (T-01).
5. **Given** no `habit_logs` table exists, **When** schema is aligned, **Then** it exists with unique constraint `(habit_id, date)` per Section 4.5.
6. **Given** no `timebox_tasks`/`timebox_habits` junction tables exist, **When** schema is aligned, **Then** both junction tables exist with composite primary keys per Sections 5.1-5.2.
7. **Given** no `intentions`/`structured_intents` tables exist, **When** schema is aligned, **Then** both exist per Sections 6.1-6.2.
8. **Given** `derived_signals` has a generic structure, **When** schema is aligned, **Then** it has per-user unique constraint and structured fields per Section 7.4.
9. **Given** all tables use `uuid` primary keys with `defaultRandom()`, **When** schema is aligned, **Then** `schema_version` integer column exists on all business tables.

---

### User Story 3 - Repository Layer Enforces Isolation (Priority: P1)

As a developer building Nexus components, I need Repository interfaces and implementations that accept and return USOM objects (not DB rows), handle `user_id` injection transparently, and provide bidirectional USOM-DB mapping, so that Nexus remains decoupled from Drizzle per constitution R-01~R-04.

**Why this priority**: The Repository pattern is the constitutional boundary between business logic and data storage. Without it, Nexus components would directly couple to Drizzle, violating the architecture.

**Independent Test**: Can be fully tested by verifying: (1) no Drizzle imports exist outside Repository files, (2) all Repository methods accept/return USOM types, (3) all queries include `user_id` filtering, (4) DB-to-USOM mapping produces correct objects.

**Acceptance Scenarios**:

1. **Given** `queries.ts` directly imports Drizzle and returns raw rows, **When** Repository is rewritten, **Then** Nexus-facing interfaces accept and return USOM objects exclusively (R-02).
2. **Given** no `user_id` filtering exists, **When** Repository is rewritten, **Then** all query methods accept `userId` parameter and filter accordingly (T-02).
3. **Given** DB row structure differs from USOM objects, **When** Repository is rewritten, **Then** explicit mapping functions convert between DB rows and USOM objects in both directions (R-03).
4. **Given** duplicate ITaskRepository exists in two files, **When** Repository is rewritten, **Then** a single set of Repository interfaces lives in `usom/interfaces/` and implementations in `lib/db/repositories/`.
5. **Given** `system_events` has update/delete methods, **When** Repository is rewritten, **Then** SystemEventRepository exposes only `insert` — no update/delete (append-only constraint).
6. **Given** HabitLogRepository doesn't exist, **When** Repository is rewritten, **Then** it provides `findByHabitAndDate`, `findByUserAndDate`, `save` — no update/delete (fact record constraint).

---

### Edge Cases

- What happens when a USOM field (e.g., `Objective.keyResultIds`) requires aggregation from a related table (`key_results.objective_id`)? The Repository must query the related table and inject the array during mapping.
- What happens when `Timebox.taskIds`/`habitIds` require junction table queries? The Repository must join through `timebox_tasks`/`timebox_habits` and aggregate.
- What happens when `Habit.frequency` (a composite object in USOM) maps to `frequency_type` + `days_of_week` in DB? The Repository must destructure on write and reassemble on read.

## Requirements

### Functional Requirements

- **FR-001**: USOM type definitions MUST include all Shared Primitives from `docs/usom-design.md` Section 2: USOM_ID, Timestamp, DateOnly, Priority, EnergyLevel, EnergyScore, EnergySource, EnergyState, Chronotype, EnergyCurvePoint, EnergySensitivity, DurationMinutes, PeriodType, TimeOfDay, Tag, Notes.
- **FR-002**: USOM type definitions MUST include all Core Objects from Section 3: User, UserCalibration, Intention, StructuredIntent, Objective, KeyResult, Task, Habit, HabitLog, Timebox, Review — with exact field names and types as specified.
- **FR-003**: USOM type definitions MUST include all Process Objects from Section 4: ContextSnapshot, USOMSnapshot, DerivedSignals, DomainPlugin (four hooks), StateProposal, SystemEvent, ActionCandidate, ExternalEvent.
- **FR-004**: USOM type definitions MUST include all Summary subtypes from Section 5: TaskSummary, HabitSummary, TimeboxSummary, ObjectiveSummary, KeyResultSummary, IntentionSummary.
- **FR-005**: Drizzle schema MUST define all "Day 1" tables from `docs/database-design.md` Section 12: users, user_calibration, energy_logs, tasks, habits, habit_logs, timeboxes, timebox_tasks, timebox_habits, intentions, structured_intents, system_events, context_snapshots, action_surfaces, derived_signals.
- **FR-006**: Every business table MUST contain `user_id` column as foreign key to `users(id)` with `on delete cascade`, satisfying constitution T-01.
- **FR-007**: Every business table MUST contain `schema_version` integer column with default value 1.
- **FR-008**: Drizzle schema MUST define all indexes specified in the design doc for each table.
- **FR-009**: Junction tables (`timebox_tasks`, `timebox_habits`) MUST use composite primary keys.
- **FR-010**: `habit_logs` MUST have a unique constraint on `(habit_id, date)`.
- **FR-011**: Repository interfaces MUST be defined in `usom/interfaces/` with methods that accept and return USOM types exclusively — no Drizzle types, no raw DB row objects (R-02).
- **FR-012**: Repository implementations MUST reside in `lib/db/repositories/` and contain all Drizzle imports and DB-to-USOM mapping logic (R-01, R-03).
- **FR-013**: All Repository query methods MUST accept a `userId` parameter and include it in WHERE clauses (T-02).
- **FR-014**: Nexus components MUST NOT import from `drizzle-orm` or `lib/db/schema` directly — only through Repository interfaces (R-01).
- **FR-015**: SystemEventRepository MUST expose only `append` (insert) — no update or delete methods.
- **FR-016**: HabitLogRepository MUST NOT expose update or delete methods (fact record immutability).
- **FR-017**: DerivedSignalsRepository MUST expose `findByUser` and `upsert` only; upsert restricted to Memory Framework consumers.
- **FR-018**: Repository mapping functions MUST handle structural differences: `Habit.frequency` (USOM object) ↔ `frequency_type` + `days_of_week` (DB columns), `Objective.keyResultIds` (aggregated from `key_results`), `Timebox.taskIds`/`habitIds` (aggregated from junction tables).
- **FR-019**: A Drizzle migration MUST be generated after schema changes that can be applied cleanly to a fresh PostgreSQL database.
- **FR-020**: The `queries.ts` file with its static Query classes and duplicate ITaskRepository MUST be removed; all data access consolidated through the new Repository pattern.

### Key Entities

- **USOM Types**: TypeScript interfaces defining the system's shared object model, serving as the single contract between all layers.
- **Drizzle Schema**: PostgreSQL table definitions using Drizzle ORM, serving as the physical data model.
- **Repository Interface**: Abstract interface in USOM layer defining data access contracts in USOM terms.
- **Repository Implementation**: Concrete class in DB layer implementing the interface with Drizzle queries and USOM-DB mapping.
- **USOM-DB Mapper**: Bidirectional conversion functions between USOM objects and database row objects.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All USOM types in `usom/types/` match `docs/usom-design.md` field-by-field with zero discrepancies.
- **SC-002**: All Drizzle schema tables match `docs/database-design.md` column-by-column with zero discrepancies, including all indexes and constraints.
- **SC-003**: Zero Drizzle imports (`from 'drizzle-orm'` or `from '../db/schema'`) exist in any file under `nexus/`, `domains/`, or `usom/` directories — verified by code search.
- **SC-004**: All Repository interface methods accept USOM types as parameters and return USOM types — verified by TypeScript type checking.
- **SC-005**: All Repository query methods include `user_id` filtering — verified by code review.
- **SC-006**: `npm run db:generate` produces a valid migration and `npm run db:migrate` applies cleanly to a fresh database.
- **SC-007**: `npm run build` completes without TypeScript errors after all changes.

## Assumptions

- The design documents (`docs/usom-design.md` v2026_03_21 and `docs/database-design.md` v2026_03_21) are the authoritative source and are correct as written.
- MVP batch ordering follows the design docs: "Day 1" tables first, OKR tables second, Review tables third. This spec covers all "Day 1" items.
- `state_proposals` table is "MVP optional" per the design doc and is included in the schema but may have a simpler Repository.
- `memories` and `external_events` tables are Phase 2 and NOT included in this alignment.
- The existing `domains/tasks/` code with its handler will be updated separately when Domain Plugin interfaces are finalized — this spec focuses on type/schema/repository alignment only.
- Authentication and user management (NextAuth, etc.) are out of scope — we define the `users` table but not the auth layer.
- The `RecurrenceRule` type is defined in USOM but marked "not in MVP" — it exists as a type/interface and as a nullable JSONB column in relevant tables, but no business logic is implemented.
- Energy calibration logic (computing `inferredLevel` from `UserCalibration.baselineCurve`) is out of scope for this spec — only the data structures and Repository access are included.
