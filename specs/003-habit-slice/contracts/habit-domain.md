# Contract: habits Domain Plugin

**Date**: 2026-05-09 | **Feature**: 003-habit-slice

## Interface: DomainPlugin (habits)

实现标准四钩子接口，遵循 Constitution Principle VI（域插件被动性）。

### onValidate

```typescript
onValidate(intent: StructuredIntent, snapshot: USOMSnapshot): ValidationResult
```

**处理的意图类型**:

| Intent Type | 验证规则 |
|-------------|----------|
| createHabit | title 非空, defaultTime HH:MM 有效, defaultDuration>0, minDuration>0 && <=defaultDuration, 时间窗口合法, frequencyType 合法枚举 |
| updateHabit | 同 createHabit 验证规则（仅验证提供的字段） |
| logHabit | habitId 存在且 active, trackable=true, 当日未重复打卡 |
| createTemplate | name 非空, applicableDays 非空数组 |
| addHabitToTemplate | habitId 存在且 active, timeOverride 在 earliestTime~latestEndTime 范围内, durationOverride >= minDuration |
| removeHabitFromTemplate | habitId 在模板中存在 |
| applyTemplate | templateId 存在且 active, applicableDays 包含当日星期 |

**返回**: `{ valid: boolean; errors: string[] }`

### onEvent

```typescript
onEvent(event: SystemEvent, snapshot: USOMSnapshot): EventResult
```

**处理的事件**:

| Event Type | Weight | Action Surface 建议 |
|------------|--------|---------------------|
| HabitCreated | 50 | 通知"新习惯已激活" |
| HabitStreakMilestone | 90 | 成就展示（7/14/30 天里程碑） |
| HabitLogged | 40 | 静默更新完成率 |
| HabitSkipped | 60 (streak<=3) / 80 (streak>3) | streak 保护提醒 |
| HabitDueSoon | 75 | 待打卡提醒（距 defaultTime < 30min） |

**返回**: `{ metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] }`

### onActionSurfaceRequest

```typescript
onActionSurfaceRequest(snapshot: USOMSnapshot, signals: Readonly<DerivedSignals>): ActionSurfaceResult
```

**返回的操作候选**:

| 条件 | ActionType | Weight |
|------|-----------|--------|
| 有待打卡的 trackable 习惯 | log_habit | 70 |
| streak 距里程碑 1 天 | streak_milestone_hint | 85 |
| 连续跳过 > habitRiskDays | habit_risk_warning | 80 |

### onOutboundRequest

MVP 不实现。返回空结果。

## Manifest

```yaml
domainId: habits
version: "1.0.0"
requiredFields:
  - title
  - defaultTime
  - defaultDuration
  - trackable
subscribedEvents:
  - HabitCreated
  - HabitActivated
  - HabitSuspended
  - HabitArchived
  - HabitLogged
  - HabitSkipped
  - HabitStreakMilestone
```

## Repository Interface

### HabitRepository

```typescript
interface IHabitRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Habit | null>
  findByUserId(userId: USOM_ID, filters?: HabitFilters): Promise<Habit[]>
  create(data: CreateHabitInput, userId: USOM_ID): Promise<Habit>
  update(id: USOM_ID, data: UpdateHabitInput, userId: USOM_ID): Promise<Habit>
  updateStatus(id: USOM_ID, status: HabitStatus, userId: USOM_ID): Promise<Habit>
  delete(id: USOM_ID, userId: USOM_ID): Promise<void>
}
```

### HabitTemplateRepository

```typescript
interface IHabitTemplateRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<HabitTemplate | null>
  findByUserId(userId: USOM_ID): Promise<HabitTemplate[]>
  create(data: CreateTemplateInput, userId: USOM_ID): Promise<HabitTemplate>
  update(id: USOM_ID, data: UpdateTemplateInput, userId: USOM_ID): Promise<HabitTemplate>
  delete(id: USOM_ID, userId: USOM_ID): Promise<void>
  addHabit(templateId: USOM_ID, habitId: USOM_ID, overrides?: TemplateHabitOverrides, userId: USOM_ID): Promise<void>
  removeHabit(templateId: USOM_ID, habitId: USOM_ID, userId: USOM_ID): Promise<void>
}
```

### HabitLogRepository

```typescript
interface IHabitLogRepository {
  findByHabitAndDate(habitId: USOM_ID, date: DateOnly, userId: USOM_ID): Promise<HabitLog | null>
  findByUserAndDate(userId: USOM_ID, date: DateOnly): Promise<HabitLog[]>
  save(log: CreateHabitLogInput, userId: USOM_ID): Promise<HabitLog>
}
```
