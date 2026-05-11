# OKR API Contract (004a-okr-core)

**Date**: 2026-05-10 | **Branch**: `004-okr-core`

> **注意**: MVP 阶段无独立 API 路由层。UI 通过 Repository 接口直接访问数据，状态操作通过 Orchestrator 执行。以下定义的是 Repository/Orchestrator 层面的接口契约。

## 1. Repository 接口

### 1.1 IObjectiveRepository（扩展）

```typescript
interface IObjectiveRepository {
  // 现有
  findById(id: USOM_ID, userId: USOM_ID): Promise<Objective | null>
  save(objective: Objective, userId: USOM_ID): Promise<void>

  // 新增
  findByStatus(status: ObjectiveStatus, userId: USOM_ID): Promise<Objective[]>
  findByPeriod(start: DateOnly, end: DateOnly, userId: USOM_ID): Promise<Objective[]>
  findByStatusInPeriod(
    status: ObjectiveStatus[],
    start: DateOnly,
    end: DateOnly,
    userId: USOM_ID
  ): Promise<Objective[]>
  findWithKeyResults(id: USOM_ID, userId: USOM_ID): Promise<ObjectiveWithKR | null>
}

type ObjectiveWithKR = Objective & { keyResults: KeyResult[] }
```

### 1.2 IKeyResultRepository（扩展）

```typescript
interface IKeyResultRepository {
  // 现有
  findById(id: USOM_ID, userId: USOM_ID): Promise<KeyResult | null>
  save(kr: KeyResult, userId: USOM_ID): Promise<void>
  findByObjective(objectiveId: USOM_ID, userId: USOM_ID): Promise<KeyResult[]>

  // 新增
  updateProgress(id: USOM_ID, currentValue: number, userId: USOM_ID): Promise<KeyResult>
  batchUpdateStatus(
    objectiveId: USOM_ID,
    fromStatus: KeyResultStatus,
    toStatus: KeyResultStatus,
    userId: USOM_ID
  ): Promise<void>
  deleteDraft(id: USOM_ID, userId: USOM_ID): Promise<void>
}
```

## 2. Orchestrator 接口

### 2.1 executeOKRIntent

```typescript
interface Orchestrator {
  executeOKRIntent(
    intent: StructuredIntent,
    userId: USOM_ID
  ): Promise<OrchestrationResult>
}
```

**支持的 intent action**:

| Action | 目标 | 说明 |
|--------|------|------|
| `createObjective` | objective | 创建草稿 O |
| `updateObjective` | objective | 更新 O 字段 |
| `activateObjective` | objective | 激活 O（含前置校验） |
| `pauseObjective` | objective | 暂停 O |
| `resumeObjective` | objective | 恢复 O |
| `completeObjective` | objective | 完成 O |
| `discardObjective` | objective | 废弃 O |
| `archiveObjective` | objective | 归档 O |
| `createKeyResult` | keyResult | 创建 KR |
| `updateKeyResult` | keyResult | 更新 KR 字段 |
| `updateKeyResultProgress` | keyResult | 手动更新 KR 进度 |
| `deleteKeyResult` | keyResult | 删除 draft KR |

## 3. Domain Plugin 接口

### 3.1 OKR Domain Plugin Hooks

**onValidate**: 校验 OKR 创建/更新/激活的字段合法性

**onEvent**: 响应事件，返回 metrics 和 suggestions

监听事件：
- OKR 事件：ObjectiveActivated, ObjectiveDiscarded, KeyResultProgressUpdated, KeyResultCompleted
- 外部事件：TaskCompleted, HabitLogged

**onActionSurfaceRequest**: 生成行动建议

| 条件 | 类型 | 内容 |
|------|------|------|
| KR 到期 < 7 天且进度 < 70% | cue | 到期预警 |
| O 周期结束 < 14 天且未完成 | guide | 周期提醒 |
| KR 进度 > 7 天无更新 | tile | 进度催更 |

## 4. USOM 类型变更

### 4.1 Objective 新增字段

```typescript
interface Objective {
  // ...现有字段
  okrType: 'visionary' | 'committed'
  discardedAt?: Timestamp
}
```

### 4.2 KeyResult 新增字段

```typescript
interface KeyResult {
  // ...现有字段
  discardedAt?: Timestamp
}
```

### 4.3 Status 枚举扩展

```typescript
type ObjectiveStatus = 'draft' | 'active' | 'paused' | 'completed' | 'discarded' | 'archived'
type KeyResultStatus = 'draft' | 'active' | 'paused' | 'completed' | 'discarded' | 'archived'
```
