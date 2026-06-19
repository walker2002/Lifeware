# 业务事实写入口公共工厂抽象实现计划（G2 切片）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 抽取 `createDomainMutationServiceFactory` 公共工厂（tasks/habits 两域工厂瘦到 ~30 行），并把 field-executor 硬编码的 `TaskFieldUpdated` 事件名参数化为 per-domain 显式配置（habits 修正为 `HabitFieldUpdated`）。

**Architecture:** 新建 `src/nexus/domain-mutation-service/factory.ts` 下沉六项组装；F-6 接线链 `DomainMutationServiceDeps.fieldUpdatedEventType → FieldExecutorContext.fieldUpdatedEventType → field-executor.execute() 发 ctx 值`；tasks 零行为变更，habits 事件名修正。

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5 / Drizzle 0.45.1 / Vitest / 真实 Docker PostgreSQL（集成测试）。

**Spec:** `docs/superpowers/specs/2026-06-19-domain-mutation-service-factory-design.md`

**基线说明：** 仓库当前存在 **21 个预存失败**（历史遗留，与本切片无关）。本切片要求「0 新增失败」——每个 Task 末尾跑相关测试，最终 Task 7 跑全量比对，失败数须仍为 21。

**语言规范：** 所有代码注释、commit message 描述用简体中文；每个 TS 文件保留/补全 `/** @file ... @brief ... */` 文件头。

**前置条件（执行前人工确认）：** 在 `frontend/` 下，PostgreSQL（docker-compose）已启动且 `DATABASE_URL` 可用（集成测试需要）。

---

## File Structure

**新建：**
- `src/nexus/domain-mutation-service/factory.ts` — 公共工厂 `createDomainMutationServiceFactory(opts)`，下沉 tasks/habits 共用的六项组装（getRepository/getFieldMetadata/smExecute/eventBus/transaction/getExecutor）+ 透传 `fieldUpdatedEventType`。
- `src/nexus/domain-mutation-service/__tests__/factory.test.ts` — 公共工厂单测（getRepository 路由/缺失抛错、getFieldMetadata 读 manifest、smExecute 闭包捕获 domainId、fieldUpdatedEventType 透传到 deps）。

**修改（核心代码）：**
- `src/usom/types/process.ts` — `SystemEventType` 联合加 `'HabitFieldUpdated'`。
- `src/nexus/field-executor/index.ts` — `FieldExecutorContext` 加必填 `fieldUpdatedEventType: SystemEventType`；`execute()` 发事件 `type: ctx.fieldUpdatedEventType`；更新文件头/行内注释。
- `src/nexus/domain-mutation-service/index.ts` — `DomainMutationServiceDeps` 加必填 `fieldUpdatedEventType: SystemEventType`；`update()` 与 `execute()` 两处 ctx 注入该字段；更新注释。
- `src/app/actions/tasks/mutation-service.ts` — 瘦化：调公共工厂，传 `fieldUpdatedEventType: 'TaskFieldUpdated'`。
- `src/app/actions/habits/mutation-service.ts` — 瘦化：调公共工厂，传 `fieldUpdatedEventType: 'HabitFieldUpdated'`（修正 F-6）。

**修改（测试）：**
- `src/nexus/field-executor/__tests__/index.test.ts` — 引入 `makeCtx` helper（含 `fieldUpdatedEventType` 默认值），10 处内联 ctx 改用 helper；保留 tasks 发 `TaskFieldUpdated` 断言；新增 habits 发 `HabitFieldUpdated` 用例。
- `src/nexus/domain-mutation-service/__tests__/dispatch.test.ts` — 5 处 deps 补 `fieldUpdatedEventType`；FactField 用例断言 ctx 透传 `fieldUpdatedEventType`。
- `src/app/actions/habits/__tests__/mutation-service.test.ts` — FactField 用例新增 `ctx.fieldUpdatedEventType === 'HabitFieldUpdated'` 断言（F-6 端到端）。

**修改（文档）：**
- `docs/usom-design.md` — §4.4 域落地状态表补注「公共工厂已抽 + F-6 已参数化」。
- `manifest.md` — 版本历史新增一行。

**不触碰：** `intent.ts`、`tasks.ts`、任何 manifest.yaml、任何 CNUI Surface、okrs/timebox、HH_MM_REGEX。

---

## Task 1: SystemEventType 联合新增 HabitFieldUpdated

**Files:**
- Modify: `src/usom/types/process.ts:185-201`
- Test: `src/usom/types/process.ts`（内联类型断言，见 Step 1）

**Why first:** Task 2 的 field-executor 测试要断言 `'HabitFieldUpdated'`，Task 3/4 的工厂/habits 要传该字面量——它必须先成为合法的 `SystemEventType`，否则 TS 报错。

- [ ] **Step 1: 写类型断言测试（RED）**

在 `src/usom/types/process.ts` 文件**末尾**追加一个编译期类型断言（不导出、无运行时开销，仅类型检查时校验字面量属于联合）：

```ts
// ─── 类型断言（仅编译期）：HabitFieldUpdated 须为合法 SystemEventType ──
const _HABIT_FIELD_UPDATED_IS_VALID_SYSTEM_EVENT_TYPE: SystemEventType = 'HabitFieldUpdated'
void _HABIT_FIELD_UPDATED_IS_VALID_SYSTEM_EVENT_TYPE
```

- [ ] **Step 2: 跑类型检查，确认失败**

Run: `cd frontend && npx tsc --noEmit -p . 2>&1 | grep -i "HabitFieldUpdated" || echo "（如未命中，可能因断言未被引用而通过——继续 Step 3 仍会失败）"`

Expected: 因为 `'HabitFieldUpdated'` 尚未在联合中，断言赋值报错（`Type '"HabitFieldUpdated"' is not assignable to type 'SystemEventType'`）。

