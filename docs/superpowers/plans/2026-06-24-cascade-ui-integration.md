# [025] 级联 UI 集成 实现计划（ISSUE-002 + ISSUE-003）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让级联在真实任务 UI 中端到端可用 —— completeTask 全量走 Orchestrator（含字段原子写）+ 级联确认弹窗（连带下级/取消）+ confirmed 重提交。

**Architecture:** completeTask 改走 submitDynamicIntent；Orchestrator 契约路径对「带字段 payload 的状态 intent」复用域业务事实写入口（mutation service）做原子字段+状态写，而非直接 sm.execute（SM 现状对 existing 对象只 updateStatus、丢弃 payload 字段，见 `state-machine/index.ts:272`）。级联确认复用现有 AlertDialog 模式（参照 `confirm-delete-dialog.tsx`），在 task-tree-view / task-complete-zone 两处调用点接入。

**Tech Stack:** TypeScript, Drizzle ORM, Vitest, React 19, shadcn/ui AlertDialog

**Spec:** `docs/superpowers/specs/2026-06-24-cascade-task-design.md`（本计划补齐其 §7.1 defer 的 UI 集成 + ⑥ CNUI Suspend surfacing 的最小可用子集）

**前置 QA 报告:** `.gstack/qa-reports/qa-report-cascade-task-2026-06-24.md`

---

## 背景与根因（已验证）

| ISSUE | 根因（systematic-debugging Phase 1 验证） |
|---|---|
| **002** | `completeTask`（tasks.ts:220）走 `createTasksMutationService().execute()`，绕过 Orchestrator → `cascadeCheck` 从不执行。**关键约束**：SM 对 existing 对象只调 `repo.updateStatus`（state-machine/index.ts:272），**丢弃 `proposal.payload` 字段**；故简单改走 submitDynamicIntent 会丢失 `actualDuration`/`notes` 原子写（[018] 的核心价值）。 |
| **003** | `updateTaskStatus`（tasks.ts:177）等所有 submitDynamicIntent 类 action 在 `!result.success` 时 `throw result.error ?? fallback`。级联 NeedConfirm = `success:false, error:undefined` → 抛「状态更新失败」通用错，丢弃 suspended。**另**：orchestrator 对 cascade source 设 `needsConfirmation:false`（I1 bug），即使透传数据也是错的。 |
| **004** | ✅ 已修复（commit `18ccd2a`）—— `complete` 放开 `todo/planned → completed`，与 cascade_complete 对齐。 |

**用户决策（AskUserQuestion 2026-06-24）：**
- ISSUE-002 方案 = **全量走 Orchestrator**（completeTask 全走 submitDynamicIntent，Orchestrator 契约路径加字段执行）
- 范围 = **完整 E2E**（服务端透传 + 客户端级联确认弹窗 + confirmed 重提交）

---

## 设计决策

### D1：Orchestrator 契约路径「带字段状态写」复用 mutation service（不复制字段执行器逻辑）

**问题**：completeTask 的 `actualDuration`（FactField）/`notes`（ContentField）须走字段执行器（宪法禁 repo-bypass 写 FactField）。SM 现状不写字段。

**方案**：Orchestrator 新增可选依赖 `executeFieldStateWrite`（由 intent.ts 绑定到域 mutation service）。契约路径在确认后判定：若 intent 携带 field_metadata 声明的字段（非路由键），则调 `executeFieldStateWrite`（mutation service `execute([...fieldSteps, {kind:'state', action}])`，单事务原子）；否则保持现有 `sm.execute`。

**为什么不复制**：mutation service（`domain-mutation-service/factory.ts`）已组装 field-executor + tx 版 SM，是「字段+状态原子写」的 SSOT。Orchestrator 复用它 = 组合能力，非逻辑重复。completeTask 当前的 mutation-service 用法语义被 1:1 保留。

