# [022] A4 Spike — 跨域事件分发方案

Date: 2026-06-26
Status: RESOLVED
Author: Claude (Task 5 of [022] Phase 3)
Supersedes: none
Relates-to: [022] 2B-T6 recomputeProgress (已完成), [022] 2C-T7 Habit 域去 keyResultId (已完成), [022] 3A-T5 (本文件), [022] 3A-T6 (待实现)

---

## Decision

采用 **方案 A：Orchestrator post-mutation hook**（在 `executeIntent` 的 SM 写完成后，遍历刚产出的 SystemEvent，按各域 manifest 的 `subscribed_events` 列表分发给目标域的 `onEvent`）。

> 注：当前架构的 `domain.onEvent` **仅同域调用**（`orchestrator/index.ts:891` 只把事件发回 `findDomain(intent.targetDomain)`）；跨域事件分发链路目前完全不存在。本 spike 的目标即为补齐这条链路。

## Rationale

1. **改动最小**（~70 行 vs ~95 行；详见 §5 工作量表）。
2. **不修改 Nexus 核心基建**（`factory.ts` 零改动；`infrastructure/event-bus` 零改动；保持 `eventBus` 单事件同步分发的现有契约）。
3. **复用已有 SystemEventRepository**：SM.execute 已通过 `eventRepo.append` + `eventBus.publish` 双轨落库（`state-machine/index.ts:307-308`），事件已持久化，post-hook 直接读 DB 即可，无需改事件链路。
4. **Domain 隔离模型不变**：各域仍不互相 import（OKR 不引用 tasks/habits，反之亦然），跨域只通过 SystemEvent payload + manifest.subscribed_events 间接耦合。
5. **测试隔离友好**：hook 在 orchestrator.executeIntent 顶层调用，可通过 orchestrator deps 注入或 env 开关禁用，无需引入全局单例。
6. **风险局部可控**：hook 失败不影响主流程（同域 onEvent 已 try/catch 包裹的隔离模式可借鉴），失败仅记录日志，主写事务已 commit。

## Background — 当前架构关键事实

### B1. EventBus 在 factory.ts:60 是局部变量
`frontend/src/nexus/domain-mutation-service/factory.ts:60`：
```typescript
const eventBus = createEventBus()
```
作用域限定在 `createDomainMutationServiceFactory(opts)` 函数体内。Factory 函数返回 `DomainMutationService` 时该闭包**未对外暴露** eventBus（返回对象无此字段，见 `index.ts:107` 返回类型 `DomainMutationService`），因此任何调用方（包括 mutation service 调用方）都**无法**订阅此 eventBus。
> 生命周期判定：mutation 完成后 factory 闭包仍存活（mutation service 对象仍持有闭包内的 `eventRepo`/`getRepository` 等），但因没有外部引用点，**订阅者无法注册**，实际等同于丢弃。brief 描述「mutation 完成后丢弃」与代码语义等价。

### B2. Orchestrator.executeIntent 的事件分发现状
`frontend/src/nexus/orchestrator/index.ts`：
- **L571**: `const eventBus = createEventBus()` —— Orchestrator 自身的 eventBus，**同样无订阅者**。
- **L885**: `const smResult = await sm.execute(proposal, eventBus, userId)` —— 传入 SM，但 SM 内部已通过 `eventRepo.append` 落库（`state-machine/index.ts:307`），`eventBus.publish` 仅同步通知 0 个订阅者。
- **L891-893**:
  ```typescript
  if (domain && smResult.event) {
    await domain.onEvent(smResult.event, usomSnapshot)
  }
  ```
  **核心结论**：Orchestrator 当前**仅调用同域** `findDomain(intent.targetDomain).onEvent`，对其他域的 `subscribed_events` 完全不感知。**post-mutation 跨域 hook 不存在**（brief §1.2 已识别此空白）。