- [ ] **Step 3: 实现最小改动**

在 `src/usom/types/process.ts` 的 `SystemEventType` 联合末尾（当前 `'TaskFieldUpdated'` 所在行，约 201 行），把：

```ts
  | 'ExecutionLogged'
  | 'TaskFieldUpdated'
```

改为：

```ts
  | 'ExecutionLogged'
  | 'TaskFieldUpdated'
  | 'HabitFieldUpdated'
```

- [ ] **Step 4: 跑类型检查，确认通过**

Run: `cd frontend && npx tsc --noEmit -p . 2>&1 | grep -i "HabitFieldUpdated" && echo "STILL FAILING" || echo "OK"`

Expected: 输出 `OK`（无 HabitFieldUpdated 相关错误）。

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/usom/types/process.ts
git commit -m "feat(usom): SystemEventType 新增 HabitFieldUpdated（G2 切片前置）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: F-6 核心接线 — field-executor 事件名参数化

**Files:**
- Modify: `src/nexus/field-executor/index.ts`（ctx 类型 + execute + 注释）
- Modify: `src/nexus/domain-mutation-service/index.ts`（deps 类型 + 2 处 ctx + 注释）
- Test: `src/nexus/field-executor/__tests__/index.test.ts`（makeCtx helper + 新断言）
- Test: `src/nexus/domain-mutation-service/__tests__/dispatch.test.ts`（deps 补字段 + ctx 透传断言）

**Atomicity note:** `FieldExecutorContext` 加必填字段后，`domain-mutation-service/index.ts` 两处 ctx 构造会立即 TS 报错——故 field-executor 与 domain-mutation-service 必须同 Task 改，不可拆。

- [ ] **Step 1: 写 field-executor 失败测试（RED）**

修改 `src/nexus/field-executor/__tests__/index.test.ts`：

(a) 顶部 import 增加 `SystemEventType` 类型：

```ts
import type { FieldMetadata } from '@/usom/types/domain-types'
import type { SystemEventType } from '@/usom/types/process'
import type { DbClient } from '@/lib/db'
import { createFieldExecutor } from '../index'
```

（注：原文件已 `import type { GenericRepo }` 与 `import type { EventBus }`，保留。新增 `SystemEventType` 与 `DbClient` 两行。）

(b) 在 `makeEventBus()` 函数**之后**新增 `makeCtx` helper（封装 10 处内联 ctx 的公共字段 + F-6 必填的 `fieldUpdatedEventType`）：

```ts
/** 构造 FieldExecutorContext 测试基线（含 F-6 必填的 fieldUpdatedEventType，默认 TaskFieldUpdated）。 */
function makeCtx(opts: {
  repo: GenericRepo
  bus: EventBus
  objectType: string
  fieldUpdatedEventType?: SystemEventType
  tx?: DbClient
}): FieldExecutorContext {
  return {
    repo: opts.repo,
    eventBus: opts.bus,
    objectType: opts.objectType,
    fieldMetadata: FIELD_META,
    fieldUpdatedEventType: opts.fieldUpdatedEventType ?? 'TaskFieldUpdated',
    ...(opts.tx !== undefined ? { tx: opts.tx } : {}),
  }
}
```

需在 import 区补 `FieldExecutorContext` 类型（从 `../index` 导入）：把 `import { createFieldExecutor } from '../index'` 改为：

```ts
import { createFieldExecutor, type FieldExecutorContext } from '../index'
```

(c) 把文件内全部 **10 处**内联 ctx 字面量改用 `makeCtx`。模式（以第 81-86 行用例为模板）：

改前：
```ts
const result = await executor.execute('task-1', 'priority', 'high', 'user-1', {
  repo,
  eventBus: bus,
  objectType: 'task',
  fieldMetadata: FIELD_META,
})
```
改后：
```ts
const result = await executor.execute(
  'task-1', 'priority', 'high', 'user-1',
  makeCtx({ repo, bus, objectType: 'task' }),
)
```

需要转换的 10 处（按原行号定位，转换后行号会变）：
1. `updateFields 被调用` 用例（原 ~81-86，objectType `'task'`）
2. `发 TaskFieldUpdated 事件` 用例（原 ~103-108，objectType `'task'`，需保留 `published` 捕获）
3. `非法枚举值` 用例（原 ~129-134，objectType `'task'`）
4. `number 负时长` 用例（原 ~149-154，objectType `'task'`）
5. `onValidate 独立` 用例（原 ~166-173）—— 特殊：保留额外 `onValidate` prop + `as any`：`makeCtx({ repo, bus, objectType: 'task' })` 后展开 `{ ...makeCtx({...}), onValidate: onValidateSpy } as any`
6. `透传 tx` 用例（原 ~184-190）—— 用 helper 的 tx 选项：`makeCtx({ repo, bus, objectType: 'task', tx: fakeTx })`，去掉外层 `as any`
7. `time 合法值` it.each（原 ~211-216，objectType `'habit'`）
8. `time 非法值` it.each（原 ~236-241，objectType `'habit'`）
9. `frequencyType 合法 daily`（原 ~256-261，objectType `'habit'`）
10. `frequencyType 非法 yearly`（原 ~273-278，objectType `'habit'`）

(d) 第 2 处用例（`发 TaskFieldUpdated 事件`）的断言 **保持不变**（tasks 仍发 `TaskFieldUpdated`）：
```ts
expect(evt.type).toBe('TaskFieldUpdated')
```

(e) 在 `发 TaskFieldUpdated 事件` 用例**之后**，新增 habits 事件名用例（验证 F-6 参数化）：

