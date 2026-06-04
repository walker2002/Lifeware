# Nexus.Orchestrator 违宪修正 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Orchestrator 的 ~540 行硬编码域特定业务逻辑迁移到通用 State Machine + Domain Plugin hooks，使 Orchestrator 成为纯调度器。

**Architecture:** SM 通过扩展后的 `GenericRepo` 通用接口执行所有 CRUD + 状态转换 + 级联。Orchestrator 只做调度：`onValidate → RuleEngine → SM → onEvent`。Domain hooks 处理校验（onValidate）和派生指标更新（onEvent）。

**Tech Stack:** TypeScript, Vitest, Drizzle ORM

**设计 Spec:** `docs/superpowers/specs/2026-06-04-nexus-orchestrator-constitutional-fix-design.md`

---

## 文件结构总览

### 新建文件

| 文件 | 职责 |
|---|---|
| `frontend/src/nexus/core/state-machine/cascade.ts` | SM cascade 机制：parent_child_status 类型处理器 |
| `frontend/src/nexus/core/state-machine/__tests__/cascade.test.ts` | cascade 机制单元测试 |
| `frontend/src/domains/tasks/repository/generic-repo-adapter.ts` | Tasks 域 GenericRepo 适配器 |
| `frontend/src/domains/tasks/repository/__tests__/generic-repo-adapter.test.ts` | Tasks adapter 测试 |
| `frontend/src/domains/habits/repository/generic-repo-adapter.ts` | Habits 域 GenericRepo 适配器 |
| `frontend/src/domains/habits/repository/__tests__/generic-repo-adapter.test.ts` | Habits adapter 测试 |
| `frontend/src/domains/okrs/repository/generic-repo-adapter.ts` | OKRs 域 GenericRepo 适配器 |
| `frontend/src/domains/okrs/repository/__tests__/generic-repo-adapter.test.ts` | OKRs adapter 测试 |
| `frontend/src/domains/timebox/repository/generic-repo-adapter.ts` | Timebox 域 GenericRepo 适配器 |

### 修改文件

| 文件 | 改动范围 |
|---|---|
| `frontend/src/nexus/core/state-machine/index.ts` | 扩展 GenericRepo 接口 + SM 支持 cascade |
| `frontend/src/nexus/core/state-machine/__tests__/generic-state-machine.test.ts` | 新增 create/updateStatus 测试 |
| `frontend/src/nexus/orchestrator/index.ts` | 逐域删除 if-else 分支，最终简化为纯调度 |
| `frontend/src/domains/okrs/manifest.yaml` | 新增 cascade_rules 块 |
| `frontend/src/domains/okrs/hooks.ts` | onValidate 增加 activate 校验 |
| `frontend/src/domains/habits/hooks.ts` | onEvent 增加 streak 重算 |
| `frontend/src/domains/okrs/repository/objective.ts` | 新增 create/updateStatus GenericRepo 方法 |
| `frontend/src/domains/okrs/repository/key-result.ts` | 新增 create/updateStatus GenericRepo 方法 |
| `frontend/src/domains/habits/repository/habit.ts` | 新增 create GenericRepo 方法 |
| `frontend/src/domains/tasks/repository/task.ts` | 新增 create GenericRepo 方法 |
| `frontend/src/domains/tasks/repository/thread.ts` | 新增 create GenericRepo 方法 |
| `frontend/src/app/actions/intent.ts` | 构造 OrchestratorDeps 改用 getRepo 工厂 |
| `frontend/src/app/actions/okr.ts` | 构造 OrchestratorDeps 改用 getRepo 工厂 |

---

## Phase 0: 扩展 GenericRepo + SM 能力

### Task 1: 扩展 GenericRepo 接口

**Files:**
- Modify: `frontend/src/nexus/core/state-machine/index.ts:153-168`

- [ ] **Step 1: 在 GenericRepo 接口中新增 create、updateStatus、deleteDraft 方法**

在 `frontend/src/nexus/core/state-machine/index.ts` 中，将 `GenericRepo` 接口替换为：

```typescript
/**
 * 通用仓储接口
 *
 * 提供 SM 所需的最小 CRUD 能力，每个 Domain 通过
 * GenericRepoAdapter 将具体 Repository 映射到此接口。
 */
export interface GenericRepo {
  /**
   * 根据 ID 查找对象
   * @param id - 对象 ID
   * @param userId - 用户 ID
   * @returns 对象或 null
   */
  findById(id: USOM_ID, userId: USOM_ID): Promise<Record<string, unknown> | null>

  /**
   * 保存对象（创建或全量更新）
   * @param obj - 对象数据（必须含 id 字段）
   * @param userId - 用户 ID
   */
  save(obj: Record<string, unknown>, userId: USOM_ID): Promise<void>

  /**
   * 创建新对象，内部生成 ID，返回含 ID 的完整对象
   * @param fields - 对象字段（不含 id、createdAt、updatedAt、status）
   * @param userId - 用户 ID
   * @returns 含生成 ID 和默认字段的完整对象
   */
  create(fields: Record<string, unknown>, userId: USOM_ID): Promise<Record<string, unknown>>

  /**
   * 更新对象状态
   * @param id - 对象 ID
   * @param toStatus - 目标状态
   * @param userId - 用户 ID
   * @returns 更新后的完整对象
   */
  updateStatus(id: USOM_ID, toStatus: string, userId: USOM_ID): Promise<Record<string, unknown>>

  /**
   * 删除草稿对象（可选，仅支持草稿状态删除的 Domain）
   * @param id - 对象 ID
   * @param userId - 用户 ID
   */
  deleteDraft?(id: USOM_ID, userId: USOM_ID): Promise<void>

  /**
   * 根据父对象 ID 查询子对象列表（用于 cascade）
   * @param parentId - 父对象 ID
   * @param userId - 用户 ID
   * @returns 子对象列表
   */
  findByParent?(parentId: USOM_ID, userId: USOM_ID): Promise<Record<string, unknown>[]>
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`

