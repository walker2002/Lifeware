# Research: Align Foundation Layer

**Feature**: 001-align-foundation
**Date**: 2026-05-02

## Research Items

### 1. Drizzle ORM 0.45.1 Schema Capabilities

**Decision**: Use Drizzle's `pgTable` with inline index definitions via `.index()` method and `uniqueIndex()` for unique constraints.

**Rationale**: Drizzle 0.45 supports inline indexes on column definitions (e.g., `index("idx_name").on(table.column)`), check constraints via `.check()`, and composite primary keys via `primaryKey()` in `pgTable`. This covers all design doc requirements including partial indexes (WHERE clauses).

**Alternatives considered**:
- Separate `pgIndex()` calls — more verbose but equally valid; inline is preferred for co-location with column definitions.
- Raw SQL constraints via `$default` — unnecessary; Drizzle has first-class support.

### 2. USOM Type File Organization

**Decision**: Split the monolithic `objects.ts` into four files: `primitives.ts`, `objects.ts`, `process.ts`, `summaries.ts`.

**Rationale**: The USOM design doc has clear section boundaries (Sections 2-5). Splitting along these lines makes it easy to find types and keeps each file under 200 lines. The `usom/index.ts` barrel re-exports everything, so consumers see no difference.

**Alternatives considered**:
- Single large `objects.ts` — would be 500+ lines, hard to navigate.
- One file per object — too many small files, excessive imports.

### 3. USOM-DB Mapping Strategy

**Decision**: Use standalone mapper functions in a dedicated `mappers.ts` file within `repositories/`.

**Rationale**: The design doc specifies 6 structural differences (Section 11.2) that require non-trivial mapping: `Objective.keyResultIds` aggregation, `Timebox.taskIds`/`habitIds` junction queries, `Habit.frequency` decomposition, JSONB serialization for tags/sections/metrics/curves. Centralizing these in one file makes the mapping logic auditable and testable.

**Alternatives considered**:
- Inline mapping in each Repository method — scattered, hard to audit.
- Class-based mappers — over-engineering for pure functions.

### 4. Junction Table Handling for Timebox

**Decision**: TimeboxRepository methods that return `Timebox` objects will issue a separate query to `timebox_tasks` and `timebox_habits` junction tables, then inject the resulting ID arrays into the USOM object.

**Rationale**: Drizzle doesn't natively support M:N relationship aggregation into arrays. A separate query per Timebox is simple and correct. For list queries (e.g., `findUpcoming`), a batched approach queries all relevant junction rows in one call.

**Alternatives considered**:
- SQL JOIN with array_agg — would require raw SQL, violating the "no raw SQL" constraint.
- Embedding junction queries in the mapper — same behavior, just different organization.

### 5. `user_id` Visibility in USOM Objects

**Decision**: USOM Core Objects (Task, Habit, etc.) do NOT include `userId` as a field. The Repository injects `user_id` during persistence and filters by it during reads. `ContextSnapshot` and `USOMSnapshot` DO include `userId` per T-04.

**Rationale**: Constitution T-03 states "Nexus components MUST NOT be aware of `user_id`." By omitting `userId` from Core Objects and including it only in Snapshots (which are system-level), we enforce this constraint at the type level.

**Alternatives considered**:
- Adding `userId` to all USOM objects — violates T-03.
- Omitting `userId` from everywhere — violates T-04 and breaks Bridge Layer.

### 6. `pool.ts` vs `index.ts` DB Connection

**Decision**: Consolidate on `index.ts` pattern (using `postgres` + `drizzle()` directly). The `pool.ts` file references a non-existent `@/env.mjs` and creates a separate connection. We keep `pool.ts` for its health-check utility but remove the env import.

**Rationale**: Having two separate postgres connections (`pool.ts` and `index.ts`) is wasteful and confusing. The `index.ts` pattern is already used by `queries.ts` and is the standard Drizzle setup.

**Alternatives considered**:
- Delete `pool.ts` entirely — it has useful utilities (health check, close pool) that may be needed later.
- Keep both as-is — dual connections are a bug risk.

### 7. TypeScript `number` for DB `numeric` columns

**Decision**: Use Drizzle's `numeric` type with `$type<number>()` for KeyResult's `target_value`, `current_value`, `progress_rate` and other numeric fields.

**Rationale**: PostgreSQL `numeric` maps to string by default in Drizzle. Using `$type<number>()` tells Drizzle to handle the conversion. The USOM spec defines these as `number`, so we need the TypeScript type to match.

**Alternatives considered**:
- Use `real` instead of `numeric` — loses precision for financial/statistical values. Design doc says `numeric`.
- Accept string type and convert manually — extra boilerplate in every consumer.

### 8. Timestamp Handling: `Date` vs `string`

**Decision**: USOM types use `string` (ISO 8601) for `Timestamp` and `DateOnly`. Drizzle schema uses `timestamp('col', { withTimezone: true })` for `Timestamp` and `date` for `DateOnly`. The mapper converts between JS `Date` objects (from Drizzle) and ISO strings (in USOM).

**Rationale**: The USOM design doc explicitly defines `Timestamp = string` (ISO 8601 UTC) and `DateOnly = string` (YYYY-MM-DD). Drizzle's `timestamp` column returns JS `Date` objects. The mapper handles this conversion.

**Alternatives considered**:
- Use JS `Date` in USOM — violates the design doc which specifies ISO string.
- Use Drizzle's `text` for timestamps — loses PostgreSQL timestamp type safety and query capabilities.
