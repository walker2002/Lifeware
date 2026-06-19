# 判定模型补全设计（G3 切片）

> 切片代号：G3（[018] 后续第二组「判定模型补全」活跃切片）
> 创建：2026-06-19
> 关联：[[018-G1] habits 写入口（961f070）] · [[018-G2] 公共工厂抽象（9f95c79）] · 宪法 §III 1.11.0 业务事实写入口 · 宪法 §VIII ValidationResult 判定模型
> 上游：`mydocs/dev/018-清晰SM管理范围的处理.md`（§问题2 修改4「onValidate 返回优化」+ §问题2 修改5「Nexus.Orchestrator 改造」）

## 1. 背景与动机

018 交付了写入口地基 + 判定模型骨架（**3 变体 ValidationResult**：`Passed | Rejected | NeedConfirm`）。原始需求 §问题2修改4 要求 **5 变体**：

```
ValidationPassed               // 继续进入 StateMachine
ValidationPassedWithWarning    // 显示警告，生成确认卡「继续/取消」
ValidationNeedInput            // 挂起 Intent，CNUI 补全字段后重生成 Intent 续走
ValidationNeedConfirm          // 生成确认卡「覆盖/保留/取消」（通常全局规则产生）
ValidationRejected             // 拒绝
```

宪法 §VIII 当时有意只落地 3 变体，把 `PassedWithWarning / NeedInput / Suspend 一等公民` **推迟到首个真实场景**（级联确认 CascadePreview、字段补全）出现，遵循 YAGNI。

本切片在用户决策下**前置推进判定模型补全**（[018] 后续第二组），范围与触发如下。

### 用户决策（2026-06-19 brainstorming）

- **范围**：④ 变体补全 + ⑤ Suspend 升格一等公民；**⑥ 完整 CNUI 持久化回环推迟**（018 已移出为独立切片）。
- **接线深度**：**B —— PassedWithWarning 全活**（接 rule engine 的 warning 作为真实生产者，修复 `ruleResultToValidation` 静默吞 warning 的已知缺口）；NeedInput 仅类型 + 路由预留（本切片无生产者，待 ⑥ 字段补全场景）。

## 2. 目标与非目标

### 目标（IN）

- **G3-1 类型补全**：`ValidationResult` 扩为 5 变体判别联合（+ `PassedWithWarning` / `NeedInput`）；新增两个 constructor。
- **G3-2 聚合偏序 5 路**：`VALIDATION_RANK` 与 `aggregateValidation` 覆盖全 5 变体全序。
- **G3-3 rule warning 接线（B 核心）**：`ruleResultToValidation` 把 `warning` 映射为 `PassedWithWarning`（携带 warnings），不再静默吞成 `Passed`。
- **G3-4 Suspend 多路由统一（⑤）**：`executeIntent` 路由 `PassedWithWarning / NeedInput / NeedConfirm → suspend`（reason 联合），`Rejected → end`，`Passed → 写入口`。
- **G3-5 PWW 确认卡 surfacing**：PWW→suspend 复用现有 `needsConfirmation + confirmationMessage` surfacing + `confirmed=true` 降级机制，端到端可用，**无需 ⑥ 持久化回环**。
- **G3-6 文档同步（Tier-2）**：宪法 §VIII MVP 试点范围段、`docs/usom-design.md` 判定模型段、`manifest.md` 版本历史。

### 非目标（OUT）

- **⑥ 完整 CNUI Suspend 回环**：挂起 Intent 持久化存储 → Presentation 入口 → CNUI 回填 → 重生成 Intent → 续走链路。推迟为独立切片（含 NeedInput 的真实生产者）。
- **NeedInput 生产者**：本切片无 domain/rule 产出 NeedInput；仅类型 + 路由预留。
- **Domain onValidate 产 PWW/NI**：本切片 domain 维持 `Passed/Rejected`；PWW 唯一生产者是 rule warning。
- **manifest `rules:` 区块 / 规则三层架构**：属第三组，本切片不动。
- **PWW+PWW 警告合并**：本切片不可能发生（domain/cnui 不产 PWW），与 NeedConfirm 不合并保持一致。
- **写入口路径（field-executor / domain-mutation-service）改动**：字段写只判 `=== 'Rejected'`，PWW/NI 是 intent 级（orchestrator）概念，写入口维持 `Passed/Rejected`。

