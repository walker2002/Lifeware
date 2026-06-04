# Nexus.Orchestrator 违宪修正设计

**日期**: 2026-06-04
**状态**: Draft
**范围**: `frontend/src/nexus/orchestrator/` + `frontend/src/nexus/core/state-machine/` + `frontend/src/domains/*/repositories/`

---

## 1. 问题定义

Orchestrator 的 `executeIntent` 方法（行 529-1073）包含约 540 行硬编码的域特定业务逻辑，违反三条宪章原则：

| 违宪条款 | 宪章位置 | 具体表现 |
|---|---|---|
| Manifest Runtime Consumption | 宪章 §Manifest Runtime Consumption | 硬编码 `domainId === 'timebox'` 等字符串比较，未从 manifest 注册表动态读取 |
| Orchestrator Purity | 宪章 §Orchestrator Purity | 包含业务逻辑（CRUD、字段映射、级联处理），非纯调度器 |
| Domain Plugin Dual-Track Model | 宪章 §VI | 新增 Domain 需修改 Orchestrator，违反 Domain 独立性承诺 |

### 违宪操作清单（16 个）

| # | 域 | 操作 | 复杂度 | 域特定逻辑 |
|---|---|---|---|---|
| T1 | Timebox | 状态转换（旧版 SM） | 中 | 使用独立 `timeboxSM` 而非通用 SM |
| H1 | Habits | create 习惯 | 中 | 字段映射硬编码 |
| H2 | Habits | updateHabit | 低 | 解构排除 `habitId` |
| H3 | Habits | logHabit 打卡 | **高** | streak 重算（`recalculateHabitMetrics`） |
| H4 | Habits | 状态转换 | 低 | 已用 manifest lifecycle |
| O1 | OKRs | create Objective | 中 | 字段映射硬编码 |
| O2 | OKRs | activate Objective | **高** | 激活前校验（≥1 draft KR + 周期日期） |
| O3 | OKRs | KR 级联联动 | **高** | 批量子对象状态变更 |
| O4 | OKRs | create KeyResult | 中 | 双写：KR + Objective.keyResultIds |
| O5 | OKRs | updateProgress KR | 中 | 根据 KR 完成状态选不同事件类型 |
| O6 | OKRs | deleteDraft KR | 低 | 简单删除 |
| O7 | OKRs | update KR | 低 | 部分字段更新 |
| Tk1 | Tasks | create Thread | 中 | 字段映射 + manifest lifecycle |
| Tk2 | Tasks | Thread 状态转换 | 低 | 已用 manifest lifecycle |
| Tk3 | Tasks | create Task | 中 | 字段映射 + 默认值 |
| Tk4 | Tasks | Task 状态转换 | 低 | 已用 manifest lifecycle |

---

## 2. 架构决策

### 2.1 核心原则：SM + Repository 分工

**问题**：写入者（SM）不知道怎么写（字段映射），知道怎么写的（Domain）不是写入者。

**方案**：SM 作为唯一写入者，通过 `GenericRepo` 通用接口调用 Repository。Repository 理解 payload 并映射到具体字段——这是 Repository 的天然职责。

- SM 保持通用：不理解字段含义，只执行状态转换和调用 `GenericRepo`
- Repository 保持映射：`create(fields)` 接受通用字段并转换为具体表结构
- Domain Plugin 保持反应式：不需要新 Hook，不需要宪章修订

### 2.2 逐操作决策

| 操作 | 决策 | 去向 |
|---|---|---|
| O3 KR 级联 | SM 内置 cascade 机制 | SM 执行父转换后，读 manifest `cascade_rules` 触发子对象批量状态变更 |
| H3 Streak 重算 | Domain `onEvent` hook | SM 创建 HabitLog → 发布 `HabitLogged` 事件 → Habits Domain `onEvent` 重算 streak |
| O2 激活校验 | Domain `onValidate` hook | 移入 OKR Domain 的 `onValidate` 实现 |
| 其余 13 个操作 | SM + GenericRepo | SM 通过扩展后的 `GenericRepo` 接口执行所有 CRUD |

### 2.3 onEvent 写权限边界