**字段拆分**：Orchestrator 取 `intent.fields` 中存在于 manifest `field_metadata` 的键（排除路由键 `objectId` / `{objectType}Id`）作为 fieldSteps。completeTask → `actualDuration`+`notes`。

### D2：级联 NeedConfirm 正确 surfacing（修 I1）

orchestrator NeedConfirm 块对 `source === 'cascade'` 时，设 `needsConfirmation: true` + 由 CascadePreview 构造的 `confirmationMessage`（如「连带完成 5 个下级任务（2 个直接子任务 + 3 个孙级）。确定连带处理？」）。现 executePipeline 已透传 `needsConfirmation`/`confirmationMessage`，故修 orchestrator 即可让数据正确流到 client。

### D3：server action 返回判别联合（停 500）

`updateTaskStatus`/`archiveTask`/`deleteTask`/`completeTask` 在 `!result.success` 时区分：
- `result.error` 有值 → 真错误，throw（保持现状）
- `result.needsConfirmation` → 返回 `{ status: 'needs_confirm', message, action, fields }`，**不 throw**

返回类型由 `Promise<Task>` 扩为判别联合 `TaskActionResult = { status:'ok'; task: Task } | { status:'needs_confirm'; message:string; confirmAction:string; confirmFields:Record<string,unknown> }`。调用方（client）据 `status` 分流。

### D4：客户端级联确认弹窗（CNUI Suspend ⑥ 最小可用子集）

新增 `<CascadeConfirmDialog>`（基于 `alert-dialog.tsx`，参照 `confirm-delete-dialog.tsx`）。两处调用点接入：
- `task-tree-view.tsx` `handleStatusChange`（状态下拉 complete/archive/delete）
- `task-complete-zone.tsx` `handleComplete`（CheckInForm/LogForm/ReviewForm）

流程：调 action → 若返回 `needs_confirm` → 开弹窗（连带下级/取消）→ 「连带下级」→ 以 `confirmed=true` 重调 action。

**不持久化挂起 Intent**（spec §7.1 ⑥ 的完整持久化回环仍 defer）—— 确认态在 React 组件内存，刷新丢失即重来。本切片目标是「cascade 在 UI 可用」，非完整 Suspend 持久化。

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/nexus/orchestrator/index.ts` | 修改 | D2: cascade NeedConfirm 设 needsConfirmation+message；D1: 契约路径带字段状态写走 mutationExecutor |
| `src/app/actions/intent.ts` | 修改 | executePipeline 绑定 `executeFieldStateWrite` 到 tasks mutation service |
| `src/app/actions/tasks.ts` | 修改 | D3: completeTask→submitDynamicIntent；4 个 action 返回判别联合 |
| `src/components/tasks/cascade-confirm-dialog.tsx` | 新建 | D4: 级联确认弹窗 |
| `src/domains/tasks/components/task-tree-view.tsx` | 修改 | D4: handleStatusChange 接入弹窗 |
| `src/domains/tasks/components/task-complete-zone.tsx` | 修改 | D4: handleComplete 接入弹窗 |
| `src/nexus/orchestrator/__tests__/cascade-check.test.ts` | 修改 | 补 D2 断言（needsConfirmation=true + message） |

---

### Task 1: Orchestrator D2 — cascade NeedConfirm 正确 surfacing

**Files:**
- Modify: `frontend/src/nexus/orchestrator/index.ts`（NeedConfirm 块）
- Modify: `frontend/src/nexus/orchestrator/__tests__/cascade-check.test.ts`

- [ ] **Step 1: cascadeCheck 返回 NeedConfirm 时附带 confirmationMessage**

在 cascadeCheck 构造 `cascadePreview` 后，计算消息并放入 data：
```typescript
const grandchildCount = Math.max(0, cascadePreview.totalCount - cascadePreview.directCount)
const actionLabel = action.startsWith('complete') ? '完成'
  : action.startsWith('archive') ? '归档' : '删除'