## 3. 现状分析（已核对源码）

### 3.1 三变体与 constructor

`frontend/src/usom/types/process.ts:87-105`：

```ts
export type ValidationResult =
  | { kind: 'Passed' }
  | { kind: 'Rejected'; errors: string[] }
  | { kind: 'NeedConfirm'; data: unknown }

export function validationPassed(): ValidationResult { return { kind: 'Passed' } }
export function validationRejected(errors: string[]): ValidationResult { return { kind: 'Rejected', errors } }
export function validationNeedConfirm(data: unknown): ValidationResult { return { kind: 'NeedConfirm', data } }
```

### 3.2 聚合偏序

`orchestrator/index.ts:109-132`：

```ts
const VALIDATION_RANK: Record<ValidationResult['kind'], number> = {
  Passed: 0, NeedConfirm: 1, Rejected: 2,
}
export function aggregateValidation(a, b): ValidationResult {
  if (a.kind === 'Rejected') return a
  if (b.kind === 'Rejected') return b
  if (VALIDATION_RANK[a.kind] >= VALIDATION_RANK[b.kind]) return a
  return b
}
```

> `Record<ValidationResult['kind'], number>` 是**强制穷举键**——新增变体不改此 map 会触发 TS 编译错误（天然 forcing function）。

### 3.3 rule warning 被静默吞掉

`orchestrator/index.ts:101-107`：

```ts
export function ruleResultToValidation(outcome): ValidationResult {
  if (outcome.result === 'confirm')
    return { kind: 'NeedConfirm', data: { source: 'rule', confirmations: outcome.confirmations ?? [] } }
  // warning / pass：试点阶段均按 Passed 处理，不阻塞。
  return { kind: 'Passed' }   // ★ warning 在此被吞成 Passed（:98 注释自承是缺口）
}
```

### 3.4 rule engine 真实产出 warning

`nexus/core/rule-engine/rules/timebox.ts` 多条规则返回 `{ severity: 'warning', message }`（:72/:94/:103/:110）。`evaluator.ts` 聚合为 `severity: 'pass' | 'warning' | 'confirm'`，`intent.ts` 的 RuleEngine adapter 把 `severity` 直接映射为 `result`。故 B 的行为变更是**真实可观测**的（timebox 域）。

### 3.5 executeIntent 路由（contract path）

`orchestrator/index.ts:518-549`：聚合 domain × rule × cnui 三方 ValidationResult 取最严格：
- `Rejected` → `{ success:false, error }`（end）
- `NeedConfirm` → `{ success:false, suspended:{reason:'need_confirm', data}, ...兼容字段 }`（**仅 Orchestrator 内部状态**）
- 否则（Passed）→ 通用 SM 写入口

`confirmed=true` 时 `ruleValidation` 降级为 `Passed`（:494-496），cnui 确认也跳过（:505）——即「继续」affordance 已存在。

### 3.6 OrchestratorResult.suspended 无读取方

`grep` 确认：`OrchestratorResult.suspended` 字段**write-only**（无任何代码读 `result.suspended`）。真正的确认卡 surfacing 走 legacy 兼容字段 `needsConfirmation / needsCnuiConfirmation / confirmationMessage / cnui*` → `intent.ts` 透传 → 客户端 `use-intent-handler.ts:140` 可 `submitIntent(rawInput, confirmed=true)` 重提交降级。

→ PWW→suspend 弹卡只需复用这条已验证的 surfacing 链，**不依赖 ⑥ 持久化**。

### 3.7 写入口边界

field-executor（`index.ts:146`）、domain-mutation-service（`:259/:350`）只判 `result.kind === 'Rejected'`。字段写不经过 orchestrator 聚合，field-executor 直接产 `Passed/Rejected`。PWW/NI 不进入此路径。