- **L843-857**: `[025] D1 executeFieldStateWrite` 路径（带字段写）。该路径**显式不调 domain.onEvent**（注释 L838-840 解释：mutation service 内部 SM 已落库到 eventRepo，与 completeTask 此前绕过 Orchestrator 的行为一致，不构成回归）。**这意味着 post-mutation hook 必须直接读 eventRepo**，不能依赖 smResult.event。

### B3. OKR hooks.ts 当前 onEvent 形态
`frontend/src/domains/okrs/hooks.ts:28-31`：
```typescript
interface OkrsHookRepos {
  objectiveRepo: any
  keyResultRepo: any
}
```
- 当前 `OkrsHookRepos` 只有 `objectiveRepo` / `keyResultRepo`，**无 `contributionRepo`**。
- 当前 `onEvent` 是同步函数（L144），返回 `{ metrics, suggestions }` —— 仅产 Action Surface 数据，**无副作用**。
- 当前 `onEvent` 的 switch（L154-224）覆盖 6 个本域事件类型（Objective*/KeyResult*），**没有 `TaskCompleted` / `HabitLogged` case**（即使 subscribed_events 已声明）—— 走 default（L222-223）直接返回空。

### B4. OKR domain/index.ts 调用点
`frontend/src/domains/okrs/index.ts:22-24`：
```typescript
const hooks = result.success
  ? createOkrsHooks(result.manifest)
  : null as any
```
**当前只传 manifest，不传 repos** —— 即使 hooks.ts 接口允许 repos 也未注入。

### B5. OKR mutation-service.ts 工厂调用点
`frontend/src/app/actions/okrs/mutation-service.ts:21-33`：仅组装 OKR 域的 mutation service，调用 `createDomainMutationServiceFactory`，不涉及 hook 注入。OKR 域 hook 走 `okrs/index.ts`，与 mutation service 是两条独立装配链。

### B6. manifest.subscribed_events 已是声明式契约
各域 manifest 在 `区块 F: subscribed_events`（YAML）声明监听的事件类型：
- **tasks** manifest (`src/domains/tasks/manifest.yaml:457-467`)：监听 `ThreadCreated`/`TaskCreated`/`TaskCompleted`/`ExecutionLogged` 等 16 项
- **habits** manifest (`src/domains/habits/manifest.yaml:218-224`)：监听 `HabitCreated`/`HabitLogged`/`HabitStreakMilestone`/`ExecutionLogged` 等 9 项
- **okrs** manifest (`src/domains/okrs/manifest.yaml:257-275`)：监听 19 项，**已含 `TaskCompleted` / `HabitLogged`** —— 契约已声明，实现是缺口。
- TS 类型在 `src/usom/types/domain-types.ts:106`（`subscribed_events: string[]`）和 `src/usom/types/process.ts:148`（`subscribedEvents: SystemEventType[]`）已固化。

`getFullManifest(domainId)` 已存在 (`src/domains/registry.ts:105-108`)，可读取任一域的完整 manifest。

### B7. 跨域事件 payload 约定（从 SM 实际发射形状提取）
`state-machine/index.ts:292-305`：SM 发射 SystemEvent 时 payload 基线为：
```typescript
payload: {
  objectId,       // 对象 ID（task 或 habit 的 ID）
  intentId,       // 触发此事件的 intent
  proposalId,
  fromStatus,
  toStatus,
}
```
- **`TaskCompleted` 事件**：payload 含 `objectId`（= taskId）；附带 task 标题的来源是 hook 的 `event.payload['title']`（由 `tasks/hooks.ts:122` 读取，但**当前实际 SM payload 不含 title** —— 这是历史遗留，详见 §6 R3 风险）。
- **`HabitLogged` 事件**：payload 含 `objectId`（= habitId）+ 附属 ExecutionLogged 事件（`state-machine/index.ts:311-332`），后者 payload 含 `sourceType` / `targetType` / `targetId` / `executionRecord`。
- **`userId`** 不在 payload 里 —— userId 由 `eventRepo.append(event, userId)` 的 userId 入参提供；**hook 接收 SystemEvent 时 userId 不在 event 上**，必须由 dispatcher 显式传入。