const confirmationMessage = `将连带${actionLabel} ${cascadePreview.totalCount} 个下级任务` +
  (grandchildCount > 0 ? `（${cascadePreview.directCount} 个直接子任务 + ${grandchildCount} 个孙级）` : '') +
  `。确定连带处理？`

return {
  kind: 'NeedConfirm',
  data: { source: 'cascade', cascadePreview, confirmationMessage },
}
```

- [ ] **Step 2: NeedConfirm 块对 cascade 设 needsConfirmation:true + 透传 message**

在 executeIntent 的 `if (aggregated.kind === 'NeedConfirm')` 的 else 分支（非 confirmed-cascade），对 `source === 'cascade'` 设 `needsConfirmation: true`、`confirmationMessage: data.confirmationMessage`：
```typescript
needsConfirmation: data?.source === 'rule' || data?.source === 'cascade' ? true : false,
confirmationMessage: data?.source === 'cascade'
  ? (data.confirmationMessage as string)
  : confirmations?.join('; '),
```

- [ ] **Step 3: 测试补断言（T2/T3/T7 等 NeedConfirm 场景）**

在 cascade-check.test.ts 对返回 suspended 的场景，断言 `needsConfirmation === true` 且 `confirmationMessage` 含「连带」。

- [ ] **Step 4: 运行测试**
```bash
cd frontend && npx vitest run src/nexus/orchestrator/__tests__/cascade-check.test.ts --reporter=verbose
```
Expected: 15+ passed（含新断言）

- [ ] **Step 5: Commit**
```bash
git commit -m "fix(cascade): [025] D2 — cascade NeedConfirm 正确 surfacing needsConfirmation + message（ISSUE-003 I1）"
```

---

### Task 2: Orchestrator D1 — 带字段状态写复用 mutation service

**Files:**
- Modify: `frontend/src/nexus/orchestrator/index.ts`（OrchestratorDeps + 契约路径）
- Modify: `frontend/src/app/actions/intent.ts`（绑定 executeFieldStateWrite）

- [ ] **Step 1: OrchestratorDeps 新增可选 executeFieldStateWrite**

```typescript
export interface OrchestratorDeps {
  // ...existing...
  /** [025] 带字段 payload 的状态写（复用域业务事实写入口原子字段+状态写） */
  executeFieldStateWrite?: (params: {
    domainId: string
    objectType: string
    targetId: USOM_ID
    intentId: USOM_ID
    fieldSteps: Array<{ field: string; value: unknown }>
    stateAction: string
    userId: USOM_ID
  }) => Promise<{ success: boolean; object?: Record<string, unknown>; error?: string }>
}
```

- [ ] **Step 2: 契约路径判定字段 payload 并分流**

在 SM 块（cascade 拆分前），判定是否带声明字段：
```typescript
// [025] D1：带字段 payload 的状态写复用 mutation service（原子字段+状态）
const manifestFieldMeta = manifestResult.success
  ? (manifestResult.manifest.field_metadata as Record<string, unknown> | undefined)
  : undefined
const routingKeys = new Set(['objectId', `${smObjectType}Id`])
const fieldSteps = Object.entries(intent.fields)
  .filter(([k, v]) => !routingKeys.has(k) && v !== undefined && manifestFieldMeta && k in manifestFieldMeta)
  .map(([field, value]) => ({ field, value }))

const targetId = resolveObjectId(intent.fields, smObjectType)