## 4. 设计

### 4.1 类型模型（5 变体）

`frontend/src/usom/types/process.ts`：

```ts
// 详见宪章 §VIII 判定模型；Orchestrator 聚合 onValidate 与 Rule Engine
// 结果取最严格后路由。G3 起 5 变体；PassedWithWarning 已接 rule warning，
// NeedInput 待 ⑥ 字段补全回环落地其生产者。
export type ValidationResult =
  | { kind: 'Passed' }
  | { kind: 'PassedWithWarning'; warnings: string[] }   // ★ 可通过但携带警告 → suspend 弹「继续/取消」卡
  | { kind: 'NeedInput'; data: unknown }                // ★ 需补全字段 → suspend（G3 无生产者，预留待 ⑥）
  | { kind: 'NeedConfirm'; data: unknown }
  | { kind: 'Rejected'; errors: string[] }

/** 产出 Passed 变体 —— 进入业务事实写入口 */
export function validationPassed(): ValidationResult { return { kind: 'Passed' } }

/** 产出 PassedWithWarning 变体 —— 可通过但携带警告，路由到 suspend 警告卡 */
export function validationPassedWithWarning(warnings: string[]): ValidationResult {
  return { kind: 'PassedWithWarning', warnings }
}

/** 产出 NeedInput 变体 —— 需补全字段（G3 预留，待 ⑥ CNUI 字段补全回环） */
export function validationNeedInput(data: unknown): ValidationResult {
  return { kind: 'NeedInput', data }
}

/** 产出 NeedConfirm 变体 —— 结构化确认，携带确认数据 */
export function validationNeedConfirm(data: unknown): ValidationResult { return { kind: 'NeedConfirm', data } }

/** 产出 Rejected 变体 —— 结构性拒绝，携带错误信息 */
export function validationRejected(errors: string[]): ValidationResult { return { kind: 'Rejected', errors } }
```

> PWW 仅 `warnings` 字段（YAGNI，不为级联预览预留 data）；NeedInput 仿 NeedConfirm 用 `data` 占位。

### 4.2 聚合偏序（5 路全序）

`orchestrator/index.ts`：

```ts
/** 偏序优先级（全序，取最严格）：Rejected > NeedConfirm > NeedInput > PassedWithWarning > Passed */
const VALIDATION_RANK: Record<ValidationResult['kind'], number> = {
  Passed: 0,
  PassedWithWarning: 1,
  NeedInput: 2,
  NeedConfirm: 3,
  Rejected: 4,
}
```

排序语义：「硬决策（NeedConfirm）> 缺数据（NeedInput）> 建议性（PWW）> 干净（Passed）」；Rejected 恒最高。`aggregateValidation` 逻辑不变（Rejected 短路 + rank 比较），仅扩 map。**不合并 PWW+PWW 警告**（本切片不可能发生）。

### 4.3 ruleResultToValidation 接线（B 核心）

`orchestrator/index.ts`：

```ts
export function ruleResultToValidation(outcome: RuleEngineOutcome): ValidationResult {
  if (outcome.result === 'confirm') {
    return { kind: 'NeedConfirm', data: { source: 'rule', confirmations: outcome.confirmations ?? [] } }
  }
  if (outcome.result === 'warning') {
    // G3：warning 不再静默吞成 Passed，映射为 PassedWithWarning → suspend 警告卡
    return { kind: 'PassedWithWarning', warnings: outcome.warnings ?? [] }
  }
  return { kind: 'Passed' }
}
```

### 4.4 Orchestrator 路由 + Suspend 一等公民

`executeIntent` 聚合后路由（替换 :525-549）：