```ts
it('发出的事件 type 取自 ctx.fieldUpdatedEventType（habits → HabitFieldUpdated）', async () => {
  const repo = makeRepo()
  const { bus, published } = makeEventBus()
  const executor = createFieldExecutor()

  await executor.execute(
    'habit-1', 'defaultTime', '07:00', 'user-1',
    makeCtx({ repo, bus, objectType: 'habit', fieldUpdatedEventType: 'HabitFieldUpdated' }),
  )

  expect(published).toHaveLength(1)
  expect(published[0].type).toBe('HabitFieldUpdated')
})
```

- [ ] **Step 2: 跑 field-executor 测试，确认失败**

Run: `cd frontend && npx vitest run src/nexus/field-executor/__tests__/index.test.ts 2>&1 | tail -30`

Expected: 新增的 `HabitFieldUpdated` 用例 **FAIL**（当前 `execute()` 硬编码发 `TaskFieldUpdated`，断言 `'HabitFieldUpdated'` 不匹配）。其余用例因 `makeCtx` 默认值 `'TaskFieldUpdated'` 仍通过。

- [ ] **Step 3: 实现 field-executor 改动（GREEN — part 1）**

修改 `src/nexus/field-executor/index.ts`：

(a) import 区（原 21-27 行附近）增加 `SystemEventType`：
```ts
import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import type { SystemEvent, SystemEventType, ValidationResult } from '@/usom/types/process'
import { validationPassed, validationRejected } from '@/usom/types/process'
```

(b) `FieldExecutorContext` 接口（原 30-41 行）在 `objectType` 后新增必填字段：
```ts
export interface FieldExecutorContext {
  /** 目标对象的仓储适配器（GenericRepo） */
  repo: GenericRepo
  /** 事件总线，用于发布域配置的字段更新事件 */
  eventBus: EventBus
  /** 目标对象类型（如 'task' / 'habit'），写入事件 payload */
  objectType: string
  /** 字段元数据表（取自 manifest field_metadata） */
  fieldMetadata: Record<string, FieldMetadata>
  /**
   * 字段写完成后发布的事件类型（per-domain 显式配置，F-6 参数化）。
   * tasks → 'TaskFieldUpdated'，habits → 'HabitFieldUpdated'。
   */
  fieldUpdatedEventType: SystemEventType
  /** 可选事务句柄（顶层写入口透传） */
  tx?: DbClient
}
```

(c) `execute()` 内发事件处（原 148-162 行），把硬编码 `type: 'TaskFieldUpdated'` 改为读 ctx：
```ts
      // 发域配置的字段更新事件（F-6：type 取自 ctx.fieldUpdatedEventType）
      const event: SystemEvent = {
        id: crypto.randomUUID() as USOM_ID,
        type: ctx.fieldUpdatedEventType,
        occurredAt: new Date().toISOString() as Timestamp,
        triggeredBy: 'state_machine',
        payload: {
          objectId: id,
          field,
          value,
          objectType: ctx.objectType,
        },
        snapshotId: '' as USOM_ID,
      }
      ctx.eventBus.publish(event)
```

(d) 文件头 `@brief`（原第 4-6 行）与 `execute()` 内 JSDoc（原 115 行）的「TaskFieldUpdated」措辞改为「域配置的字段更新事件」：
- 第 6 行 `并发布通用 TaskFieldUpdated 事件。` → `并发布域配置的字段更新事件（per-domain，F-6）。`
- 第 33 行 `/** 事件总线，用于发布 TaskFieldUpdated */` → `/** 事件总线，用于发布域配置的字段更新事件 */`
- 第 115 行 `流程：字段级校验 → repo.updateFields 写库 → 发 TaskFieldUpdated 事件。` → `流程：字段级校验 → repo.updateFields 写库 → 发 ctx.fieldUpdatedEventType 事件。`

- [ ] **Step 4: 实现 domain-mutation-service 改动（GREEN — part 2，必须同 Task 否则 TS 报错）**

修改 `src/nexus/domain-mutation-service/index.ts`：

(a) import 区（原 32-39 行附近）增加 `SystemEventType`：
```ts
import type { ValidationResult } from '@/usom/types/process'
import type { SystemEventType } from '@/usom/types/process'
```
（合并为一行亦可：`import type { ValidationResult, SystemEventType } from '@/usom/types/process'`）

(b) `DomainMutationServiceDeps` 接口（原 84-99 行）在 `eventBus` 前新增必填字段：
```ts
export interface DomainMutationServiceDeps {
  /** 按 objectType 取得仓储适配器 */
  getRepository: (objectType: string, domainId: string) => GenericRepo
  /** 取得字段执行器（T6 真实实现 / 测试 mock） */
  getExecutor: () => FieldExecutor
  /** 按 domainId+objectType 取得 field_metadata（取自 manifest） */
  getFieldMetadata: (domainId: string, objectType: string) => Record<string, FieldMetadata>
  /** 单字段写路径用的 submitDynamicIntent（遗留，update() 已不使用；保留兼容） */
  submitDynamicIntent?: SubmitDynamicIntentFn
  /**
   * FactField 字段写完成发布的事件类型（per-domain 显式配置，F-6）。
   * tasks → 'TaskFieldUpdated'，habits → 'HabitFieldUpdated'。
   * 透传进 FieldExecutorContext.fieldUpdatedEventType。
   */
  fieldUpdatedEventType: SystemEventType
  /** 事件总线（execute 路径透传给 SM） */
  eventBus: EventBus
  /** db.transaction 别名（execute 路径用）；缺省时不开启顶层事务 */
  transaction?: TransactionFn
  /** tx 版 SM.execute 别名（execute 路径用） */
  smExecute?: SmExecuteFn
}
```