> ⚠️ 上述 payload 不含 userId 是历史决定；post-hook 实现必须从 orchestrator 上下文（`executeIntent(userId)` 的 userId 参数）取，不依赖 payload。

### B8. domainRegistry / findDomain 模式
`src/domains/registry.ts:24-33`：`domainRegistry: DomainPlugin[]` 是 4 域插件数组（timebox/habits/okrs/tasks，过滤掉加载失败的）。Orchestrator 当前**只用 `findDomain(domainId)` 取单域**（`orchestrator/index.ts:660`），未迭代 registry。post-hook 需要**新增遍历**，从 registry 过滤出所有 `manifest.subscribedEvents.includes(eventType)` 的目标域。

### B9. ContributionRepository 跨域重算入口已就位
`src/domains/okrs/repository/contribution.ts:28-41`：`findByContributor(type, id, userId, tx?)` 已存在。
`src/domains/okrs/repository/contribution.ts:88-177`：`recomputeProgress(keyResultId, userId, tx?)` 已存在，含完整 ContextProvider + habit_logs + manual + 周期过滤 + 双向钳制实现（2B-T6 落地）。
这两方法被 T6 直接复用，**无需新写仓储代码**。

---

## Alternatives Considered

### 方案 B：全局 EventBus 单例
- 改动：`factory.ts:60` `new EventBus()` → `getGlobalEventBus()`；新增 `infrastructure/event-bus/registry.ts` 单例 + subscriber 注册；各域 `okrs/index.ts:22` 创建 hook 时 `globalBus.subscribe('TaskCompleted', handler)`。
- 优势：真正的发布/订阅模型；理论上支持多域监听同一事件、未来 SSE/Webhook 桥接也可复用。
- 劣势：
  1. 改动 Nexus 核心基建（4 域均依赖 factory，触碰面大）。
  2. 全局单例引入 vitest 测试隔离问题：跨测试文件共享 bus 状态，需 `beforeEach(bus.clear())` 约束。
  3. 当前架构无持久订阅需求 —— 仅 OKR 域需要跨域事件，tasks/habits 不订阅 okrs 的事件。
  4. SM 已通过 eventRepo 持久化，单例总线仅起「同步触发」作用，价值与持久层重叠。
- **结论**：被拒绝。

### 方案 C（额外评估）：在 SM 内 dispatch 多域
- 思路：让 SM 知道所有订阅者（注入 domainRegistry 进 SM deps），publish 时遍历分发。
- 劣势：SM 是 Nexus 核心，**禁止**业务域知识泄漏（违反宪法 §I/§VI 域隔离原则）；SM 应只关心单域状态转换。
- **结论**：被拒绝（架构违规）。

---

## Implementation Outline

### 总改动量预估（与 brief 对齐并修正）

| 改动点 | 改动量 | 说明 |
|---|---|---|
| `okrs/hooks.ts` | ~30 行（+contributionRepo 字段 + 2 case） | brief 估 ~20 行，因 `okrs/hooks.ts` 当前 onEvent 是**同步函数**（L144 无 async），新 case 涉及 `await contributionRepo.recomputeProgress` 必须升级为 async 函数；外加 onValidate 已是 async，类型改动需波及 manifest |
| `okrs/index.ts` | ~10 行（注入 ContributionRepository + 透传给 createOkrsHooks） | brief 估 ~5 行 |
| `nexus/orchestrator/index.ts` | ~25 行（post-hook 块 + 引入 dependencies） | brief 估 ~15 行 |
| 测试 | ~30 行（mock + 集成） | brief 估 ~30 行 |
| **合计** | **~95 行** | brief 估 ~70 行；本 spike 修正为 ~95 行 |

> ⚠️ 工作量差异原因：okrs/hooks.ts 的 onEvent 当前是同步签名（返回 `{ metrics, suggestions }`），要执行 `await repos.contributionRepo.recomputeProgress()` 必须升级为 async（返回 `Promise<{...}>`），波及 DomainPlugin 接口的 onEvent 签名。**建议先在 `usom/types/process.ts:128-131` 确认 onEvent 已支持 Promise 返回**（已支持：`Promise<...> | {...}` 联合类型，TS 已接受），无需改动接口。