```ts
if (aggregated.kind === 'Rejected') {
  return { success: false, error: aggregated.errors.join('; ') }
}

// Suspend 路由（⑤ 一等公民）：PWW / NeedInput / NeedConfirm 三路统一 suspend
if (aggregated.kind === 'PassedWithWarning') {
  const warnings = aggregated.warnings
  return {
    success: false,
    suspended: { reason: 'need_warning', data: { warnings } },
    // 复用现有确认卡 surfacing（rule warning 走 needsConfirmation 卡 + confirmed=true 降级）
    needsConfirmation: true,
    confirmationMessage: warnings.join('; '),
    warnings,
  }
}

if (aggregated.kind === 'NeedInput') {
  // G3 预留：无生产者；待 ⑥ 字段补全回环落地 surfacing
  return {
    success: false,
    suspended: { reason: 'need_input', data: aggregated.data },
  }
}

if (aggregated.kind === 'NeedConfirm') {
  // 现状逻辑保持不变（source=rule→needsConfirmation；source=cnui→needsCnuiConfirmation）
  const data = aggregated.data as Record<string, unknown>
  const confirmations = data?.source === 'rule' ? (data.confirmations as string[] | undefined) : undefined
  return {
    success: false,
    suspended: { reason: 'need_confirm', data: aggregated.data },
    needsConfirmation: data?.source === 'rule' ? true : false,
    needsCnuiConfirmation: data?.source === 'cnui' ? true : false,
    confirmationMessage: confirmations?.join('; '),
    cnuiAction: data?.source === 'cnui' ? (data.cnuiAction as string) : undefined,
    cnuiDomain: data?.source === 'cnui' ? (data.cnuiDomain as string) : undefined,
    cnuiSurface: data?.source === 'cnui' ? (data.cnuiSurface as string) : undefined,
    cnuiIntentFields: data?.source === 'cnui' ? (data.cnuiIntentFields as Record<string, unknown>) : undefined,
    warnings: ruleResult.warnings,
  }
}

// Passed → 通用 SM 写入口（现有 :551+ 逻辑不变）
```

- `OrchestratorResult.suspended` 类型：`{ reason: 'need_confirm' | 'need_warning' | 'need_input'; data: unknown }`（:182 reason 扩联合）。
- PWW 的「继续」：首次 submit(confirmed=false)→PWW→suspend→needsConfirmation 卡；用户「继续」→ `submitIntent(_, confirmed=true)` → `ruleValidation` 降级 `Passed`（:494-496 现有机制）→ 进写入口。无需 ⑥ 持久化。

## 5. 行为变更与回归边界（如实）

### 5.1 唯一可观测行为变更

timebox 域 rule warning（`rules/timebox.ts` 4 条规则）：从「`success:true` + `warnings` 附在成功结果」→「`success:false` + `needsConfirmation:true` 确认卡（`confirmationMessage`=warnings）」。这是 B 的既定效果（用户已知）。

- tasks / habits / okrs 域：rule engine 无 warning 规则 → **零影响**。
- 用户「继续」后行为与变更前等价（warning 被确认后放行）。

### 5.2 零变更边界

- 写入口路径（field-executor / domain-mutation-service）：只判 `=== 'Rejected'`，字段写维持 `Passed/Rejected`。
- NeedConfirm 现有 surfacing（rule/cnui 两种 source）：**完全不变**。
- `intent.ts` 签名与透传字段：**不变**（PWW 复用 `needsConfirmation/confirmationMessage/warnings`，已存在的字段）。

## 6. 测试策略（TDD）

| 测试文件 | 动作 |
|---|---|
| `usom/types/__tests__/validation-result.test.ts` | 加 PWW/NI constructor 断言；`route()` 穷举 switch 补 2 case（防 TS 非穷举报错）；kind 互斥从 3→5 |
| `nexus/orchestrator/__tests__/validation-aggregation.test.ts` | 5 路偏序断言（PWW>Passed、NeedConfirm>PWW、NeedInput 位次）；**翻转** `ruleResultToValidation(warning).kind` 由 `Passed`→`PassedWithWarning`（现 :110 断言） |
| `nexus/orchestrator/__tests__/orchestrator.test.ts` | 加 PWW→suspend(reason:need_warning)+needsConfirmation 集成断言；`confirmed=true` 降级 Passed 进写入口；回归 NeedConfirm(rule/cnui) 不变 |
| 基线 21 预存失败 | 保持不变，0 新增回归 |