(c) `createDomainMutationService` 解构（原 182-189 行）增加 `fieldUpdatedEventType`：
```ts
  const {
    getRepository,
    getExecutor,
    getFieldMetadata,
    eventBus,
    transaction,
    smExecute,
    fieldUpdatedEventType,
  } = deps
```

(d) `update()` 内构造 ctx 处（原 242-250 行）增加 `fieldUpdatedEventType`：
```ts
            {
              repo,
              eventBus,
              objectType,
              fieldMetadata,
              fieldUpdatedEventType,
              // update() 单字段写为原子单元，不开顶层事务（与 execute() 聚合路径不同）
              tx: undefined,
            }
```

(e) `execute()` 内构造 ctx 处（原 333-339 行）增加 `fieldUpdatedEventType`：
```ts
                {
                  repo,
                  eventBus,
                  objectType: stepObjectType,
                  fieldMetadata,
                  fieldUpdatedEventType,
                  tx,
                }
```

(f) 文件内 4 处注释「TaskFieldUpdated」（原 10、48、209、233 行）措辞改为「域配置的字段更新事件」或「ctx.fieldUpdatedEventType」（保持语义即可，逐字不强求）。

- [ ] **Step 5: 更新 dispatch.test.ts，补 deps 字段 + ctx 透传断言**

修改 `src/nexus/domain-mutation-service/__tests__/dispatch.test.ts`：

(a) 在全部 **5 处** `createDomainMutationService({...} as any)` 的 deps 对象里补 `fieldUpdatedEventType: 'TaskFieldUpdated'`（与现有 `getRepository`/`getExecutor`/`getFieldMetadata` 并列）。例如第一处（原 51-57 行）：
```ts
    const service = createDomainMutationService({
      getRepository: () => repo,
      getExecutor: () => executor,
      getFieldMetadata: () => FIELD_META,
      fieldUpdatedEventType: 'TaskFieldUpdated',
      eventBus: { publish: vi.fn() } as any,
      submitDynamicIntent,
    } as any)
```
对其余 4 处（原 76、97、128、180 行附近）同样补一行 `fieldUpdatedEventType: 'TaskFieldUpdated',`。

(b) 在「FactField → 直连字段执行器」用例（原 46-69 行）的断言里，把对 `executor.execute` 的断言（原 63-66 行）改为同时校验 ctx 透传 `fieldUpdatedEventType`：
```ts
    expect(executor.execute).toHaveBeenCalledWith(
      'task-1', 'priority', 'high', 'user-1',
      expect.objectContaining({
        objectType: 'task',
        fieldUpdatedEventType: 'TaskFieldUpdated',
      }),
    )
```

- [ ] **Step 6: 跑测试，确认全绿**

Run: `cd frontend && npx vitest run src/nexus/field-executor/__tests__/index.test.ts src/nexus/domain-mutation-service/__tests__/dispatch.test.ts 2>&1 | tail -25`

Expected: 两个文件全部 PASS（含新增 `HabitFieldUpdated` 用例、含 ctx 透传断言）。

- [ ] **Step 7: 跑类型检查，确认无 ctx/deps 缺字段错误**

Run: `cd frontend && npx tsc --noEmit -p . 2>&1 | grep -iE "fieldUpdatedEventType|FieldExecutorContext|DomainMutationServiceDeps" && echo "TS ERRORS" || echo "OK"`

Expected: 输出 `OK`（两处 ctx 与 deps 都已补字段，无遗漏）。

- [ ] **Step 8: Commit**

```bash
cd frontend
git add src/nexus/field-executor/index.ts src/nexus/field-executor/__tests__/index.test.ts src/nexus/domain-mutation-service/index.ts src/nexus/domain-mutation-service/__tests__/dispatch.test.ts
git commit -m "feat(nexus): F-6 field-executor 事件名参数化（per-domain fieldUpdatedEventType）

- FieldExecutorContext + DomainMutationServiceDeps 新增必填 fieldUpdatedEventType: SystemEventType
- field-executor.execute() 用 ctx.fieldUpdatedEventType 替代硬编码 TaskFieldUpdated
- domainMutationService 两处 ctx 注入透传该字段
- 测试：field-executor 引入 makeCtx helper + 新增 HabitFieldUpdated 用例；dispatch 断言 ctx 透传

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: 公共工厂 createDomainMutationServiceFactory

**Files:**
- Create: `src/nexus/domain-mutation-service/factory.ts`
- Test: `src/nexus/domain-mutation-service/__tests__/factory.test.ts`

- [ ] **Step 1: 写失败测试（RED）**

新建 `src/nexus/domain-mutation-service/__tests__/factory.test.ts`：

```ts
/**
 * @file factory.test
 * @brief 公共工厂 createDomainMutationServiceFactory 单测（G2）
 *
 * 验证公共工厂产出的 service：
 *  - getRepository 按 objectType 路由；未知 objectType 抛带 repoLabel 的错
 *  - getFieldMetadata 读对 manifest（mock registry，不耦合真实 manifest 内容）
 *  - fieldUpdatedEventType 透传进 deps（通过拦截字段执行器 ctx 验证）
 *  - update(ContentField) 直走 repo.updateFields
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GenericRepo } from '@/nexus/core/state-machine'

// ─── Mock registry（返回受控 manifest：priority=FactField / title=ContentField）──
vi.mock('@/domains/registry', () => ({
  getFullManifest: () => ({
    field_metadata: {
      priority: { type: 'enum', label: '优先级', required: false, options: ['high', 'low'], mutation_mode: 'FactField' },
      title: { type: 'string', label: '标题', required: true, mutation_mode: 'ContentField' },
    },
    lifecycle: { task: { initial: 'todo', states: {} } },
  }),
}))

// ─── Mock 字段执行器（拦截 FactField 路径，观察 ctx.fieldUpdatedEventType） ──
const executorExecuteMock = vi.fn()
vi.mock('@/nexus/field-executor', () => ({
  createFieldExecutor: () => ({ execute: executorExecuteMock }),
}))

// ─── Mock SystemEventRepository / db（避免触达 DB；update() 路径不触 SM） ──
vi.mock('@/lib/db/repositories/system-event.repository', () => ({
  SystemEventRepository: vi.fn(function (this: any) {
    return {}
  }),
}))
vi.mock('@/lib/db', () => ({ db: {} }))

import { createDomainMutationServiceFactory } from '../factory'

/** 构造一个最简 GenericRepo 桩。 */
function makeRepo(): GenericRepo {
  return {
    findById: vi.fn().mockResolvedValue({ id: 't-1' }),
    save: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({}),
    updateStatus: vi.fn().mockResolvedValue({}),
    updateFields: vi.fn().mockResolvedValue({ id: 't-1' }),
  } as GenericRepo
}

