# Data Model: 时间盒管理优化

**Feature**: 002-timebox-slice
**Date**: 2026-05-06（更新）

## 核心数据流

```
用户输入 → Intention → StructuredIntent → StateProposal → Timebox (状态转移) → SystemEvent → ActionSurface
```

## 实体定义

### Intention（意图）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | USOM_ID | UUID |
| status | IntentionStatus | captured → clarified → routed → dissolved |
| rawInput | string | 用户原始输入文本 |
| inputMode | 'natural_language' \| 'template_form' | 输入方式 |
| capturedAt | Timestamp | 捕获时间 |

### StructuredIntent（结构化意图）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | USOM_ID | UUID |
| intentionId | USOM_ID | 关联的 Intention |
| targetDomain | string | `'timebox'` |
| action | string | `'create_timebox'` |
| fields | Record<string, unknown> | `{ title, startTime, duration }` |
| confidence | number | AI 置信度 0-1 |
| resolvedBy | 'ai' \| 'template_form' | 解析方式 |

**create_timebox fields schema**:
```typescript
{
  title: string          // 必需
  startTime: string      // 必需，ISO 8601
  duration: number       // 必需，分钟数 (5-480)
}
```

### StateProposal（状态提案）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | USOM_ID | UUID |
| intentId | USOM_ID | 关联的 StructuredIntent |
| targetObject.type | 'timebox' | 目标对象类型 |
| targetObject.id | undefined | 创建时为 undefined |
| action | 'create' | 动作 |
| payload | Record<string, unknown> | Timebox 构造数据 |
| approvedAt | Timestamp | 审核时间 |
| approvedBy | 'rule_engine' | 审核者 |

### Timebox（时间盒）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | USOM_ID | UUID |
| status | TimeboxStatus | planned/running/paused/ended/logged |
| title | string | 标题 |
| startTime | Timestamp | 开始时间 |
| endTime | Timestamp | 结束时间 |
| taskIds | USOM_ID[] | MVP 为空 |
| habitIds | USOM_ID[] | MVP 为空 |
| isRecurring | boolean | false |
| tags | Tag[] | MVP 为空 |
| createdAt | Timestamp | 创建时间 |
| updatedAt | Timestamp | 更新时间 |

**状态转移图**:
```
                    ┌─── User: start ──→ running ←── User: resume ──┐
                    │                      │                          │
  (Intent) → planned                       │ User: pause              │
                    │                      ↓                          │
                    │                   paused                        │
                    │                      │                          │
                    └── Time trigger ──→ ended ←── Time trigger ─────┘
                                            │
                                     User: log
                                            ↓
                                         logged
```

### SystemEvent（系统事件）

时间盒相关事件：`TimeboxCreated`, `TimeboxStarted`, `TimeboxPaused`, `TimeboxEnded`, `TimeboxLogged`

### ActionSurface（行动切面）

| 字段 | 类型 | 说明 |
|---|---|---|
| guide | ActionCandidate[] | Action Guide（MVP 暂空） |
| tiles | ActionCandidate[] | Dynamic Tile 候选 |
| cues | ActionCandidate[] | Continuity Cue 候选 |

### ContextSnapshot（上下文快照）

State Machine 每次执行后刷新。MVP 只填充时间盒相关字段。

## UI 组件层级（2026-05-07 更新）

```
AppShell
├── TopNav (64px 固定)
│   └── 设置按钮 → 追踪日志开关
├── TilesBanner (全宽横幅)
│   └── DynamicTile[] (行动提示)
├── 两栏 Grid
│   ├── AiPanel (320px 固定)
│   │   ├── IntentInput (自然语言输入框)
│   │   ├── IntentForm (表单模式)
│   │   └── (DynamicTile 已移至 TilesBanner)
│   └── MainContent (flex-1)
│       ├── DateNav [日 | 周 | 月] + 前进/后退 + 日期显示
│       ├── DayView (日视图，默认)
│       │   ├── TimeboxList (左列：列表视图，compact)
│       │   ├── TimeboxTimeline (中列：小时时间轴)
│       │   └── MiniCalendar (右列：月历小日历)
│       ├── WeekView (周视图)
│       │   └── 周日历时间表格 (react-big-calendar week view)
│       └── MonthView (月视图)
│           └── 月日历网格 (react-big-calendar month view)
└── TracePanel (底部可折叠调试面板，默认隐藏)
    └── TraceStep[] (可展开的调用链步骤)
```

### DateNav 日期导航

| 属性 | 类型 | 说明 |
|---|---|---|
| mode | `'day' \| 'week' \| 'month'` | 当前浏览模式，默认 `'day'` |
| currentDate | Date | 当前选中的日期 |
| onModeChange | (mode) => void | 模式切换回调 |
| onNavigate | (direction: 'prev' \| 'next') => void | 翻页回调 |
| mobileHidden | boolean | 移动端隐藏"周"选项 |

### 视图模式数据范围

| 模式 | 数据范围 | 布局 |
|---|---|---|
| day | currentDate 00:00-23:59 | 三栏：列表 + 时间轴 + 小日历 |
| week | currentDate 所在周一至周日 | 全宽：周日历时间表格 |
| month | currentDate 所在月 1 日至月末 | 全宽：月日历网格 |

## 追踪日志数据模型（2026-05-06 新增）

### TraceSession（追踪会话）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | UUID |
| startedAt | Timestamp | 会话开始时间 |
| completedAt | Timestamp | 会话结束时间 |
| rawInput | string | 用户原始输入 |
| steps | TraceStep[] | 调用链步骤列表 |
| result | 'success' \| 'error' | 最终结果 |

### TraceStep（追踪步骤）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 步骤序号 |
| component | string | 组件名称（IntentEngine/RuleEngine/StateMachine/ActionSurfaceEngine） |
| phase | 'start' \| 'end' | 开始/结束阶段 |
| timestamp | Timestamp | 时间戳 |
| input | Record<string, unknown> | 输入数据 |
| output | Record<string, unknown> \| undefined | 输出数据（phase='end'时有值） |
| duration | number \| undefined | 耗时(ms)（phase='end'时有值） |
| error | string \| undefined | 错误信息 |

### StateTransitionTrace（状态转换追踪）

| 字段 | 类型 | 说明 |
|---|---|---|
| fromStatus | TimeboxStatus \| null | 转换前状态 |
| toStatus | TimeboxStatus | 转换后状态 |
| action | string | 触发动作 |
| eventType | string | 生成的事件类型 |
| proposal | StateProposal | 状态提案 |
| event | SystemEvent | 生成的事件 |

### 追踪配置

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| enabled | boolean | false | 是否启用追踪日志 |
| maxSessions | number | 50 | 最大保留会话数 |
| logToConsole | boolean | true | 是否同时输出到浏览器 console |

## 依赖关系

```
Intention
  └── StructuredIntent (1:1)
        └── StateProposal (1:1)
              └── Timebox (创建)

Timebox
  ├── SystemEvent (1:N, append-only)
  ├── ContextSnapshot (触发刷新)
  └── ActionSurface (触发生成)

ContextSnapshot
  └── ActionSurface (1:1)
```
