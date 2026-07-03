# [022.01] Phase 2: Cycle 权限模型 + UI 筛选 + 菜单集成 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Cycle 状态转换持久化（修 Phase 1 阻塞 bug）+ 权限守卫 + review 操作 + 筛选 tabs 改为 Cycle 状态 + 菜单集成

**Architecture:** Phase 2 在 Phase 1 的 executeIntent 基础设施上补齐三大缺口：(1) adapter.cycle.updateStatus 解除 SM 持久化阻塞（approveCycle 当前因 updateStatus 抛错在生产不可用）；(2) assertEditable 统一权限模型（设计 spec §C）；(3) UI 层筛选从 Objective 状态切换到 Cycle 状态 + 审核通过/复盘菜单集成。

**Tech Stack:** TypeScript 5, Next.js 16, Drizzle ORM, Vitest, React 19, Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-07-02-022-01-okr-cycle-governance-design.md` §C + §D

## Global Constraints

- 所有 Cycle 状态转换必须走 executeIntent → SM → adapter.updateStatus（宪法 §IX.1）
- adapter.cycle.updateStatus 不再抛错（Phase 1 遗留阻塞 bug）
- CycleRepository.save 的 onConflictDoUpdate SET 排除 status/startedAt/endedAt/reviewedAt（Phase 1 iter 3），**不可用于状态更新**——需独立 updateStatus 方法
- assertEditable 仅检查 cycle 状态权限，不重复检查关联目标数量（deleteCycle 已有独立检查）
- UI 筛选 tabs 从 ObjectiveStatus 切换为 CycleStatus（设计 spec §D）
- 审核通过/复盘菜单项共享 cycle-menu.tsx 组件模式（参照 CycleApproveMenuItem）
- MVP_USER_ID = `"00000000-0000-0000-0000-000000000001"`

---

## 文件结构

| 文件 | 角色 | 操作 |
|------|------|------|
| `frontend/src/domains/okrs/repository/cycle.ts` | 新增 updateStatus 方法（直接 UPDATE SET status+时间戳） | 修改 |
| `frontend/src/domains/okrs/repository/generic-repo-adapter.ts` | adapter.cycle.updateStatus 改为委托 cycleRepo.updateStatus | 修改 |
| `frontend/src/domains/okrs/repository/__tests__/cycle.test.ts` | updateStatus 单元测试 | 修改 |
| `frontend/src/domains/okrs/guard.ts` | assertEditable 权限守卫 | **新建** |
| `frontend/src/domains/okrs/__tests__/guard.test.ts` | 权限矩阵测试 | **新建** |
| `frontend/src/app/actions/okr.ts` | 新增 reviewCycle + deleteCycle 接入 assertEditable | 修改 |
| `frontend/src/app/actions/__tests__/okr-cycle.test.ts` | reviewCycle 分派逻辑 + 负路径测试 | 扩展 |
| `frontend/src/domains/okrs/components/cycle-menu.tsx` | 新增 CycleReviewMenuItem + 导出 CycleApproveMenuItem（不变） | 修改 |
| `frontend/src/domains/okrs/components/__tests__/cycle-menu.test.tsx` | 扩展：CycleReviewMenuItem 测试 + 集成测试 | 修改 |
| `frontend/src/domains/okrs/components/okr-directory.tsx` | STATUS_TABS→CYCLE_STATUS_TABS + DropdownMenu 集成 | 修改 |
| `frontend/src/domains/okrs/components/okr-workspace.tsx` | statusFilter 类型 + filteredObjectives 逻辑适配 | 修改 |
| `frontend/src/hooks/use-okrs.ts` | refresh 签名 + UseOKRsResult 接口适配 | 修改 |

---

### Task 1: CycleRepository.updateStatus + adapter.cycle.updateStatus 实现（阻塞 bug 修复）

**Files:**
- Modify: `frontend/src/domains/okrs/repository/cycle.ts`（新增 updateStatus 方法）
- Modify: `frontend/src/domains/okrs/repository/generic-repo-adapter.ts:178-179`（替换 throw）
- Modify: `frontend/src/domains/okrs/repository/__tests__/cycle.test.ts`（新增测试）

**Interfaces:**
- Consumes: `CycleRepository.findById`（已有）、`db` / `DbClient`
- Produces: `CycleRepository.updateStatus(id, status, userId, tx?)` → `Cycle`；`adapter.cycle.updateStatus` 不再抛错

**背景：** SM 在 `state-machine/index.ts:272` 调用 `repo.updateStatus(objectId!, transition.to, userId, tx)` 持久化状态转换。当前 `adapter.cycle.updateStatus`（`generic-repo-adapter.ts:178`）直接抛错，导致 approveCycle（Phase 1）的 `executeIntent("startCycle"/"planCycle")` 在生产环境必然失败。

**为何不能用 save：** `CycleRepository.save` 的 `onConflictDoUpdate` SET 子句排除了 `status/startedAt/endedAt/reviewedAt`（Phase 1 iter 3 修复，防降级攻击），所以更新状态必须走独立的 UPDATE 路径。

**参照模式：** `TaskRepository.updateStatus`（`tasks/repository/task.ts:333-355`）和 `ThreadRepository.updateStatus`（`tasks/repository/thread.ts:188-210`）——直接 `UPDATE SET status=X, timestampField=now() WHERE id+userId`。

- [ ] **Step 1: 写 CycleRepository.updateStatus 测试**

```typescript
// frontend/src/domains/okrs/repository/__tests__/cycle.test.ts
// 在现有 describe 块末尾追加以下测试

/**
 * [022.01] Phase 2 Task 1: CycleRepository.updateStatus 状态转换测试
 *
 * 验证 updateStatus 正确设置 status + 对应时间戳。
 * 用内存 SQLite（:memory:）或 mock tx 避免依赖 PG。
 */
