# Quickstart: Align Foundation Layer

**Feature**: 001-align-foundation
**Date**: 2026-05-02

## Prerequisites

- Node.js 18+
- PostgreSQL running via Docker Compose
- `DATABASE_URL` set in `frontend/.env.local`

## Setup

```bash
cd frontend

# 1. Install dependencies (if not already done)
npm install

# 2. Start PostgreSQL
docker-compose up -d

# 3. Generate migration from the new schema
npm run db:generate

# 4. Apply migration
npm run db:migrate

# 5. Verify build compiles
npm run build
```

## Verification Checklist

1. **USOM Types**: Open `frontend/src/usom/types/primitives.ts` and verify all types from `docs/usom-design.md` Section 2 are present.
2. **Drizzle Schema**: Open `frontend/src/lib/db/schema.ts` and verify all 15+ tables are defined with `user_id`, `schema_version`, indexes, and constraints.
3. **Repository Interfaces**: Open `frontend/src/usom/interfaces/irepository.ts` and verify all interfaces use USOM types only.
4. **Repository Implementations**: Open `frontend/src/lib/db/repositories/` and verify implementations exist for all interfaces.
5. **No Drizzle Leakage**: Run `grep -r "drizzle-orm" frontend/src/nexus/ frontend/src/domains/ frontend/src/usom/` — must return nothing.
6. **Old Code Removed**: Verify `frontend/src/lib/db/queries.ts` no longer exists.

## Key Files Changed

| File | Action | Purpose |
|---|---|---|
| `usom/types/primitives.ts` | CREATE | Shared Primitives and enums |
| `usom/types/objects.ts` | REWRITE | Core Objects (Task, Habit, etc.) |
| `usom/types/process.ts` | CREATE | Process Objects (ContextSnapshot, etc.) |
| `usom/types/summaries.ts` | CREATE | Summary subtypes |
| `usom/interfaces/irepository.ts` | REWRITE | All Repository interfaces |
| `lib/db/schema.ts` | REWRITE | Full Drizzle schema |
| `lib/db/queries.ts` | DELETE | Replaced by repositories/ |
| `lib/db/repositories/*.ts` | CREATE | Repository implementations + mappers |

## Architecture Constraints Enforced

- **R-01**: No Drizzle imports outside `lib/db/repositories/` and `lib/db/schema.ts`
- **R-02**: All Repository methods accept/return USOM types
- **R-03**: Bidirectional USOM-DB mapping via `mappers.ts`
- **R-04**: UI receives only USOM objects
- **T-01**: All tables have `user_id` FK
- **T-02**: All queries filter by `user_id`
- **T-03**: USOM Core Objects don't expose `userId`
- **T-04**: Snapshots include `userId`
