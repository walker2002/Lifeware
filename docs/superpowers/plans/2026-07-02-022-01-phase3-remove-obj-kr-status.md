# [022.01] Phase 3 — 移除 Objective/KR 独立状态 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 Objective 和 KeyResult 完全移除独立 status 字段与状态机，编辑/删除权限收敛到 Cycle.status 经 assertEditable 守卫

**Architecture:** 自底向上清理——类型层 → 数据层 → 业务逻辑层 → UI 层 → DB 迁移。每个 Task 产出可独立测试的中间状态。P0-3 四组引用（manifest/代码/DB/UI）全部清零

**Design spec:** `docs/superpowers/specs/2026-07-02-022-01-okr-cycle-governance-design.md` §B + P0-3

**Tech Stack:** Next.js 16.1.6, React 19.2.3, TypeScript 5, Drizzle ORM, vitest, PostgreSQL

## 关键边界

- **迁移有损可接受**（用户已确认 P2）：paused 语义永久丢失，status 列 DROP 后无法精确还原
- **暂停语义替代**：Obj/KR 去 status 后 `paused` 不可表达。当前产品决策：paused = 无视觉标记 + 仍可通过 cycle.status 约束编辑
- **完成语义由 KR 进度承载**：progressRate >= 1.0 → completedAt 自动设置
- **软删除复用 discardedAt/archivedAt**：discard = `discarded_at = now()`，archive = `archived_at = now()`
- **跨域隔离不变**：OKR domain 不 import tasks/habits domain 内部模块

## Global Constraints

- **Repository Pattern (R-01~R-04)**: 所有 DB 操作通过 IRepository 接口，不直查 Drizzle schema
- **Multi-Tenancy (T-02)**: 所有 WHERE 含 userId，所有 server action 传递 MVP_USER_ID
- **tsc 零新增**: 60 errors 基线（[022.01] Phase 2），本 Phase 大量删代码，目标 ≤60
- **vitest OKR domain 保持通过**: 44 tests 基线（Phase 2），去 status 后重写/删除相关测试
- **文件头注释**: 每个新建/修改的 TS/JS 文件必须有 `/** @file ... @brief ... */` 注释
- **简体中文**: 所有注释和用户可见文案
- **UI 颜色令牌**: 使用 CSS 变量（`bg-canvas`、`text-ink` 等），禁止 Tailwind 默认颜色
- **文档权威链**: USOM Design > Database Design > Schema Code（宪法 §IV），先更新文档再改代码
- **迁移手写**: drizzle migrate 不可用，手写 SQL + psql + 登记 journal

---
---

### Task 1: 文档前置更新

**Files:**
- Modify: `docs/usom-design.md`
- Modify: `docs/database-design.md`

**前置条件**: 宪法 §IV 要求「USOM Document > Database Design Document > Schema Code」权威链，文档更新必须在代码变更之前。

- [ ] **Step 1: 更新 usom-design.md — Objective 类型去 status**

在 `docs/usom-design.md` 的 Objective 类型定义中：

1. 删除 `status: ObjectiveStatus` 字段行
2. 添加版本标注：
```markdown
### Objective (v2 — since 2026-07-02: removed status field)

状态权威已迁移至 Cycle.status。Objective 的可编辑性由所属 Cycle 状态决定：
- draft/not_started/in_progress/ended cycle → Objective 可字段编辑
- reviewed cycle → Objective 只读
- 删除 Objective 仅限 draft cycle + 无 KR 关联守卫
```
3. 保留 `discardedAt`、`completedAt`、`archivedAt` 时间戳字段（软删除语义）

- [ ] **Step 2: 更新 usom-design.md — KeyResult 类型去 status**

同上，KeyResult 类型：
1. 删除 `status: KeyResultStatus` 字段行
2. 添加版本标注，说明完成语义由 progressRate 承载（progressRate >= 1.0 → completedAt 自动设置）
3. 保留 `discardedAt`、`completedAt`、`archivedAt`

- [ ] **Step 3: 更新 database-design.md — objectives/key_results 表去 status 列**

1. objectives 表：删除 `status` 列，标注迁移索引号
2. key_results 表：删除 `status` 列，标注迁移索引号
3. 同步删除索引 `idx_objectives_user_status`、`idx_key_results_user_status`
4. 标注 `findAll` 过滤逻辑变更：`ne(status,'archived')` → `discardedAt IS NULL AND archivedAt IS NULL`

- [ ] **Step 4: Commit**

```bash
git add docs/usom-design.md docs/database-design.md
git commit -m "docs(okrs): [022.01] Phase 3 — USOM/DB 设计文档去 Objective/KR status

宪法 §IV 文档权威链前置更新：
- USOM: Objective/KeyResult 类型移除 status 字段，标注版本变更
- DB: objectives/key_results 表移除 status 列 + 索引，标注迁移号
- 状态权威迁移至 Cycle.status，完成语义由 KR progressRate 承载"
```

---

### Task 2: USOM 类型层 + Manifest + 状态转换清理

**Files:**
- Modify: `frontend/src/usom/types/objects.ts`
- Modify: `frontend/src/usom/types/primitives.ts`
- Modify: `frontend/src/usom/types/process.ts`
- Modify: `frontend/src/domains/okrs/manifest.yaml`
- Modify: `frontend/src/domains/okrs/transitions.ts`
- Modify: `frontend/src/domains/okrs/guard.ts`
- Modify: `frontend/src/domains/okrs/hooks.ts`

**Interfaces:**
- Removes: `Objective.status`, `KeyResult.status`, `ObjectiveStatus` type, `KeyResultStatus` type, `objectiveTransitions`, `keyResultTransitions`, manifest `lifecycle.objective`, `lifecycle.key_result`, `cascade_rules.parent_child_status`, Objective status events
- Produces: N/A（纯删除 + guard 注释更新）

- [ ] **Step 1: 删除 primitives.ts 中的 ObjectiveStatus / KeyResultStatus 类型**

修改 `frontend/src/usom/types/primitives.ts`，删除以下两行及注释块：
```typescript
// 删除 (原 L197):
export type ObjectiveStatus = 'draft' | 'active' | 'paused' | 'completed' | 'discarded' | 'archived'

// 删除 (原 L208):
export type KeyResultStatus = 'draft' | 'active' | 'paused' | 'completed' | 'discarded' | 'archived'
```

> ⚠️ 若 `ObjectiveStatus` / `KeyResultStatus` 被其他域 import（如 tasks/habits），需同步更新。先在 frontend 目录 grep 确认：
> ```bash
> cd frontend && grep -r "ObjectiveStatus\|KeyResultStatus" src/ --include="*.ts" --include="*.tsx" | grep -v __tests__ | grep -v node_modules | grep -v "domains/okrs" | grep -v "usom/types"
> ```
> 预期：仅 okrs 域和 usom/types 自身引用。

- [ ] **Step 2: 删除 objects.ts 中 Objective 和 KeyResult 的 status 字段**

修改 `frontend/src/usom/types/objects.ts`：

Objective 接口 (L183-207)：
```typescript
export interface Objective {
  id: USOM_ID
  // [022.01] Phase 3: 移除 status 字段。状态权威迁移至 Cycle.status。
  title: string
  description?: string
  cycleId: USOM_ID
  // ... 其余字段不变
  discardedAt?: Timestamp
  completedAt?: Timestamp
  archivedAt?: Timestamp
}
```