当前宪章规定 `onEvent` "no state mutation"。需要明确化：

> `onEvent` hook **可更新自身域对象的聚合派生字段**（如 streak、progressRate），但：
> - **不可**跨域写入
> - **不可**创建或删除对象
> - **不可**改变对象主状态（status 字段）

这是对 "state mutation" 禁令的明确化，不是修订。禁止的是主状态变更，聚合指标更新属于读取 → 计算 → 回写的合理模式。

---

## 3. 改造后架构

### 3.1 Orchestrator Contract 路径

**改造前**（违宪）：
```
onValidate → RuleEngine → if(domainId === 'timebox') { ... }
                          if(domainId === 'habits') { ... }
                          if(domainId === 'okrs')  { ... }
                          if(domainId === 'tasks')  { ... }
```

**改造后**（合规）：
```
onValidate → RuleEngine → genericSM.execute(proposal)
                                       ├─ validateTransition(manifest.lifecycle)
                                       ├─ repo.save() / repo.updateStatus()
                                       ├─ cascade(child objects, manifest.cascade_rules)
                                       └─ appendEvent() + eventBus.publish()
                            → domain.onEvent(event)  // 派生指标更新
```

Orchestrator 的 `executeIntent` 从 ~540 行 if-else 分支变成约 20 行纯调度链。

### 3.2 GenericRepo 接口扩展

**当前**：
```typescript
export interface GenericRepo {
  findById(id: USOM_ID, userId: USOM_ID): Promise<Record<string, unknown> | null>
  save(obj: Record<string, unknown>, userId: USOM_ID): Promise<void>
}
```

**扩展后**：
```typescript
export interface GenericRepo {
  /** 根据 ID 查找对象 */
  findById(id: USOM_ID, userId: USOM_ID): Promise<Record<string, unknown> | null>
  /** 保存对象（创建或更新） */
  save(obj: Record<string, unknown>, userId: USOM_ID): Promise<void>
  /** 创建新对象，返回含生成 ID 的完整对象 */
  create(fields: Record<string, unknown>, userId: USOM_ID): Promise<Record<string, unknown>>
  /** 更新对象状态 */
  updateStatus(id: USOM_ID, toStatus: string, userId: USOM_ID): Promise<Record<string, unknown>>
  /** 删除草稿对象（可选，仅支持草稿状态删除的 Domain） */
  deleteDraft?(id: USOM_ID, userId: USOM_ID): Promise<void>
}
```

每个 Domain 提供一个 `GenericRepoAdapter` 工厂函数，将 `GenericRepo` 接口映射到具体 Repository 方法：

```typescript
// domains/okrs/repositories/generic-repo-adapter.ts
export function createOkrsGenericRepo(repos: {
  objectiveRepo: IObjectiveRepository
  keyResultRepo: IKeyResultRepository
}): Record<string, GenericRepo> {
  return {
    objective: {
      findById: (id, userId) => repos.objectiveRepo.findById(id, userId),
      create: (fields, userId) => repos.objectiveRepo.create(fields, userId),
      updateStatus: (id, status, userId) => repos.objectiveRepo.updateStatus(id, status, userId),
      save: (obj, userId) => repos.objectiveRepo.save(obj as Objective, userId),
    },
    key_result: {
      findById: (id, userId) => repos.keyResultRepo.findById(id, userId),
      create: (fields, userId) => repos.keyResultRepo.create(fields, userId),
      updateStatus: (id, status, userId) => repos.keyResultRepo.updateStatus(id, status, userId),
      save: (obj, userId) => repos.keyResultRepo.save(obj as KeyResult, userId),
      deleteDraft: (id, userId) => repos.keyResultRepo.deleteDraft(id, userId),
    },
  }
}
```

**ID 生成职责**：`GenericRepo.create()` 负责在内部生成 `id`（UUID v4），并在返回的对象中包含 `id` 字段。SM 从返回值中提取 `id` 用于构造 `SystemEvent`。这保持了 Repository 作为持久层唯一入口的角色，SM 不需要知道 ID 如何生成。

### 3.3 SM Cascade 机制

