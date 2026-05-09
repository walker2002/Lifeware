# Repository Interface Contracts

**Feature**: 001-align-foundation
**Date**: 2026-05-02

These contracts define the boundary between Nexus components (consumers) and the data layer (providers). All consumers depend on these interfaces only — never on Drizzle or schema code.

## Interface Definitions

### ITaskRepository

```typescript
interface ITaskRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Task | null>
  findByStatus(status: TaskStatus, userId: USOM_ID): Promise<Task[]>
  findByTimebox(timeboxId: USOM_ID, userId: USOM_ID): Promise<Task[]>
  findActive(userId: USOM_ID): Promise<Task[]>
  save(task: Task, userId: USOM_ID): Promise<void>
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}
```

### IHabitRepository

```typescript
interface IHabitRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Habit | null>
  findActive(userId: USOM_ID): Promise<Habit[]>
  findByFrequency(frequencyType: HabitFrequency['type'], userId: USOM_ID): Promise<Habit[]>
  save(habit: Habit, userId: USOM_ID): Promise<void>
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}
```

### IHabitLogRepository

```typescript
interface IHabitLogRepository {
  findByHabitAndDate(habitId: USOM_ID, date: DateOnly, userId: USOM_ID): Promise<HabitLog | null>
  findByUserAndDate(date: DateOnly, userId: USOM_ID): Promise<HabitLog[]>
  findByHabit(habitId: USOM_ID, userId: USOM_ID): Promise<HabitLog[]>
  save(log: HabitLog, userId: USOM_ID): Promise<void>
  // NO update/delete — HabitLog is an immutable fact record
}
```

### ITimeboxRepository

```typescript
interface ITimeboxRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Timebox | null>
  findRunning(userId: USOM_ID): Promise<Timebox[]>
  findUpcoming(userId: USOM_ID, withinHours?: number): Promise<Timebox[]>
  findByDateRange(start: Timestamp, end: Timestamp, userId: USOM_ID): Promise<Timebox[]>
  save(timebox: Timebox, userId: USOM_ID): Promise<void>
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}
```

### IObjectiveRepository

```typescript
interface IObjectiveRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Objective | null>
  findActive(userId: USOM_ID): Promise<Objective[]>
  save(objective: Objective, userId: USOM_ID): Promise<void>
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}
```

### IKeyResultRepository

```typescript
interface IKeyResultRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<KeyResult | null>
  findByObjective(objectiveId: USOM_ID, userId: USOM_ID): Promise<KeyResult[]>
  save(keyResult: KeyResult, userId: USOM_ID): Promise<void>
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}
```

### IIntentionRepository

```typescript
interface IIntentionRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Intention | null>
  findByStatus(status: IntentionStatus, userId: USOM_ID): Promise<Intention[]>
  save(intention: Intention, userId: USOM_ID): Promise<void>
  dissolve(id: USOM_ID, userId: USOM_ID): Promise<void>
}
```

### IStructuredIntentRepository

```typescript
interface IStructuredIntentRepository {
  findByIntention(intentionId: USOM_ID, userId: USOM_ID): Promise<StructuredIntent | null>
  save(structuredIntent: StructuredIntent, userId: USOM_ID): Promise<void>
}
```

### IReviewRepository

```typescript
interface IReviewRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Review | null>
  findByPeriod(start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Review[]>
  findByType(type: PeriodType, userId: USOM_ID): Promise<Review[]>
  save(review: Review, userId: USOM_ID): Promise<void>
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
}
```

### IUserRepository

```typescript
interface IUserRepository {
  findById(id: USOM_ID): Promise<User | null>
  findByEmail(email: string): Promise<User | null>
  save(user: User): Promise<void>
}
```

### IUserCalibrationRepository

```typescript
interface IUserCalibrationRepository {
  findByUserId(userId: USOM_ID): Promise<UserCalibration | null>
  save(calibration: UserCalibration): Promise<void>
  initializeDefaults(userId: USOM_ID): Promise<UserCalibration>
}
```

### ISystemEventRepository

```typescript
interface ISystemEventRepository {
  append(event: SystemEvent, userId: USOM_ID): Promise<void>
  findByUserInRange(userId: USOM_ID, startAt: Timestamp, endAt: Timestamp): Promise<SystemEvent[]>
  findUnprocessed(userId: USOM_ID): Promise<SystemEvent[]>
  markProcessed(id: USOM_ID, userId: USOM_ID): Promise<void>
  // NO update of event data / NO delete — append-only
}
```

### IContextSnapshotRepository

```typescript
interface IContextSnapshotRepository {
  findLatest(userId: USOM_ID): Promise<ContextSnapshot | null>
  save(snapshot: ContextSnapshot, userId: USOM_ID): Promise<void>
}
```

### IActionSurfaceRepository

```typescript
interface IActionSurfaceRepository {
  findLatest(userId: USOM_ID): Promise<ActionSurface | null>
  save(surface: ActionSurface, userId: USOM_ID): Promise<void>
}
```

### IDerivedSignalsRepository

```typescript
interface IDerivedSignalsRepository {
  findByUser(userId: USOM_ID): Promise<DerivedSignals | null>
  upsert(signals: DerivedSignals, userId: USOM_ID): Promise<void>
  // upsert restricted to Memory Framework consumers only
}
```

### IEnergyLogRepository

```typescript
interface IEnergyLogRepository {
  findByUserInRange(userId: USOM_ID, startAt: Timestamp, endAt: Timestamp): Promise<EnergyLog[]>
  save(log: EnergyLog, userId: USOM_ID): Promise<void>
}
```

## Mapping Contract: mappers.ts

The `mappers.ts` file exports pure functions for each entity:

```typescript
// For each entity E:
function eRowToUSOM(row: ERow): E
function eUSOMToRow(usom: E, userId: USOM_ID): EInsert
```

Where `ERow` is the Drizzle select output type and `EInsert` is the Drizzle insert input type.

### Special mappings

- `objectiveRowToUSOM`: queries `key_results` for `keyResultIds`
- `timeboxRowToUSOM`: queries junction tables for `taskIds` and `habitIds`
- `habitRowToUSOM`: assembles `HabitFrequency` from `frequency_type` + `days_of_week`
- `habitUSOMToRow`: destructures `HabitFrequency` into `frequency_type` + `days_of_week`
- All timestamp fields: `Date` ↔ ISO string conversion
- All JSONB fields: parse/stringify with type assertions