KeyResult 接口 (L228-249)：
```typescript
export interface KeyResult {
  id: USOM_ID
  objectiveId: USOM_ID
  title: string
  // ... 其余字段不变
  // [022.01] Phase 3: 移除 status 字段。完成语义由 progressRate 承载。
  discardedAt?: Timestamp
  completedAt?: Timestamp
  archivedAt?: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

同步更新 JSDoc 注释（移除 `@property status` 行）。

- [ ] **Step 3: 清理 manifest.yaml — 删除 lifecycle.objective + lifecycle.key_result**

修改 `frontend/src/domains/okrs/manifest.yaml`：

1. **精简** `lifecycle.objective` 为 minimal null→draft（仅 create 转换，draft 同时是初态和终态）：
```yaml
  # [022.01] Phase 3：objective 无独立状态机。仅保留 null→draft 的 create 转换
  # 以维持 orchestrator 管线（createObjective 走 executeIntent→SM→SystemEvent）。
  # draft 即初态也是终态——创建后无任何 SM 转换，字段写走 mutation-service。
  objective:
    states: [draft]
    initial_state: draft
    transitions:
      - { from: null, to: draft, trigger: intent, action: create, event_type: ObjectiveCreated }
    terminal_states: [draft]
```
2. **精简** `lifecycle.key_result` 为 minimal null→draft（同上模式）：
```yaml
  key_result:
    states: [draft]
    initial_state: draft
    transitions:
      - { from: null, to: draft, trigger: intent, action: create, event_type: KeyResultUpdated }
    terminal_states: [draft]
```
3. **保留** `lifecycle.cycle:` 不变

> 为什么要保留 minimal lifecycle？orchestrator L951 在 `getLifecycle` 返回 undefined 时抛 `"未找到 lifecycle: okrs/objective"`。`resolveObjectType` (L120) 和 `buildActionMap` (L59) 也都依赖 lifecycle keys 做对象类型推导和 action 映射。删光会崩。

- [ ] **Step 4: 清理 manifest.yaml — 删除 cascade_rules**

删除 `cascade_rules:` 整块（L233-263）。SM 侧已有 null-safety 守卫：
```typescript
// orchestrator/index.ts:955
getCascadeRules: cascadeRules.length > 0 ? () => cascadeRules as any : undefined,
// state-machine/index.ts:336
if (deps.getCascadeRules && deps.domainId) { ... }
```
删除后 cascadeRules 为空数组 → getCascadeRules 为 undefined → SM 跳过 cascade 处理，不会抛 TypeError。

- [ ] **Step 5: 清理 manifest.yaml — 删除 field_metadata.status + subscribed_events 中的 Obj 事件 + list_actions**

1. 删除 `field_metadata.status` 行（L156，Obj/KR 不再有 status 字段）
2. 删除 `subscribed_events` 中的 6 个 Objective 状态事件（L199-204）：
   - `ObjectiveActivated`
   - `ObjectivePaused`
   - `ObjectiveResumed`
   - `ObjectiveCompleted`
   - `ObjectiveDiscarded`
   - `ObjectiveArchived`
3. 删除 `list_actions:` 整块（L164-170，discard/archive 不再走 list action 路径）

- [ ] **Step 6: 删除 transitions.ts 中的 objectiveTransitions + keyResultTransitions**

修改 `frontend/src/domains/okrs/transitions.ts`：

1. 删除 `objectiveTransitions` 常量（L29-40，含注释）
2. 删除 `keyResultTransitions` 常量（L42-53，含注释）
3. 删除 `ObjectiveStatus` / `KeyResultStatus` import
4. 保留 `Transition<T>` 接口和 `findTransition` 辅助函数（cycle SM 仍在使用）
5. 更新 `@file` / `@brief` 注释

- [ ] **Step 7: 更新 guard.ts 注释 + 去 Phase 2 限定**

修改 `frontend/src/domains/okrs/guard.ts`：

1. 更新 `@brief` 注释：移除「Phase 2 集成范围」行，改为全面守卫说明
2. 将
   ```
   * Phase 2 集成范围：deleteCycle + reviewCycle（cycle 级操作）。
   * Obj/KR 写路径接入 defer 到 Phase 3（届时 Obj/KR 自身 status 被移除）。
   ```
   替换为：
   ```
   * Phase 3 全面守卫：所有 Cycle/Obj/KR 写路径均经 assertEditable 检查。
   ```
3. 权限矩阵（ALLOWED）不变——Phase 2 定义的矩阵已是正确的（Obj/KR 编辑由 cycle.status 决定）

- [ ] **Step 7b: 清理 process.ts — 删除已移除的 Objective/KR 事件类型**

修改 `frontend/src/usom/types/process.ts`，从 `CoreEvent['type']` 联合类型（约 L199-201）中移除以下事件类型：
```typescript
// 删除：
| 'ObjectiveActivated' | 'ObjectivePaused' | 'ObjectiveResumed'
| 'ObjectiveCompleted' | 'ObjectiveDiscarded' | 'ObjectiveArchived'
```
> ⚠️ 这些事件名也出现在 `manifest.yaml` 的 `subscribed_events`（Task 2 Step 5 已删）。不删会导致联合类型仍接受不可能被 dispatch 的事件，所有 switch on event.type 的分支仍保留 dead case。

- [ ] **Step 7c: 清理 hooks.ts — 删除 Objective status 事件 + activateObjective 校验**

修改 `frontend/src/domains/okrs/hooks.ts`：

1. **删除 `activateObjective` 校验块**（约 L146）：
```typescript
// 删除以下代码块：
if (action === 'activateObjective') {
  // draft KR + period dates check ...
}
```

2. **删除 `onEvent` switch 中的 Objective/KR status 事件 case**（约 L236-269）：
```typescript
// 删除以下 switch cases（这些事件不再产生）：
case 'ObjectiveActivated':
case 'ObjectiveCompleted':
case 'ObjectiveDiscarded':
case 'KeyResultCompleted':
```

3. **删除 `ObjectiveStatus` / `KeyResultStatus` import**（如有）

- [ ] **Step 8: 编译验证**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
```

预期：大量 TS 错误（类型层移除后所有引用 Objective.status/KeyResult.status 的代码都会报错）。Record baseline——这是预期行为，后续 Task 逐步清零。

- [ ] **Step 9: 验证 manifest**

```bash
cd frontend && npm run validate:manifest 2>&1 | grep "okrs"
```

预期：`✓ okrs/manifest.yaml — 全部通过`（manifest 已删 obj/kr lifecycle，仅保留 cycle）

- [ ] **Step 10: Commit**

```bash
git add frontend/src/usom/types/objects.ts frontend/src/usom/types/primitives.ts \
        frontend/src/domains/okrs/manifest.yaml frontend/src/domains/okrs/transitions.ts \
        frontend/src/domains/okrs/guard.ts
git commit -m "feat(okrs): [022.01] Phase 3 — 类型层+Manifest+状态转换去 Objective/KR status

- 删除 ObjectiveStatus / KeyResultStatus 类型（primitives.ts）
- 删除 Objective.status / KeyResult.status 字段（objects.ts）
- 删除 manifest lifecycle.objective / lifecycle.key_result
- 删除 manifest cascade_rules.parent_child_status（6 条）
- 删除 manifest subscribed_events 中的 6 个 Obj 状态事件
- 删除 manifest field_metadata.status + list_actions
- 删除 objectiveTransitions / keyResultTransitions
- guard.ts 去 Phase 2 限定注释（升级为全面守卫）"
```

---

### Task 3: 数据层清理 — Mappers + Repositories + Adapter

**Files:**
- Modify: `frontend/src/lib/db/repositories/mappers.ts`
- Modify: `frontend/src/domains/okrs/repository/objective.ts`
- Modify: `frontend/src/domains/okrs/repository/key-result.ts`
- Modify: `frontend/src/domains/okrs/repository/generic-repo-adapter.ts`