#### 3.3.1 Manifest 声明扩展

OKRs manifest 新增 `cascade_rules`（与现有 event-driven 类型并列）。两种 cascade 类型共享 `cascade_rules` 数组，通过 `type` 字段区分：

```yaml
# okrs/manifest.yaml 新增 cascade_rules 块
cascade_rules:
  # 类型 A: event-driven（timebox/habits 已使用，保持不变）
  - type: event_driven
    on_event: 'SomeEvent'
    condition: "..."
    action: '...'
    auto_execute: true

  # 类型 B: parent_child_status（新增，OKR KR 级联使用）
  - type: parent_child_status
    parent_object: objective
    child_object: key_result
    child_query: 'findByObjective'   # GenericRepo 上的查询方法名，用于查询子对象
    rules:
      - parent_action: activate
        child_filter: "status == 'draft'"
        child_to_status: active
        event_type: KeyResultActivated
      - parent_action: pause
        child_filter: "status == 'active'"
        child_to_status: paused
        event_type: KeyResultPaused
      - parent_action: resume
        child_filter: "status == 'paused'"
        child_to_status: active
        event_type: KeyResultResumed
      - parent_action: complete
        child_filter: "status in ['active', 'paused']"
        child_to_status: completed
        event_type: KeyResultCompleted
      - parent_action: discard
        child_filter: "status not in ['discarded', 'archived']"
        child_to_status: discarded
        event_type: KeyResultDiscarded
      - parent_action: archive
        child_filter: "status != 'archived'"
        child_to_status: archived
        event_type: KeyResultArchived
```

`cascade_rules` 是一个联合类型数组，SM 通过 `type` 字段分发到不同的 cascade 处理器。现有 event-driven 规则的 schema 和处理逻辑保持不变。

#### 3.3.2 SM 执行流程

```
1. validateTransition(parent, manifest.lifecycle) → 通过
2. repo.updateStatus(parentId, toStatus, userId) → 完成主对象转换
3. 检查 manifest cascade_rules，筛选 type === 'parent_child_status' 且 parent_action 匹配
4. 若匹配 → 通过 GenericRepo 查询子对象 → 批量 updateStatus
5. 生成主事件 + 子事件 → appendEvent + eventBus.publish
```

### 3.4 OrchestratorDeps 简化

**当前**（域感知）：
```typescript
export interface OrchestratorDeps {
  timeboxRepo: ITimeboxRepository
  habitRepo?: IHabitRepository
  habitLogRepo?: IHabitLogRepository
  objectiveRepo?: IObjectiveRepository
  keyResultRepo?: IKeyResultRepository
  taskRepo?: ITaskRepository
  threadRepo?: IThreadRepository
  eventRepo: ISystemEventRepository
  intentEngine: IntentEngine
  ruleEngine: RuleEngine
  actionSurfaceEngine?: ActionSurfaceEngine
  onTrace?: (step: TraceStep) => void
}
```

**改造后**（域无关）：
```typescript
export interface OrchestratorDeps {
  eventRepo: ISystemEventRepository
  intentEngine: IntentEngine
  ruleEngine: RuleEngine
  actionSurfaceEngine?: ActionSurfaceEngine
  /** 通用仓储获取 — (domainId, objectType) => GenericRepo */
  getRepo: (domainId: string, objectType: string) => GenericRepo
  onTrace?: (step: TraceStep) => void
}
```

所有域特定 Repository 引用消失。调用方在构造 Orchestrator 时传入 `getRepo` 工厂函数。

### 3.5 OrchestratorResult 重设计

**当前**（域特定字段）：
```typescript
export interface OrchestratorResult {
  success: boolean
  timebox?: Timebox      // 硬编码
  habit?: Habit          // 硬编码
  actionSurface?: ActionSurface
  // ...
}
```

