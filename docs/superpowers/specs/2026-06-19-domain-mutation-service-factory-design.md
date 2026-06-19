# 业务事实写入口公共工厂抽象设计（G2 切片）

> 切片代号：G2（[018] 后续第一组「公共工厂抽象」活跃切片）
> 创建：2026-06-19
> 关联：[[018-G1] habits 写入口切片（961f070）] · 宪法 §III 1.11.0 业务事实写入口
> 上游计划：`~/.gstack/projects/walker2002-lifeware/018-g1-vertical-replication-plan.md`

## 1. 背景与动机

[018-G1] 已把 tasks、habits 两域的业务事实写入口落地：每域各自一个 `createXxxMutationService()` 工厂，照同一模板组装 `createDomainMutationService(deps)`。两工厂现在**结构同构**（N=2 已达成），仅三处差异：

| 差异点 | tasks | habits |
|---|---|---|
| 域 ID 常量 | `'tasks'` | `'habits'` |
| repo 实例化 | `createTasksGenericRepo({taskRepo, threadRepo})` | `createHabitsGenericRepo({habitRepo, habitLogRepo})` |
| 错误串 | `未找到 Tasks 仓储` | `未找到 Habits 仓储` |

模板复制带来的重复（getRepository/getFieldMetadata/smExecute/eventBus/transaction 六项组装，~80 行）已是明确的可下沉代码。

同时 G1 遗留 **F-6**：`field-executor.execute()` 在 `src/nexus/field-executor/index.ts:151` **硬编码** `type: 'TaskFieldUpdated'`。habits 域字段写因此发出**语义错误的事件名**（habit 字段更新却发 `TaskFieldUpdated`）。G1 切片仅注释标注，约定本切片参数化。

**本切片两件事**：① 抽 `createDomainMutationServiceFactory`；② F-6 事件名参数化（方案 A：显式 per-domain 配置）。

## 2. 目标与非目标

### 目标（IN）
- **G2-1 抽公共工厂**：新建 `src/nexus/domain-mutation-service/factory.ts`，导出 `createDomainMutationServiceFactory(opts)`，下沉六项组装；tasks/habits 每域工厂瘦到 ~8 行。
- **G2-2 F-6 事件名参数化**：`FieldExecutorContext` + `DomainMutationServiceDeps` 新增 `fieldUpdatedEventType`，field-executor 用 `ctx.fieldUpdatedEventType` 替代硬编码；tasks→`TaskFieldUpdated`（不变）、habits→`HabitFieldUpdated`（修正）。
- **G2-3 SystemEventType 扩展**：`src/usom/types/process.ts` 联合补 `'HabitFieldUpdated'`。
- **G2-4 getRepository/getFieldMetadata 签名收口**：公共工厂内统一为「忽略冗余 domainId 参数」的实现，消除单参/双参 smell（TS 协变天然兼容）。
- **G2-5 文档同步**：`docs/usom-design.md` §4.4 域落地状态表 + `manifest.md`。

### 非目标（OUT）
- **HH_MM_REGEX 去重**（field-executor 与 habits/validation.ts 各一份）：独立的「公共校验工厂」关注，本切片不动（field-executor 注释已标注）。
- **okrs/timebox 写入口工厂**：推迟到后续重大重构（见 `[[project-018-followup-todos]]`）。
- **smExecute / getLifecycle 进一步抽象**（如按域统一 lifecycle 读取）：YAGNI，两域实现一致但抽不出更简的形式。
- **thread→`ThreadFieldUpdated` 细分**：per-domain 粒度下 tasks 域 task+thread 都发 `TaskFieldUpdated`（保持现状），thread 细分踢出（无订阅者，YAGNI）。
- **ValidationResult 3→5 变体 / Suspend 回环**：属第二组判定模型，与本切片无关。

## 3. 现状分析

### 3.1 两工厂同构（已核对源码）

`src/app/actions/tasks/mutation-service.ts`（131 行）与 `src/app/actions/habits/mutation-service.ts`（143 行）逐行对应，仅上表三处差异。`createXxxMutationService()` 内部：

1. `new` 各 Repository + `SystemEventRepository` + `makeEventBus()`；
2. `createXxxGenericRepo({...})` 产出 `Record<objectType, GenericRepo>`；
3. `getRepository(objectType)` —— 单参，`repos[objectType]` 取值，缺失抛错；
4. `getFieldMetadata(_domainId, _objectType)` —— 双参签名但忽略参数，读 `getFullManifest(DOMAIN_ID).field_metadata`；
5. `smExecute(proposal, smBus, userId, tx?)` —— 按 `proposal.targetObject.type` 取 repo/lifecycle，`createGenericStateMachine({domainId}).execute(...)`；
6. `createDomainMutationService({getRepository, getExecutor, getFieldMetadata, eventBus, transaction, smExecute})`。