**Interfaces:**
- Removes: `ObjectiveRow.status`, `KeyResultRow.status`, mapper status 映射, `ObjectiveRepository.findByStatus/findActive/findByStatusInPeriod/archive`, `KeyResultRepository.batchUpdateStatus/deleteDraft/archive`, `updateProgress` 中的 status 派生逻辑, adapter 中的 obj/kr `create`（status 硬编码）、`updateStatus`、`deleteDraft`
- Produces: `KeyResultRepository.updateProgress` 独立设置 `completedAt`（progressRate >= 1.0）；`ObjectiveRepository.findAll` 改 `discardedAt IS NULL AND archivedAt IS NULL` 过滤；`findActive` 改为按 cycle.status=in_progress 过滤

- [ ] **Step 1: 清理 mappers.ts — 删除 Objective/KeyResult 的 status 映射**

修改 `frontend/src/lib/db/repositories/mappers.ts`：

1. `ObjectiveRow` 类型（L407-418）：删除 `status: string;`
2. `objectiveRowToUSOM`（L420-446）：删除 `status: row.status as Objective['status'],`
3. `objectiveUSOMToRow`（L448-467）：删除 `status: objective.status,`
4. `KeyResultRow` 类型（L470-481）：删除 `status: string;`
5. `keyResultRowToUSOM`（L483-505）：删除 `status: row.status as KeyResult['status'],`
6. `keyResultUSOMToRow`（L507-524）：删除 `status: kr.status,`

- [ ] **Step 2: 清理 ObjectiveRepository — 删除 status 相关方法 + 更新 findAll/findActive**

修改 `frontend/src/domains/okrs/repository/objective.ts`：

**2a. `findObjRows` select 子句**（L31-53）：删除 `status: s.objectives.status,`

**2b. `findAll`**（L82-88）：从
```typescript
async findAll(userId: USOM_ID): Promise<Objective[]> {
  const rows = await this.findObjRows(
    and(eq(s.objectives.userId, userId), ne(s.objectives.status, 'archived')),
  )
```
改为：
```typescript
async findAll(userId: USOM_ID): Promise<Objective[]> {
  const rows = await this.findObjRows(
    and(
      eq(s.objectives.userId, userId),
      // [022.01] Phase 3: status 列已删除，用时间戳过滤软删除
      eq(s.objectives.discardedAt, null as any),  // isNull 需用 isNull()
      eq(s.objectives.archivedAt, null as any),
    ),
  )
```
> ⚠️ Drizzle `isNull` 操作符：`import { isNull } from 'drizzle-orm'`，用法 `isNull(s.objectives.discardedAt)`。

实际代码：
```typescript
import { eq, and, between, inArray, ne, like, isNull, type SQL } from 'drizzle-orm'
// ...
async findAll(userId: USOM_ID): Promise<Objective[]> {
  const rows = await this.findObjRows(
    and(
      eq(s.objectives.userId, userId),
      isNull(s.objectives.discardedAt),
      isNull(s.objectives.archivedAt),
    ),
  )
  const krByObj = await this.batchKeyResultIds(rows.map((r) => r.id))
  return rows.map((r) => objectiveRowToUSOM(r as any, krByObj.get(r.id) ?? []))
}
```

**2c. `findActive`**（L90-96）：从 status='active' 改为按 cycle.status='in_progress' 过滤：
```typescript
async findActive(userId: USOM_ID): Promise<Objective[]> {
  const rows = await this.findObjRows(
    and(
      eq(s.objectives.userId, userId),
      isNull(s.objectives.discardedAt),
      isNull(s.objectives.archivedAt),
      eq(s.cycles.status, 'in_progress'),
    ),
  )
  const krByObj = await this.batchKeyResultIds(rows.map((r) => r.id))
  return rows.map((r) => objectiveRowToUSOM(r as any, krByObj.get(r.id) ?? []))
}
```

**2d. 删除 `findByStatus` 方法**（L98-104）：整个删除

**2e. 删除 `findByStatusInPeriod` 方法**（L133-144）：整个删除

**2f. 删除 `archive` 方法**（L245-249）：整个删除。软删除语义改为调用方直接设置 `discardedAt`/`archivedAt` 通过 `updateFields`

**2g. `findWithKeyResults`** (L146-175)：同样删除 select 子句中的 `status: s.objectives.status,`

**2h. 清理 import**：删除 `ObjectiveStatus` import，添加 `isNull` import

- [ ] **Step 3: 清理 KeyResultRepository — 删除 status 方法 + 更新 updateProgress**

修改 `frontend/src/domains/okrs/repository/key-result.ts`：

**3a. `updateProgress`**（L47-120）：删除 status 派生逻辑（L104-105），改为独立设置 `completedAt`：
```typescript
// ── 4. 完成时间戳自动管理（替代 status 派生）──
// progressRate >= 1.0 且 completedAt 未设 → 设 completedAt = now()
// progressRate < 1.0 且 completedAt 已设 → 清空 completedAt（允许"未完成"回退）
const now = new Date()
const completedAtUpdate: Date | null =
  progressRate >= 1.0 ? (existing.completedAt ? toDate(existing.completedAt) ?? now : now) : null

// ── 5. 持久化 ──
await tx.update(s.keyResults)
  .set({
    currentValue: String(clampedValue),
    progressRate: String(progressRate),
    updatedAt: now,
    ...(completedAtUpdate !== undefined ? { completedAt: completedAtUpdate } : {}),
  })
  .where(and(eq(s.keyResults.id, id), eq(s.keyResults.userId, userId)))
```

> ⚠️ 需要 `toDate` helper（从 mappers.ts 导入或内联）

完整新版 updateProgress：
```typescript
async updateProgress(
  id: USOM_ID,
  _currentValue: number,
  userId: USOM_ID,
  tx: DbClient = db,
): Promise<KeyResult> {
  const contributionRepo = new ContributionRepository()

  // ── 0. 孤儿清理 ──
  const contributions = await contributionRepo.findByKeyResult(id, userId, tx)
  // 0a. Task 孤儿 ... (保持不变)
  // 0b. Habit 孤儿 ... (保持不变)

  // ── 1. 经 junction 表重算进度 ──
  const { currentValue, progressRate } = await contributionRepo.recomputeProgress(id, userId, tx)

  // ── 2. 获取 KR 元数据 ──
  const existing = await this.findById(id, userId, tx)
  if (!existing) throw new Error(`KeyResult ${id} not found`)

  // ── 3. 下钳保底 ──
  const clampedValue = Math.max(0, currentValue)

  // ── 4. [022.01] Phase 3: 完成时间戳自动管理（替代 status 派生）──
  const setValues: Record<string, unknown> = {
    currentValue: String(clampedValue),
    progressRate: String(progressRate),
    updatedAt: new Date(),
  }
  if (progressRate >= 1.0 && !existing.completedAt) {
    setValues.completedAt = new Date()
  } else if (progressRate < 1.0 && existing.completedAt) {
    setValues.completedAt = null  // 允许"未完成"回退
  }

  // ── 5. 持久化 ──
  await tx.update(s.keyResults)
    .set(setValues)
    .where(and(eq(s.keyResults.id, id), eq(s.keyResults.userId, userId)))

  const updated = await this.findById(id, userId, tx)
  if (!updated) throw new Error(`KeyResult ${id} not found after updateProgress`)
  return updated
}
```

**3b. 删除 `batchUpdateStatus` 方法**（L122-136）：整个删除（cascade 系统不再需要）

**3c. 删除 `deleteDraft` 方法**（L138-145）：整个删除（不再依赖 status='draft'）

**3d. 删除 `archive` 方法**（L176-180）：整个删除

