# Contract: 时间盒执行转换

**Feature**: 002-timebox-slice
**Date**: 2026-05-07

## Server Action: `transitionTimebox`

统一的执行操作入口。所有状态转换都通过此 Server Action 调用。

### Input

```typescript
interface TransitionInput {
  timeboxId: string;
  action: 'start' | 'end' | 'cancel' | 'log';
  executionRecord?: ExecutionRecord;  // 仅 log 动作需要
  confirmed?: boolean;                 // 规则警告时需确认
}
```

### Output

```typescript
interface TransitionResult {
  success: boolean;
  timebox?: TimeboxSummary;
  warnings?: Array<{
    ruleId: string;
    severity: 'warning' | 'confirm';
    message: string;
    details?: unknown;
  }>;
  actionSurfaces?: ActionSurface[];
  error?: string;
}
```

### Behavior

1. 根据 `timeboxId` 查询当前时间盒状态
2. 构造执行意图 `StructuredIntent`（`action: action + '_timebox'`）
3. 通过 Orchestrator 执行完整管道（Rule Engine → State Machine → Event Bus → Action Surface）
4. 返回结果（含 warnings 时不自动执行，需 `confirmed: true` 二次调用）

### Error Cases

| Condition | Error Message |
|-----------|---------------|
| timeboxId 不存在 | "时间盒不存在" |
| 当前状态不支持该 action | "时间盒不在 {requiredState} 状态" |
| log 动作缺少 executionRecord | "执行记录不能为空" |
| 规则校验未确认 | 返回 warnings，success=false |

---

## Server Action: `submitExecutionIntent`

自然语言触发的执行意图入口。

### Input

```typescript
interface ExecutionIntentInput {
  rawInput: string;
  traceEnabled?: boolean;
}
```

### Output

```typescript
interface ExecutionIntentResult {
  success: boolean;
  timebox?: TimeboxSummary;
  actionSurfaces?: ActionSurface[];
  warnings?: RuleWarning[];
  traceSession?: TraceSession;
  error?: string;
}
```

### Behavior

1. 创建 Intention 记录（`inputMode: 'natural_language'`）
2. AI parser 解析为执行意图 `StructuredIntent`
3. 从 `target` 字段匹配目标时间盒 ID
4. 通过 Orchestrator 执行管道
5. 返回结果

### AI Parser 输出格式

```typescript
interface ExecutionStructuredIntent {
  domain: 'timebox';
  action: 'start_timebox' | 'end_timebox' | 'cancel_timebox' | 'log_timebox';
  target: { title?: string; current?: boolean } | { index?: number };
  fields: Record<string, unknown>;  // log 时可能含 executionRecord
  confidence: number;
}
```

### Target Matching

1. `title` 匹配: 模糊匹配时间盒标题（包含关系）
2. `current: true`: 匹配当前 running 状态的时间盒
3. `index`: 按列表顺序匹配
4. 无匹配: 返回错误 "未找到匹配的时间盒"

---

## Hook: `useAutoTrigger`

客户端 React Hook，负责自动触发状态转换。

### Interface

```typescript
function useAutoTrigger(
  timeboxes: TimeboxSummary[],
  onTransition: (id: string, action: string) => Promise<void>
): {
  lastChecked: Date | null;
  pendingActions: Array<{ timeboxId: string; action: string; reason: string }>;
}
```

### Behavior

- 每 60 秒检查一次
- 页面首次加载立即检查
- 检测条件及动作:

| Condition | Action | Reason |
|-----------|--------|--------|
| `planned && startTime <= now` | `'start'` | "到达计划开始时间" |
| `running && endTime <= now` | `'overtime'` | "超过计划结束时间" |

- 批量执行检测到的转换
- 返回上次检查时间和待执行动作列表（用于调试展示）