因为 `create`、`updateStatus` 是新方法，现有的 `makeMockRepo` 等调用点需要更新。先忽略编译错误，下一 Task 统一修复。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/nexus/core/state-machine/index.ts
git commit -m "refactor(sm): 扩展 GenericRepo 接口 — 新增 create/updateStatus/deleteDraft/findByParent"
```

---

### Task 2: 更新 SM 测试的 mock 和现有测试

**Files:**
- Modify: `frontend/src/nexus/core/state-machine/__tests__/generic-state-machine.test.ts`

- [ ] **Step 1: 扩展 makeMockRepo 支持 create/updateStatus**

将 `makeMockRepo` 函数替换为：

```typescript
function makeMockRepo(existing?: Record<string, unknown> | null): GenericRepo {
  const store = new Map<string, Record<string, unknown>>()
  if (existing) {
    store.set(existing.id as string, existing)
  }
  return {
    findById: vi.fn(async (id: string) => store.get(id) ?? null),
    save: vi.fn(async (obj: Record<string, unknown>) => { store.set(obj.id as string, obj) }),
    create: vi.fn(async (fields: Record<string, unknown>, _userId: string) => {
      const id = crypto.randomUUID()
      const obj = { id, ...fields }
      store.set(id, obj)
      return obj
    }),
    updateStatus: vi.fn(async (id: string, toStatus: string, _userId: string) => {
      const obj = store.get(id)
      if (!obj) throw new Error('对象不存在')
      const updated = { ...obj, status: toStatus }
      store.set(id, updated)
      return updated
    }),
  }
}
```

- [ ] **Step 2: 运行现有测试确认仍通过**

Run: `cd frontend && npx vitest run src/nexus/core/state-machine/__tests__/generic-state-machine.test.ts`
Expected: 所有现有测试 PASS

- [ ] **Step 3: 新增 create 路径测试**

在测试文件末尾（`create 路径 payload spread` describe 块之后）添加：

```typescript
// ─── 测试：create 方法路径 ──────────────────────────────────────
describe('Generic SM — create 方法路径', () => {
  it('create 时应通过 repo.create 创建对象', async () => {
    const repo = makeMockRepo()
    const { repo: eventRepo } = makeEventRepo()
    const { bus } = makeEventBus()

    const sm = createGenericStateMachine({
      getRepository: () => repo,
      eventRepo,
      getLifecycle: () => taskLifecycle,
    })

    const result = await sm.execute(makeProposal({
      targetObject: { type: 'task' },
      action: 'create',
      payload: { title: '测试任务', priority: 'high' },
    }), bus, userId)

    expect(result.success).toBe(true)
    expect(result.object!.id).toBeTruthy()
    expect(result.object!.title).toBe('测试任务')
    expect(result.object!.status).toBe('draft')
    expect(repo.create).toHaveBeenCalled()
  })

  it('状态转换时应通过 repo.updateStatus 更新状态', async () => {
    const existing = { id: 't-001', status: 'draft', title: '测试' }
    const repo = makeMockRepo(existing)
    const { repo: eventRepo } = makeEventRepo()
    const { bus } = makeEventBus()

    const sm = createGenericStateMachine({
      getRepository: () => repo,
      eventRepo,
      getLifecycle: () => taskLifecycle,
    })

    const result = await sm.execute(makeProposal({
      targetObject: { type: 'task', id: 't-001' as USOM_ID },
      action: 'activate',
    }), bus, userId)

    expect(result.success).toBe(true)
    expect(result.object!.status).toBe('active')
    expect(repo.updateStatus).toHaveBeenCalledWith('t-001', 'active', userId)
  })
})
```

- [ ] **Step 4: 运行测试验证**

Run: `cd frontend && npx vitest run src/nexus/core/state-machine/__tests__/generic-state-machine.test.ts`
Expected: 新增测试可能 FAIL（SM 还没改用 create/updateStatus），先记录失败原因

- [ ] **Step 5: Commit**

```bash
git add frontend/src/nexus/core/state-machine/__tests__/generic-state-machine.test.ts
git commit -m "test(sm): 新增 create/updateStatus 路径测试 + 扩展 mock"
```

---

### Task 3: SM 改用 GenericRepo 的 create/updateStatus

**Files:**
- Modify: `frontend/src/nexus/core/state-machine/index.ts:251-388`（`createGenericStateMachine` 函数体）

- [ ] **Step 1: 修改 SM 的 execute 方法，对已有对象使用 updateStatus，对新对象使用 create**

在 `createGenericStateMachine` 返回的 `execute` 方法中，替换步骤 3（构造目标对象）和步骤 4（持久化）：

找到 `// 3. 构造目标对象` 到 `// 4. 持久化` 之间的代码块，替换为：

```typescript
      // 3. 构造目标对象并持久化
      let object: Record<string, unknown>
      const repo = getRepository(objectType)

      if (existingObject) {
        // 状态转换：使用 updateStatus
        object = await repo.updateStatus(objectId!, transition.to as string, userId)

        // 自动设置 lifecycle_timestamp 字段
        const actionTimestampMap = buildActionTimestampMap(lifecycle, fieldMeta)
        const timestampKey = actionTimestampMap[proposal.action]
        if (timestampKey && lifecycleTimestampFields.includes(timestampKey)) {
          object = { ...object, [timestampKey]: now }
          await repo.save(object, userId)
        }
      } else {
        // 创建：使用 repo.create，由 Repository 负责 ID 生成和字段映射
        object = await repo.create(proposal.payload, userId)

        // 确保 status 正确（Repository 可能不知道目标 status）
        if (object.status !== transition.to) {
          object = { ...object, status: transition.to }
          await repo.save(object, userId)
        }
      }
```

同时删除旧的 `// 4. 持久化` 行（`const repo = getRepository(objectType)` 和 `await repo.save(object, userId)`），因为新代码已在 if/else 内部处理持久化。

注意：`lifecycleTimestampFields` 变量引用需要保留在步骤 3 之前（它在现有代码的步骤 3 之前已定义）。

- [ ] **Step 2: 运行测试验证**

Run: `cd frontend && npx vitest run src/nexus/core/state-machine/__tests__/generic-state-machine.test.ts`
Expected: 所有测试 PASS（包括新增的 create/updateStatus 测试）

- [ ] **Step 3: Commit**

```bash
git add frontend/src/nexus/core/state-machine/index.ts
git commit -m "refactor(sm): SM 改用 GenericRepo.create/updateStatus 替代直接 save"
```

---

### Task 4: 实现 SM Cascade 机制

**Files:**
- Create: `frontend/src/nexus/core/state-machine/cascade.ts`
- Create: `frontend/src/nexus/core/state-machine/__tests__/cascade.test.ts`