**3e. 清理 import**：删除 `KeyResultStatus` import

- [ ] **Step 4: 清理 generic-repo-adapter.ts — 删除 obj/kr 的 create/updateStatus/deleteDraft**

修改 `frontend/src/domains/okrs/repository/generic-repo-adapter.ts`：

**4a. `objective` adapter**：

删除 `create` 方法（L58-77，含 `status: fields.status ?? 'draft'` 硬编码）。需保留 `create` 但去掉 status：
```typescript
async create(fields, userId, tx) {
  const id = crypto.randomUUID() as USOM_ID
  const now = new Date().toISOString()
  const objective = {
    id,
    // [022.01] Phase 3: 不再硬编码 status。fields 中不含 status。
    title: fields.title ?? '',
    description: fields.description,
    okrType: fields.okrType ?? 'committed',
    priority: fields.priority ?? 'P1',
    tags: fields.tags ?? [],
    cycleId: fields.cycleId,
    keyResultIds: [] as string[],
    objectiveNumber: '',
    createdAt: now,
    updatedAt: now,
  }
  await repos.objectiveRepo.save(objective, userId, tx)
  return objective
}
```

删除 `updateStatus` 方法（L78-92）。

**4b. `key_result` adapter**：

删除 `create` 中的 `status: fields.status ?? 'draft'`（L117）。保留其余字段不变。

删除 `updateStatus` 方法（L124-138）。

删除 `deleteDraft` 方法（L145-147）。

**4c. 接口类型 `OkrsRepoPair`**（L20-41）：

在 `keyResultRepo` 接口中删除 `deleteDraft` 声明。

- [ ] **Step 5: 运行 OKR domain 测试，确认数据层测试通过**

```bash
cd frontend && npx vitest run src/domains/okrs/repository --reporter=verbose 2>&1 | tail -20
```

预期：相关测试需更新（删除 status 断言），记录失败数。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/db/repositories/mappers.ts \
        frontend/src/domains/okrs/repository/objective.ts \
        frontend/src/domains/okrs/repository/key-result.ts \
        frontend/src/domains/okrs/repository/generic-repo-adapter.ts
git commit -m "feat(okrs): [022.01] Phase 3 — 数据层去 Objective/KR status

Mapper:
- ObjectiveRow/KeyResultRow 删 status 字段
- objectiveRowToUSOM/objectiveUSOMToRow 删 status 映射
- keyResultRowToUSOM/keyResultUSOMToRow 删 status 映射

ObjectiveRepository:
- findAll: ne(status,'archived') → isNull(discardedAt)+isNull(archivedAt)
- findActive: status='active' → cycle.status='in_progress'
- 删除 findByStatus / findByStatusInPeriod / archive

KeyResultRepository:
- updateProgress: status 派生 → completedAt 自动管理(progressRate≥1.0设值,<1.0清空)
- 删除 batchUpdateStatus / deleteDraft / archive

GenericRepoAdapter:
- objective.create/key_result.create 去 status 硬编码
- 删除 objective/key_result 的 updateStatus / deleteDraft"
```

---

### Task 4: Server Actions + useOKRs Hook 清理

**Files:**
- Modify: `frontend/src/app/actions/okr.ts`
- Modify: `frontend/src/hooks/use-okrs.ts`

**Interfaces:**
- Removes: `activateObjective`, `changeObjectiveStatus`, `deleteDraftKeyResult` server actions；hook 中的 `activate`, `changeStatus`, `deleteKR` 方法
- Produces: `createObjective`/`updateObjective`/`createKeyResult`/`updateKeyResult` 接入 `assertEditable`；`refresh()` 不再接受 status 参数

- [ ] **Step 1: 清理 server actions — 删除 status 相关 actions**

修改 `frontend/src/app/actions/okr.ts`：

1. 删除 `import type { ObjectiveStatus }` 行
2. 删除 `getObjectives` 的 `status?: ObjectiveStatus` 参数——改为无参数（返回所有非软删除 objectives）：
```typescript
export async function getObjectives(): Promise<OKRActionResult<Objective[]>> {
  try {
    const repo = new ObjectiveRepository();
    const objectives = await repo.findAll(MVP_USER_ID);
    return { success: true, data: objectives };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "获取目标列表失败" };
  }
}
```

3. 删除 `activateObjective` 函数（L257-269）：整个删除。Obj 不再有独立状态，激活语义消失。

4. 删除 `changeObjectiveStatus` 函数（L278-298）：整个删除。状态变更改为软删除（discard→设 discardedAt，archive→设 archivedAt）或走 cycle 级操作。

5. 删除 `deleteDraftKeyResult` 函数（L375-387）：整个删除。KR 删除改为设 discardedAt（通过 `updateKeyResult(id, { discardedAt: new Date().toISOString() })`）。

6. **新增**: `createObjective` 接入 `assertEditable`：
```typescript
export async function createObjective(
  input: { cycleId: string; title: string; description?: string; okrType?: "visionary" | "committed"; priority?: "P0" | "P1" | "P2" },
): Promise<OKRActionResult<Objective>> {
  try {
    // Phase 3: 检查 cycle 是否允许 edit_objective
    const cycleRepo = new CycleRepository();
    const cycle = await cycleRepo.findById(input.cycleId as USOM_ID, MVP_USER_ID);
    if (cycle) assertEditable(cycle, 'edit_objective');

    const orchestrator = await createOKROrchestrator();
    const intent = makeIntent("createObjective", { ...input, priority: input.priority ?? 'P1' });
    const result = await orchestrator.executeIntent(intent, MVP_USER_ID);
    if (!result.success) return { success: false, error: result.error };
    // [022.01] Phase 3: findByStatus 已删除（obj 无 status 字段）。
    // SM executeIntent 返回 result.object 含新创建的 Objective，直接取用。
    const created = result.object as Objective | undefined;
    if (!created) return { success: false, error: "目标创建成功但未返回对象" };
    return { success: true, data: created };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "创建目标失败" };
  }
}
```

7. **新增**: `updateObjective` 接入 `assertEditable`（在逐字段写入前）：
```typescript
export async function updateObjective(
  objectiveId: string,
  fields: Record<string, unknown>,
): Promise<OKRActionResult<Objective>> {
  try {
    // Phase 3: 检查所属 cycle 是否允许 edit_objective
    const objRepo = new ObjectiveRepository();
    const obj = await objRepo.findById(objectiveId, MVP_USER_ID);
    if (obj) {
      const cycleRepo = new CycleRepository();
      const cycle = await cycleRepo.findById(obj.cycleId, MVP_USER_ID);
      if (cycle) assertEditable(cycle, 'edit_objective');
    }
    // ... 逐字段写入逻辑不变
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '更新目标失败' };
  }
}
```

8. **新增**: `createKeyResult` 接入 `assertEditable`（检查所属 objective 的 cycle）：
```typescript
export async function createKeyResult(
  objectiveId: string,
  input: { title: string; description?: string; targetValue: number; unit: string },
): Promise<OKRActionResult<KeyResult>> {
  try {
    // Phase 3: 检查所属 Objective 的 cycle 是否允许 edit_kr
    const objRepo = new ObjectiveRepository();
    const obj = await objRepo.findById(objectiveId as USOM_ID, MVP_USER_ID);
    if (obj) {
      const cycleRepo = new CycleRepository();
      const cycle = await cycleRepo.findById(obj.cycleId, MVP_USER_ID);
      if (cycle) assertEditable(cycle, 'edit_kr');
    }
    // ... 现有逻辑不变
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "创建关键结果失败" };
  }
}
```

9. `updateKeyResult` 和 `updateKeyResultProgress` 同样接入 `assertEditable(cycle, 'edit_kr')`。

- [ ] **Step 2: 更新 use-okrs.ts — 删除 status 相关方法 + 更新 refresh 签名**

修改 `frontend/src/hooks/use-okrs.ts`：

1. 删除 `import type { ObjectiveStatus }`（L16）
2. 删除 `import { ..., activateObjective, changeObjectiveStatus, ..., deleteDraftKeyResult }` 中的三个 import
3. 删除 `UseOKRsResult` 接口中的：
   - `refresh: (cycleStatus?: ObjectiveStatus) => Promise<void>` → `refresh: () => Promise<void>`
   - `activate: (id: string) => Promise<boolean>`
   - `changeStatus: (id: string, action: ...) => Promise<boolean>`
   - `deleteKR: (id: string) => Promise<boolean>`
4. 更新 `refresh` 实现：从 `getObjectives(cycleStatus)` → `getObjectives()`（无参数）
5. 删除 `activate_` callback（L149-157）
6. 删除 `changeStatus_` callback（L159-167）
7. 删除 `deleteKR_` callback（L193-201）
8. 在 return 对象中删除 `activate`, `changeStatus`, `deleteKR` 字段
9. 更新 `@file` / `@brief` 注释

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/actions/okr.ts frontend/src/hooks/use-okrs.ts
git commit -m "feat(okrs): [022.01] Phase 3 — Server Actions + Hook 去 Objective/KR status

Server Actions:
- 删除 activateObjective / changeObjectiveStatus / deleteDraftKeyResult
- getObjectives() 去 status 参数
- createObjective/updateObjective 接入 assertEditable(cycle, 'edit_objective')
- createKeyResult/updateKeyResult/updateKRProgress 接入 assertEditable(cycle, 'edit_kr')

Hook:
- refresh() 签名简化（不再接受 ObjectiveStatus 参数）
- 删除 activate / changeStatus / deleteKR 方法
- 删除 ObjectiveStatus import"
```