新增最小集：PWW/NI 类型 + 5 路偏序 + ruleResultToValidation warning 翻转 + PWW suspend 路由。其余为回归。

## 7. 影响面（文件清单）

**改**：
- `frontend/src/usom/types/process.ts`（2 新变体 + 2 constructor + 注释）
- `frontend/src/nexus/orchestrator/index.ts`（VALIDATION_RANK 5 路 + ruleResultToValidation 接线 + executeIntent 路由扩 PWW/NI suspend + OrchestratorResult.suspended.reason 联合）
- `frontend/src/usom/types/__tests__/validation-result.test.ts`
- `frontend/src/nexus/orchestrator/__tests__/validation-aggregation.test.ts`
- `frontend/src/nexus/orchestrator/__tests__/orchestrator.test.ts`

**文档（Tier-2 同步，必做）**：
- `.specify/memory/constitution.md` §VIII（MVP 试点范围段：三变体→五变体；PWW 已接 rule warning 落地；NeedInput/Suspend 完整回环仍待 ⑥）
- `docs/usom-design.md`（判定模型段同步 5 变体 + 路由表）
- `manifest.md`（版本历史新增一行）

**不触碰**：任何 domain manifest · field-executor · domain-mutation-service · CNUI Surface · intent.ts · rule-engine 规则定义本身。

## 8. 决策记录（已关闭）

- **D1 范围**：④+⑤，⑥ 推迟。理由：⑥（完整 CNUI 持久化回环）是独立切片、跨 DB schema/UI 风险最高；④+⑤ 自洽可测、为 ⑥/[025] 铺地基。
- **D2 接线深度**：B（PWW 全活接 rule warning）。理由：PWW 有真实生产者（rule warning）且修复「静默吞警告」已知缺口；NeedInput 无现成生产者，仅预留。用户 2026-06-19 决策。
- **D3 PWW 形状**：仅 `warnings: string[]`。理由：YAGNI，不为级联预览预留 data。
- **D4 偏序**：`Rejected > NeedConfirm > NeedInput > PassedWithWarning > Passed`。理由：「硬决策 > 缺数据 > 建议 > 干净」。NeedInput rank 本切片无生产者触发，仅类型完整。
- **D5 不合并 PWW+PWW 警告**：本切片不可能发生（domain/cnui 不产 PWW），与 NeedConfirm 不合并保持一致。
- **D6 PWW surfacing 复用现有确认卡链**：`needsConfirmation + confirmationMessage + confirmed=true 降级`，不引入新字段、不依赖 ⑥ 持久化。

## 9. 验收标准

1. `ValidationResult` 含 5 变体；`validationPassedWithWarning` / `validationNeedInput` 存在并被引用。
2. `VALIDATION_RANK` 覆盖全 5 变体；`aggregateValidation` 5 路偏序正确（单测）。
3. `ruleResultToValidation(warning)` 返回 `PassedWithWarning`（携带 warnings），不再返回 `Passed`。
4. `executeIntent`：PWW→suspend(reason:need_warning)+needsConfirmation；NeedInput→suspend(reason:need_input)；NeedConfirm 行为不变；Rejected→end；Passed→写入口。
5. PWW 的 `confirmed=true` 重提交降级为 Passed 进写入口（集成测试）。
6. 全套测试 green，基线 21 预存失败不变，0 新增回归。
7. 宪法 §VIII + `docs/usom-design.md` + `manifest.md` 同步。

## 10. 后续（不在本切片）

- **⑥ 完整 CNUI Suspend 回环**：挂起 Intent 持久化 → Presentation 入口 → CNUI 回填 → 重生成 Intent → 续走（含 NeedInput 的真实生产者 + 字段补全场景）。
- **Domain onValidate 产 PWW/NI**：待具体域场景（如级联确认 CascadePreview = [025]）。
- **PWW+PWW 警告合并**：待 PWW 有多个生产者时。
- **第三组规则三层架构**：manifest `rules:` 区块 + L1/L2/L3 规则。