- [ ] **Step 1: 编写 cascade 测试**

创建 `frontend/src/nexus/core/state-machine/__tests__/cascade.test.ts`：

```typescript
/**
 * @file cascade.test
 * @brief SM Cascade 机制单元测试
 */
import { describe, it, expect, vi } from 'vitest'
import type { USOM_ID } from '@/usom/types/primitives'
import type { GenericRepo } from '../index'

// ─── 测试：parent_child_status cascade ──────────────────────────
describe('SM Cascade — parent_child_status', () => {
  it('父对象 activate 时，子对象 draft→active', async () => {
    const childRepo: GenericRepo = {
      findById: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({}),
      updateStatus: vi.fn(async (id, status) => ({ id, status })),
      findByParent: vi.fn().mockResolvedValue([
        { id: 'kr-001', status: 'draft', objectiveId: 'obj-001' },
        { id: 'kr-002', status: 'draft', objectiveId: 'obj-001' },
      ]),
    }

    const cascadeRule = {
      type: 'parent_child_status' as const,
      parent_object: 'objective',
      child_object: 'key_result',
      child_query: 'findByParent',
      rules: [
        { parent_action: 'activate', child_filter: "status == 'draft'", child_to_status: 'active', event_type: 'KeyResultActivated' },
      ],
    }

    const { executeCascade } = await import('../cascade')
    const results = await executeCascade({
      rule: cascadeRule,
      parentObjectType: 'objective',
      parentAction: 'activate',
      parentId: 'obj-001' as USOM_ID,
      userId: 'user-001' as USOM_ID,
      getRepo: (_domainId: string, objectType: string) =>
        objectType === 'key_result' ? childRepo : childRepo,
    })

    expect(results).toHaveLength(1)
    expect(results[0].count).toBe(2)
    expect(results[0].toStatus).toBe('active')
    expect(childRepo.updateStatus).toHaveBeenCalledTimes(2)
  })

  it('无匹配规则时返回空数组', async () => {
    const childRepo: GenericRepo = {
      findById: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({}),
      updateStatus: vi.fn().mockResolvedValue({}),
      findByParent: vi.fn().mockResolvedValue([]),
    }

    const cascadeRule = {
      type: 'parent_child_status' as const,
      parent_object: 'objective',
      child_object: 'key_result',
      child_query: 'findByParent',
      rules: [
        { parent_action: 'activate', child_filter: "status == 'draft'", child_to_status: 'active', event_type: 'KeyResultActivated' },
      ],
    }

    const { executeCascade } = await import('../cascade')
    const results = await executeCascade({
      rule: cascadeRule,
      parentObjectType: 'objective',
      parentAction: 'pause',   // 不匹配任何 rule
      parentId: 'obj-001' as USOM_ID,
      userId: 'user-001' as USOM_ID,
      getRepo: (_domainId: string, _objectType: string) => childRepo,
    })

    expect(results).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/nexus/core/state-machine/__tests__/cascade.test.ts`
Expected: FAIL — `../cascade` 模块不存在

- [ ] **Step 3: 实现 cascade.ts**

创建 `frontend/src/nexus/core/state-machine/cascade.ts`：

```typescript
/**
 * @file cascade
 * @brief SM Cascade 机制 — parent_child_status 类型处理器
 *
 * 当父对象完成状态转换后，根据 manifest cascade_rules
 * 自动触发子对象的批量状态变更。
 *
 * @see docs/superpowers/specs/2026-06-04-nexus-orchestrator-constitutional-fix-design.md §3.3
 */

import type { USOM_ID } from '@/usom/types/primitives'
import type { GenericRepo } from './index'

/**
 * parent_child_status 类型的 cascade 规则
 */
export interface ParentChildStatusRule {
  type: 'parent_child_status'
  /** 父对象类型名 */
  parent_object: string
  /** 子对象类型名 */
  child_object: string
  /** GenericRepo 上的查询方法名（findByParent） */
  child_query: string
  /** 父 action → 子对象过滤 → 子目标状态的映射规则 */
  rules: Array<{
    parent_action: string
    child_filter: string
    child_to_status: string
    event_type: string
  }>
}

/**
 * Cascade 执行结果
 */
export interface CascadeResult {
  /** 子对象类型 */
  objectType: string
  /** 受影响的子对象 ID */
  objectIds: USOM_ID[]
  /** 受影响数量 */
  count: number
  /** 子对象目标状态 */
  toStatus: string
  /** 事件类型 */
  eventType: string
}

/**
 * Cascade 执行参数
 */
export interface CascadeParams {
  rule: ParentChildStatusRule
  parentObjectType: string
  parentAction: string
  parentId: USOM_ID
  userId: USOM_ID
  getRepo: (domainId: string, objectType: string) => GenericRepo
}

/**
 * 简单的子对象过滤器
 *
 * 支持：`status == 'value'`、`status in ['a','b']`、
 * `status != 'value'`、`status not in ['a','b']`
 *
 * @param obj - 子对象
 * @param filter - 过滤表达式
 * @returns 是否匹配
 */
function matchesFilter(obj: Record<string, unknown>, filter: string): boolean {
  // status == 'value'
  const eqMatch = filter.match(/^(\w+)\s*==\s*'([^']*)'$/)
  if (eqMatch) return obj[eqMatch[1]] === eqMatch[2]

  // status != 'value'
  const neqMatch = filter.match(/^(\w+)\s*!=\s*'([^']*)'$/)
  if (neqMatch) return obj[neqMatch[1]] !== neqMatch[2]

  // status in ['a','b']
  const inMatch = filter.match(/^(\w+)\s+in\s+\[([^\]]+)\]$/)
  if (inMatch) {
    const values = inMatch[2].split(',').map(s => s.trim().replace(/'/g, ''))
    return values.includes(obj[inMatch[1]] as string)
  }

  // status not in ['a','b']
  const notInMatch = filter.match(/^(\w+)\s+not\s+in\s+\[([^\]]+)\]$/)
  if (notInMatch) {
    const values = notInMatch[2].split(',').map(s => s.trim().replace(/'/g, ''))
    return !values.includes(obj[notInMatch[1]] as string)
  }

  return false
}

/**
 * 执行 parent_child_status 类型的 cascade
 *
 * @param params - 执行参数
 * @returns cascade 结果列表（可能为空）
 */
export async function executeCascade(params: CascadeParams): Promise<CascadeResult[]> {
  const { rule, parentObjectType, parentAction, parentId, userId, getRepo } = params

  // 只处理匹配的父对象类型
  if (parentObjectType !== rule.parent_object) return []

  // 找到匹配 parent_action 的规则
  const matchedRules = rule.rules.filter(r => r.parent_action === parentAction)
  if (matchedRules.length === 0) return []

  const childRepo = getRepo('', rule.child_object)
  const results: CascadeResult[] = []

  for (const matchRule of matchedRules) {
    // 查询子对象
    const children = childRepo.findByParent
      ? await childRepo.findByParent(parentId, userId)
      : []

    // 过滤并批量更新
    const toUpdate = children.filter(child => matchesFilter(child, matchRule.child_filter))

    if (toUpdate.length === 0) continue

    const objectIds: USOM_ID[] = []
    for (const child of toUpdate) {
      await childRepo.updateStatus(child.id as USOM_ID, matchRule.child_to_status, userId)
      objectIds.push(child.id as USOM_ID)
    }

    results.push({
      objectType: rule.child_object,
      objectIds,
      count: toUpdate.length,
      toStatus: matchRule.child_to_status,
      eventType: matchRule.event_type,
    })
  }

  return results
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd frontend && npx vitest run src/nexus/core/state-machine/__tests__/cascade.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/nexus/core/state-machine/cascade.ts frontend/src/nexus/core/state-machine/__tests__/cascade.test.ts
git commit -m "feat(sm): 实现 cascade 机制 — parent_child_status 类型处理器 + 测试"
```