if (fieldSteps.length > 0 && deps.executeFieldStateWrite && targetId) {
  const writeResult = await deps.executeFieldStateWrite({
    domainId, objectType: smObjectType, targetId,
    intentId: intent.id, fieldSteps, stateAction: action, userId,
  })
  if (!writeResult.success) return { success: false, error: writeResult.error }
  // 跳过下方 sm.execute，直接进 cascade 拆分（writeResult.object 为父对象）
  // （把 smResult 等价物设好，复用下方 cascade 拆分块）
}
```
注：需重构 SM 块使 cascade 拆分能复用（无论写来自 sm.execute 还是 executeFieldStateWrite）。

- [ ] **Step 3: intent.ts executePipeline 绑定 executeFieldStateWrite**

在 createOrchestrator deps 内新增：
```typescript
executeFieldStateWrite: async ({ domainId, objectType, targetId, intentId, fieldSteps, stateAction, userId }) => {
  if (domainId !== 'tasks') {
    return { success: false, error: `executeFieldStateWrite 暂仅支持 tasks 域` }
  }
  const service = createTasksMutationService()
  const res = await service.execute(
    {
      id: crypto.randomUUID() as USOM_ID,
      domainId,
      objectType,
      targetId,
      steps: [...fieldSteps.map(f => ({ kind: 'field' as const, ...f })), { kind: 'state' as const, action: stateAction }],
    },
    userId,
  )
  return { success: res.success, object: res.object, error: res.error }
},
```
（import createTasksMutationService）

- [ ] **Step 4: 运行回归**
```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -20 && npx tsc --noEmit 2>&1 | grep -i orchestrator | head
```
Expected: 零新增失败；orchestrator 零 tsc 错误

- [ ] **Step 5: Commit**
```bash
git commit -m "feat(cascade): [025] D1 — Orchestrator 契约路径带字段状态写复用 mutation service（ISSUE-002）"
```

---

### Task 3: tasks.ts — completeTask 全走 Orchestrator + action 返回判别联合

**Files:**
- Modify: `frontend/src/app/actions/tasks.ts`

- [ ] **Step 1: 定义判别联合返回类型**

```typescript
export type TaskActionResult =
  | { status: 'ok'; task: Task }
  | { status: 'needs_confirm'; message: string; confirmAction: string; confirmFields: Record<string, unknown> }
```

- [ ] **Step 2: completeTask 改走 submitDynamicIntent**

```typescript
export async function completeTask(taskId: string, extraFields?: Record<string, unknown>): Promise<TaskActionResult> {
  const fields: Record<string, unknown> = { taskId, ...extraFields }
  const result = await submitDynamicIntent('tasks', 'completeTask', fields)
  if (!result.success) {
    if (result.needsConfirmation) {
      return { status: 'needs_confirm', message: result.confirmationMessage ?? '需确认', confirmAction: 'completeTask', confirmFields: fields }
    }
    throw new Error(result.error ?? '完成任务失败')
  }
  return { status: 'ok', task: result.object as Task }
}
```

- [ ] **Step 3: updateTaskStatus / archiveTask / deleteTask 同样返回判别联合 + 透传 needs_confirm**

对 `!result.success` 分流：有 `result.error` → throw；`result.needsConfirmation` → 返回 needs_confirm。三个 action 返回类型改 `Promise<TaskActionResult>`（archiveTask/deleteTask 的 ok 分支 task 用兜底 findById 或改返回 void 联合）。

- [ ] **Step 4: tsc + 回归**
```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "tasks.ts|task-tree-view|task-complete-zone" | head
```
Expected: 调用方报错（task-tree-view/task-complete-zone 仍按旧 Promise<Task> 用）—— 由 Task 4 修复

- [ ] **Step 5: Commit**
```bash
git commit -m "feat(cascade): [025] D3 — tasks server actions 返回判别联合 + completeTask 全走 Orchestrator（ISSUE-002/003 服务端）"
```

---

### Task 4: 客户端级联确认弹窗 + 两处调用点接入

**Files:**
- Create: `frontend/src/components/tasks/cascade-confirm-dialog.tsx`
- Modify: `frontend/src/domains/tasks/components/task-tree-view.tsx`
- Modify: `frontend/src/domains/tasks/components/task-complete-zone.tsx`

- [ ] **Step 1: 新建 CascadeConfirmDialog（参照 confirm-delete-dialog.tsx）**

```tsx
'use client'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