**改造后**（域无关）：
```typescript
export interface OrchestratorResult {
  success: boolean
  /** SM 执行后的主对象快照（通用） */
  object?: Record<string, unknown>
  /** 受影响的对象类型标识（如 'task', 'habit', 'objective'） */
  objectType?: string
  /** 级联影响的子对象摘要 */
  cascadeResults?: CascadeResult[]
  actionSurface?: ActionSurface
  error?: string
  warnings?: string[]
  needsConfirmation?: boolean
  confirmationMessage?: string
  generativeResult?: GenerationResult
  queryResult?: QueryResult
}

export interface CascadeResult {
  objectType: string
  /** 受影响的子对象 ID 列表 */
  objectIds: USOM_ID[]
  count: number
  toStatus: string
}
```

调用方通过 `objectType` 判断类型，自行将 `object` 转换为具体 USOM 类型。Orchestrator 完全不感知具体域对象。

---

## 4. Domain onValidate 职责明确化

将域特定校验逻辑从 Orchestrator 内部迁移到各 Domain 的 `onValidate` 实现：

| Domain | onValidate 校验 |
|---|---|
| OKRs | activate 时：≥1 draft KR + 周期起止日期已设置 |
| Habits | logHabit 时：今日未打卡（幂等校验） |
| Tasks | create 时：如关联了 threadId 则验证 Thread 存在 |

当前 `onValidate` 接口签名：
```typescript
onValidate(intent: StructuredIntent, snapshot: USOMSnapshot): { valid: boolean; errors: string[] }
```

`onValidate` 需要异步查询能力来执行校验（如检查 KR 数量）。两种方案：
1. 扩展 `onValidate` 为 `async` + 传入 `GenericRepo` 引用（通过 Domain Plugin 内部持有的 Repository 引用，无需修改签名）
2. 在 `USOMSnapshot` 中预填充校验所需数据（由 Context Engine 组装）

**推荐方案 1**：Domain Plugin 在构造时接收自己的 Repository 引用（这是现有模式），`onValidate` 内部直接使用。签名变更为：

```typescript
onValidate(intent: StructuredIntent, snapshot: USOMSnapshot): Promise<{ valid: boolean; errors: string[] }>
// 或
onValidate(intent: StructuredIntent, snapshot: USOMSnapshot): { valid: boolean; errors: string[] }
```

从同步改为 `Promise` 返回（或保持同步但 Domain 内部通过闭包持有 Repo 引用）。这是接口签名的非破坏性扩展，不需要宪章修订。具体采用哪种方式在实施阶段根据现有代码模式确定。

---

## 5. 迁移策略

采用**逐域迁移**策略，每阶段可独立验证：

| 阶段 | 内容 | 验证标准 |
|---|---|---|
| **P0** | 扩展 `GenericRepo` 接口 + 通用 SM 能力 | SM 单元测试覆盖 create / updateStatus / cascade |
| **P1** | 迁移 Tasks 域（最简单，4 个操作） | Orchestrator 不再含 `if (domainId === 'tasks')` |
| **P2** | 迁移 Habits 域（4 个操作 + streak hook） | streak 重算移入 onEvent，Orchestrator 不再含 habits 分支 |
| **P3** | 迁移 OKRs 域（最复杂，7 个操作 + cascade） | KR 级联走 SM cascade，Orchestrator 不再含 okrs 分支 |
| **P4** | 迁移 Timebox 域（替换旧版 SM） | `timeboxSM` 替换为通用 SM，删除旧版 SM 实例 |
| **P5** | 清理：Deps 简化 + Result 重设计 + 删除死代码 | `OrchestratorDeps` 不含域特定字段，`OrchestratorResult` 不含域特定字段 |

### 风险控制

- 每阶段完成后运行完整测试套件
- P1-P4 各阶段可回退：保留旧代码路径，通过 feature flag 切换
- P5 仅在 P1-P4 全部完成后执行

---

## 6. 不在本次范围内

以下内容**明确排除**在本次重构之外：

- Generative Path / Query Path（已在行 1075+ 独立实现，基本合规）
- AI Runtime 调用方式（`createAIRuntime()` 在 generative path 中，不在 contract path 中）
- Rule Engine 的 manifest 驱动改造（独立任务）
- Context Engine 改造（已 manifest-driven）
- `OrchestratorResult` 调用方的适配（P5 阶段处理）
- `DomainId` 类型（`primitives.ts` 中的联合类型）的泛化（独立任务）