---

### Task 5: 将 cascade 集成到 SM execute 方法

**Files:**
- Modify: `frontend/src/nexus/core/state-machine/index.ts`

- [ ] **Step 1: 扩展 GenericStateMachineDeps 新增 cascade 相关依赖**

在 `GenericStateMachineDeps` 接口中新增字段：

```typescript
export interface GenericStateMachineDeps {
  getRepository: (objectType: string) => GenericRepo
  eventRepo: ISystemEventRepository
  getLifecycle: (domainId: string, objectType: string) => LifecycleDefinition
  getFieldMetadata?: (domainId: string, objectType: string) => Record<string, FieldMetadata>
  /** 获取 cascade 规则（可选，从 manifest cascade_rules 读取） */
  getCascadeRules?: (domainId: string) => Array<import('./cascade').ParentChildStatusRule>
  /** 域 ID（用于 cascade 规则查找） */
  domainId?: string
}
```

- [ ] **Step 2: 在 SM execute 方法末尾（事件发布之后）集成 cascade**

在 `createGenericStateMachine` 返回的 `execute` 方法中，找到 `return { success: true, object, event }` 之前，插入 cascade 逻辑：

```typescript
      // 6. Cascade 处理
      let cascadeResults: import('./cascade').CascadeResult[] = []
      if (deps.getCascadeRules && deps.domainId) {
        const cascadeRules = deps.getCascadeRules(deps.domainId)
        for (const rule of cascadeRules) {
          const { executeCascade } = await import('./cascade')
          const cascadeResult = await executeCascade({
            rule,
            parentObjectType: objectType,
            parentAction: proposal.action,
            parentId: object.id as USOM_ID,
            userId,
            getRepo: (domainId, objType) => deps.getRepository(objType),
          })
          cascadeResults.push(...cascadeResult)
        }
      }

      return { success: true, object, event, cascadeResults }
```

同时更新 `StateMachineResult` 接口新增 `cascadeResults` 可选字段：

```typescript
export interface StateMachineResult {
  success: boolean
  object?: Record<string, unknown>
  event?: SystemEvent
  error?: string
  /** Cascade 执行结果 */
  cascadeResults?: import('./cascade').CascadeResult[]
}
```

- [ ] **Step 3: 运行所有 SM 测试**

Run: `cd frontend && npx vitest run src/nexus/core/state-machine/`
Expected: 所有测试 PASS（现有测试不传 cascade deps，cascade 不会触发）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/nexus/core/state-machine/index.ts
git commit -m "feat(sm): SM 集成 cascade 机制到 execute 方法"
```

---

## Phase 1: 迁移 Tasks 域

### Task 6: 创建 Tasks GenericRepoAdapter

**Files:**
- Create: `frontend/src/domains/tasks/repository/generic-repo-adapter.ts`
- Create: `frontend/src/domains/tasks/repository/__tests__/generic-repo-adapter.test.ts`

- [ ] **Step 1: 先读取现有 Repository 接口确认方法签名**

运行以下命令查看 Task 和 Thread Repository 的接口：
```bash
cd frontend && grep -n 'export.*interface\|async.*create\|async.*updateStatus\|async.*findById\|async.*save\|async.*delete' src/domains/tasks/repository/task.ts src/domains/tasks/repository/thread.ts
```

根据输出确认 `create`、`updateStatus`、`findById` 的参数和返回类型。

- [ ] **Step 2: 编写 adapter 测试**

创建 `frontend/src/domains/tasks/repository/__tests__/generic-repo-adapter.test.ts`：

```typescript
/**
 * @file generic-repo-adapter.test
 * @brief Tasks 域 GenericRepo 适配器测试
 */
import { describe, it, expect, vi } from 'vitest'
import type { USOM_ID } from '@/usom/types/primitives'

// ─── Mock Repositories ──────────────────────────────────────────
function makeMockTaskRepo() {
  return {
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'task-001', title: '测试任务', status: 'draft' }),
    updateStatus: vi.fn().mockResolvedValue({ id: 'task-001', status: 'active', title: '测试任务' }),
    findByUserId: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
  }
}

function makeMockThreadRepo() {
  return {
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'thread-001', name: '测试主线', status: 'active' }),
    updateStatus: vi.fn().mockResolvedValue({ id: 'thread-001', status: 'completed', name: '测试主线' }),
    findByUserId: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
  }
}