interface CascadeConfirmDialogProps {
  open: boolean
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export function CascadeConfirmDialog({ open, message, onConfirm, onCancel }: CascadeConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>级联确认</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-primary">连带下级</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 2: task-tree-view handleStatusChange 接入**

调 `updateTaskStatusAction` → 若返回 `needs_confirm` → 存 pendingConfirm 状态 → 渲染 CascadeConfirmDialog → 「连带下级」→ 以 confirmed 语义重调（需 updateTaskStatus 接受 confirmed 参数，或新增 updateTaskStatusConfirmed action）。注意：状态更新需传 confirmed，submitDynamicIntent 已支持第 4 参 confirmed。

- [ ] **Step 3: task-complete-zone handleComplete 接入（3 处 form）**

CheckInForm/LogForm/ReviewForm 的 handleComplete 调 completeTask → 若 needs_confirm → 弹窗 → 重调 completeTask with confirmed。

- [ ] **Step 4: 浏览器 E2E（/browse 或手动）**

1. 父任务（有子任务）下拉「完成」→ 弹窗 → 连带下级 → 父子 completed
2. complete-zone「标记完成」有子任务 → 弹窗 → 连带 → 父子 completed（actualDuration 已写）
3. todo 任务「标记完成」→ 直接完成（ISSUE-004 已修，无子任务不弹窗）

- [ ] **Step 5: Commit**
```bash
git commit -m "feat(cascade): [025] D4 — 客户端级联确认弹窗 + task-tree-view/complete-zone 接入（ISSUE-003 E2E）"
```

---

### Task 5: 最终回归 + tsc + manifest

- [ ] **Step 1: 全量测试**
```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -20
```
Expected: 与基线一致（聚焦新增失败）

- [ ] **Step 2: tsc**
```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -vE "<预存错误文件>" | head
```
Expected: 零新增

- [ ] **Step 3: validate-manifest**
```bash
cd frontend && npx tsx scripts/validate-manifest.ts
```

- [ ] **Step 4: 更新 QA 报告 + memory**

更新 `.gstack/qa-reports/qa-report-cascade-task-2026-06-24.md` 的 ISSUE-002/003 状态为 resolved；更新 memory `project-025-cascade-decisions.md`。

- [ ] **Step 5: Commit**
```bash
git commit -m "chore(cascade): [025] ISSUE-002/003 E2E 验证通过，零回归"
```

---

## 自检清单

- [ ] Spec §8 验收 #1（completeTask 确认卡 + 父子完成）→ Task 2+3+4
- [ ] Spec §8 验收 #2（archiveThread 级联）→ Task 3+4（archive 走 updateTaskStatus 已过 Orchestrator）
- [ ] Spec §8 验收 #8（浏览器 E2E 确认卡呈现）→ Task 4 Step 4
- [ ] ISSUE-004 已修（commit 18ccd2a）
- [ ] 无 TBD/TODO 占位
- [ ] D1 复用 mutation service（不复制字段执行器逻辑）
- [ ] D4 不持久化挂起 Intent（spec §7.1 ⑥ 持久化仍 defer，本切片仅内存态确认）

---

## 风险

1. **Task 2 契约路径重构**：SM 块需重构使 cascade 拆分能复用 sm.execute 与 executeFieldStateWrite 两种写来源。注意 smResult.event（onEvent 钩子）—— mutation service 走 SM 时也发 event，但 event 经独立 eventBus，onEvent 调用需对齐。
2. **Task 3 返回类型 rippling**：4 个 action 返回判别联合 → 所有调用方须适配。搜索调用方：`grep -rn "updateTaskStatus\|completeTask\|archiveTask\|deleteTask" frontend/src --include=*.tsx`。
3. **Task 4 confirmed 传递**：submitDynamicIntent 第 4 参 confirmed 已支持；server action 须透传 confirmed（新增参数）。
4. **D4 内存态确认**：刷新页面丢失确认态（可接受，⑥ 持久化 defer）。