### 3.2 F-6 接线链（现状）

```
field-executor.execute()  ← 硬编码 type:'TaskFieldUpdated' (index.ts:151)
        ▲ ctx 由谁构造？
domainMutationService:
  update()   构造 ctx {repo, eventBus, objectType, fieldMetadata, tx:undefined}     (index.ts:242-250)
  execute()  构造 ctx {repo, eventBus, objectType, fieldMetadata, tx}              (index.ts:333-339)
        ▲ deps 从哪来？
createXxxMutationService() 注入 DomainMutationServiceDeps
```

要让事件名可参数化，链路需打通：**deps → ctx → field-executor**。两处 ctx 构造点都要注入。

### 3.3 getRepository 单参 / 双参 smell

`DomainMutationServiceDeps.getRepository` 接口签名是 `(objectType, domainId) => GenericRepo`（双参，`index.ts:86`），domainMutationService 内部两处都用 `getRepository(objectType, domainId)` 调用（`index.ts:230,318`）。但每域实现是单参（`objectType`）+ 忽略 domainId（域 ID 在闭包里固定）。TS 协变允许「少参函数赋给多参接口」，运行正确，仅视觉不一致。公共工厂统一此模式后，smell 消解（模式显式化即合规）。

## 4. 设计

### 4.1 公共工厂 `createDomainMutationServiceFactory`

**位置**：`src/nexus/domain-mutation-service/factory.ts`（新建，与 `index.ts` 并列——`index.ts` 仍持有核心服务逻辑与类型，`factory.ts` 持有按域组装的辅助）。

**签名**：

```ts
import { createDomainMutationService, type DomainMutationService } from './index'
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

/** 每域工厂的入参（只关心域间差异的三项 + 事件名） */
export interface DomainMutationServiceFactoryOptions {
  /** 域固定 ID（读 manifest / 组装 SM 用） */
  domainId: string
  /** objectType → GenericRepo 适配器映射（由各域 generic-repo-adapter 产出） */
  repos: Record<string, GenericRepo>
  /** FactField 字段写发出的事件类型（per-domain，方案 A）；类型为 SystemEventType 保证只接受已声明事件名 */
  fieldUpdatedEventType: SystemEventType
  /** 仓储缺失错误信息里的域标签，缺省取 domainId */
  repoLabel?: string
}

/** 组装任一域业务事实写入口服务（下沉 tasks/habits 共用的六项组装）。 */
export function createDomainMutationServiceFactory(
  opts: DomainMutationServiceFactoryOptions,
): DomainMutationService {
  const { domainId, repos, fieldUpdatedEventType, repoLabel = domainId } = opts
  const eventRepo = new SystemEventRepository()
  const eventBus = createEventBus()

  function getRepository(objectType: string): GenericRepo {
    const repo = repos[objectType]
    if (!repo) throw new Error(`getRepository: 未找到 ${repoLabel} 仓储 ${objectType}`)
    return repo
  }

  function getFieldMetadata(_domainId: string, _objectType: string): Record<string, FieldMetadata> {
    const manifest = getFullManifest(domainId)
    return (manifest?.field_metadata as Record<string, FieldMetadata> | undefined) ?? {}
  }

  function smExecute(proposal: unknown, smBus: EventBus, userId: USOM_ID, tx?: DbClient) {
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
    fieldUpdatedEventType, // ★ 新注入
  })
}
```

> `getRepository(objectType)` 单参 + `getFieldMetadata(_d,_o)` 忽略双参 —— 接口双参、实现单参，TS 协变兼容（少参赋多参合法），运行等价于现状。smell 通过「模式在公共工厂集中显式化」消解。

### 4.2 F-6 事件名参数化接线

链路打通（4 个改动点，全在已有文件）：

| # | 文件 | 改动 |
|---|---|---|
| ① | `src/nexus/field-executor/index.ts` | `FieldExecutorContext` 加 `fieldUpdatedEventType: SystemEventType`（从 `@/usom/types/process` 引入，与已有 `SystemEvent` 同模块）；`execute()` 发事件 `type: ctx.fieldUpdatedEventType`（替 index.ts:151 硬编码，无需 cast）。文件头注释「发布通用 TaskFieldUpdated」改为「发布域配置的字段更新事件」。 |
| ② | `src/nexus/domain-mutation-service/index.ts` | `DomainMutationServiceDeps` 加 `fieldUpdatedEventType: SystemEventType`；`update()` 与 `execute()` 两处构造 ctx 时填 `fieldUpdatedEventType: deps.fieldUpdatedEventType`。 |
| ③ | `src/usom/types/process.ts` | `SystemEventType` 联合末尾补 `'HabitFieldUpdated'`（紧随 `'TaskFieldUpdated'`）。 |
| ④ | 4.1 公共工厂 | `opts.fieldUpdatedEventType` 透传进 `createDomainMutationService` deps。 |