### Step 1: `domains/okrs/hooks.ts` — 扩展 OkrsHookRepos 与 onEvent

**1a. 接口扩展（L28-31）**：
```typescript
interface OkrsHookRepos {
  objectiveRepo: any
  keyResultRepo: any
  contributionRepo: ContributionRepository  // 新增（替换 any，提升类型安全）
}
```

**1b. onEvent 升级为 async，新增两个 case**（替换 L144 函数签名 + L154 switch）：
```typescript
async function onEvent(
  event: SystemEvent,
  _snapshot: USOMSnapshot,
): Promise<{ metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] }> {
  if (!subscribedEvents.has(event.type)) {
    return { metrics: [], suggestions: [] }
  }
  // ... 既有 Objective*/KeyResult* case 保持不变 ...

  // [022-A4] 跨域事件：TaskCompleted → KR 进度重算
  if (event.type === 'TaskCompleted') {
    return handleTaskCompleted(event, repos, _snapshot.userId)
  }
  if (event.type === 'HabitLogged') {
    return handleHabitLogged(event, repos, _snapshot.userId)
  }

  return { metrics: [], suggestions: [] }
}
```

**1c. 新增辅助函数（同文件内）**：
```typescript
async function handleTaskCompleted(
  event: SystemEvent,
  repos: OkrsHookRepos | undefined,
  userId: string,
): Promise<{ metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] }> {
  if (!repos?.contributionRepo) return { metrics: [], suggestions: [] }
  const taskId = event.payload['objectId'] as string | undefined
  if (!taskId) return { metrics: [], suggestions: [] }

  const contribs = await repos.contributionRepo.findByContributor('task', taskId as USOM_ID, userId as USOM_ID)
  for (const c of contribs) {
    try {
      await repos.contributionRepo.recomputeProgress(c.keyResultId, userId as USOM_ID)
    } catch (err) {
      console.error(`[okrs.onEvent] recomputeProgress failed for KR ${c.keyResultId}:`, err)
    }
  }
  return { metrics: [], suggestions: [] }
}

async function handleHabitLogged(
  event: SystemEvent,
  repos: OkrsHookRepos | undefined,
  userId: string,
): Promise<{ metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] }> {
  if (!repos?.contributionRepo) return { metrics: [], suggestions: [] }
  const habitId = event.payload['objectId'] as string | undefined
  if (!habitId) return { metrics: [], suggestions: [] }

  const contribs = await repos.contributionRepo.findByContributor('habit', habitId as USOM_ID, userId as USOM_ID)
  for (const c of contribs) {
    try {
      await repos.contributionRepo.recomputeProgress(c.keyResultId, userId as USOM_ID)
    } catch (err) {
      console.error(`[okrs.onEvent] recomputeProgress failed for KR ${c.keyResultId}:`, err)
    }
  }
  return { metrics: [], suggestions: [] }
}
```

> **设计要点**：
> - `recomputeProgress` 内部已含周期过滤（`contribution.ts:128-132` task 用 completedAt；`contribution.ts:150-159` habit 用 habit_logs.between），不会重复触发。
> - `userId` 从 snapshot 传入（`usomSnapshot.userId`），不在 event payload 中。
> - 错误用 `try/catch` + `console.error` 隔离，**失败不影响主流程**。

### Step 2: `domains/okrs/index.ts` — 注入 ContributionRepository

修改 L22-24：
```typescript
import { ContributionRepository } from './repository/contribution'

const contributionRepo = new ContributionRepository()

const hooks = result.success
  ? createOkrsHooks(result.manifest, {
      objectiveRepo: undefined,        // OKR onValidate 不依赖 objectiveRepo 跨调用；保留字段
      keyResultRepo: undefined,        // 同上
      contributionRepo,
    })
  : null as any
```