describe('G2 createDomainMutationServiceFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    executorExecuteMock.mockResolvedValue({ kind: 'Passed' })
  })

  it('fieldUpdatedEventType 透传进字段执行器 ctx（tasks → TaskFieldUpdated）', async () => {
    const repo = makeRepo()
    const service = createDomainMutationServiceFactory({
      domainId: 'tasks',
      repos: { task: repo },
      fieldUpdatedEventType: 'TaskFieldUpdated',
      repoLabel: 'Tasks',
    })

    // priority 在 mock manifest 标为 FactField
    const res = await service.update('t-1', 'priority', 'high', 'u-1', 'tasks', 'task')

    expect(res.success).toBe(true)
    expect(executorExecuteMock).toHaveBeenCalledTimes(1)
    const ctx = executorExecuteMock.mock.calls[0][4]
    expect(ctx.fieldUpdatedEventType).toBe('TaskFieldUpdated')
  })

  it('getRepository 未知 objectType 抛带 repoLabel 的错', async () => {
    const repo = makeRepo()
    const service = createDomainMutationServiceFactory({
      domainId: 'tasks',
      repos: { task: repo },
      fieldUpdatedEventType: 'TaskFieldUpdated',
      repoLabel: 'Tasks',
    })

    await expect(
      service.update('t-1', 'title', 'x', 'u-1', 'tasks', 'unknown-type'),
    ).rejects.toThrow(/未找到 Tasks 仓储 unknown-type/)
  })

  it('update(ContentField) 直走 repo.updateFields', async () => {
    const repo = makeRepo()
    const service = createDomainMutationServiceFactory({
      domainId: 'tasks',
      repos: { task: repo },
      fieldUpdatedEventType: 'TaskFieldUpdated',
    })

    // title 在 mock manifest 标为 ContentField
    const res = await service.update('t-1', 'title', '新标题', 'u-1', 'tasks', 'task')

    expect(res.success).toBe(true)
    expect(repo.updateFields).toHaveBeenCalledWith('t-1', { title: '新标题' }, 'u-1')
    expect(executorExecuteMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试，确认失败（模块不存在）**

Run: `cd frontend && npx vitest run src/nexus/domain-mutation-service/__tests__/factory.test.ts 2>&1 | tail -20`

Expected: FAIL，报 `Failed to resolve import "../factory"`（模块尚未创建）。

- [ ] **Step 3: 实现公共工厂（GREEN）**

新建 `src/nexus/domain-mutation-service/factory.ts`：

```ts
/**
 * @file factory
 * @brief 域业务事实写入口公共组装工厂（G2 切片）
 *
 * 下沉 tasks/habits 两域 createXxxMutationService() 共用的六项组装
 * （getRepository/getFieldMetadata/smExecute/eventBus/transaction/getExecutor）
 * + 透传 per-domain 的 fieldUpdatedEventType（F-6）。每域工厂只保留域间差异：
 * domainId / repos / fieldUpdatedEventType / repoLabel。
 *
 * 层次归属：本工厂属 Nexus 层（组装用的是 Nexus 内部件：createFieldExecutor /
 * createGenericStateMachine / createEventBus）。每域 src/app/actions/* 只负责
 * domain repo wiring（new Repository + generic-repo-adapter），调用本工厂。
 *
 * @see docs/superpowers/specs/2026-06-19-domain-mutation-service-factory-design.md
 * @see 宪法 §III 业务事实写入口（1.11.0）
 */
import {
  createDomainMutationService,
  type DomainMutationService,
} from './index'
import { createFieldExecutor } from '@/nexus/field-executor'
import { createGenericStateMachine } from '@/nexus/core/state-machine'
import { createEventBus } from '@/nexus/infrastructure/event-bus'
import { getFullManifest } from '@/domains/registry'
import { SystemEventRepository } from '@/lib/db/repositories/system-event.repository'
import { db } from '@/lib/db'
import type { DbClient } from '@/lib/db'
import type { EventBus } from '@/nexus/infrastructure/event-bus'
import type { GenericRepo } from '@/nexus/core/state-machine'
import type { FieldMetadata } from '@/usom/types/domain-types'
import type { SystemEventType } from '@/usom/types/process'
import type { USOM_ID } from '@/usom/types/primitives'

/** 每域工厂入参（只关心域间差异：domainId / repos / 事件名 / 仓储标签）。 */
export interface DomainMutationServiceFactoryOptions {
  /** 域固定 ID（读 manifest / 组装 SM 用） */
  domainId: string
  /** objectType → GenericRepo 适配器映射（由各域 generic-repo-adapter 产出） */
  repos: Record<string, GenericRepo>
  /** FactField 字段写发出的事件类型（per-domain，F-6 方案 A） */
  fieldUpdatedEventType: SystemEventType
  /** 仓储缺失错误信息里的域标签，缺省取 domainId */
  repoLabel?: string
}

/**
 * 组装任一域业务事实写入口服务（下沉 tasks/habits 共用的六项组装）。
 *
 * getRepository 单参、getFieldMetadata 双参签名忽略 domainId —— 接口虽要求双参，
 * TS 协变允许少参赋多参，运行等价于原每域实现。domainId 在闭包内固定。
 *
 * @param opts - 域差异入参
 * @returns 业务事实写入口服务
 */
export function createDomainMutationServiceFactory(
  opts: DomainMutationServiceFactoryOptions,
): DomainMutationService {
  const { domainId, repos, fieldUpdatedEventType, repoLabel = domainId } = opts
  const eventRepo = new SystemEventRepository()
  const eventBus = createEventBus()

  /** 按 objectType 取得仓储适配器（domainId 在闭包固定，故单参）。 */
  function getRepository(objectType: string): GenericRepo {
    const repo = repos[objectType]
    if (!repo) throw new Error(`getRepository: 未找到 ${repoLabel} 仓储 ${objectType}`)
    return repo
  }

  /** 从本域 manifest 读取 field_metadata（domainId 在闭包固定，忽略入参）。 */
  function getFieldMetadata(
    _domainId: string,
    _objectType: string,
  ): Record<string, FieldMetadata> {
    const manifest = getFullManifest(domainId)
    return (manifest?.field_metadata as Record<string, FieldMetadata> | undefined) ?? {}
  }

  /** 构建 tx 版 SM.execute 闭包（按 proposal.targetObject.type 取 repo/lifecycle）。 */
  function smExecute(
    proposal: unknown,
    smBus: EventBus,
    userId: USOM_ID,
    tx?: DbClient,
  ) {
    const p = proposal as {
      targetObject: { type: string }
      action: string
      payload: Record<string, unknown>
      id: USOM_ID
      intentId: USOM_ID
    }
    const objectType = p.targetObject.type

    const sm = createGenericStateMachine({
      getRepository: () => getRepository(objectType),
      eventRepo,
      getLifecycle: (d, objType) => {
        const manifest = getFullManifest(d)
        const lc = manifest?.lifecycle?.[objType]
        if (!lc) throw new Error(`未找到 lifecycle: ${d}/${objType}`)
        return lc as any
      },
      getFieldMetadata,
      domainId,
    })

    return sm.execute(p as any, smBus, userId, tx)
  }

  return createDomainMutationService({
    getRepository: (objectType: string) => getRepository(objectType),
    getExecutor: () => createFieldExecutor(),
    getFieldMetadata,
    eventBus,
    transaction: <T,>(cb: (tx: any) => Promise<T>): Promise<T> =>
      db.transaction(cb as any) as unknown as Promise<T>,
    smExecute: smExecute as any,
    fieldUpdatedEventType,
  })
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd frontend && npx vitest run src/nexus/domain-mutation-service/__tests__/factory.test.ts 2>&1 | tail -20`

Expected: 全部 PASS（3 个用例）。测试已 mock `@/domains/registry`（priority=FactField、title=ContentField），不依赖真实 manifest 内容，确定性通过。

- [ ] **Step 5: 跑类型检查**

Run: `cd frontend && npx tsc --noEmit -p . 2>&1 | grep -i "factory" && echo "TS ERRORS" || echo "OK"`

Expected: `OK`。

- [ ] **Step 6: Commit**

```bash
cd frontend
git add src/nexus/domain-mutation-service/factory.ts src/nexus/domain-mutation-service/__tests__/factory.test.ts
git commit -m "feat(nexus): 抽 createDomainMutationServiceFactory 公共工厂（G2）

下沉 tasks/habits 共用的六项组装 + 透传 per-domain fieldUpdatedEventType。
N=2 已达成，两域工厂将瘦到 ~30 行。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: habits mutation-service 瘦化 + 事件名修正（HabitFieldUpdated）

**Files:**
- Modify: `src/app/actions/habits/mutation-service.ts`（整体重写为瘦版）
- Test: `src/app/actions/habits/__tests__/mutation-service.test.ts`（加 fieldUpdatedEventType 断言）

- [ ] **Step 1: 写失败测试（RED）**

修改 `src/app/actions/habits/__tests__/mutation-service.test.ts` 的「FactField 字段走字段执行器路径」用例（原 70-94 行），在现有 `ctx.objectType` 断言（原 91 行）后新增 F-6 端到端断言：

```ts
    expect(ctx.objectType).toBe('habit')
    // F-6：事件名透传为 per-domain 的 HabitFieldUpdated
    expect(ctx.fieldUpdatedEventType).toBe('HabitFieldUpdated')
    // FactField 路径不直走 repo.updateFields
    expect(habitUpdateFieldsMock).not.toHaveBeenCalled()
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd frontend && npx vitest run src/app/actions/habits/__tests__/mutation-service.test.ts 2>&1 | tail -20`

Expected: FAIL —— `ctx.fieldUpdatedEventType` 为 `undefined`（当前 habits 工厂未注入该字段，field-executor 虽已在 Task 2 支持，但 habits 的 deps 还没传）。

- [ ] **Step 3: 瘦化 habits mutation-service（GREEN）**

把 `src/app/actions/habits/mutation-service.ts` **整体替换**为：

```ts
/**
 * @file mutation-service
 * @brief Habits 域业务事实写入口组装（G2：调公共工厂）
 *
 * G2 切片起改调 src/nexus/domain-mutation-service/factory.ts 的公共工厂，
 * 仅保留 Habits 域差异：domainId / repos（habit + habit_log）/ 事件名
 * HabitFieldUpdated（F-6 修正，原 G1 硬编码 TaskFieldUpdated 为语义错误）。
 * 六项组装（getRepository/getFieldMetadata/smExecute/eventBus/transaction/
 * getExecutor）已下沉到公共工厂。
 *
 * @see docs/superpowers/specs/2026-06-19-domain-mutation-service-factory-design.md
 * @see src/nexus/domain-mutation-service/factory.ts
 */
import { createDomainMutationServiceFactory } from '@/nexus/domain-mutation-service/factory'
import { createHabitsGenericRepo } from '@/domains/habits/repository/generic-repo-adapter'
import { HabitRepository } from '@/domains/habits/repository/habit'
import { HabitLogRepository } from '@/domains/habits/repository/habit-log'
import type { DomainMutationService } from '@/nexus/domain-mutation-service'

/**
 * 组装 Habits 域业务事实写入口服务实例。
 *
 * 每次调用产生独立服务实例（含独立 eventRepo / eventBus），保证事务隔离与可测试性。
 * @returns 业务事实写入口服务
 */
export function createHabitsMutationService(): DomainMutationService {
  const repos = createHabitsGenericRepo({
    habitRepo: new HabitRepository() as any,
    habitLogRepo: new HabitLogRepository() as any,
  })
  return createDomainMutationServiceFactory({
    domainId: 'habits',
    repos,
    fieldUpdatedEventType: 'HabitFieldUpdated',
    repoLabel: 'Habits',
  })
}
```

- [ ] **Step 4: 跑 habits mutation-service 测试，确认通过**

Run: `cd frontend && npx vitest run src/app/actions/habits/__tests__/mutation-service.test.ts 2>&1 | tail -20`

Expected: 全部 PASS（3 个用例，含新增 `fieldUpdatedEventType === 'HabitFieldUpdated'` 断言、含「未知 objectType 抛 `未找到 Habits 仓储`」）。

- [ ] **Step 5: 跑 write-entry-guard 守卫，确认仍绿（瘦化未引入直写）**

Run: `cd frontend && npx vitest run src/app/actions/habits/__tests__/write-entry-guard.test.ts 2>&1 | tail -15`

Expected: PASS（瘦版用 `habitRepo: new HabitRepository()` 属性键，不命中 `habitRepo.update(` 守卫模式）。

- [ ] **Step 6: 跑 update-habit 集成测试（真实 PG），确认契约不破**

Run: `cd frontend && npx vitest run src/app/actions/habits/__tests__/update-habit.integration.test.ts 2>&1 | tail -25`

Expected: 全部 PASS（经 updateHabit → intent → createHabitsMutationService → 公共工厂，行为等价）。

- [ ] **Step 7: Commit**

```bash
cd frontend
git add src/app/actions/habits/mutation-service.ts src/app/actions/habits/__tests__/mutation-service.test.ts
git commit -m "refactor(habits): mutation-service 瘦化调公共工厂 + F-6 事件名修正 HabitFieldUpdated（G2）

- createHabitsMutationService 由 ~80 行模板缩为 ~30 行（new repo + adapter + 调工厂）
- fieldUpdatedEventType 改为 HabitFieldUpdated（修正 G1 硬编码 TaskFieldUpdated 的语义错误）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: tasks mutation-service 瘦化（零行为变更）

**Files:**
- Modify: `src/app/actions/tasks/mutation-service.ts`（整体重写为瘦版）

**Regression invariant:** tasks 域行为逐字节不变——仍发 `TaskFieldUpdated`，task+thread 同名。

- [ ] **Step 1: 瘦化 tasks mutation-service**

把 `src/app/actions/tasks/mutation-service.ts` **整体替换**为：

```ts
/**
 * @file mutation-service
 * @brief Tasks 域业务事实写入口组装（G2：调公共工厂）
 *
 * G2 切片起改调 src/nexus/domain-mutation-service/factory.ts 的公共工厂，
 * 仅保留 Tasks 域差异：domainId / repos（task + thread）/ 事件名
 * TaskFieldUpdated（F-6 per-domain 显式配置，与 G1 硬编码值一致——零行为变更）。
 * 六项组装已下沉到公共工厂。
 *
 * @see docs/superpowers/specs/2026-06-19-domain-mutation-service-factory-design.md
 * @see src/nexus/domain-mutation-service/factory.ts
 */
import { createDomainMutationServiceFactory } from '@/nexus/domain-mutation-service/factory'
import { createTasksGenericRepo } from '@/domains/tasks/repository/generic-repo-adapter'
import { TaskRepository } from '@/domains/tasks/repository/task'
import { ThreadRepository } from '@/domains/tasks/repository/thread'
import type { DomainMutationService } from '@/nexus/domain-mutation-service'

/**
 * 组装 Tasks 域业务事实写入口服务实例。
 *
 * 每次调用产生独立服务实例（含独立 eventRepo / eventBus），保证事务隔离与可测试性。
 * @returns 业务事实写入口服务
 */
export function createTasksMutationService(): DomainMutationService {
  const repos = createTasksGenericRepo({
    taskRepo: new TaskRepository() as any,
    threadRepo: new ThreadRepository() as any,
  })
  return createDomainMutationServiceFactory({
    domainId: 'tasks',
    repos,
    fieldUpdatedEventType: 'TaskFieldUpdated',
    repoLabel: 'Tasks',
  })
}
```

- [ ] **Step 2: 跑 tasks 全套测试，确认零回归**

Run: `cd frontend && npx vitest run src/app/actions/tasks/ 2>&1 | tail -25`

Expected: tasks 下全部测试 PASS（migration / promote-to-thread / complete-task 集成测试）。migration.test.ts mock 了 `createTasksMutationService`，不受实现替换影响；集成测试走真实链路，行为等价。

- [ ] **Step 3: 跑类型检查**

Run: `cd frontend && npx tsc --noEmit -p . 2>&1 | grep -iE "tasks/mutation-service|createTasksMutationService" && echo "TS ERRORS" || echo "OK"`

Expected: `OK`（tasks.ts 4 处调用方签名不变）。

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/app/actions/tasks/mutation-service.ts
git commit -m "refactor(tasks): mutation-service 瘦化调公共工厂（G2，零行为变更）

createTasksMutationService 由 ~80 行模板缩为 ~30 行；fieldUpdatedEventType=TaskFieldUpdated
与 G1 硬编码值一致，tasks 行为逐字节不变。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: 文档同步（usom-design §4.4 + manifest）

**Files:**
- Modify: `docs/usom-design.md`（§4.4 域落地状态表）
- Modify: `manifest.md`（版本历史表）

- [ ] **Step 1: 更新 usom-design §4.4 域落地状态表**

在 `docs/usom-design.md` §4.4「域落地状态」表中（tasks✓ / habits✓[018-G1] 行附近），为 habits 行追加「公共工厂已抽 + F-6 已参数化（HabitFieldUpdated）」注记，并新增一行说明「公共工厂 `createDomainMutationServiceFactory`（G2）已抽，tasks/habits 工厂瘦到 ~30 行」。具体措辞参照该表现有风格（先 Read 该表段定位精确位置，再用 Edit 改）。

- [ ] **Step 2: 更新 manifest.md 版本历史**

在 `manifest.md` 版本历史表**末尾**新增一行（参照 `[018-G1]` 行格式）：

```markdown
| USOM 详细设计 | 2026_06_19 | 2026_06_19 | [018-G2] 公共工厂抽象：抽 `createDomainMutationServiceFactory`（tasks/habits 工厂瘦到 ~30 行）；F-6 field-executor 事件名参数化（per-domain fieldUpdatedEventType，tasks=TaskFieldUpdated 零变更，habits=HabitFieldUpdated 修正）；SystemEventType 新增 HabitFieldUpdated |
```

（核对：上一行 USOM 详细设计的「当前版本」列为 `2026_06_19`、上一版本 `2026_06_18`。本行「当前版本」取今日实际提交日期，「上一版本」取 `2026_06_19`。以实际 commit 日期为准，勿写错。）

- [ ] **Step 3: Commit**

```bash
cd /home/walker/lifeware
git add docs/usom-design.md manifest.md
git commit -m "docs: 同步 [018-G2] 公共工厂 + F-6 事件名参数化（usom-design §4.4 + manifest）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: 全量回归 + 守卫 grep

**Files:** 无（仅验证）

- [ ] **Step 1: grep 守卫 — field-executor 不再硬编码 TaskFieldUpdated**

Run: `cd frontend && grep -n "TaskFieldUpdated" src/nexus/field-executor/index.ts && echo "STILL HARDCODED" || echo "OK"`

Expected: `OK`（`index.ts` 内不再出现 `TaskFieldUpdated` 字面量——已参数化为 `ctx.fieldUpdatedEventType`；注释也已改为通用措辞）。

- [ ] **Step 2: grep 确认 HabitFieldUpdated 已贯通**

Run: `cd frontend && grep -rn "HabitFieldUpdated" src/usom/types/process.ts src/nexus/domain-mutation-service/factory.ts src/app/actions/habits/mutation-service.ts 2>/dev/null`

Expected: 3 行命中（union 定义 + 工厂无——工厂不写死字面量，仅 habits/mutation-service 传值；实际命中应为 `process.ts` 与 `habits/mutation-service.ts` 两处；factory.ts 不含该字面量属正常）。

- [ ] **Step 3: 跑全量测试，比对基线（21 预存失败，0 新增）**

Run: `cd frontend && npm test 2>&1 | tail -40`

Expected:
- 全量测试运行完成。
- **失败数 == 21**（与本切片前基线一致；这些是历史预存失败，与本切片无关）。
- 新增/修改的测试（factory / field-executor HabitFieldUpdated / dispatch ctx 透传 / habits mutation-service fieldUpdatedEventType）全部 PASS。

若失败数 > 21：定位新增失败用例，修复后重跑，直至失败数回到 21。

- [ ] **Step 4: 跑类型检查（全局兜底）**

Run: `cd frontend && npx tsc --noEmit -p . 2>&1 | tail -20`

Expected: 无 error（或仅与基线一致的既有告警）。若出现 `fieldUpdatedEventType` / `FieldExecutorContext` / `DomainMutationServiceDeps` 相关 error，回查 Task 2 两处 ctx 与 deps 是否都已补字段。

- [ ] **Step 5: 汇总验证结果**

汇总：测试失败数、tsc 状态、grep 守卫状态、本切片 5 个 commit。如实报告，不得声称未跑的验证已通过。

---

## 完成判定（Definition of Done）

1. `createDomainMutationServiceFactory` 存在于 `src/nexus/domain-mutation-service/factory.ts`，被 tasks/habits 两工厂调用；两工厂各 ≤ ~35 行。
2. `src/nexus/field-executor/index.ts` 不含硬编码 `TaskFieldUpdated`（grep 0 命中）。
3. habits 字段写发 `HabitFieldUpdated`（factory.test + habits mutation-service.test 断言）；tasks 仍发 `TaskFieldUpdated`（field-executor test + dispatch test 断言）。
4. `SystemEventType` 含 `'HabitFieldUpdated'`。
5. `npm test` 失败数 == 21（0 新增回归），tsc 无新 error。
6. `docs/usom-design.md` §4.4 + `manifest.md` 同步。

## 后续（不在本切片）

- okrs / timebox 写入口（重大重构，推迟）。
- HH_MM_REGEX 公共校验工厂抽取。
- ValidationResult 3→5 变体 / Suspend CNUI 回环（第二组）。