**粒度=per-domain**：一个 service 一个静态事件名（非 per-objectType getter）。tasks 域 → `TaskFieldUpdated`（task + thread 都发此名，**与现状逐字节一致**）；habits 域 → `HabitFieldUpdated`（修正语义错误）。

### 4.3 每域工厂瘦化

`src/app/actions/tasks/mutation-service.ts` 与 `src/app/actions/habits/mutation-service.ts` 各自缩为「new repo + adapter + 调公共工厂」：

```ts
// tasks（瘦化后约 30 行含文件头）
import { createDomainMutationServiceFactory } from '@/nexus/domain-mutation-service/factory'
import { createTasksGenericRepo } from '@/domains/tasks/repository/generic-repo-adapter'
import { TaskRepository } from '@/domains/tasks/repository/task'
import { ThreadRepository } from '@/domains/tasks/repository/thread'
import type { DomainMutationService } from '@/nexus/domain-mutation-service'

const TASKS_FIELD_UPDATED_EVENT = 'TaskFieldUpdated' // per-domain 显式配置（F-6 方案 A）

export function createTasksMutationService(): DomainMutationService {
  const repos = createTasksGenericRepo({
    taskRepo: new TaskRepository() as any,
    threadRepo: new ThreadRepository() as any,
  })
  return createDomainMutationServiceFactory({
    domainId: 'tasks',
    repos,
    fieldUpdatedEventType: TASKS_FIELD_UPDATED_EVENT,
    repoLabel: 'Tasks',
  })
}
```

```ts
// habits（瘦化后约 30 行含文件头）
import { createDomainMutationServiceFactory } from '@/nexus/domain-mutation-service/factory'
import { createHabitsGenericRepo } from '@/domains/habits/repository/generic-repo-adapter'
import { HabitRepository } from '@/domains/habits/repository/habit'
import { HabitLogRepository } from '@/domains/habits/repository/habit-log'
import type { DomainMutationService } from '@/nexus/domain-mutation-service'

const HABITS_FIELD_UPDATED_EVENT = 'HabitFieldUpdated' // per-domain 显式配置（修正 F-6）

export function createHabitsMutationService(): DomainMutationService {
  const repos = createHabitsGenericRepo({
    habitRepo: new HabitRepository() as any,
    habitLogRepo: new HabitLogRepository() as any,
  })
  return createDomainMutationServiceFactory({
    domainId: 'habits',
    repos,
    fieldUpdatedEventType: HABITS_FIELD_UPDATED_EVENT,
    repoLabel: 'Habits',
  })
}
```

每域删除：`makeEventBus`、`getRepository`、`getFieldMetadata`、`smExecute`、`createDomainMutationService` 直接调用、eventRepo/eventBus/db 等不再需要的 import。保留文件头注释（更新职责说明）。

### 4.4 getRepository / getFieldMetadata 签名收口

公共工厂内统一为：
- `getRepository(objectType: string)` —— 单参（domainId 在闭包固定）；
- `getFieldMetadata(_domainId, _objectType)` —— 双参签名忽略参数。

赋给 `DomainMutationServiceDeps`（接口要求双参）时，TS 协变接受。每域工厂不再各自重复此模式。这是 3.3 smell 的正式消解，无运行时行为变化。

## 5. 回归边界（tasks 零行为变更）

**核心不变式**：tasks 域行为逐字节一致。

- tasks 仍发 `TaskFieldUpdated`（`fieldUpdatedEventType='TaskFieldUpdated'`，与硬编码值相同）。
- task + thread 仍发同一事件名（per-domain 粒度，不细分）。
- tasks mutation-service 的 getRepository/getFieldMetadata/smExecute 逻辑**平移**进公共工厂，行为等价。
- 唯一触及 tasks 侧的改动是**类型层面**：`FieldExecutorContext` 新增必填字段 `fieldUpdatedEventType` → tasks 现有 field-executor 单测构造 ctx 时需补该字段（值取 `'TaskFieldUpdated'`，断言值不变）。