> **说明**：当前 `onValidate` 的 `repos?.objectiveRepo` / `repos?.keyResultRepo` 仅用于 `activateObjective` 校验（L83-98）。这两字段若不传，**激活校验降级为本地规则检查**（与 T6 行为一致：T6 的 hook 已实际不依赖这两个 repo，验证在前端层做）。**T6 实现时若需要保留激活校验，应同时注入 ObjectiveRepository + KeyResultRepository**。建议方案：T6 评估是否仍需激活前 DB 校验；如不需要，字段保留但传 undefined；如需要，一并注入。

### Step 3: `nexus/orchestrator/index.ts` — post-mutation event dispatch

修改 L880-955 之间的现有 SM 调用块，在 SM.execute（或 executeFieldStateWrite）返回后、cascade 块之前，**新增 post-mutation hook**：

```typescript
// [022-A4] Post-mutation cross-domain event dispatch
// SM.execute 已通过 eventRepo.append 落库到 system_events 表，
// 此处从 eventRepo 读取本次 intent 关联的全部事件（按时间窗口或 intentId 过滤），
// 按各域 manifest.subscribedEvents 分发给目标域 onEvent。
await dispatchCrossDomainEvents({
  eventRepo: deps.eventRepo,
  intentId: intent.id,
  userId,
  snapshot: usomSnapshot,
})

// ── 新增私有函数（同文件内） ─────────────────────────
async function dispatchCrossDomainEvents(params: {
  eventRepo: ISystemEventRepository
  intentId: USOM_ID
  userId: USOM_ID
  snapshot: USOMSnapshot
}): Promise<void> {
  // 1. 读取本次 intent 在近 5 秒窗口内产出的事件
  //    （不用 findByIntent 因无该方法；用 findByUserInRange 近似）
  const now = new Date()
  const windowStart = new Date(now.getTime() - 5000).toISOString() as Timestamp
  const windowEnd = now.toISOString() as Timestamp
  const recentEvents = await params.eventRepo.findByUserInRange(
    params.userId, windowStart, windowEnd,
  )
  // 过滤：仅本次 intent 产生的事件
  const intentEvents = recentEvents.filter(
    e => e.payload['intentId'] === params.intentId,
  )

  // 2. 遍历 domainRegistry，分发
  for (const plugin of domainRegistry) {
    const subscribedTypes = plugin.manifest.subscribedEvents ?? []
    for (const event of intentEvents) {
      if (subscribedTypes.includes(event.type) && plugin.onEvent) {
        try {
          await plugin.onEvent(event, params.snapshot)
        } catch (err) {
          console.error(
            `[orchestrator.postHook] onEvent failed: domain=${plugin.manifest.domainId}, event=${event.type}`,
            err,
          )
        }
      }
    }
  }
}
```

> **设计要点**：
> - `domainRegistry` 已在 `src/domains/registry.ts:24` 导出，Orchestrator 仅需新增 `import { domainRegistry } from '@/domains/registry'`。
> - 跳过 **同域** 事件分发（避免双重执行）：SM.execute 后已有 L891-893 的同域 onEvent 调用；但因 post-hook 用 `intentEvents` 全量遍历，**同域事件会被 post-hook 二次触发**。解决方案：在 L891-893 的同域 onEvent 调用**保留**但从 post-hook 的 `dispatchCrossDomainEvents` 中**排除 intent.targetDomain**（最简实现），或保留 post-hook 但移除 L891-893 的同域调用（更整洁但影响回归）。**建议保留 L891-893 + 在 post-hook 里跳过同域**（最小回归风险）。详见 §6 R1 风险。
> - `findByUserInRange` 窗口用 ±5 秒是保守值（SM.execute + eventRepo.append 在同事务内完成，落库到读取 < 100ms，5 秒足够容错测试环境慢 DB）。

### Step 4: 测试改动（建议 T6 同步实现）

