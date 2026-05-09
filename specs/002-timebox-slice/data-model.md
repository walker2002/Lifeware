# Data Model: 时间盒执行记录

**Feature**: 002-timebox-slice
**Date**: 2026-05-07（更新）

## Entity Changes

### Timebox (Modified)

| Field | Type | Nullable | Change | Description |
|-------|------|----------|--------|-------------|
| status | enum | NO | MODIFIED | 新增 overtime, cancelled；移除 paused |
| overtime_at | timestamptz | YES | NEW | 超时自动标记时间 |
| execution_record | jsonb | YES | NEW | 执行记录数据 |

### Status Enum (Modified)

```
旧: 'planned' | 'running' | 'paused' | 'ended' | 'logged'
新: 'planned' | 'running' | 'overtime' | 'ended' | 'cancelled' | 'logged'
```

### ExecutionRecord (New JSONB Type)

```
ExecutionRecord = SimpleExecutionRecord | DetailedExecutionRecord

SimpleExecutionRecord {
  mode: 'simple'
  completionStatus: 'completed' | 'partially_completed' | 'not_completed'
  actualDuration: number        // 实际用时（分钟）
  plannedDuration: number       // 计划用时（分钟）
  deviationMinutes: number      // 偏差（实际 - 计划）
  loggedAt: string              // ISO 8601
}

DetailedExecutionRecord extends Simple {
  mode: 'detailed'
  completionRating: number      // 1-10
  actualOutput: string          // 实际产出描述
  deviationReasons?: string     // 偏差原因
  energyLevel?: number          // 1-10
  notes?: string                // 备注
}
```

## State Transitions

```
                  ┌──────────────────────────────────────┐
                  │                                      │
   create         │ start (手动/自动)    end (手动)       │ log (可选)
 ────────→ planned ──────────→ running ──────────→ ended ────────→ logged
               │                 │
               │ cancel          │ overtime (自动)
               ↓                 ↓
            cancelled        overtime ──end(手动)──→ ended
```

| Transition | Action | From | To | Auto? | Timestamp Field |
|------------|--------|------|----|-------|-----------------|
| T1 | create | null | planned | No | created_at |
| T2 | start | planned | running | Yes (start_time) | started_at |
| T3 | end | running | ended | No | ended_at |
| T4 | overtime | running | overtime | Yes (end_time) | overtime_at |
| T5 | end | overtime | ended | No | ended_at |
| T6 | cancel | planned | cancelled | No | updated_at |
| T7 | log | ended | logged | No | logged_at |

## System Events

| Event | Trigger | Payload |
|-------|---------|---------|
| TimeboxCreated | T1 | `{timeboxId, title, startTime, endTime}` |
| TimeboxStarted | T2 | `{timeboxId, title, trigger: 'manual' \| 'auto'}` |
| TimeboxEnded | T3, T5 | `{timeboxId, title, actualDuration, plannedDuration}` |
| TimeboxOvertime | T4 | `{timeboxId, title, overtimeMinutes}` |
| TimeboxCancelled | T6 | `{timeboxId, title}` |
| TimeboxLogged | T7 | `{timeboxId, title, completionStatus, mode}` |

## USOM Type Changes

### objects.ts

```typescript
// 新增类型
type CompletionStatus = 'completed' | 'partially_completed' | 'not_completed';

interface SimpleExecutionRecord {
  mode: 'simple';
  completionStatus: CompletionStatus;
  actualDuration: number;
  plannedDuration: number;
  deviationMinutes: number;
  loggedAt: string;
}

interface DetailedExecutionRecord extends SimpleExecutionRecord {
  mode: 'detailed';
  completionRating: number;
  actualOutput: string;
  deviationReasons?: string;
  energyLevel?: number;
  notes?: string;
}

type ExecutionRecord = SimpleExecutionRecord | DetailedExecutionRecord;

// Timebox status 更新
type TimeboxStatus = 'planned' | 'running' | 'overtime' | 'ended' | 'cancelled' | 'logged';

// Timebox interface 新增字段
interface Timebox {
  // ...existing fields
  status: TimeboxStatus;
  overtimeAt?: string;
  executionRecord?: ExecutionRecord;
}
```

### summaries.ts

```typescript
interface TimeboxSummary {
  // ...existing fields
  status: TimeboxStatus;
  startedAt?: string;
  endedAt?: string;
  overtimeAt?: string;
  executionRecord?: ExecutionRecord;  // 供 UI 展示完成度标记和颜色编码
}
```

## Card Color Coding Rules (新增)

卡片颜色编码基于 ExecutionRecord 的 rating 和 energyLevel 字段，通过左侧边框颜色表达。

### Color Mapping

| 字段 | 条件 | 颜色令牌 | Tailwind Class | 语义 |
|------|------|----------|----------------|------|
| rating | > 3 | warm-400 | border-l-coral-400 | 超出预期 |
| rating | < 3 | cool-400 | border-l-slate-400 | 未达预期 |
| energyLevel | > 3 | bright-400 | border-l-amber-400 | 高能量 |
| energyLevel | < 3 | dim-400 | border-l-gray-400 | 低能量 |
| rating=3 且 energy=3 | — | transparent | border-l-transparent | 默认中性 |
| 无 executionRecord | — | transparent | border-l-transparent | 未记录 |

### 优先级规则

当 rating 和 energyLevel 同时偏离默认值时：rating 颜色优先于 energyLevel 颜色。因为评分反映成果质量（用户更关注），能量反映过程状态。

### 应用范围 (FR-029)

- TimeboxCard 列表卡片
- TimeboxTimeline 时间轴色块
- WeekView 周日历事件块
- MonthView 月日历事件块
- ExecutionLogDialog 查看记录时展示相同颜色指示

### 共享工具函数

```typescript
// frontend/src/lib/color-coding.ts
function getCardBorderColor(record?: ExecutionRecord): string {
  if (!record) return "border-l-transparent";
  const detailed = record as DetailedExecutionRecord;
  if (detailed.completionRating !== undefined && detailed.completionRating > 3) return "border-l-coral-400";
  if (detailed.completionRating !== undefined && detailed.completionRating < 3) return "border-l-slate-400";
  if (detailed.energyLevel !== undefined && detailed.energyLevel > 3) return "border-l-amber-400";
  if (detailed.energyLevel !== undefined && detailed.energyLevel < 3) return "border-l-gray-400";
  return "border-l-transparent";
}
```