---

### Task 5: UI 组件去 Objective/KR status

**Files:**
- Modify: `frontend/src/domains/okrs/components/okr-directory.tsx`
- Modify: `frontend/src/domains/okrs/components/okr-detail.tsx`
- Modify: `frontend/src/domains/okrs/components/okr-panel.tsx`
- Modify: `frontend/src/domains/okrs/components/okr-workspace.tsx`
- Modify: `frontend/src/domains/okrs/components/okr-list.tsx`
- Modify: `frontend/src/domains/okrs/components/objective-card.tsx`
- Modify: `frontend/src/domains/okrs/components/contribution-panel.tsx`
- Modify: `frontend/src/domains/okrs/components/kr-progress.tsx`

**Interfaces:**
- Removes: 所有 `obj.status === ...` 条件分支、`STATUS_LABELS`/`STATUS_ORDER`/`STATUS_TABS` 常量、`objectiveMenuItems` status 驱动函数、`statusActions` status 驱动数组、`activeKRs` status 过滤
- Produces: `ContributionPanel.isEditable` 改为 `cycleStatus` 驱动；OKRDirectory 目标菜单改为 cycle-status 驱动的简化版本

- [ ] **Step 1: 清理 okr-directory.tsx — 删除 objectiveMenuItems + status 依赖**

修改 `frontend/src/domains/okrs/components/okr-directory.tsx`：

1. 删除 `import type { ObjectiveStatus }`（L39）
2. 删除 `type ObjectiveAction` 和 `ObjectiveMenuItem` 类型（L97-102）
3. 删除 `objectiveMenuItems` 函数（L104-125）
4. 删除 `onChangeObjectiveStatus` prop 和 `handleChangeStatus`（L147）
5. 更新 collapse 逻辑（L149-159）：从
   ```typescript
   const hasActive = objectives.some(
     (o) => o.cycleId === cycle.id && o.status === "active",
   )
   ```
   改为（默认全部展开，或按 cycle.status === 'in_progress' 展开）：
   ```typescript
   const hasActive = cycle.status === "in_progress"
   ```
6. 替换目标行的 `...` 菜单渲染（L290-309）：从
   ```tsx
   {items.length > 0 && (
     <DropdownMenu>...
   ```
   改为——每个目标行仅保留「删除目标」操作（gate 由 assertEditable 决定，draft cycle 才可删）：
   ```tsx
   <DropdownMenu>
     <DropdownMenuTrigger aria-label="目标操作" className="...">⋯</DropdownMenuTrigger>
     <DropdownMenuContent align="end">
       <DropdownMenuItem onClick={() => handleChangeStatus(obj.id, "discard")}>
         删除目标
       </DropdownMenuItem>
     </DropdownMenuContent>
   </DropdownMenu>
   ```
   > ⚠️ Phase 3 MVP：目标菜单简化为仅「删除」（设置 discardedAt）。pause/resume/complete/archive 语义由 cycle 级操作承载。后续迭代可扩展。

- [ ] **Step 2: 清理 okr-detail.tsx — 删除 STATUS_LABELS + statusActions + status 渲染**

修改 `frontend/src/domains/okrs/components/okr-detail.tsx`：

1. 删除 `STATUS_LABELS` 常量（L51-58）
2. 删除 `statusActions` 推导逻辑（L97-128，含 `obj.status === "draft"/"active"/"paused"...`）
3. 删除 `handleStatusAction` 中的 `activate` case（L142-143）
4. 删除状态 Badge（L172-174）：
   ```tsx
   <Badge variant={obj.status === "active" ? "default" : "secondary"}>
     {STATUS_LABELS[obj.status] ?? obj.status}
   </Badge>
   ```
   改为显示 cycle 状态：
   ```tsx
   {/* cycle status 从 objective.period 无法直接获取，需父组件传入或查 cycle */}
   ```
   > ⚠️ MVP 取舍：OKR 详情页暂不显示状态 Badge。后续可在 OKRPanel 层传入 cycleStatus。

5. 删除「空 KR 提示」(L185-189, `activeKRs.length === 0 && obj.status === "active"`)
6. 删除「全完成提示」(L190-196, `activeKRs.every(kr => kr.status === "completed") && obj.status === "active"`)
7. 删除 `activeKRs` 过滤（L89）：改为 `const activeKRs = krs`（不按 status 过滤 KR）
8. 删除 draft 状态的「激活」按钮（L197-199）
9. 删除 `statusActions.map` 渲染（L202-208）
10. 在 ContributionPanel 处改 `objectiveStatus={obj.status}` → 传递 cycleStatus（需从父组件获取或从 objective.cycleId 推算）

- [ ] **Step 3: 清理 okr-panel.tsx — 删除 STATUS_LABELS + status 分支**

修改 `frontend/src/domains/okrs/components/okr-panel.tsx`：

1. 删除 `STATUS_LABELS` 常量（L42-50）
2. 删除 `activeKRs` 中的 status 过滤（L89）：`krs.filter(kr => kr.status !== "discarded" && kr.status !== "archived")` → `krs`
3. **检查 L226 附近**是否有第二处 `kr.status` 过滤——`okr-panel.tsx` 可能在 `completeKRs` 或其他 derived state 中再次使用了 `kr.status`。全部替换为 `progressRate >= 1.0` 或直接去掉状态过滤
3. 删除 `statusActions` 推导逻辑（L112-124，与 okr-detail.tsx 重复）
4. 删除 `handleStatusAction` 中的 `activate` dispatch
5. 在 `OKRDetail` 调用处传入 `cycleStatus` prop（从 objective.cycleId 查 cycle）

- [ ] **Step 4: 清理 okr-workspace.tsx — 删除所有 status 相关回调 + 过滤**

修改 `frontend/src/domains/okrs/components/okr-workspace.tsx`：