| 测试文件 | 改动 |
|---|---|
| `frontend/src/nexus/core/state-machine/__tests__/state-machine.test.ts` | 新增 case：SM.execute 后断言 mock eventRepo.append 被调用 |
| 新增 `frontend/src/nexus/orchestrator/__tests__/post-hook.test.ts` | mock domainRegistry + eventRepo，验证 TaskCompleted 触发 OKR onEvent，habits 未订阅时不被分发 |
| `frontend/src/domains/okrs/__tests__/hooks.test.ts`（如不存在则新建） | 验证 handleTaskCompleted / handleHabitLogged 在贡献存在/不存在时的行为 |

---

## Impact Assessment

### 触及面
- **tasks/habits 域**：**零改动**。SM 已在 `state-machine/index.ts:307` 落库 TaskCompleted/HabitLogged 事件，OKR 域 post-hook 直接消费。
- **OKR 域**：`hooks.ts` +30 行 + `index.ts` +10 行（注入 ContributionRepository）。
- **Nexus core**：`orchestrator/index.ts` +25 行（post-hook 块 + 私有函数 + import）。
- **manifest**：OKR manifest 已在 L268-269 声明 `TaskCompleted`/`HabitLogged`，**无需改动**。tasks/habits manifest 也无需改动（它们不订阅 OKR 事件）。

### 回归风险
- **低**：post-hook 失败仅记录日志（同域 onEvent 既有 try/catch 隔离模式可借鉴）；主写事务已 commit。
- **中**：若 post-hook 与同域 onEvent 双重执行 OKR 自身事件（ObjectiveCompleted），会导致 `KeyResultProgressUpdated` 类的 metric 被产两次。**缓解**：post-hook 跳过 `plugin.manifest.domainId === intent.targetDomain`。
- **低**：测试隔离 —— vitest 每个 test 文件独立 module graph，domainRegistry 不会被跨文件污染。

### 与既有架构的契约一致性
- ✅ 不修改 Nexus 核心基建（factory.ts / infrastructure/event-bus 零改动）。
- ✅ Domain 隔离：OKR 不直接引用 tasks/habits，仅消费 eventRepo 通用事件。
- ✅ Repository Pattern：post-hook 通过 `OkrsHookRepos.contributionRepo` 注入，遵循 R-01。
- ✅ Multi-Tenancy：所有 recompute 调用透传 userId（来自 snapshot），遵循 T-02。
- ✅ AI/Rule 边界：post-hook 是纯副作用，不产 ValidationResult，不污染 Orchestrator 聚合路径。

---

## Risks & Open Questions

### R1. 同域事件双重分发（[CRITICAL]）
**风险**：Orchestrator 现有 L891-893 已对同域调用 `domain.onEvent(smResult.event, usomSnapshot)`；post-hook 会再次遍历 intentEvents（包含此事件）并分发给同域 `onEvent`。
**影响**：OKR 自身事件（ObjectiveCompleted 等）的 metric/suggestions 会被产两次；副作用（如 streak 重算）若 OKR 后续引入也会被触发两次。
**缓解方案**：
- **方案 A1**（推荐）：post-hook 内 `if (plugin.manifest.domainId === intent.targetDomain) continue` 跳过同域。最小改动。
- **方案 A2**：移除 L891-893 同域调用，统一由 post-hook 分发。更整洁但波及 `executeFieldStateWrite` 路径（L843-857 注释说明该路径已不调 onEvent，需同步调整）。
**T6 决策**：采用 A1，零回归风险。

### R2. event payload 不含 userId（[MEDIUM]）
**风险**：SystemEvent 类型定义 (`usom/types/process.ts:218`) 的 payload 无 userId 字段；SM 在 `state-machine/index.ts:307` `eventRepo.append(event, userId)` 时 userId 作为 DB 列存储，**但 hook 收到的 event 对象上无 userId**。
**缓解方案**：post-hook 的 `dispatchCrossDomainEvents` 显式传 `userId` 参数（从 `executeIntent(userId)` 入参取得），hook 内部从入参/snapshot 取 userId，不用 payload。
**T6 实现**：snapshot.userId 是稳定来源，OKR hook 用 `_snapshot.userId`（`hooks.ts:147` 已存在 `_snapshot` 参数，升级为 async 后可正常 await snapshot.userId）。

