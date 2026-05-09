# Timebox Domain Plugin Contract

**Feature**: 001-align-foundation (Timebox 切片)
**Date**: 2026-05-03

## 概述

时间盒 Domain 插件遵循 Constitution Principle VI 的四钩子模型，是纯粹被动组件。

## Domain Manifest

```yaml
id: timebox
name: Timebox
version: 0.1.0

requiredFields:
  create_timebox:
    - title
    - startTime
    - duration

subscribedEvents:
  - TimeboxCreated
  - TimeboxStarted
  - TimeboxPaused
  - TimeboxEnded
  - TimeboxLogged
```

## 四钩子接口

### onValidate

```typescript
onValidate(
  intent: StructuredIntent,
  snapshot: USOMSnapshot,
): { valid: boolean; errors: string[] }
```

**职责**: 结构性验证（字段完整性、类型合法性）

**验证规则**:
| 规则 | 说明 |
|---|---|
| title 非空 | `fields.title` 存在且不为空字符串 |
| startTime 合法 | `fields.startTime` 是有效 ISO 8601 时间 |
| duration 合法 | `fields.duration` 是正整数，且 5 ≤ duration ≤ 480（分钟） |
| 结束时间在未来 | startTime > 当前时间 |

**注意**: 时间重叠检测由 Rule Engine 规则处理（调用 Repository 查询），不在 Domain.onValidate 中。

### onEvent

```typescript
onEvent(
  event: SystemEvent,
  snapshot: USOMSnapshot,
): { metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] }
```

**职责**: 响应事件，返回指标更新建议和 Action Surface 候选

**事件响应**:

| 事件 | 指标建议 | Action Surface 建议 |
|---|---|---|
| TimeboxCreated | (无) | tile: "时间盒已创建: {title}" |
| TimeboxStarted | (无) | cue: "时间盒开始: {title}" |
| TimeboxEnded | (无) | cue: "时间盒结束，请记录执行结果" |
| TimeboxLogged | timeboxAdherence7d 更新建议 | tile: "已记录: {title}" |

**MVP 实现**: `metrics` 返回空数组（Memory Framework 暂不实现），`suggestions` 返回固定格式候选。

### onActionSurfaceRequest

```typescript
onActionSurfaceRequest(
  snapshot: USOMSnapshot,
  signals: Readonly<DerivedSignals>,
): { actions: ActionCandidate[]; category: ActionCategory; weight: number }
```

**职责**: 根据 snapshot 状态生成 Action Surface 候选

**MVP 规则**:
| 条件 | 候选 | 类别 | 权重 |
|---|---|---|---|
| 有 planned 时间盒且距 start_time < 15min | "即将开始: {title}" | cue | 80 |
| 有 running 时间盒 | "进行中: {title}" | tile | 90 |
| 有 ended 时间盒 | "记录执行结果: {title}" | cue | 70 |

### onOutboundRequest

**MVP 不实现**（返回空或 undefined）。

## 禁令（Constitution Principle VI）

1. **禁止直接写状态**: 不调用 State Machine 或 Repository 的 save 方法
2. **禁止自主执行**: 不触发新的 Intent 或 Event
3. **禁止访问其他 Domain 数据**: 只使用 USOMSnapshot 和 DerivedSignals

## 文件结构

```text
domains/timebox/
├── index.ts         # DomainPlugin 实现
└── manifest.yaml    # Domain 清单
```