**4a.** `filteredObjectives` (L69)：从
```typescript
hook.objectives.filter((o) => o.status !== "archived"),
```
改为（防御性——findAll 已返回非软删除行）：
```typescript
hook.objectives.filter((o) => !o.archivedAt && !o.discardedAt),
```

**4b.** 删除 `handleDelete` (L148-155) — 替换为直接设 discardedAt：
```typescript
const handleDelete = useCallback(async (id: string) => {
  await hook.update(id, { discardedAt: new Date().toISOString() })
  if (selectedId === id) {
    setSelectedId(null); setDetailData(null); setMode("empty")
  }
}, [selectedId, hook])
```

**4c.** 删除 `handleStatusChange` (L157-163) 整个 callback

**4d.** 删除 `handleActivate` (L165-171) 整个 callback

**4e.** OKRDirectory props (L258)：删除 `onChangeObjectiveStatus` 行：
```typescript
// 删除此 prop:
onChangeObjectiveStatus={(id, action) => { void handleStatusChange(id, action as "pause" | "resume" | "complete" | "discard" | "archive") }}
```

**4f.** OKRPanel props (L283-302)：删除以下 prop 行：
```typescript
// 删除:
onActivate={handleActivate}
onChangeStatus={handleStatusChange}
onDeleteKR={hook.deleteKR}
```

**4g.** 在 OKRPanel 调用处传入 `cycleStatus`（供下游透传至 KRProgress/ContributionPanel）：
```typescript
cycleStatus={detailData?.cycleId ? hook.cycles.find(c => c.id === detailData.cycleId)?.status : undefined}
```

- [ ] **Step 5: 清理 okr-list.tsx — 删除 STATUS_ORDER/STATUS_LABELS + ObjectiveStatus**

修改 `frontend/src/domains/okrs/components/okr-list.tsx`：

1. 删除 `import type { ObjectiveStatus }`
2. 删除 `STATUS_ORDER` 常量（L21）
3. 删除 `STATUS_LABELS` 常量（L23-28）
4. 删除 `statusFilter` state（L31）
5. 删除 `filtered` logic（L94-96）→ 简单 `.filter(o => !o.archivedAt && !o.discardedAt)`
6. 删除 `grouped` logic（L98-104）→ 简单 map over objectives（不再按 status 分组）
7. 删除 status tabs 渲染（L115-121）
8. 删除 status 分组标题（L130-）

> ⚠️ `okr-list.tsx` 仅从 `components/index.ts` barrel export 被导出，无活跃 import 路径。若确认无外部引用，可考虑标记 deprecated 或直接更新。

- [ ] **Step 6: 清理 objective-card.tsx — 删除 status 渲染**

修改 `frontend/src/domains/okrs/components/objective-card.tsx`：

1. 删除 `STATUS_LABELS` 常量
2. 删除 `statusColor` 映射（L44-50）
3. 删除 `className` 中的 `statusColor[objective.status]`（L52）
4. 删除 status Badge 渲染（L65-66）
5. 删除 `activeKRs` 中的 status 过滤（L39）

- [ ] **Step 7: 清理 contribution-panel.tsx — objectiveStatus → cycleStatus**

修改 `frontend/src/domains/okrs/components/contribution-panel.tsx`：

1. 修改 `ContributionPanelProps`（L33-40）：
```typescript
interface ContributionPanelProps {
  krId: string
  /** [022.01] Phase 3: 改为 Cycle 状态（替代 Objective.status）*/
  cycleStatus: string
  onChange: () => void
}
```

2. 修改 `isEditable`（L72）：
```typescript
// [022.01] Phase 3：编辑权限由 cycle.status 决定
// draft/not_started/in_progress/ended 可编辑贡献；reviewed 只读
const isEditable = cycleStatus !== "reviewed"
```

3. 更新 `@brief` 注释（L8：`objective.status ∈ {draft, active}` → `cycle.status ≠ reviewed`）

> ⚠️ `cycleStatus` 通过 prop drilling 传入：okr-workspace（已有 `hook.cycles`，含所有 cycle status）→ OKRPanel → OKRDetail → ContributionPanel。OKRPanel 中：`const cycleStatus = hook.cycles.find(c => c.id === obj.cycleId)?.status ?? 'draft'`，然后透传给 OKRDetail 和 ContributionPanel。零额外 DB 请求。

- [ ] **Step 7b: 清理 kr-progress.tsx — 删除 kr.status 引用**

修改 `frontend/src/domains/okrs/components/kr-progress.tsx`（4 处 `kr.status` 使用）：

1. **L80**: 删除 status 文字显示。替换为完成状态文本：
```tsx
{kr.progressRate >= 1.0 && <span className="text-xs text-success">✓</span>}
```

2. **L85**: 进度条颜色从 `statusColors[kr.status]` 改为 progressRate 驱动：
```typescript
const barColor = kr.progressRate >= 1.0 ? "bg-success" : "bg-primary"
```
```tsx
<div className={`h-full rounded-full transition-all ${barColor}`}
```

3. **L106**: `editable && kr.status === "active"` → 仅 `editable`（父组件已根据 cycleStatus 控制 editable）：
```tsx
{editable && (
  <Button ...>更新</Button>
)}
```

4. **L136**: 同上，`editable && kr.status === "active" && onConfidenceUpdate` → `editable && onConfidenceUpdate`

5. 删除 `statusColors` 对象（L64-71）

- [ ] **Step 8: Commit**

```bash
git add frontend/src/domains/okrs/components/
git commit -m "feat(okrs): [022.01] Phase 3 — UI 组件去 Objective/KR status

okr-directory:
- 删除 objectiveMenuItems（status 驱动）
- collapse 逻辑改为 cycle.status === 'in_progress'
- 目标菜单简化为仅「删除」（MVP）

okr-detail/okr-panel:
- 删除 STATUS_LABELS + statusActions + status Badge
- 删除 activeKRs status 过滤
- 删除 draft 激活/status 操作按钮

okr-workspace:
- 删除 onChangeObjectiveStatus / handleStatusChange / handleActivate
- 删除 o.status !== 'archived' 过滤 → 改为时间戳检查

okr-list:
- 删除 STATUS_ORDER / STATUS_LABELS / ObjectiveStatus tabs

objective-card:
- 删除 status Badge / statusColor

contribution-panel:
- isEditable: objectiveStatus → cycleStatus（reviewed 只读）
- objectiveStatus prop → cycleStatus prop"
```

---

### Task 6: DB Schema + 数据迁移

**Files:**
- Modify: `frontend/src/lib/db/schema.ts`
- Create: `frontend/drizzle/0028_p3_drop_obj_kr_status.sql`
- Modify: `frontend/drizzle/journal.ts`

**Interfaces:**
- Removes: `objectives.status` column + `idx_objectives_user_status` index; `key_results.status` column + `idx_key_results_user_status` index
- Produces: 迁移 SQL（up + down）+ journal entry

- [ ] **Step 1: 更新 schema.ts — 删除 objectives.status 列 + 索引**

修改 `frontend/src/lib/db/schema.ts`：

1. L97：删除 `status: text('status', { enum: [...] }).notNull(),`
2. L116：删除 `index('idx_objectives_user_status').on(table.userId, table.status),`（整行）
3. 保留其余索引：`idx_objectives_cycle`、`idx_objectives_parent`

- [ ] **Step 2: 更新 schema.ts — 删除 key_results.status 列 + 索引**

1. L127：删除 `status: text('status', { enum: [...] }).notNull(),`
2. L151：删除 `index('idx_key_results_user_status').on(table.userId, table.status),`（整行）
3. 保留其余索引：`idx_key_results_objective`、`idx_key_results_due_date`

