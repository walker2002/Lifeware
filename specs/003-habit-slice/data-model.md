# Data Model: 习惯管理切片

**Date**: 2026-05-09 | **Feature**: 003-habit-slice

## Entity Relationship

```
User 1──N Habit
User 1──N HabitTemplate
HabitTemplate 1──N TemplateHabit N──1 Habit
Habit 1──N HabitLog
Habit 1──N Timebox (via timebox_habits)
```

## Entities

### Habit（习惯）— 扩展现有表

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| id | uuid PK | ✅ | gen | — |
| userId | uuid FK→users | ✅ | — | T-01 multi-tenancy |
| schemaVersion | integer | ✅ | 1 | > 0 |
| status | text enum | ✅ | 'draft' | draft/active/suspended/archived |
| title | text | ✅ | — | 非空 |
| description | text | ❌ | null | — |
| frequencyType | text enum | ✅ | 'daily' | daily/weekly/custom |
| daysOfWeek | jsonb (number[]?) | ❌ | null | 0-6 范围，frequencyType=weekly/custom 时必填 |
| **defaultTime** | text | ✅ | — | HH:MM 格式（重命名自 scheduledTime） |
| **earliestTime** | text | ✅ | defaultTime-30min | HH:MM 格式（新增） |
| **latestEndTime** | text | ✅ | defaultTime+duration+30min | HH:MM 格式（新增） |
| **defaultDuration** | integer | ✅ | — | > 0，分钟（重命名自 duration） |
| **minDuration** | integer | ✅ | defaultDuration*0.5 | > 0, <= defaultDuration（新增） |
| **trackable** | boolean | ✅ | true | —（新增） |
| keyResultId | uuid FK→key_results | ❌ | null | — |
| streak | integer | ✅ | 0 | >= 0 |
| longestStreak | integer | ✅ | 0 | >= 0 |
| completionRate7d | real | ✅ | 0 | 0-1 |
| startDate | date | ✅ | — | — |
| endDate | date | ❌ | null | > startDate |
| tags | jsonb (text[]) | ❌ | '[]' | — |
| notes | text | ❌ | null | — |
| createdAt | timestamp | ✅ | now() | — |
| updatedAt | timestamp | ✅ | now() | — |
| suspendedAt | timestamp | ❌ | null | — |
| archivedAt | timestamp | ❌ | null | — |

**Indexes**: idx_habits_user_status, idx_habits_start_date, idx_habits_key_result

**Constraints**:
- earliestTime <= defaultTime
- defaultTime + defaultDuration <= latestEndTime（或跨日约定）
- minDuration <= defaultDuration
- trackable=false 时不产生 HabitLog

**State Transitions**:
```
draft → active (用户确认激活)
active → suspended (用户暂停)
active → archived (用户归档)
suspended → active (用户恢复)
suspended → archived (用户归档)
```

### HabitTemplate（习惯模板）— 新增表

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| id | uuid PK | ✅ | gen | — |
| userId | uuid FK→users | ✅ | — | T-01 multi-tenancy |
| name | text | ✅ | — | 非空, 用户内唯一 |
| description | text | ❌ | null | — |
| icon | text | ❌ | null | — |
| status | text enum | ✅ | 'draft' | draft/active |
| applicableDays | jsonb (number[]) | ✅ | — | 非空数组, 0-6 |
| createdAt | timestamp | ✅ | now() | — |
| updatedAt | timestamp | ✅ | now() | — |

**Indexes**: idx_habit_templates_user_status

### TemplateHabit（模板-习惯关联）— 新增表

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| templateId | uuid FK→habit_templates | ✅ | — | CASCADE 删除 |
| habitId | uuid FK→habits | ✅ | — | RESTRICT 删除（习惯被引用时阻止） |
| sortOrder | integer | ✅ | 0 | >= 0 |
| timeOverride | text | ❌ | null | HH:MM, 范围在习惯 earliestTime~latestEndTime 内 |
| durationOverride | integer | ❌ | null | >= 习惯 minDuration |

**Primary Key**: (templateId, habitId)

### HabitLog（打卡记录）— 现有表不变

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| id | uuid PK | ✅ | gen | — |
| userId | uuid FK→users | ✅ | — | — |
| habitId | uuid FK→habits | ✅ | — | CASCADE, habit.trackable=true |
| date | date | ✅ | — | — |
| status | text enum | ✅ | — | completed/skipped/partial |
| actualDuration | integer | ❌ | null | > 0 |
| note | text | ❌ | null | — |
| loggedAt | timestamp | ✅ | now() | — |
| source | text enum | ✅ | 'manual' | manual/connector |

**Unique**: uniq_habit_logs_habit_date

### timebox_habits（现有 junction table，不变）

联合主键 (timebox_id, habit_id)

## Cross-Midnight Convention

当 `latestEndTime < defaultTime`（或 `latestEndTime < earliestTime`）时，表示跨越午夜到次日。

**转换规则**：将 HH:MM 转为分钟偏移（0~1439）。跨日时 `latestEndTime` 加 1440 再比较。

**示例**：睡眠 earliestTime=22:00(1320), latestEndTime=06:00(360) → 实际比较 360+1440=1800, 所以 1320 < 1800 ✅

## Schema Migration Plan

### Migration: 0002_habit_enhancements.sql

```sql
-- 重命名字段
ALTER TABLE habits RENAME COLUMN "scheduledTime" TO "defaultTime";
ALTER TABLE habits RENAME COLUMN "duration" TO "defaultDuration";

-- 新增字段
ALTER TABLE habits ADD COLUMN "trackable" boolean NOT NULL DEFAULT true;
ALTER TABLE habits ADD COLUMN "earliestTime" text;
ALTER TABLE habits ADD COLUMN "latestEndTime" text;
ALTER TABLE habits ADD COLUMN "minDuration" integer;

-- 根据 defaultTime 和 defaultDuration 回填新字段
UPDATE habits SET
  "earliestTime" = "defaultTime",
  "latestEndTime" = "defaultTime",
  "minDuration"  = "defaultDuration"
WHERE "earliestTime" IS NULL;

-- 创建模板表
CREATE TABLE habit_templates ( ... );
CREATE TABLE template_habits ( ... );
```