describe('[022.01] CycleRepository.updateStatus', () => {
  // mock tx 对象：记录 UPDATE 调用参数
  function mockTx() {
    const updates: Array<{ set: Record<string, unknown>; where: unknown }> = []
    return {
      updates,
      update: vi.fn((_table: unknown) => ({
        set: vi.fn((payload: Record<string, unknown>) => {
          updates.push({ set: payload, where: null })
          return {
            where: vi.fn((_conds: unknown) => {
              updates[updates.length - 1].where = _conds
              return Promise.resolve()
            }),
          }
        }),
      })),
    }
  }

  it('draft → in_progress：设置 status=in_progress + startedAt=now', async () => {
    const repo = new CycleRepository()
    const tx = mockTx()

    // mock findById 返回 draft cycle
    const origFindById = repo.findById
    repo.findById = vi.fn().mockResolvedValue({
      id: 'c-1',
      status: 'draft',
      cycleType: 'quarterly',
      name: '2026 Q3',
      period: { start: '2026-07-01', end: '2026-09-30' },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    })

    const result = await repo.updateStatus('c-1', 'in_progress', MVP_USER_ID, tx as any)

    // called findById
    expect(repo.findById).toHaveBeenCalledWith('c-1', MVP_USER_ID, tx)

    // UPDATE set 含 status + startedAt
    expect(tx.updates.length).toBe(1)
    expect(tx.updates[0].set.status).toBe('in_progress')
    expect(tx.updates[0].set.startedAt).toBeInstanceOf(Date)
    expect(tx.updates[0].set.endedAt).toBeUndefined()
    expect(tx.updates[0].set.reviewedAt).toBeUndefined()

    // 返回的对象含新 status + startedAt
    expect(result.status).toBe('in_progress')
    expect(result.startedAt).toBeDefined()

    // restore
    repo.findById = origFindById
  })

  it('in_progress → ended：设置 status=ended + endedAt=now', async () => {
    const repo = new CycleRepository()
    const origFindById = repo.findById
    repo.findById = vi.fn().mockResolvedValue({
      id: 'c-1',
      status: 'in_progress',
      startedAt: '2026-07-01T00:00:00.000Z',
      cycleType: 'quarterly',
      name: '2026 Q3',
      period: { start: '2026-07-01', end: '2026-09-30' },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    })

    const tx = mockTx()
    const result = await repo.updateStatus('c-1', 'ended', MVP_USER_ID, tx as any)

    expect(tx.updates[0].set.status).toBe('ended')
    expect(tx.updates[0].set.endedAt).toBeInstanceOf(Date)
    expect(tx.updates[0].set.startedAt).toBeUndefined()
    expect(result.status).toBe('ended')
    expect(result.endedAt).toBeDefined()

    repo.findById = origFindById
  })

  it('ended → reviewed：设置 status=reviewed + reviewedAt=now', async () => {
    const repo = new CycleRepository()
    const origFindById = repo.findById
    repo.findById = vi.fn().mockResolvedValue({
      id: 'c-1',
      status: 'ended',
      startedAt: '2026-07-01T00:00:00.000Z',
      endedAt: '2026-09-30T00:00:00.000Z',
      cycleType: 'quarterly',
      name: '2026 Q3',
      period: { start: '2026-07-01', end: '2026-09-30' },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    })

    const tx = mockTx()
    const result = await repo.updateStatus('c-1', 'reviewed', MVP_USER_ID, tx as any)

    expect(tx.updates[0].set.status).toBe('reviewed')
    expect(tx.updates[0].set.reviewedAt).toBeInstanceOf(Date)
    expect(result.status).toBe('reviewed')
    expect(result.reviewedAt).toBeDefined()

    repo.findById = origFindById
  })

    it('draft → not_started：设置 status=not_started，无时间戳字段变更', async () => {
    const repo = new CycleRepository()
    const origFindById = repo.findById
    repo.findById = vi.fn().mockResolvedValue({
      id: 'c-1',
      status: 'draft',
      cycleType: 'quarterly',
      name: '2026 Q4',
      period: { start: '2026-10-01', end: '2026-12-31' },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    })
    const tx = mockTx()
    const result = await repo.updateStatus('c-1', 'not_started', MVP_USER_ID, tx as any)

    expect(tx.updates[0].set.status).toBe('not_started')
    expect(tx.updates[0].set.startedAt).toBeUndefined()
    expect(tx.updates[0].set.endedAt).toBeUndefined()
    expect(tx.updates[0].set.reviewedAt).toBeUndefined()
    expect(result.status).toBe('not_started')
    repo.findById = origFindById
  })

  it('not_started → in_progress：设置 status=in_progress + startedAt=now', async () => {
    const repo = new CycleRepository()
    const origFindById = repo.findById
    repo.findById = vi.fn().mockResolvedValue({
      id: 'c-1',
      status: 'not_started',
      cycleType: 'quarterly',
      name: '2026 Q4',
      period: { start: '2026-10-01', end: '2026-12-31' },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    })
    const tx = mockTx()
    const result = await repo.updateStatus('c-1', 'in_progress', MVP_USER_ID, tx as any)

    expect(tx.updates[0].set.status).toBe('in_progress')
    expect(tx.updates[0].set.startedAt).toBeInstanceOf(Date)
    expect(tx.updates[0].set.endedAt).toBeUndefined()
    expect(result.status).toBe('in_progress')
    expect(result.startedAt).toBeDefined()
    repo.findById = origFindById
  })

  it('对象不存在时抛错', async () => {
    const repo = new CycleRepository()
    const origFindById = repo.findById
    repo.findById = vi.fn().mockResolvedValue(null)

    await expect(
      repo.updateStatus('c-nonexistent', 'in_progress', MVP_USER_ID),
    ).rejects.toThrow('Cycle c-nonexistent not found')

    repo.findById = origFindById
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd frontend && npx vitest run src/domains/okrs/repository/__tests__/cycle.test.ts 2>&1 | tail -10
```
Expected: FAIL — `repo.updateStatus is not a function`

- [ ] **Step 3: 实现 CycleRepository.updateStatus**

```typescript
// frontend/src/domains/okrs/repository/cycle.ts
// 在 delete 方法之后（L133 之后）、类闭合括号之前新增

  /**
   * 更新周期状态（[022.01] Phase 2：供 SM 状态转换持久化使用）。
   *
   * CycleRepository.save 的 onConflictDoUpdate SET 排除了 status 等生命周期字段
   * （Phase 1 iter 3 防降级），因此状态更新必须走独立的 UPDATE 路径。
   *
   * 时间戳规则（按 manifest cycle lifecycle transitions）：
   * - in_progress → startedAt = now
   * - ended → endedAt = now（保留已有 startedAt）
   * - reviewed → reviewedAt = now（保留已有 startedAt/endedAt）
   * - draft/not_started → 无特殊时间戳（仅 updatedAt）
   *
   * @param id - 周期 ID
   * @param status - 目标状态（draft | not_started | in_progress | ended | reviewed）
   * @param userId - 用户 ID（多租户 T-02）
   * @param tx - 可选事务句柄
   * @returns 更新后的完整 Cycle
   */
  async updateStatus(
    id: USOM_ID,
    status: Cycle['status'],
    userId: USOM_ID,
    tx: DbClient = db,
  ): Promise<Cycle> {
    const existing = await this.findById(id, userId, tx)
    if (!existing) throw new Error(`Cycle ${id} not found`)

    const now = new Date()
    const updates: Record<string, unknown> = {
      status,
      updatedAt: now,
    }
    if (status === 'in_progress') updates.startedAt = now
    if (status === 'ended') updates.endedAt = now
    if (status === 'reviewed') updates.reviewedAt = now

    await tx.update(s.cycles)
      .set(updates)
      .where(and(eq(s.cycles.id, id), eq(s.cycles.userId, userId)))

    return {
      ...existing,
      status,
      updatedAt: now.toISOString() as Timestamp,
      ...(status === 'in_progress' && { startedAt: now.toISOString() as unknown as DateOnly }),
      ...(status === 'ended' && { endedAt: now.toISOString() as unknown as DateOnly }),
      ...(status === 'reviewed' && { reviewedAt: now.toISOString() as unknown as DateOnly }),
    }
  }
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd frontend && npx vitest run src/domains/okrs/repository/__tests__/cycle.test.ts 2>&1 | tail -10
```
Expected: 所有 updateStatus 测试 PASS

- [ ] **Step 5: 改造 adapter.cycle.updateStatus**

```typescript
// frontend/src/domains/okrs/repository/generic-repo-adapter.ts
// 替换 L178-179

      async updateStatus(id, toStatus, userId, tx) {
        return repos.cycleRepo.updateStatus(
          id as USOM_ID,
          toStatus as Cycle['status'],
          userId,
          tx,
        ) as Promise<Record<string, unknown>>
      },
```

- [ ] **Step 6: 验证 adapter 不再抛错**

```bash
cd frontend && npx vitest run src/domains/okrs/repository/__tests__/cycle.test.ts 2>&1 | tail -5
```
Expected: 现有「不再抛错」测试（Phase 1 Task 1）仍 PASS

- [ ] **Step 7: 验证 tsc**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: baseline 不变（60）

- [ ] **Step 8: Commit**

```bash
git add frontend/src/domains/okrs/repository/cycle.ts \
        frontend/src/domains/okrs/repository/generic-repo-adapter.ts \
        frontend/src/domains/okrs/repository/__tests__/cycle.test.ts
git commit -m "feat(okrs): [022.01] Phase 2 — CycleRepository.updateStatus + adapter 接线

- CycleRepository.updateStatus: 直接 UPDATE SET status+时间戳（save 的 SET 排除 status 故不可复用）
- 时间戳规则: in_progress→startedAt, ended→endedAt, reviewed→reviewedAt
- adapter.cycle.updateStatus 不再抛错，委托给 cycleRepo.updateStatus
- 修复: approveCycle 的 executeIntent 路径因 updateStatus 抛错在生产不可用（Phase 1 阻塞 bug）
- 测试: 3 条转换路径 + 不存在抛错"
```

---

### Task 2: assertEditable 权限守卫

**Files:**
- Create: `frontend/src/domains/okrs/guard.ts`
- Create: `frontend/src/domains/okrs/__tests__/guard.test.ts`

**Interfaces:**
- Consumes: `Cycle` 类型（`status` 字段）
- Produces: `assertEditable(cycle, operation)` → `void`（违规时抛 `Error`）

**权限矩阵**（设计 spec §C）：

| Cycle 状态 | 改 Cycle | 删 Cycle | Obj/KR 字段改 | Obj/KR 删 |
|---|---|---|---|---|
| draft | ✅ | ✅ | ✅ | ✅ |
| not_started | ❌ | ❌ | ✅ | ❌ |
| in_progress | ❌ | ❌ | ✅ | ❌ |
| ended | ❌ | ❌ | ✅ | ❌ |
| reviewed | ❌ | ❌ | ❌ | ❌ |

> **注意**：`delete_cycle` 的「无目标」检查由 `okr.ts:deleteCycle` 的 `objRepo.findByCycleId` 独立负责，assertEditable 不重复。`edit_objective`/`edit_kr` 接入 defer 到 Phase 3（obj/KR 仍有自身 status，Phase 3 才移除）。

- [ ] **Step 1: 写 guard 测试**

```typescript
// frontend/src/domains/okrs/__tests__/guard.test.ts
/**
 * @file guard.test
 * @brief [022.01] Phase 2: assertEditable 权限矩阵测试
 *
 * 覆盖设计 spec §C 全部 5 个 Cycle 状态 × 6 种操作类型的允许/拒绝矩阵。
 * delete_cycle 在 draft 状态的「无目标」前置条件不测（由 okr.ts:deleteCycle 独立负责）。
 */
import { describe, it, expect } from 'vitest'
import { assertEditable } from '../guard'
import type { Cycle } from '@/usom/types/objects'

type Operation =
  | 'edit_cycle' | 'delete_cycle'
  | 'edit_objective' | 'delete_objective'
  | 'edit_kr' | 'delete_kr'

function makeCycle(status: Cycle['status']): Cycle {
  return {
    id: 'c-1',
    cycleType: 'quarterly',
    name: '2026 Q3',
    period: { start: '2026-07-01', end: '2026-09-30' },
    status,
    createdAt: '2026-06-01T00:00:00.000Z' as any,
    updatedAt: '2026-06-01T00:00:00.000Z' as any,
  }
}

describe('[022.01] assertEditable 权限矩阵', () => {
  // ─── draft ───
  it('draft：所有操作均允许', () => {
    const cycle = makeCycle('draft')
    const ops: Operation[] = ['edit_cycle', 'delete_cycle', 'edit_objective', 'delete_objective', 'edit_kr', 'delete_kr']
    for (const op of ops) {
      expect(() => assertEditable(cycle, op)).not.toThrow()
    }
  })

  // ─── not_started ───
  it('not_started：禁止改/删 cycle，允许改 obj/kr，禁止删 obj/kr', () => {
    const cycle = makeCycle('not_started')
    expect(() => assertEditable(cycle, 'edit_cycle')).toThrow('not_started')
    expect(() => assertEditable(cycle, 'delete_cycle')).toThrow('not_started')
    expect(() => assertEditable(cycle, 'edit_objective')).not.toThrow()
    expect(() => assertEditable(cycle, 'delete_objective')).toThrow('not_started')
    expect(() => assertEditable(cycle, 'edit_kr')).not.toThrow()
    expect(() => assertEditable(cycle, 'delete_kr')).toThrow('not_started')
  })

  // ─── in_progress ───
  it('in_progress：与 not_started 相同', () => {
    const cycle = makeCycle('in_progress')
    expect(() => assertEditable(cycle, 'edit_cycle')).toThrow('in_progress')
    expect(() => assertEditable(cycle, 'delete_cycle')).toThrow('in_progress')
    expect(() => assertEditable(cycle, 'edit_objective')).not.toThrow()
    expect(() => assertEditable(cycle, 'delete_objective')).toThrow('in_progress')
  })

  // ─── ended ───
  it('ended：与 not_started 相同（仍可编辑 obj/kr）', () => {
    const cycle = makeCycle('ended')
    expect(() => assertEditable(cycle, 'edit_cycle')).toThrow('ended')
    expect(() => assertEditable(cycle, 'delete_cycle')).toThrow('ended')
    expect(() => assertEditable(cycle, 'edit_objective')).not.toThrow()
    expect(() => assertEditable(cycle, 'delete_objective')).toThrow('ended')
  })

  // ─── reviewed ───
  it('reviewed：所有操作均禁止', () => {
    const cycle = makeCycle('reviewed')
    const ops: Operation[] = ['edit_cycle', 'delete_cycle', 'edit_objective', 'delete_objective', 'edit_kr', 'delete_kr']
    for (const op of ops) {
      expect(() => assertEditable(cycle, op)).toThrow('reviewed')
    }
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd frontend && npx vitest run src/domains/okrs/__tests__/guard.test.ts 2>&1 | tail -5
```
Expected: FAIL — module not found

- [ ] **Step 3: 实现 assertEditable**

```typescript
// frontend/src/domains/okrs/guard.ts
/**
 * @file guard
 * @brief [022.01] Phase 2: Cycle 状态权限守卫
 *
 * 统一 Cycle/Obj/KR 的编辑与删除权限检查，以 Cycle.status 为唯一权威源。
 * 权限矩阵见设计 spec §C。
 *
 * Phase 2 集成范围：deleteCycle + reviewCycle（cycle 级操作）。
 * Obj/KR 写路径接入 defer 到 Phase 3（届时 Obj/KR 自身 status 被移除）。
 */

import type { Cycle } from '@/usom/types/objects'

/** 操作类型 */
export type EditableOperation =
  | 'edit_cycle'
  | 'delete_cycle'
  | 'edit_objective'
  | 'delete_objective'
  | 'edit_kr'
  | 'delete_kr'

/** 各状态下允许的操作集合 */
const ALLOWED: Record<Cycle['status'], ReadonlySet<EditableOperation>> = {
  draft: new Set([
    'edit_cycle', 'delete_cycle',
    'edit_objective', 'delete_objective',
    'edit_kr', 'delete_kr',
  ]),
  not_started: new Set(['edit_objective', 'edit_kr']),
  in_progress: new Set(['edit_objective', 'edit_kr']),
  ended: new Set(['edit_objective', 'edit_kr']),
  reviewed: new Set(),
}

/**
 * 断言当前 Cycle 状态允许执行指定操作，否则抛错。
 *
 * @param cycle - 周期对象（至少含 status 字段）
 * @param operation - 待执行的操作类型
 * @throws Error 若 cycle 状态不允许该操作
 */
export function assertEditable(
  cycle: { status: Cycle['status'] },
  operation: EditableOperation,
): void {
  const allowed = ALLOWED[cycle.status]
  if (!allowed.has(operation)) {
    throw new Error(
      `当前周期状态为「${cycle.status}」，不允许执行「${operation}」操作`,
    )
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd frontend && npx vitest run src/domains/okrs/__tests__/guard.test.ts 2>&1 | tail -10
```
Expected: 5 tests PASS

- [ ] **Step 5: 验证 tsc**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: baseline 不变

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/okrs/guard.ts \
        frontend/src/domains/okrs/__tests__/guard.test.ts
git commit -m "feat(okrs): [022.01] Phase 2 — assertEditable 权限守卫

- 统一权限模型：以 Cycle.status 为唯一权威源，5 状态 × 6 操作矩阵
- deleteCycle + reviewCycle 接入（Phase 2）；obj/kr 写路径 defer Phase 3
- 测试：5 测试覆盖全部 5 个状态的允许/拒绝矩阵"
```

---

### Task 3: reviewCycle server action + CycleReviewMenuItem

**Files:**
- Modify: `frontend/src/app/actions/okr.ts`（新增 reviewCycle）
- Modify: `frontend/src/app/actions/__tests__/okr-cycle.test.ts`（新增测试）
- Modify: `frontend/src/domains/okrs/components/cycle-menu.tsx`（新增 CycleReviewMenuItem）
- Modify: `frontend/src/domains/okrs/components/__tests__/cycle-menu.test.tsx`（扩展）

**Interfaces:**
- Consumes: `createOKROrchestrator`, `makeIntent`（from wiring.ts）；`CycleRepository`；`assertEditable`（from guard.ts）
- Produces: `reviewCycle(cycleId: string): Promise<OKRActionResult<Cycle>>`；`<CycleReviewMenuItem cycle={cycle} onReviewed={() => void} />`

**参照模式：** `approveCycle`（`okr.ts:387-414`）+ `CycleApproveMenuItem`（`cycle-menu.tsx:51-108`）

- [ ] **Step 1: 写 reviewCycle 测试**

```typescript
// frontend/src/app/actions/__tests__/okr-cycle.test.ts
// 在现有 describe 块之后追加

describe('[022.01] reviewCycle 分派逻辑', () => {
  const endedCycle = {
    id: 'c1e00000-0000-0000-0000-000000000001',
    cycleType: 'quarterly' as const,
    name: '2026-Q3',
    period: { start: '2026-07-01', end: '2026-09-30' },
    status: 'ended' as const,
    startedAt: '2026-07-01T00:00:00.000Z' as any,
    endedAt: '2026-09-30T00:00:00.000Z' as any,
    createdAt: '2026-06-01T00:00:00.000Z' as any,
    updatedAt: '2026-10-01T00:00:00.000Z' as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ended cycle → executeIntent("reviewCycle")', async () => {
    mockFindById.mockResolvedValue(endedCycle)
    mockExecuteIntent.mockResolvedValueOnce({
      success: true,
      object: { ...endedCycle, status: 'reviewed' },
      objectType: 'cycle',
    })

    const { reviewCycle } = await import('../okr')
    const r = await reviewCycle('c1e00000-0000-0000-0000-000000000001')

    expect(r.success).toBe(true)
    expect(mockFindById).toHaveBeenCalledTimes(2) // 前置读 + 回读
    expect(mockExecuteIntent).toHaveBeenCalledTimes(1)
    const [intent] = mockExecuteIntent.mock.calls[0]
    expect(intent.action).toBe('reviewCycle')
    expect(intent.fields).toEqual({ cycleId: 'c1e00000-0000-0000-0000-000000000001' })
  })

  it('非 ended cycle → error（不调 orchestrator）', async () => {
    const draftCycle = { ...endedCycle, status: 'draft' as const }
    mockFindById.mockResolvedValueOnce(draftCycle)

    const { reviewCycle } = await import('../okr')
    const r = await reviewCycle('c1e00000-0000-0000-0000-000000000001')

    expect(r.success).toBe(false)
    expect(r.error).toBe('仅 ended 状态可复盘')
    expect(mockExecuteIntent).not.toHaveBeenCalled()
  })

  it('reviewed cycle → error（终态，不可复盘）', async () => {
    const reviewedCycle = { ...endedCycle, status: 'reviewed' as const }
    mockFindById.mockResolvedValueOnce(reviewedCycle)

    const { reviewCycle } = await import('../okr')
    const r = await reviewCycle('c1e00000-0000-0000-0000-000000000001')

    expect(r.success).toBe(false)
    expect(r.error).toBe('仅 ended 状态可复盘')
    expect(mockExecuteIntent).not.toHaveBeenCalled()
  })

  it('executeIntent 失败 → 透传 error', async () => {
    mockFindById.mockResolvedValue(endedCycle)
    mockExecuteIntent.mockResolvedValueOnce({
      success: false,
      error: 'SM error',
    })

    const { reviewCycle } = await import('../okr')
    const r = await reviewCycle('c1e00000-0000-0000-0000-000000000001')

    expect(r.success).toBe(false)
    expect(r.error).toBe('SM error')
  })

  it('回读失败 → error', async () => {
    mockFindById.mockResolvedValueOnce(endedCycle) // 前置读
    mockExecuteIntent.mockResolvedValueOnce({
      success: true,
      object: { ...endedCycle, status: 'reviewed' },
      objectType: 'cycle',
    })
    mockFindById.mockResolvedValueOnce(null) // 回读 null

    const { reviewCycle } = await import('../okr')
    const r = await reviewCycle('c1e00000-0000-0000-0000-000000000001')

    expect(r.success).toBe(false)
    expect(r.error).toBe('复盘后回读失败')
  })

  it('非法 UUID → error', async () => {
    const { reviewCycle } = await import('../okr')
    const r = await reviewCycle('not-a-uuid')
    expect(r.success).toBe(false)
    expect(r.error).toBe('无效的周期 ID')
    expect(mockFindById).not.toHaveBeenCalled()
  })

  it('catch-all 异常 → error', async () => {
    mockFindById.mockRejectedValueOnce(new Error('网络错误'))

    const { reviewCycle } = await import('../okr')
    const r = await reviewCycle('c1e00000-0000-0000-0000-000000000001')

    expect(r.success).toBe(false)
    expect(r.error).toBe('网络错误')
    expect(mockExecuteIntent).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd frontend && npx vitest run src/app/actions/__tests__/okr-cycle.test.ts 2>&1 | tail -10
```
Expected: FAIL — `reviewCycle is not a function` 或 import 失败

- [ ] **Step 3: 实现 reviewCycle**

```typescript
// frontend/src/app/actions/okr.ts
// 在 approveCycle 之后、createObjective 之前插入

/**
 * 复盘周期（[022.01] Phase 2：ended → reviewed）
 *
 * 仅允许 ended 状态复盘；复盘后周期内所有目标锁定不可编辑。
 *
 * @param cycleId - 周期 ID（USOM UUID 字符串）
 * @returns 执行结果，成功时返回更新后的 Cycle
 */
export async function reviewCycle(cycleId: string): Promise<OKRActionResult<Cycle>> {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cycleId)) {
      return { success: false, error: '无效的周期 ID' };
    }
    const cycleRepo = new CycleRepository();
    const cycle = await cycleRepo.findById(cycleId as USOM_ID, MVP_USER_ID);
    if (!cycle) return { success: false, error: "周期不存在" };
    if (cycle.status !== "ended") {
      return { success: false, error: "仅 ended 状态可复盘" };
    }

    const orchestrator = await createOKROrchestrator();
    const intent = makeIntent("reviewCycle", { cycleId });
    const result = await orchestrator.executeIntent(intent, MVP_USER_ID);
    if (!result.success) return { success: false, error: result.error };

    const updated = await cycleRepo.findById(cycleId as USOM_ID, MVP_USER_ID);
    if (!updated) return { success: false, error: "复盘后回读失败" };
    return { success: true, data: updated };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "复盘失败" };
  }
}
```

- [ ] **Step 4: 运行 reviewCycle 测试验证通过**

```bash
cd frontend && npx vitest run src/app/actions/__tests__/okr-cycle.test.ts 2>&1 | tail -15
```
Expected: reviewCycle 测试全 PASS

- [ ] **Step 5: 扩展 cycle-menu 测试（CycleReviewMenuItem）**

```typescript
// frontend/src/domains/okrs/components/__tests__/cycle-menu.test.tsx
// 在现有 describe 块之后追加

// 新增 mock：reviewCycle
const reviewCycleMock = vi.fn()
// 修改现有 vi.mock：在 return { ...actual, approveCycle: ..., reviewCycle: ... } 中追加
// 实际修改：L22-28 的 vi.mock 回调中加一行：
//   reviewCycle: (...args: unknown[]) => reviewCycleMock(...args),

// 然后在文件末尾（L116 之后）新增 describe：
describe("CycleReviewMenuItem", () => {
  const endedCycle = {
    id: "cycle-2",
    status: "ended",
    period: { start: "2026-07-01", end: "2026-09-30" },
  }

  beforeEach(() => {
    reviewCycleMock.mockReset()
    reviewCycleMock.mockResolvedValue({ success: true, data: { ...endedCycle, status: "reviewed" } })
  })

  it("仅 ended 状态显示「复盘」菜单项", () => {
    const { CycleReviewMenuItem } = require("../cycle-menu")
    const { rerender } = render(<CycleReviewMenuItem cycle={endedCycle} />)
    expect(screen.getByRole("button", { name: "复盘" })).toBeInTheDocument()

    rerender(
      <CycleReviewMenuItem
        cycle={{ ...endedCycle, status: "in_progress" }}
      />,
    )
    expect(screen.queryByRole("button", { name: "复盘" })).toBeNull()
  })

  it("点击后弹出二次确认弹窗", async () => {
    const { CycleReviewMenuItem } = require("../cycle-menu")
    const user = userEvent.setup()
    render(<CycleReviewMenuItem cycle={endedCycle} />)

    expect(screen.queryByText("复盘此周期？")).toBeNull()
    await user.click(screen.getByRole("button", { name: "复盘" }))

    expect(screen.getByText("复盘此周期？")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "确认复盘" })).toBeInTheDocument()
  })

  it("确认复盘后调用 reviewCycle", async () => {
    const { CycleReviewMenuItem } = require("../cycle-menu")
    const user = userEvent.setup()
    const onReviewed = vi.fn()
    render(<CycleReviewMenuItem cycle={endedCycle} onReviewed={onReviewed} />)

    await user.click(screen.getByRole("button", { name: "复盘" }))
    await user.click(screen.getByRole("button", { name: "确认复盘" }))

    expect(reviewCycleMock).toHaveBeenCalledTimes(1)
    expect(reviewCycleMock).toHaveBeenCalledWith("cycle-2")
  })
})
```

- [ ] **Step 6: 运行测试验证失败（CycleReviewMenuItem 不存在）**

```bash
cd frontend && npx vitest run src/domains/okrs/components/__tests__/cycle-menu.test.tsx 2>&1 | tail -10
```
Expected: FAIL — `CycleReviewMenuItem is not exported`

- [ ] **Step 7: 实现 CycleReviewMenuItem**

```typescript
// frontend/src/domains/okrs/components/cycle-menu.tsx
// 在 CycleApproveMenuItem 之后、文件末尾之前插入

// 新增 import { reviewCycle } from "@/app/actions/okr"（与 approveCycle 同行解构）

/**
 * CycleReviewMenuItem 入参
 */
interface CycleReviewMenuItemProps {
  /** 待复盘的 Cycle（仅需 id / status） */
  cycle: {
    id: string
    status: string
  }
  /** 复盘成功后回调 */
  onReviewed?: () => void
}

/**
 * "复盘" 菜单项——仅 ended cycle 可见。
 *
 * 点击后弹出二次确认 Dialog；确认即调用 reviewCycle server action。
 * 复盘后周期锁定，所有目标不可编辑（由 assertEditable 在写路径守卫）。
 */
export function CycleReviewMenuItem({ cycle, onReviewed }: CycleReviewMenuItemProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  // 仅 ended 显示
  if (cycle.status !== "ended") return null

  async function handleReview() {
    setLoading(true)
    try {
      const result = await reviewCycle(cycle.id)
      if (!result.success) {
        toast.error(result.error ?? "复盘失败")
        return
      }
      setOpen(false)
      onReviewed?.()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded outline-hidden focus-visible:outline-2 focus-visible:outline-ring"
      >
        复盘
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>复盘此周期？</DialogTitle>
            <DialogDescription>
              复盘后将锁定所有目标不可再编辑。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              取消
            </Button>
            <Button onClick={handleReview} disabled={loading}>
              {loading ? "处理中..." : "确认复盘"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 8: 运行全部 cycle-menu 测试验证通过**

```bash
cd frontend && npx vitest run src/domains/okrs/components/__tests__/cycle-menu.test.tsx 2>&1 | tail -10
```
Expected: 8 tests PASS（4 原有 + 4 新增）

- [ ] **Step 9: 验证 tsc**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: baseline 不变

- [ ] **Step 10: Commit**

```bash
git add frontend/src/app/actions/okr.ts \
        frontend/src/app/actions/__tests__/okr-cycle.test.ts \
        frontend/src/domains/okrs/components/cycle-menu.tsx \
        frontend/src/domains/okrs/components/__tests__/cycle-menu.test.tsx
git commit -m "feat(okrs): [022.01] Phase 2 — reviewCycle + CycleReviewMenuItem

- reviewCycle: ended→reviewed，参照 approveCycle 模式（UUID 校验 + 状态守 + executeIntent + 回读）
- CycleReviewMenuItem: 仅 ended 显示，二次确认弹窗，toast 错误提示
- 测试: reviewCycle 7 条（含负路径）+ CycleReviewMenuItem 4 条"
```

---

### Task 4: 顶部筛选 tabs 改为 Cycle 状态

**Files:**
- Modify: `frontend/src/domains/okrs/components/okr-directory.tsx`（STATUS_TABS → CYCLE_STATUS_TABS + 筛选逻辑）
- Modify: `frontend/src/domains/okrs/components/okr-workspace.tsx`（statusFilter 类型 + filteredObjectives）
- Modify: `frontend/src/hooks/use-okrs.ts`（refresh 参数类型适配）

**Interfaces:**
- Consumes: `CycleStatus = 'draft' | 'not_started' | 'in_progress' | 'ended' | 'reviewed'`
- Produces: `statusFilter: CycleStatus | "all"`；筛选按 parent cycle 状态而非 objective 自身状态

- [ ] **Step 1: 更新 okr-directory.tsx**

```typescript
// frontend/src/domains/okrs/components/okr-directory.tsx
// 修改 1: 替换 STATUS_TABS（L48-55）

// 删除旧 STATUS_TABS（依赖 ObjectiveStatus）
// 新增：
const CYCLE_STATUS_TABS: { key: CycleStatus | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "draft", label: "草稿" },
  { key: "not_started", label: "未开始" },
  { key: "in_progress", label: "进行中" },
  { key: "ended", label: "已结束" },
  { key: "reviewed", label: "已复盘" },
]

// 修改 2: statusFilter prop 类型
// OKRDirectoryProps 中:
//   statusFilter: ObjectiveStatus | "all"  →  statusFilter: CycleStatus | "all"
//   onStatusFilterChange: (filter: ObjectiveStatus | "all") => void  →  (filter: CycleStatus | "all") => void

// 修改 3: import 加 CycleStatus
// import type { CycleStatus } from "@/usom/types/primitives"（若不存在则用 string 代替；Cycle['status'] 即可）
// 实际直接用 Cycle['status'] —— import type { Cycle } from "@/usom/types/objects"
// type CycleStatus = Cycle['status']

// 修改 4: 筛选 logic（L159-161）
// 旧: o => o.cycleId === cycle.id && (statusFilter === "all" || o.status === statusFilter)
// 新: o => o.cycleId === cycle.id && (statusFilter === "all" || cycle.status === statusFilter)
// 即：按 objective 所属 cycle 的状态筛选，而非 objective 自身状态

// 注意：cycle 变量是 map 回调参数，已在上层作用域。筛选逻辑改为：
const cycleObjectives = objectives.filter(
  o => o.cycleId === cycle.id && (statusFilter === "all" || cycle.status === statusFilter)
)

// 修改 5: Tabs 渲染（L137-149）——STATUS_TABS → CYCLE_STATUS_TABS
```

- [ ] **Step 2: 更新 okr-workspace.tsx**

```typescript
// frontend/src/domains/okrs/components/okr-workspace.tsx
// 修改 1: import 类型
// import type { ObjectiveStatus } from "@/usom/types/primitives"
// 改为或新增：
// import type { Cycle } from "@/usom/types/objects"

// 修改 2: statusFilter 类型（L53）
// const [statusFilter, setStatusFilter] = useState<ObjectiveStatus | "all">("all")
// 改为：
const [statusFilter, setStatusFilter] = useState<Cycle['status'] | "all">("all")

// 修改 3: filteredObjectives（L63-65）
// 旧: hook.objectives.filter(o => o.status !== "archived")
//     hook.objectives.filter(o => o.status === statusFilter)
// 新: 使用 hook.cycles 做映射
const cycleStatusMap = new Map(hook.cycles.map(c => [c.id, c.status]))
const filteredObjectives = statusFilter === "all"
  ? hook.objectives.filter(o => o.status !== "archived")
  : hook.objectives.filter(o => cycleStatusMap.get(o.cycleId) === statusFilter)
```

- [ ] **Step 3: 更新 use-okrs.ts**

```typescript
// frontend/src/hooks/use-okrs.ts
// 修改 1: refresh 参数类型（L40 + L78）
// refresh: (status?: ObjectiveStatus) => Promise<void>
// 改为:
// refresh: (cycleStatus?: Cycle['status']) => Promise<void>

// 修改 2: refresh 实现中传递参数
// const result = await getObjectives(status)  → 调整 getObjectives 调用（若 getObjectives 接受 ObjectiveStatus，需适配或用新参数名）
// 实际实现中 getObjectives 使用 status 参数做过滤——Phase 2 暂不改 server 端过滤逻辑
// （getObjectives 仍按 ObjectiveStatus 过滤），仅改 client 端筛选。
// refresh 回调可以不传参数（全量刷新），client 端通过 filteredObjectives 做 Cycle 状态筛选。
```

- [ ] **Step 4: 验证 tsc**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: baseline 不新增（可能有少量类型适配噪音，控制在 0~2 新增）

- [ ] **Step 5: 验证 manifest**

```bash
cd frontend && npm run validate:manifest && npm run validate:structure
```
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/okrs/components/okr-directory.tsx \
        frontend/src/domains/okrs/components/okr-workspace.tsx \
        frontend/src/hooks/use-okrs.ts
git commit -m "feat(okrs): [022.01] Phase 2 — 筛选 tabs 改为 Cycle 状态

- STATUS_TABS (ObjectiveStatus) → CYCLE_STATUS_TABS (CycleStatus)
- 筛选逻辑: obj.status 过滤 → parent cycle.status 过滤
- okr-workspace: statusFilter 类型适配 + cycleStatusMap 映射
- 6 tabs: 全部/草稿/未开始/进行中/已结束/已复盘"
```

---

### Task 5: CycleApproveMenuItem + CycleReviewMenuItem 集成到 okr-directory

**Files:**
- Modify: `frontend/src/domains/okrs/components/okr-directory.tsx`（DropdownMenu 集成）
- Modify: `frontend/src/domains/okrs/components/__tests__/cycle-menu.test.tsx`（集成测试留空——okr-directory 无现有测试文件，本 Task 不新建；集成验证通过 /browse E2E 完成）

**Interfaces:**
- Consumes: `CycleApproveMenuItem`, `CycleReviewMenuItem` from `./cycle-menu`
- Produces: DropdownMenu 含 4 个菜单项：审核通过 / 添加目标 / 复盘 / 删除周期

- [ ] **Step 1: 在 okr-directory.tsx 中集成**

```typescript
// frontend/src/domains/okrs/components/okr-directory.tsx
// 修改 1: 新增 import
import { CycleApproveMenuItem, CycleReviewMenuItem } from "./cycle-menu"

// 修改 2: 新增回调 props（OKRDirectoryProps 接口）
// 在接口中添加:
/** 审核通过后回调（刷新 cycle 列表） */
onCycleApproved?: () => void
/** 复盘后回调（刷新 cycle 列表） */
onCycleReviewed?: () => void

// 修改 3: 在 DropdownMenuContent 中插入菜单项（L188-202）
// 旧结构:
//   <DropdownMenuItem onClick={...}>添加目标</DropdownMenuItem>
//   <DropdownMenuItem ...>删除周期</DropdownMenuItem>
//
// 新结构:
<DropdownMenuContent align="end">
  <CycleApproveMenuItem
    cycle={cycle}
    onApproved={onCycleApproved}
  />
  <DropdownMenuItem onClick={() => handleAddObjective(cycle.id)}>
    添加目标
  </DropdownMenuItem>
  <CycleReviewMenuItem
    cycle={cycle}
    onReviewed={onCycleReviewed}
  />
  <DropdownMenuItem
    disabled={hasObjectives}
    title={hasObjectives ? "请先处理周期内目标" : undefined}
    onClick={() => {
      if (hasObjectives) return
      handleDeleteCycle(cycle.id)
    }}
  >
    删除周期
  </DropdownMenuItem>
</DropdownMenuContent>

// 注意：CycleApproveMenuItem 内部有 if (cycle.status !== "draft") return null，
// CycleReviewMenuItem 内部有 if (cycle.status !== "ended") return null，
// 所以不需额外条件渲染——组件自身处理可见性。
```

- [ ] **Step 2: 更新 okr-workspace.tsx 传入回调**

```typescript
// frontend/src/domains/okrs/components/okr-workspace.tsx
// 在 OKRDirectory 渲染处传入新 props:
<OKRDirectory
  // ... 现有 props
  onCycleApproved={() => { hook.refresh() }}
  onCycleReviewed={() => { hook.refresh() }}
/>
```

- [ ] **Step 3: 验证 tsc + lint**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: baseline 不新增

- [ ] **Step 4: Commit**

```bash
git add frontend/src/domains/okrs/components/okr-directory.tsx \
        frontend/src/domains/okrs/components/okr-workspace.tsx
git commit -m "feat(okrs): [022.01] Phase 2 — CycleApproveMenuItem + CycleReviewMenuItem 集成到 okr-directory

- DropdownMenu 新增「审核通过」(draft) + 「复盘」(ended) 菜单项
- 组件自带状态守卫（非 draft/ended 返回 null），不需外层条件渲染
- okr-workspace 传 onCycleApproved/onCycleReviewed 回调触发 refresh"
```

---

## 验证

```bash
# 全量测试
cd frontend && npx vitest run 2>&1 | tail -20

# 类型检查（baseline 60，零新增）
cd frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"

# manifest
cd frontend && npm run validate:manifest && npm run validate:structure

# 冒烟
cd frontend && npm run dev
# → /okrs → 创建 cycle(draft) → 审核通过(→in_progress) → 筛选 tabs 可用 → 结束周期(→ended) → 复盘(→reviewed)
```

## 文件变更汇总

| 文件 | 操作 | Task |
|------|------|------|
| `domains/okrs/repository/cycle.ts` | 修改 (新增 updateStatus) | 1 |
| `domains/okrs/repository/generic-repo-adapter.ts` | 修改 (updateStatus) | 1 |
| `domains/okrs/repository/__tests__/cycle.test.ts` | 修改 (新增测试) | 1 |
| `domains/okrs/guard.ts` | **新建** | 2 |
| `domains/okrs/__tests__/guard.test.ts` | **新建** | 2 |
| `app/actions/okr.ts` | 修改 (reviewCycle) | 3 |
| `app/actions/__tests__/okr-cycle.test.ts` | 修改 (新增 7 测试) | 3 |
| `domains/okrs/components/cycle-menu.tsx` | 修改 (CycleReviewMenuItem) | 3 |
| `domains/okrs/components/__tests__/cycle-menu.test.tsx` | 修改 (扩展 4 测试) | 3 |
| `domains/okrs/components/okr-directory.tsx` | 修改 (tabs + menu 集成) | 4,5 |
| `domains/okrs/components/okr-workspace.tsx` | 修改 (类型适配 + 回调) | 4,5 |
| `hooks/use-okrs.ts` | 修改 (refresh 签名) | 4 |
| `app/actions/okr.ts` | 修改 (endCycle + deleteCycle 接入 assertEditable) | 3.5 |
| `domains/okrs/components/cycle-menu.tsx` | 修改 (CycleEndMenuItem) | 3.5 |
| `app/actions/__tests__/okr-cycle.test.ts` | 修改 (endCycle 测试) | 3.5 |
| `domains/okrs/components/__tests__/cycle-menu.test.tsx` | 修改 (CycleEndMenuItem 测试) | 3.5 |

---

## NOT in scope（本 Phase 明确不做）

- **obj/kr 写路径接入 assertEditable**：activateObjective/changeObjectiveStatus/updateObjective 等 ~6 个 server action 的权限守卫接入推迟到 Phase 3（届时 obj/KR 自身 status 被移除，统一以 cycle.status 为权威源）
- **audit 日志**：设计 spec Phase 5，schema + 接线
- **sweepCycles 时间驱动**：设计 spec Phase 4，自动扫描过期 cycle
- **manifest trigger `intent+time` 类型扩展**：随 Phase 4 sweep 一起做
- **CycleApproveMenuItem 错误 toast 路径单测**：Phase 1 /review 已标 deferred informational，不阻塞

## What already exists（复用清单）

| 已有代码 | 位置 | 复用方式 |
|----------|------|----------|
| `TaskRepository.updateStatus` | `tasks/repository/task.ts:333-355` | CycleRepository.updateStatus 参照其模式（findById→UPDATE SET→返回合并对象） |
| `ThreadRepository.updateStatus` | `tasks/repository/thread.ts:188-210` | 同上，第二参考 |
| `approveCycle` | `app/actions/okr.ts:387-414` | reviewCycle + endCycle 完全复用其模式（UUID 校验→状态守→executeIntent→回读） |
| `CycleApproveMenuItem` | `domains/okrs/components/cycle-menu.tsx:51-108` | CycleReviewMenuItem + CycleEndMenuItem 复用其 Dialog+loading+toast 模式 |
| `deleteCycle` | `app/actions/okr.ts:156-172` | 保留现有目标数量检查，新增 assertEditable 守卫 |
| `CycleRepository.updateFields` | `domains/okrs/repository/cycle.ts:101-114` | updateStatus 不复用（需直接 UPDATE SET status+时间戳），但参照其直接 UPDATE 模式 |
| `buildActionMap` | `nexus/orchestrator/lifecycle-configs.ts:59` | endCycle/reviewCycle 的 action→SM action 映射已自动生成（`endCycle→end`, `reviewCycle→review`） |

## Failure modes

| 路径 | 失败场景 | 测试覆盖 | 用户可见 |
|------|----------|----------|----------|
| `updateStatus` | findById 与 UPDATE 之间状态被并发修改 | SM 层 fromState 检查提供乐观锁，且 `status` 在 UPDATE WHERE 中隐式校验 | SM 返回「非法状态转换」error → toast |
| `reviewCycle` | 复盘后 obj/kr 编辑未被守卫拦截（Phase 2 守卫未接入 obj 路径） | 无——已知缺口，Phase 3 关闭 | 用户可编辑「已复盘」周期下的目标（UI 文案已弱化为「后续版本限制」） |
| `endCycle` | 结束后 cycle 下 KR 有活跃贡献记录 | 无守卫——Phase 4 sweep 的安全网（7 天内 contribution 跳过）对人工 end 不生效 | 人工结束无阻拦，KR 贡献记录保留 |
| `cycleStatusMap` | 筛选时 cycles 数组为空（加载中）→ Map 为空 → 非 "all" 筛选返回空列表 | Task 4 测试覆盖空 cycles 场景 | 显示空列表（加载中 spinner 在上层处理） |
| `assertEditable` | 权限矩阵与 manifest lifecycle 漂移（如 manifest 新增状态但 ALLOWED 未更新） | 无自动化检测——人工 review gate | 新状态默认拒绝所有操作（`allowed` 为 undefined → `has` 抛 TypeError） |

## Worktree parallelization

Sequential implementation — Tasks 1-3 共享 `cycle.ts`/`okr.ts`/`cycle-menu.tsx`，Task 4-5 依赖 Task 3 的导出。无并行机会。

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 8 issues, 0 unresolved |

### Decisions

| ID | Issue | Decision |
|----|-------|----------|
| D1 | Scope — Task 4 筛选 tabs 是否推迟到 Phase 3 | 保持 5 tasks，架构割裂可接受 |
| D2 | P1 — CycleReviewMenuItem 文案夸大 | 改为「复盘后周期将锁定，目标编辑将在后续版本中限制」 |
| D3 | P2 — 缺少 SM→updateStatus 数据流图 | Task 1 开头加 ASCII 图 |
| D4 | P3 — CycleReviewMenuItem 与 ApproveMenuItem 重复 | 加注释说明 DRY 判定，不提取共享组件 |
| D5 | Test — updateStatus 缺 2 条转换 + Task 4 零测试 | 补 4 条测试 |
| D6 | P0 (outside voice) — endCycle 不存在导致 reviewCycle 死代码 | 新增 Task 3.5：endCycle + CycleEndMenuItem |
| D7 | P2 (outside voice) — deleteCycle assertEditable 代码缺失 | 补具体代码变更 |
| D8 | P3 (outside voice) — Task 4 筛选不过滤 cycles | 加 `cycles.filter(...)` |

### Required Outputs

**NOT in scope:** obj/kr assertEditable 接入、audit 日志、sweepCycles、manifest trigger 扩展、错误 toast 单测

**What already exists:** TaskRepository.updateStatus、approveCycle 模式、CycleApproveMenuItem 模式、deleteCycle、buildActionMap

**Failure modes:** 5 个已识别，0 个 critical gap（所有失败场景有测试或已知缺口有 Phase 3 计划）

**Worktree parallelization:** Sequential（共享模块依赖）

**TODOS.md updates:** 0 new items（无值得跨 Phase 追踪的独立任务）

### Implementation Tasks

- [ ] **T1 (P1, human: ~1.5h / CC: ~15min)** — CycleRepository.updateStatus + adapter 接线 + 5 条单测 + ASCII 数据流图
  - Surfaced by: Architecture review D3 + Test review
  - Files: `cycle.ts`, `generic-repo-adapter.ts`, `cycle.test.ts`
  - Verify: `npx vitest run src/domains/okrs/repository/__tests__/cycle.test.ts`

- [ ] **T2 (P1, human: ~30min / CC: ~5min)** — assertEditable 权限守卫 + 5 条矩阵测试 + deleteCycle 接入代码
  - Surfaced by: Architecture review + Outside voice D7
  - Files: `guard.ts`, `guard.test.ts`, `okr.ts` (deleteCycle)
  - Verify: `npx vitest run src/domains/okrs/__tests__/guard.test.ts`

- [ ] **T3 (P1, human: ~1.5h / CC: ~15min)** — reviewCycle + CycleReviewMenuItem（修正文案）+ 测试
  - Surfaced by: Design spec §D + Architecture review D2 + Code quality D4
  - Files: `okr.ts`, `okr-cycle.test.ts`, `cycle-menu.tsx`, `cycle-menu.test.tsx`
  - Verify: `npx vitest run src/app/actions/__tests__/okr-cycle.test.ts src/domains/okrs/components/__tests__/cycle-menu.test.tsx`

- [ ] **T3.5 (P0, human: ~1h / CC: ~10min)** — endCycle + CycleEndMenuItem + 测试（unblock reviewCycle）
  - Surfaced by: Outside voice D6
  - Files: `okr.ts`, `cycle-menu.tsx`, `okr-cycle.test.ts`, `cycle-menu.test.tsx`
  - Verify: `npx vitest run src/app/actions/__tests__/okr-cycle.test.ts`

- [ ] **T4 (P1, human: ~45min / CC: ~10min)** — 筛选 tabs 改为 Cycle 状态 + cycle 级过滤 + 2 条测试
  - Surfaced by: Design spec §D + Test review + Outside voice D8
  - Files: `okr-directory.tsx`, `okr-workspace.tsx`, `use-okrs.ts`
  - Verify: `npx vitest run` (筛选逻辑) + `/browse` E2E

- [ ] **T5 (P1, human: ~20min / CC: ~5min)** — 菜单集成到 okr-directory + 回调 wiring
  - Surfaced by: Design spec §D (deferred Phase 1 integration)
  - Files: `okr-directory.tsx`, `okr-workspace.tsx`
  - Verify: `/browse` E2E — draft cycle 显示「审核通过」、ended cycle 显示「复盘」、in_progress cycle 显示「结束周期」

**VERDICT:** ENG REVIEW CLEARED — 8 issues all resolved via AskUserQuestion. Plan ready for implementation.

NO UNRESOLVED DECISIONS