- [ ] **Step 3: 编写迁移 SQL（up）**

创建 `frontend/src/lib/db/migrations/0030_p3_drop_obj_kr_status.sql`：

```sql
-- [022.01] Phase 3: 移除 objectives/key_results 的 status 列
-- Up migration: 软删除语义落地 → DROP INDEX → DROP COLUMN
-- See: docs/superpowers/specs/2026-07-02-022-01-okr-cycle-governance-design.md §数据迁移计划

BEGIN;

-- 1. 软删除语义落地（COALESCE 保已有时间戳）
UPDATE objectives SET archived_at  = COALESCE(archived_at,  now()) WHERE status = 'archived';
UPDATE objectives SET discarded_at = COALESCE(discarded_at, now()) WHERE status = 'discarded';
UPDATE objectives SET completed_at = COALESCE(completed_at, now()) WHERE status = 'completed';
UPDATE key_results SET archived_at  = COALESCE(archived_at,  now()) WHERE status = 'archived';
UPDATE key_results SET discarded_at = COALESCE(discarded_at, now()) WHERE status = 'discarded';
UPDATE key_results SET completed_at = COALESCE(completed_at, now()) WHERE status = 'completed';

-- 2. DROP 索引（基于 status 列，已无用）
DROP INDEX IF EXISTS idx_objectives_user_status;
DROP INDEX IF EXISTS idx_key_results_user_status;

-- 3. DROP 列
ALTER TABLE objectives  DROP COLUMN IF EXISTS status;
ALTER TABLE key_results DROP COLUMN IF EXISTS status;

COMMIT;
```

- [ ] **Step 4: 编写迁移 SQL（down — 回滚用）**

**同一文件末尾追加 down migration**：

```sql
-- Down migration: 仅恢复列结构和索引，不恢复精确 status 值
-- ⚠️ 必须同步回滚代码（类型/mapper/repository 等），不可单独执行
-- 使用 NOT NULL DEFAULT 'draft' 匹配原始 schema 约束（原始列为 NOT NULL）

BEGIN;

-- 1. 恢复列（text NOT NULL，默认 draft 匹配原始语义）
ALTER TABLE key_results ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';
ALTER TABLE objectives  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

-- 2. 恢复索引
CREATE INDEX IF NOT EXISTS idx_objectives_user_status  ON objectives(user_id, status);
CREATE INDEX IF NOT EXISTS idx_key_results_user_status ON key_results(user_id, status);

COMMIT;
```

- [ ] **Step 5: 登记 journal**

修改 `frontend/src/lib/db/migrations/meta/_journal.json`，在末尾添加：
```json
{ "idx": 30, "name": "0030_p3_drop_obj_kr_status", "when": "2026-07-02T00:00:00.000Z", "tag": "0030_p3_drop_obj_kr_status", "breakpoints": true }
```
> ⚠️ `meta/_journal.json` 是 JSON 格式（非 TS），idx 29 已被 0027_a3_m3_drop_habit_templates 占用，下一个是 30。

- [ ] **Step 6: 执行迁移**

```bash
cd frontend
psql -U lifeware -d lifeware_dev -h localhost -f src/lib/db/migrations/0030_p3_drop_obj_kr_status.sql
```

验证：
```bash
psql -U lifeware -d lifeware_dev -h localhost -c "\d objectives" | grep status
# 预期：无 status 列

psql -U lifeware -d lifeware_dev -h localhost -c "\d key_results" | grep status
# 预期：无 status 列（但 index key_results_due_date 有 user_id 列，不冲突）
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/db/schema.ts \
        frontend/src/lib/db/migrations/0030_p3_drop_obj_kr_status.sql \
        frontend/src/lib/db/migrations/meta/_journal.json
git commit -m "feat(okrs): [022.01] Phase 3 — DB Schema 去 status 列 + 迁移

Schema:
- objectives: DROP status 列 + idx_objectives_user_status 索引
- key_results: DROP status 列 + idx_key_results_user_status 索引

Migration (0030):
- Up: UPDATE archived/completed/discarded 时间戳 → DROP INDEX → DROP COLUMN
- Down: ADD COLUMN NOT NULL DEFAULT 'draft' + CREATE INDEX（需同步回滚代码）
- Journal idx=30

迁移后验证: psql \d objectives/key_results 无 status 列"
```

---

### Task 7: 全量回归 + grep 清零 + 收尾验证

- [ ] **Step 1: tsc 全量检查**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
```

目标：≤60（Phase 2 基线 60，本次为大量删代码的 Task，应 ≤ 60）
若超出基线，分析新增错误来源并修复。

- [ ] **Step 2: 更新/新增测试 + 全量运行**

**2a. guard.test.ts — 新增 checkCycleEditable helper 测试（3 cases）：**
```typescript
describe('checkCycleEditable', () => {
  it('valid cycle status → passes', async () => {
    // draft cycle + edit_objective → 不抛错
  })
  it('reviewed cycle → throws', async () => {
    // reviewed cycle + edit_objective → throw Error
  })
  it('cycle not found → throws', async () => {
    // 不存在的 cycleId → throw Error('周期不存在')
  })
})
```

**2b. objective.test.ts — 新增 findAll 行为变更测试（2 cases）：**
```typescript
describe('findAll after Phase 3', () => {
  it('不返回 discardedAt 非 NULL 的 objectives', async () => { ... })
  it('不返回 archivedAt 非 NULL 的 objectives', async () => { ... })
})
```

**2c. key-result.test.ts — 新增 updateProgress completedAt 自动管理测试（4 cases）：**
```typescript
describe('updateProgress completedAt auto-management', () => {
  it('progressRate >= 1.0 且 completedAt 为 NULL → 设置 completedAt', async () => { ... })
  it('progressRate >= 1.0 且 completedAt 已存在 → 保持不变', async () => { ... })
  it('progressRate < 1.0 且 completedAt 已存在 → 清空 completedAt', async () => { ... })
  it('progressRate < 1.0 且 completedAt 为 NULL → 不变', async () => { ... })
})
```

**2d. okr-cycle.test.ts — 新增 assertEditable 守卫测试（3 cases）+ 删除 status action 测试：**
```typescript
describe('createObjective assertEditable guard', () => {
  it('reviewed cycle → createObjective 返回 error', async () => { ... })
  it('in_progress cycle → createObjective 成功', async () => { ... })
})
describe('updateKeyResultProgress assertEditable guard', () => {
  it('reviewed cycle → updateKRProgress 返回 error', async () => { ... })
})
// 删除 activateObjective / changeObjectiveStatus / deleteDraftKeyResult 相关测试
```

**2e. okr-directory.test.tsx — 更新 collapse + 菜单测试：**
```typescript
// 更新：in_progress cycle 默认展开 → 删除 obj.status === 'active' 断言
// 新增：目标 ⋯ 菜单仅含「删除目标」
it('目标菜单仅含删除目标操作', async () => { ... })
```

**2f. contribution-panel 测试 — 更新 isEditable 断言：**
```typescript
// 更新：cycleStatus !== 'reviewed' → 可编辑
// 新增：cycleStatus === 'reviewed' → 不可编辑
```

**2g. 删除死代码对应测试：**
- 删除 `okr-list` 相关测试（如有）
- 删除 `objectiveTransitions`/`keyResultTransitions` 相关测试

```bash
cd frontend && npx vitest run src/domains/okrs --reporter=verbose 2>&1 | tail -30
```

预期：151 baseline → 删除 status 测试 + 新增守卫测试，目标 140+ PASS 零新增失败

- [ ] **Step 3: grep 全仓 status 引用清零**

```bash
cd frontend