**habits 侧**：行为变化=事件名修正（`TaskFieldUpdated` → `HabitFieldUpdated`）。G1-H 的 update-habit 集成测试若断言了事件名需同步更新；write-entry-guard / compliance 守卫应保持 green（它们断言「走写入口」而非事件名）。

## 6. 测试策略（TDD）

| 测试 | 类型 | 关注点 |
|---|---|---|
| `factory.ts` 单测（新建） | unit | 公共工厂产出的 service：getRepository 路由正确、缺失 repo 抛带 repoLabel 的错、getFieldMetadata 读对 manifest、smExecute 闭包捕获正确 domainId |
| field-executor 单测（更新） | unit | ctx 补 `fieldUpdatedEventType`；断言**发出的 event.type === ctx.fieldUpdatedEventType**（tasks 用 `TaskFieldUpdated`、新加 habits 用例 `HabitFieldUpdated`） |
| tasks mutation-service 回归 | integration | 现有写入口测试全 green（零行为变更） |
| habits mutation-service 回归 | integration | G1-F 工厂测试、G1-H update-habit 集成测试 green；事件名若被断言则更新为 `HabitFieldUpdated` |
| write-entry-guard（G1-GOV） | guard | grep 守卫仍断言 action 层无 `habitRepo.update/save` 直写 |
| habits-compliance（G1-E2E） | compliance | mutation_mode 完整性断言（T011）保持 green |
| 基线 21 预存失败 | — | 保持不变，0 新增回归 |

**新增最小集**：公共工厂单测 + field-executor 事件名参数化断言。其余为回归。

## 7. 影响面（文件清单）

**新建**：
- `src/nexus/domain-mutation-service/factory.ts`
- `src/nexus/domain-mutation-service/__tests__/factory.test.ts`

**修改**：
- `src/nexus/field-executor/index.ts`（ctx 加字段 + 发事件用 ctx 值 + 文件头注释）
- `src/nexus/domain-mutation-service/index.ts`（deps 加字段 + 两处 ctx 注入 + 注释）
- `src/usom/types/process.ts`（SystemEventType 加 `HabitFieldUpdated`）
- `src/app/actions/tasks/mutation-service.ts`（瘦化）
- `src/app/actions/habits/mutation-service.ts`（瘦化 + 事件名修正）
- `src/nexus/field-executor/__tests__/*.test.ts`（ctx 补字段，若有）
- `docs/usom-design.md`（§4.4 域落地状态表补注：公共工厂已抽、F-6 已参数化）
- `manifest.md`（版本历史新增一行）

**不触碰**：`intent.ts`（updateHabit 调用契约不变）、任何 domain manifest、任何 CNUI Surface、okrs/timebox 代码。

## 8. 决策记录（已关闭）

- **D1 事件名粒度**：per-domain（非 per-objectType）。理由：最小变更 + 保持 tasks 零行为变化。thread→ThreadFieldUpdated 细分踢出（无订阅者，YAGNI）。
- **D2 F-6 接线方案**：方案 A 显式配置（每域工厂传 `fieldUpdatedEventType` 字符串）。理由：显式 > 巧妙（P5），不引入约定派生（方案 B）或泛化事件名（方案 C）的额外抽象。
- **D3 公共工厂位置**：`src/nexus/domain-mutation-service/factory.ts`（nexus 层）。理由：组装用的是 nexus 内部件（createFieldExecutor / createGenericStateMachine / createEventBus），归 nexus 所有；每域 `app/actions/*` 只负责 domain repo wiring。
- **D4 getRepository 收口**：公共工厂内单参 + 忽略 domainId。理由：消除 smell，无行为变化，TS 协变天然兼容。

## 9. 验收标准

1. `createDomainMutationServiceFactory` 存在并被 tasks/habits 两工厂调用；两工厂各 ≤ ~35 行。
2. field-executor 不再含硬编码 `'TaskFieldUpdated'`（grep 0 命中于 `index.ts`）。
3. habits 字段写发出 `HabitFieldUpdated`（单测断言）；tasks 仍发 `TaskFieldUpdated`（回归断言）。
4. SystemEventType 含 `'HabitFieldUpdated'`。
5. 全套测试 green，基线 21 预存失败不变，0 新增回归。
6. `docs/usom-design.md` §4.4 + `manifest.md` 同步。

## 10. 后续（不在本切片）

- okrs / timebox 写入口（重大重构，与 field-executor 路由架构债一起）。
- HH_MM_REGEX 公共校验工厂抽取。
- ValidationResult 3→5 变体 / Suspend CNUI 回环（第二组）。