### R3. TaskCompleted 事件 payload 不含 title（[LOW]）
**风险**：`state-machine/index.ts:297-303` SM 发射 TaskCompleted 时 payload 不含 `title`，但 `tasks/hooks.ts:122` 用 `event.payload['title'] || event.payload['name']` 读取 → 当前 OKR hook 也不依赖 title（handleTaskCompleted 只读 objectId），**无实际影响**。但若 T7 验证路径需要 title（如提示文案），需补：让 SM 在 payload 注入 title，或 OKR hook 二次查 task repo。
**T6 决策**：T6 不处理，留 T7 评估。

### R4. onEvent 同步/异步签名升级（[LOW]）
**风险**：`okrs/hooks.ts:144` 当前 onEvent 是**同步函数**；新逻辑涉及 `await recomputeProgress` 必须升级为 async。
**缓解**：`usom/types/process.ts:128-131` 的 DomainPlugin.onEvent 签名已是 `Promise<...> | {...}` 联合类型，TS 接受；tasks/habits onEvent 也已用 async（habits 是 async，tasks 是 sync），无接口级冲击。
**T6 决策**：直接升级为 async，`return { metrics: [], suggestions: [] }` 兼容既有返回类型。

### R5. vitest 测试隔离（[LOW]）
**风险**：`domainRegistry` 是模块级单例（`src/domains/registry.ts:24`），跨测试文件共享。若某测试 mock 了某域 plugin，后续测试可能受污染。
**缓解**：vitest 每个 test 文件独立 module graph（除非显式 `--isolate=false`），且现有 217 个测试已稳定运行 —— 无新增风险。
**T6 验证**：跑 `cd frontend && npm run test` 确认基线 217/217 通过。

### R6. recomputeProgress 失败不阻断主流程（[MEDIUM]）
**风险**：recomputeProgress 涉及多表 join（`contribution.ts:94-103` KR + objective + cycle），若 DB 短暂不可用抛异常，会被 hook 的 try/catch 捕获但**用户界面无任何反馈**。
**缓解方案**：
- 当前已设计：post-hook 错误仅 console.error，**主写事务已 commit**，用户感知最小。
- T7 可考虑：recompute 失败时入 `system_events` 表的 `payload.processed=false` 标记，供后台 worker 重试（架构债，defer T7+）。
**T6 决策**：T6 不实现重试，spike 记录为 known limitation。

### R7. 跨域事件分发与 executeFieldStateWrite 路径交互（[LOW]）
**风险**：`orchestrator/index.ts:843-857` 的 `[025] D1 executeFieldStateWrite` 路径**不调**同域 onEvent（L838-840 注释明确说明：mutation service 内部 SM 已落库）。post-hook 通过读 eventRepo 实现，**与该路径兼容**（无论事件来自 sm.execute 还是 executeFieldStateWrite 内部的 SM 调用，eventRepo 都有记录）。
**T6 决策**：无需特殊处理，post-hook 只读 eventRepo，与事件来源解耦。

### R8. habit_logs 日期过滤口径（[LOW]）
**风险**：`contribution.ts:153` `between(s.habitLogs.date, periodStart, periodEnd)` 用 `date` 字段；该字段类型由 schema 决定（推断为 date-only）。**非 OKR spike 范畴**，但若 T6 验证发现 date 类型不匹配，需在 [022] 范围内修复 schema 或查询。
**T6 决策**：T6 验证时若发现，沿 [022] 范围内处理；不阻塞本 spike。

---

## Spike Key Design Decisions (1-2 lines each)