# 组 1：USOM 类型中不应再有 status 引用
grep -rn "ObjectiveStatus\|KeyResultStatus" src/usom/ --include="*.ts" | grep -v ".test." | grep -v __tests__
# 预期：无输出

# 组 2：OKR domain 中不应再有 non-cycle 的 status 引用
grep -rn "\.status" src/domains/okrs/ --include="*.ts" --include="*.tsx" | grep -v __tests__ | grep -v "\.test\." | grep -v "cycle\.status\|cycleStatus\|Cycle\['status'\]\|\.status ===\|\.status !==\|statusFilter\|STATUS_\|status\s*="
# 预期：仅 cycle 相关 status 引用

# 组 3：actions 中不应再有 ObjectiveStatus import
grep -rn "ObjectiveStatus" src/app/actions/ --include="*.ts"
# 预期：无输出

# 组 4：hooks 中不应再有 changeObjectiveStatus / deleteDraftKeyResult
grep -rn "changeObjectiveStatus\|deleteDraftKeyResult\|activateObjective" src/hooks/ --include="*.ts"
# 预期：无输出
```

- [ ] **Step 4: 跨域隔离守卫**

```bash
grep -r "from.*tasks" src/domains/okrs/ --include="*.ts" --include="*.tsx" | grep -v __tests__ | grep -v ".test." && echo "FAIL" || echo "PASS"
grep -r "from.*habits" src/domains/okrs/ --include="*.ts" --include="*.tsx" | grep -v __tests__ | grep -v ".test." && echo "FAIL" || echo "PASS"
grep -r "keyResultId" src/domains/habits/ --include="*.ts" --include="*.tsx" | grep -v __tests__ | grep -v ".test." && echo "FAIL" || echo "PASS"
```

预期：3/3 PASS

- [ ] **Step 5: manifest 验证**

```bash
cd frontend && npm run validate:manifest 2>&1 | grep "okrs"
cd frontend && npm run validate:structure 2>&1
```

预期：零错误

- [ ] **Step 6: 更新 CHANGELOG.md**

在 `CHANGELOG.md` 添加版本历史 entry：
```markdown
| 2026-07-02 | main | [022.01] Phase 3 — 移除 Objective/KeyResult 独立 status 字段与状态机。编辑/删除权限收敛至 Cycle.status 经 assertEditable 守卫。DB 迁移 0028（DROP objectives.status + key_results.status 列） | 1.16.0 |
```

- [ ] **Step 7: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(okrs): [022.01] Phase 3 收尾验证 + CHANGELOG

门禁:
- tsc: ≤60 (Phase 2 基线)
- OKR vitest: 全 PASS
- grep 守卫: 4/4 CLEAN
- manifest: validate:manifest + validate:structure 0 errors
- DB 迁移 0028 已执行 (objectives/key_results 无 status 列)"
```

---

## Execution Order

```
Task 1 (文档前置) ────────────────────────────────────────┐
Task 2 (类型+Manifest+Transitions) ──────────────────────┤ 可部分并行
Task 3 (数据层: Mappers+Repos+Adapter) ──────────────────┤
Task 4 (Server Actions+Hook) ─── requires Task 2+3 ──────┤
Task 5 (UI 组件) ─────────────── requires Task 2+3+4 ────┤
Task 6 (DB Schema+迁移) ───────── requires Task 2+3 ──────┤ (独立于 UI)
Task 7 (收尾验证) ─────────────── requires ALL ───────────┘
```

Tasks 1-3 可部分并行（Task 2 依赖 Task 1 的文档内容，Task 3 依赖 Task 2 的类型定义）

## 风险点

| 风险 | 影响 | 缓解 |
|------|------|------|
| `paused` 语义永久丢失 | 1 条 paused objective 在迁移后无法与 active 区分 | 用户已确认 P2「迁移有损可接受」，文档标注 |
| ContributionPanel `cycleStatus` 传值链断裂 | okr-detail 不再有 `obj.status` 可用，需从父组件传入 cycleStatus | Task 5 Step 7 明确标注，okr-panel 层负责传入 |
| `okr-list.tsx` 少量外部引用 | barrel export 可能被其他页面使用 | grep 已确认无活跃 import，直接更新 |
| DROP COLUMN 锁表 | 迁移执行期间 objectives/key_results 不可读写 | dev 库数据量小(607 行)，瞬时完成；生产执行需维护窗口 |
| cascade_rules 读取路径 null-safety | 删 manifest cascade_rules 后 orchestrator 可能抛 TypeError | 已验证：`getCascadeRules` 为 undefined 时 SM 跳过 cascade (L336 守卫) |

---

## Self-Review

**1. Spec coverage:**
- ✅ P0-3 组 1（manifest 清理）→ Task 2 Steps 3-5
- ✅ P0-3 组 2（代码层 status 派生与写方法）→ Task 3 Steps 2-4
- ✅ P0-3 组 3（DB schema + 迁移）→ Task 6
- ✅ P0-3 组 4（UI/hook/类型/跨域 wiring）→ Task 2 Step 1-2 + Task 4 + Task 5
- ✅ §B 前置步骤（文档更新）→ Task 1
- ✅ assertEditable 全面接入 → Task 4 Step 1（6-9）
- ✅ 迁移 up/down SQL → Task 6 Steps 3-4
- ✅ cascade_rules null-safety 验证 → Task 2 Step 4（标注已验证安全）

**2. Placeholder scan:** ✅ 零 "TBD"/"TODO"/"implement later"。所有步骤有具体代码或命令。

**3. Type consistency:**
- `Objective.status` 删除 → 所有引用编译报错 → Task 3-5 逐步清理
- `KeyResult.status` 删除 → 所有引用编译报错 → Task 3-5 逐步清理
- `Cycle['status']` → 不变，cycle 保留 status
- `ContributionPanel.cycleStatus` → Task 5 Step 7 定义，Task 5 Step 3 传入
- `assertEditable(cycle, operation)` → 签名不变，Task 2 Step 7 仅更新注释

**4. No orphaned code:** 所有删除有明确的替换逻辑（或无替换——直接废弃该功能）。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 10 issues, all resolved |
| Outside Voice | Codex automated | Independent 2nd opinion | 1 | CLEAR | 24 findings, 4 CRITICAL (C1-C4), all folded |

**CODEX:** 4 CRITICAL runtime crashers caught (createObjective→deleted findByStatus, kr-progress.tsx not in plan, okr-workspace broken hook refs, migration paths+idx wrong). Plus 2 HIGH type errors (process.ts union, hooks.ts dead code). All 6 fixed.

**CROSS-MODEL:** Strong agreement on architecture direction. Codex found 4 concrete runtime bugs the in-depth review missed — validates the outside voice as a complementary layer, not a substitute.

**VERDICT:** ENG + OUTSIDE VOICE CLEARED — ready to implement.

**RESOLVED — Review Decisions:**
- D-A1 (Arch 1): Keep minimal null→draft lifecycle (orchestrator L951 requires it)
- D-A2 (Arch 2): cycleStatus via prop drilling (okr-workspace→OKRPanel→OKRDetail→ContributionPanel)
- D-A3 (Arch 3): Delete okr-list.tsx (dead code, zero consumers)
- D-A4 (Arch 4): findAll behavior change documented (discarded now filtered)
- D-C5 (Code): Extract checkCycleEditable helper to guard.ts
- D-C6 (Code): Precise subscribed_events cleanup (7 events removed, not 6)
- C1-C4 (Codex CRITICAL): All fixed in plan
- H5-H6 (Codex HIGH): process.ts union + hooks.ts dead code fixed

NO UNRESOLVED DECISIONS