describe('Tasks GenericRepoAdapter', () => {
  it('task adapter 的 create 应委托给 taskRepo.create', async () => {
    const taskRepo = makeMockTaskRepo() as any
    const threadRepo = makeMockThreadRepo() as any
    const { createTasksGenericRepo } = await import('../generic-repo-adapter')
    const repos = createTasksGenericRepo({ taskRepo, threadRepo })

    const result = await repos.task.create({ title: '写文档' }, 'user-001' as USOM_ID)

    expect(result.id).toBeTruthy()
    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: '写文档' }),
      'user-001',
    )
  })

  it('task adapter 的 updateStatus 应委托给 taskRepo.updateStatus', async () => {
    const taskRepo = makeMockTaskRepo() as any
    const threadRepo = makeMockThreadRepo() as any
    const { createTasksGenericRepo } = await import('../generic-repo-adapter')
    const repos = createTasksGenericRepo({ taskRepo, threadRepo })

    const result = await repos.task.updateStatus('task-001' as USOM_ID, 'active', 'user-001' as USOM_ID)

    expect(result.status).toBe('active')
    expect(taskRepo.updateStatus).toHaveBeenCalledWith('task-001', 'active', 'user-001')
  })

  it('thread adapter 的 create 应委托给 threadRepo.create', async () => {
    const taskRepo = makeMockTaskRepo() as any
    const threadRepo = makeMockThreadRepo() as any
    const { createTasksGenericRepo } = await import('../generic-repo-adapter')
    const repos = createTasksGenericRepo({ taskRepo, threadRepo })

    const result = await repos.thread.create({ name: '主线A' }, 'user-001' as USOM_ID)

    expect(result.id).toBeTruthy()
    expect(threadRepo.create).toHaveBeenCalled()
  })

  it('thread adapter 的 updateStatus 应委托给 threadRepo.updateStatus', async () => {
    const taskRepo = makeMockTaskRepo() as any
    const threadRepo = makeMockThreadRepo() as any
    const { createTasksGenericRepo } = await import('../generic-repo-adapter')
    const repos = createTasksGenericRepo({ taskRepo, threadRepo })

    await repos.thread.updateStatus('thread-001' as USOM_ID, 'completed', 'user-001' as USOM_ID)

    expect(threadRepo.updateStatus).toHaveBeenCalledWith('thread-001', 'completed', 'user-001')
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/domains/tasks/repository/__tests__/generic-repo-adapter.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 4: 实现 adapter**

创建 `frontend/src/domains/tasks/repository/generic-repo-adapter.ts`：

```typescript
/**
 * @file generic-repo-adapter
 * @brief Tasks 域 GenericRepo 适配器
 *
 * 将 Tasks 域的 ITaskRepository / IThreadRepository
 * 适配为通用 GenericRepo 接口，供 State Machine 使用。
 */

import type { GenericRepo } from '@/nexus/core/state-machine'
import type { USOM_ID } from '@/usom/types/primitives'

/**
 * Tasks 域 GenericRepo 适配器工厂
 *
 * @param repos - Tasks 域的具体 Repository 实例
 * @returns 按对象类型索引的 GenericRepo 映射
 */
export function createTasksGenericRepo(repos: {
  taskRepo: any
  threadRepo: any
}): Record<string, GenericRepo> {
  return {
    task: {
      async findById(id: USOM_ID, userId: USOM_ID) {
        return repos.taskRepo.findById(id, userId) as Promise<Record<string, unknown> | null>
      },
      async save(obj: Record<string, unknown>, userId: USOM_ID) {
        await repos.taskRepo.save(obj, userId)
      },
      async create(fields: Record<string, unknown>, userId: USOM_ID) {
        return repos.taskRepo.create(fields, userId) as Promise<Record<string, unknown>>
      },
      async updateStatus(id: USOM_ID, toStatus: string, userId: USOM_ID) {
        return repos.taskRepo.updateStatus(id, toStatus, userId) as Promise<Record<string, unknown>>
      },
    },
    thread: {
      async findById(id: USOM_ID, userId: USOM_ID) {
        return repos.threadRepo.findById(id, userId) as Promise<Record<string, unknown> | null>
      },
      async save(obj: Record<string, unknown>, userId: USOM_ID) {
        await repos.threadRepo.save(obj, userId)
      },
      async create(fields: Record<string, unknown>, userId: USOM_ID) {
        return repos.threadRepo.create(fields, userId) as Promise<Record<string, unknown>>
      },
      async updateStatus(id: USOM_ID, toStatus: string, userId: USOM_ID) {
        return repos.threadRepo.updateStatus(id, toStatus, userId) as Promise<Record<string, unknown>>
      },
    },
  }
}
```

- [ ] **Step 5: 运行测试验证通过**

Run: `cd frontend && npx vitest run src/domains/tasks/repository/__tests__/generic-repo-adapter.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/tasks/repository/generic-repo-adapter.ts frontend/src/domains/tasks/repository/__tests__/generic-repo-adapter.test.ts
git commit -m "feat(tasks): 创建 Tasks 域 GenericRepoAdapter + 测试"
```

---

### Task 7: 从 Orchestrator 移除 Tasks 域 if-else 分支

**Files:**
- Modify: `frontend/src/nexus/orchestrator/index.ts`

- [ ] **Step 1: 在 OrchestratorDeps 中新增 getRepo 工厂**

在 `OrchestratorDeps` 接口中新增：

```typescript
export interface OrchestratorDeps {
  // ... 保留现有字段不变（P5 统一清理）
  /** 通用仓储获取工厂（新增，用于通用 SM 路径） */
  getRepo?: (domainId: string, objectType: string) => GenericRepo
  // ...
}
```

- [ ] **Step 2: 在文件顶部新增 GenericRepo import**

在 import 区域添加：

```typescript
import type { GenericRepo } from '@/nexus/core/state-machine'
```

- [ ] **Step 3: 删除 Tasks 域的 if-else 分支**

删除 `frontend/src/nexus/orchestrator/index.ts` 中行 931-1070 的 `if (domainId === 'tasks')` 整个代码块（从 `// ─── Tasks 域` 注释到对应的闭合 `}`）。

- [ ] **Step 4: 在 if-else 分支的位置添加通用 SM 调用**

在删除 Tasks 分支后，在原位置添加通用路径处理。找到 `// 3. 路由到域特定处理` 注释处，将剩余的 timebox/habits/okrs 分支之后添加：

```typescript
      // ─── 通用 SM 路径（Tasks 域已迁移，其他域待迁移） ──────
      if (domainId === 'tasks' && deps.getRepo) {
        const smObjectType = getObjectType(intent)
        const repo = deps.getRepo(domainId, smObjectType)
        const sm = createGenericStateMachine({
          getRepository: () => repo,
          eventRepo: deps.eventRepo,
          getLifecycle: (domainId_, objType) => {
            const lc = getLifecycleFromManifest(domainId_, objType)
            if (!lc) throw new Error(`未找到 lifecycle: ${domainId_}/${objType}`)
            return lc
          },
          domainId,
        })

        const proposal: StateProposal = {
          id: crypto.randomUUID() as USOM_ID,
          intentId: intent.id,
          targetObject: { type: smObjectType, id: intent.fields[smObjectType + 'Id'] as USOM_ID | undefined },
          action,
          payload: intent.fields,
          approvedAt: new Date().toISOString() as Timestamp,
          approvedBy: 'rule_engine',
        }

        const smResult = await sm.execute(proposal, eventBus, userId)

        if (!smResult.success) {
          return { success: false, error: smResult.error }
        }

        if (domain && smResult.event) {
          domain.onEvent(smResult.event, usomSnapshot)
        }

        return {
          success: true,
          object: smResult.object,
          objectType: smObjectType,
          warnings: ruleResult.warnings,
        }
      }
```

注意：`getObjectType` 函数已存在于 `lifecycle-configs.ts`。

- [ ] **Step 5: 更新调用方传入 getRepo**

在 `frontend/src/app/actions/intent.ts` 的 `executePipeline` 函数中，找到 `createOrchestrator` 调用，在 deps 中新增 `getRepo`：

```typescript
import { createTasksGenericRepo } from '@/domains/tasks/repository/generic-repo-adapter'
// ... 在 createOrchestrator 调用处：
const taskRepos = createTasksGenericRepo({
  taskRepo: new TaskRepository(),
  threadRepo: new ThreadRepository(),
})
// ...
const orchestrator = createOrchestrator({
  // ... 现有字段
  getRepo: (domainId: string, objectType: string) => {
    if (domainId === 'tasks') return taskRepos[objectType]
    throw new Error(`未注册的域: ${domainId}`)
  },
})
```

- [ ] **Step 6: 运行编译检查**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -30`

修复任何类型错误。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/nexus/orchestrator/index.ts frontend/src/app/actions/intent.ts
git commit -m "refactor(orchestrator): Tasks 域迁移到通用 SM — 移除 if-else 分支"
```

---

## Phase 2: 迁移 Habits 域

### Task 8: 创建 Habits GenericRepoAdapter

**Files:**
- Create: `frontend/src/domains/habits/repository/generic-repo-adapter.ts`
- Create: `frontend/src/domains/habits/repository/__tests__/generic-repo-adapter.test.ts`

- [ ] **Step 1: 编写 adapter 测试**

创建 `frontend/src/domains/habits/repository/__tests__/generic-repo-adapter.test.ts`，模式同 Task 6 的 Tasks 测试。

测试点：
- `habit` adapter 的 create 委托给 `habitRepo.create`
- `habit` adapter 的 updateStatus 委托给 `habitRepo.updateStatus`
- `habit_log` adapter 的 create 委托给 `habitLogRepo.save`（HabitLog 的创建本质是 save）

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/domains/habits/repository/__tests__/generic-repo-adapter.test.ts`

- [ ] **Step 3: 实现 adapter**

创建 `frontend/src/domains/habits/repository/generic-repo-adapter.ts`：

```typescript
/**
 * @file generic-repo-adapter
 * @brief Habits 域 GenericRepo 适配器
 */

import type { GenericRepo } from '@/nexus/core/state-machine'
import type { USOM_ID } from '@/usom/types/primitives'

export function createHabitsGenericRepo(repos: {
  habitRepo: any
  habitLogRepo: any
}): Record<string, GenericRepo> {
  return {
    habit: {
      async findById(id: USOM_ID, userId: USOM_ID) {
        return repos.habitRepo.findById(id, userId) as Promise<Record<string, unknown> | null>
      },
      async save(obj: Record<string, unknown>, userId: USOM_ID) {
        await repos.habitRepo.save(obj, userId)
      },
      async create(fields: Record<string, unknown>, userId: USOM_ID) {
        return repos.habitRepo.create(fields, userId) as Promise<Record<string, unknown>>
      },
      async updateStatus(id: USOM_ID, toStatus: string, userId: USOM_ID) {
        return repos.habitRepo.updateStatus(id, toStatus, userId) as Promise<Record<string, unknown>>
      },
    },
    habit_log: {
      async findById(id: USOM_ID, userId: USOM_ID) {
        return repos.habitLogRepo.findById(id, userId) as Promise<Record<string, unknown> | null>
      },
      async save(obj: Record<string, unknown>, userId: USOM_ID) {
        await repos.habitLogRepo.save(obj, userId)
      },
      async create(fields: Record<string, unknown>, userId: USOM_ID) {
        // HabitLog 使用 save 而非 create（日志是不可变事实）
        const id = crypto.randomUUID() as USOM_ID
        const log = { id, ...fields }
        await repos.habitLogRepo.save(log, userId)
        return log as Record<string, unknown>
      },
      async updateStatus() {
        throw new Error('HabitLog 不支持状态转换')
      },
    },
  }
}
```

- [ ] **Step 4: 运行测试通过**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/habits/repository/generic-repo-adapter.ts frontend/src/domains/habits/repository/__tests__/generic-repo-adapter.test.ts
git commit -m "feat(habits): 创建 Habits 域 GenericRepoAdapter + 测试"
```

---

### Task 9: Habits onEvent hook 增加 streak 重算

**Files:**
- Modify: `frontend/src/domains/habits/hooks.ts`

- [ ] **Step 1: 修改 createHabitsHooks 工厂函数签名，接受 Repository 引用**

将 `createHabitsHooks` 函数签名改为：

```typescript
export function createHabitsHooks(
  manifest: DomainManifest,
  repos?: { habitRepo: any; habitLogRepo: any },
) {
```

- [ ] **Step 2: 在 onEvent 中处理 HabitLogged 事件，执行 streak 重算**

在 `onEvent` 函数的 switch 语句中，添加 `HabitLogged` case：

```typescript
      case 'HabitLogged': {
        // streak 重算：onEvent 允许更新自身域的聚合派生字段
        if (repos?.habitRepo) {
          const habitId = event.payload['habitId'] as USOM_ID | undefined
          if (habitId) {
            try {
              await repos.habitRepo.recalculateMetrics(habitId)
            } catch {
              // streak 重算失败不影响主流程
            }
          }
        }
        return {
          metrics: [{ metricKey: 'habit_logged', value: 1 }],
          suggestions: [],
        }
      }
```

注意：需要将 `onEvent` 的返回类型从同步改为 async：

```typescript
  async function onEvent(
    event: SystemEvent,
    _snapshot: USOMSnapshot,
  ): Promise<{ metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] }> {
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/domains/habits/hooks.ts
git commit -m "feat(habits): onEvent hook 增加 streak 重算（HabitLogged 事件触发）"
```

---

### Task 10: 从 Orchestrator 移除 Habits 域 if-else 分支

**Files:**
- Modify: `frontend/src/nexus/orchestrator/index.ts`

- [ ] **Step 1: 删除 Habits 域 if-else 分支**

删除 `if (domainId === 'habits')` 整个代码块（行 562-717）。

- [ ] **Step 2: 在通用 SM 路径中增加 habits 域支持**

将 Task 7 中添加的 `if (domainId === 'tasks' && deps.getRepo)` 条件扩展为：

```typescript
      if ((domainId === 'tasks' || domainId === 'habits') && deps.getRepo) {
```

- [ ] **Step 3: 更新调用方**

在 `frontend/src/app/actions/intent.ts` 中，更新 `getRepo` 工厂以包含 habits 域。

- [ ] **Step 4: 运行编译 + 测试**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/nexus/orchestrator/index.ts frontend/src/app/actions/intent.ts
git commit -m "refactor(orchestrator): Habits 域迁移到通用 SM — 移除 if-else 分支"
```

---

## Phase 3: 迁移 OKRs 域

### Task 11: OKR manifest 新增 cascade_rules

**Files:**
- Modify: `frontend/src/domains/okrs/manifest.yaml`

- [ ] **Step 1: 在 manifest.yaml 末尾新增 cascade_rules 块**

```yaml
cascade_rules:
  - type: parent_child_status
    parent_object: objective
    child_object: key_result
    child_query: findByParent
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

- [ ] **Step 2: Commit**

```bash
git add frontend/src/domains/okrs/manifest.yaml
git commit -m "feat(okrs): manifest 新增 cascade_rules — Objective↔KeyResult 级联声明"
```

---

### Task 12: OKRs onValidate 增加 activate 校验

**Files:**
- Modify: `frontend/src/domains/okrs/hooks.ts`

- [ ] **Step 1: 修改 createOkrsHooks 签名，接受 Repository 引用**

```typescript
export function createOkrsHooks(
  manifest: DomainManifest,
  repos?: { objectiveRepo: any; keyResultRepo: any },
) {
```

- [ ] **Step 2: 在 onValidate 的 activateObjective 分支中增加校验**

在 `if (action === 'activateObjective')` 块中，在现有校验之后添加：

```typescript
    if (action === 'activateObjective') {
      const objectiveId = fields['objectiveId']
      if (!objectiveId || typeof objectiveId !== 'string') {
        errors.push('objectiveId 必填')
      }

      // 激活前置校验：≥1 draft KR + 周期日期必填
      if (repos?.keyResultRepo && repos?.objectiveRepo) {
        const objective = await repos.objectiveRepo.findById(objectiveId, fields['userId'])
        if (objective) {
          if (!objective.period?.start || !objective.period?.end) {
            errors.push('激活失败: 必须设置周期起止日期')
          }
          const krs = await repos.keyResultRepo.findByObjective(objectiveId, fields['userId'])
          const draftKRs = krs.filter((kr: any) => kr.status === 'draft')
          if (draftKRs.length === 0) {
            errors.push('激活失败: 至少需要 1 个草稿关键结果')
          }
        }
      }
    }
```

注意：这需要将 `onValidate` 改为 async。Orchestrator 中调用 `domain.onValidate()` 的代码（行 488）也需同步改为 `await domain.onValidate()`。这是非破坏性变更——同步函数的返回值用 await 调用不会出错。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/domains/okrs/hooks.ts
git commit -m "feat(okrs): onValidate 增加 activate 前置校验（KR 数量 + 周期日期）"
```

---

### Task 13: 创建 OKRs GenericRepoAdapter

**Files:**
- Create: `frontend/src/domains/okrs/repository/generic-repo-adapter.ts`
- Create: `frontend/src/domains/okrs/repository/__tests__/generic-repo-adapter.test.ts`

- [ ] **Step 1: 编写测试并实现 adapter**

模式同 Task 6/Task 8。关键差异：
- `key_result` adapter 需要 `findByParent` 方法（用于 cascade），委托给 `keyResultRepo.findByObjective`
- `key_result` adapter 需要 `deleteDraft` 方法
- `objective` adapter 的 `create` 需要额外处理 `keyResultIds` 默认值

- [ ] **Step 2: Commit**

```bash
git add frontend/src/domains/okrs/repository/generic-repo-adapter.ts frontend/src/domains/okrs/repository/__tests__/generic-repo-adapter.test.ts
git commit -m "feat(okrs): 创建 OKRs 域 GenericRepoAdapter + 测试（含 findByParent 支持 cascade）"
```

---

### Task 14: 从 Orchestrator 移除 OKRs 域 if-else 分支

**Files:**
- Modify: `frontend/src/nexus/orchestrator/index.ts`

- [ ] **Step 1: 删除 OKRs 域 if-else 分支**

删除 `if (domainId === 'okrs')` 整个代码块（约 210 行）。

- [ ] **Step 2: 扩展通用 SM 路径条件**

```typescript
      if ((domainId === 'tasks' || domainId === 'habits' || domainId === 'okrs') && deps.getRepo) {
```

- [ ] **Step 3: 为 OKRs 域的通用 SM 路径添加 cascade 支持**

在构造 `createGenericStateMachine` 时，传入 `getCascadeRules` 和 `domainId`：

```typescript
        const manifestResult = loadDomainManifest(domainId)
        const cascadeRules = manifestResult.success
          ? (manifestResult.manifest.cascade_rules?.filter((r: any) => r.type === 'parent_child_status') ?? [])
          : []

        const sm = createGenericStateMachine({
          getRepository: () => repo,
          eventRepo: deps.eventRepo,
          getLifecycle: (domainId_, objType) => {
            const lc = getLifecycleFromManifest(domainId_, objType)
            if (!lc) throw new Error(`未找到 lifecycle: ${domainId_}/${objType}`)
            return lc
          },
          domainId,
          getCascadeRules: () => cascadeRules,
        })
```

- [ ] **Step 4: 运行编译 + 测试**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/nexus/orchestrator/index.ts
git commit -m "refactor(orchestrator): OKRs 域迁移到通用 SM + cascade — 移除 if-else 分支"
```

---

## Phase 4: 迁移 Timebox 域

### Task 15: 创建 Timebox GenericRepoAdapter + 替换旧版 SM

**Files:**
- Create: `frontend/src/domains/timebox/repository/generic-repo-adapter.ts`
- Modify: `frontend/src/nexus/orchestrator/index.ts`

- [ ] **Step 1: 创建 Timebox GenericRepoAdapter**

创建 `frontend/src/domains/timebox/repository/generic-repo-adapter.ts`：

```typescript
/**
 * @file generic-repo-adapter
 * @brief Timebox 域 GenericRepo 适配器
 */

import type { GenericRepo } from '@/nexus/core/state-machine'
import type { USOM_ID } from '@/usom/types/primitives'

export function createTimeboxGenericRepo(repos: {
  timeboxRepo: any
}): Record<string, GenericRepo> {
  return {
    timebox: {
      async findById(id: USOM_ID, userId: USOM_ID) {
        return repos.timeboxRepo.findById(id, userId) as Promise<Record<string, unknown> | null>
      },
      async save(obj: Record<string, unknown>, userId: USOM_ID) {
        await repos.timeboxRepo.save(obj, userId)
      },
      async create(fields: Record<string, unknown>, userId: USOM_ID) {
        const id = crypto.randomUUID() as USOM_ID
        const now = new Date().toISOString()
        const obj = { id, ...fields, createdAt: now, updatedAt: now }
        await repos.timeboxRepo.save(obj, userId)
        return obj as Record<string, unknown>
      },
      async updateStatus(id: USOM_ID, toStatus: string, userId: USOM_ID) {
        const existing = await repos.timeboxRepo.findById(id, userId)
        if (!existing) throw new Error('时间盒不存在')
        const now = new Date().toISOString()
        const updated = { ...existing, status: toStatus, updatedAt: now }
        await repos.timeboxRepo.save(updated, userId)
        return updated as Record<string, unknown>
      },
    },
  }
}
```

- [ ] **Step 2: 删除 Orchestrator 中的 Timebox if-else 分支和旧版 SM 引用**

删除 `if (domainId === 'timebox')` 分支（行 533-559）。

扩展通用 SM 路径条件包含 `timebox`。

同时移除 `createTimeboxStateMachine` 的调用和 `timeboxSM` 变量。

- [ ] **Step 3: 移除 Orchestrator 中的 `executeTimeboxAction` 方法**

此方法（约行 390-467）使用旧版 SM，应被通用路径替代。删除整个方法。

- [ ] **Step 4: 运行编译 + 测试**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/timebox/repository/generic-repo-adapter.ts frontend/src/nexus/orchestrator/index.ts
git commit -m "refactor(orchestrator): Timebox 域迁移到通用 SM — 移除旧版 SM 和 executeTimeboxAction"
```

---

## Phase 5: 清理

### Task 16: 简化 OrchestratorDeps + OrchestratorResult

**Files:**
- Modify: `frontend/src/nexus/orchestrator/index.ts`
- Modify: `frontend/src/app/actions/intent.ts`
- Modify: `frontend/src/app/actions/okr.ts`

- [ ] **Step 1: 简化 OrchestratorDeps — 移除所有域特定 Repository**

将 `OrchestratorDeps` 改为：

```typescript
export interface OrchestratorDeps {
  eventRepo: ISystemEventRepository
  intentEngine: IntentEngine
  ruleEngine: RuleEngine
  actionSurfaceEngine?: ActionSurfaceEngine
  /** 通用仓储获取工厂 */
  getRepo: (domainId: string, objectType: string) => GenericRepo
  onTrace?: (step: TraceStep) => void
}
```

- [ ] **Step 2: 简化 OrchestratorResult — 移除域特定字段**

将 `OrchestratorResult` 中 `timebox?` 和 `habit?` 字段替换为通用的 `object?` 和 `objectType?`。

- [ ] **Step 3: 更新所有调用方**

更新 `frontend/src/app/actions/intent.ts` 和 `frontend/src/app/actions/okr.ts` 中的 `createOrchestrator` 调用，使用新的 `getRepo` 工厂。

- [ ] **Step 4: 删除死代码**

移除：
- 不再需要的域特定 import（`Timebox`, `Habit`, `Objective`, `KeyResult` 等类型 import 可保留用于其他路径）
- `createStubSnapshot` 中不再需要的硬编码字段
- `toUSOMSnapshot` 中的域特定映射（如需要）

- [ ] **Step 5: 运行完整测试套件**

Run: `cd frontend && npx vitest run`
Expected: 所有测试 PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(orchestrator): P5 清理 — 简化 Deps/Result + 删除死代码 + 更新调用方"
```

---

### Task 17: 最终验证 + lint

**Files:** 无修改

- [ ] **Step 1: 运行 lint**

Run: `cd frontend && npm run lint`

修复所有 lint 问题。

- [ ] **Step 2: 运行类型检查**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: 运行完整测试**

Run: `cd frontend && npx vitest run`

- [ ] **Step 4: 手动验证**

启动 dev server（`npm run dev`），测试以下操作：
- 创建 Task → 激活 → 完成
- 创建 Habit → 打卡
- 创建 Objective → 添加 KR → 激活（触发 KR 级联）
- 创建 Timebox → 开始 → 结束

- [ ] **Step 5: 更新当前开发内容文档状态**

在 `mydocs/dev/当前开发内容.md` 中将 `[000] Nexus.Orchestrator 违宪修正` 的状态标记为已完成。

- [ ] **Step 6: 最终 Commit**

```bash
git add -A
git commit -m "chore: Nexus.Orchestrator 违宪修正完成 — 全域迁移到通用 SM"
```