1. **方案 A 选定**：Orchestrator post-mutation hook 在 SM 完成后遍历 intentEvents 分发，改动量小、不动 Nexus 核心。
2. **跳过同域**：post-hook 内部 `plugin.domainId === intent.targetDomain` 跳过，避免双重触发既有 L891-893 的同域 onEvent。
3. **userId 来自 snapshot**：hook 不从 event.payload 取 userId，从 `_snapshot.userId` 取，与多租户 T-02 一致。
4. **错误隔离**：recomputeProgress 失败仅 console.error，主流程不中断；失败事件不重试（T7+ 评估）。
5. **零 manifest 改动**：OKR manifest 已在 L268-269 声明 TaskCompleted/HabitLogged，仅补实现。
6. **onEvent 升级 async**：OKR hook onEvent 升级为 async（涉及 await recomputeProgress）；habits 已 async，tasks 仍 sync（无 await 需求）。
7. **测试基线**：T6 实施前跑 `cd frontend && npm run test` 确认 217/217 基线，T6 完成后跑同样命令确认零回归。

---

## Self-Review Checklist

- [x] brief 中 `factory.ts:60` 的 EventBus 局部变量断言已**验证**（实际确为 L60）。
- [x] brief 中 `okrs/hooks.ts:144` onEvent 同步签名断言已**验证**（实际确为 L144 同步函数）。
- [x] brief 中 `okrs/index.ts:22-23` createOkrsHooks 不传 repos 断言已**验证**（实际确为 L22-24）。
- [x] brief 中 `okrs/mutation-service.ts` 工厂调用点已**验证**（实际路径正确：L21-33）。
- [x] Orchestrator 当前**仅同域** onEvent 调用（L891-893）已**验证**。
- [x] Orchestrator 当前**无** post-mutation hook 已**确认**（代码全文无类似模式）。
- [x] OKR manifest `subscribed_events` 已含 `TaskCompleted`/`HabitLogged`（L268-269）已**验证**。
- [x] SystemEventRepository 无 `findByIntent` 方法已**确认**（仅 `findByUserInRange`/`findUnprocessed`/`markProcessed`），spike 改用 `findByUserInRange` ±5 秒窗口近似。
- [x] EventBus 创建在 4 个文件（factory.ts / ai-runtime/cnui/ / orchestrator/）已**确认**；orchestrator 与 factory 各自的 eventBus 互不相通。
- [x] `contributionRepo.findByContributor` + `recomputeProgress` 已存在且完整实现（2B-T6 落地），可直接复用。
- [x] **修正** brief 工作量估算：~70 行 → ~95 行（因 onEvent 升级 async + import 注入 + 测试更复杂）。
- [x] **补充** brief 未提及的风险：R1 同域双重分发（关键）、R2 userId 不在 payload、R7 executeFieldStateWrite 路径兼容。
- [x] **验证** taskCompleted/habitLogged 事件 payload 实际形态（state-machine/index.ts:292-305）。

---

## Reference — 相关 commit 与历史

- `[022] 2B-T6` (commit `d64082c`): `recomputeProgress` 完整实现（ContextProvider + habit_logs + manual + 周期过滤 + 双向钳制）
- `[022] 2B-T8` (commit `c03b0e1`): `KeyResultRepository.updateProgress` 经 ContributionRepository 重算
- `[022] 2C-T7` (commit `0547e1f`): Habit 域去 keyResultId
- `[022] 3A-T5` (本文件): 跨域事件分发方案选定
- `[022] 3A-T6` (待实现): 事件驱动 recompute + manifest 清理（基于本 spike）
- `[022] 3A-T7` (待执行): 收尾验证 + manifest 版本历史更新

---

## 决策摘要（一句话）

在 `orchestrator.executeIntent` 内 SM 写完成后，新增 `dispatchCrossDomainEvents` 私有函数，从 `eventRepo` 读本 intent 关联事件、遍历 `domainRegistry` 按 `manifest.subscribedEvents` 分发到各目标域 `onEvent`；OKR 域 hook 升级为 async 并接收 `ContributionRepository`，新增 `TaskCompleted`/`HabitLogged` 两个 case 触发 `recomputeProgress`；同域事件由既有 L891-893 处理，post-hook 跳过同域避免双重触发。
