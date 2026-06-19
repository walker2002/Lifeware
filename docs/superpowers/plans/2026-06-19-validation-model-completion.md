# 判定模型补全（G3）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 ValidationResult 从 3 变体补全为 5 变体（+ PassedWithWarning / NeedInput），统一 Suspend 多路由（⑤），并把 rule warning 接到 PassedWithWarning（B 接线，修复静默吞警告）；⑥ 完整 CNUI 回环推迟。

**Architecture:** 纯类型扩展 + Orchestrator 调度层路由。PWW 唯一生产者为 rule engine 的 warning（经 `ruleResultToValidation`）；PWW→suspend 复用现有 `needsConfirmation + confirmed=true` 降级链，无需 ⑥ 持久化。写入口路径（field-executor / domain-mutation-service）只判 `=== 'Rejected'`，不触碰新变体。

**Tech Stack:** TypeScript 5, Vitest（`npx vitest run`），Next.js 16。

**Spec:** `docs/superpowers/specs/2026-06-19-validation-model-completion-design.md`

---

## File Structure

| 文件 | 责任 | 本计划动作 |
|---|---|---|
| `frontend/src/usom/types/process.ts` | ValidationResult 判别联合 + constructors | 改：+2 变体 +2 constructor |
| `frontend/src/usom/types/__tests__/validation-result.test.ts` | 变体/constructor 单测 | 改：+PWW/NI 断言、route() 穷举、互斥 3→5 |
| `frontend/src/nexus/orchestrator/index.ts` | 聚合偏序 + ruleResultToValidation + 路由 + OrchestratorResult | 改：RANK 5 路、warning→PWW、PWW/NI suspend 路由、suspended.reason 联合 |
| `frontend/src/nexus/orchestrator/__tests__/validation-aggregation.test.ts` | 聚合/映射/端到端路由单测 | 改：5 路偏序断言、翻转 warning→PWW、+PWW suspend 端到端 |
| `frontend/src/nexus/orchestrator/__tests__/orchestrator.test.ts` | Orchestrator 集成 | 改：+warning→suspend、+warning+confirmed 降级 |
| `.specify/memory/constitution.md` | §VIII 判定模型（Tier-3 治理） | 改：MVP 范围段 三变体→五变体 |
| `docs/usom-design.md` | 判定模型段 | 改：5 变体 + 路由表 |
| `manifest.md` | 版本历史 | 改：+G3 一行 |

---

## Task 1: 类型补全（+ PassedWithWarning / NeedInput 变体 + constructor）

**Files:**
- Modify: `frontend/src/usom/types/process.ts:83-105`
- Test: `frontend/src/usom/types/__tests__/validation-result.test.ts`

- [ ] **Step 1: 写失败测试** — 在 `validation-result.test.ts` 顶部 import 补两个 constructor，并新增/改写测试：

import 块改为：
```ts
import {
  validationPassed,
  validationRejected,
  validationNeedConfirm,
  validationPassedWithWarning,
  validationNeedInput,
} from '../process'
```

把 `describe('ValidationResult 三变体', ...)` 标题改为 `describe('ValidationResult 五变体', ...)`，并在 `validationNeedConfirm` 测试之后追加：

```ts
  it('validationPassedWithWarning 产出 PassedWithWarning 变体并携带 warnings', () => {
    const result = validationPassedWithWarning(['接近晚餐时段', '能量偏低'])
    expect(result.kind).toBe('PassedWithWarning')
    if (result.kind === 'PassedWithWarning') {
      expect(result.warnings).toEqual(['接近晚餐时段', '能量偏低'])
    }
  })

  it('validationNeedInput 产出 NeedInput 变体并透传 data（G3 预留，待 ⑥）', () => {
    const data = { missingFields: ['duration'] }
    const result = validationNeedInput(data)
    expect(result.kind).toBe('NeedInput')
    if (result.kind === 'NeedInput') {
      expect(result.data).toBe(data)
    }
  })
```

把 `route()` 穷举 switch（现 3 case）补全为 5 case：
```ts
    function route(result: ValidationResult): string {
      switch (result.kind) {
        case 'Passed':
          return '进入写入口'
        case 'PassedWithWarning':
          return 'Suspend 警告卡'
        case 'NeedInput':
          return 'Suspend 补全'
        case 'Rejected':
          return '终止'
        case 'NeedConfirm':
          return 'Suspend 确认'
      }
    }

    expect(route(validationPassed())).toBe('进入写入口')
    expect(route(validationPassedWithWarning(['w']))).toBe('Suspend 警告卡')
    expect(route(validationNeedInput({}))).toBe('Suspend 补全')
    expect(route(validationRejected(['x']))).toBe('终止')
    expect(route(validationNeedConfirm({}))).toBe('Suspend 确认')
```

把 kind 互斥测试从 3→5：
```ts
  it('五个变体 kind 互斥（判别联合的判别字段唯一）', () => {
    const passed = validationPassed()
    const passedWithWarning = validationPassedWithWarning(['w'])
    const needInput = validationNeedInput(null)
    const needConfirm = validationNeedConfirm({})
    const rejected = validationRejected(['e'])

    const kinds = new Set([passed.kind, passedWithWarning.kind, needInput.kind, needConfirm.kind, rejected.kind])
    expect(kinds.size).toBe(5)
  })
```

- [ ] **Step 2: 运行测试，预期 FAIL**（constructor 未定义 + route 非穷举 TS 报错）

```bash
cd /home/walker/lifeware/frontend && npx vitest run src/usom/types/__tests__/validation-result.test.ts
```
预期：`validationPassedWithWarning is not exported` / TS 非穷举 switch 报错。

- [ ] **Step 3: 实现** — 改 `process.ts:83-105`。注释块 + 类型 + constructor：

注释块（替换 :83-86）：
```ts
// ─── ValidationResult（意图校验/规则判定统一产出）────────────
// 详见宪章 §VIII 判定模型；Orchestrator 聚合 onValidate 与 Rule Engine
// 结果取最严格后路由。G3 起 5 变体：PassedWithWarning 已接 rule warning，
// NeedInput 待 ⑥ 字段补全回环落地其生产者。
```

类型（替换 :87-90）：
```ts
export type ValidationResult =
  | { kind: 'Passed' }
  | { kind: 'PassedWithWarning'; warnings: string[] }
  | { kind: 'NeedInput'; data: unknown }
  | { kind: 'NeedConfirm'; data: unknown }
  | { kind: 'Rejected'; errors: string[] }
```

在 `validationPassed` 之后、`validationRejected` 之前插入两个 constructor：
```ts
/** 产出 PassedWithWarning 变体 —— 可通过但携带警告，路由到 suspend 警告卡（G3） */
export function validationPassedWithWarning(warnings: string[]): ValidationResult {
  return { kind: 'PassedWithWarning', warnings }
}

/** 产出 NeedInput 变体 —— 需补全字段（G3 预留，待 ⑥ CNUI 字段补全回环） */
export function validationNeedInput(data: unknown): ValidationResult {
  return { kind: 'NeedInput', data }
}
```

- [ ] **Step 4: 运行测试，预期 PASS**

```bash
cd /home/walker/lifeware/frontend && npx vitest run src/usom/types/__tests__/validation-result.test.ts
```
预期：全部 PASS。

- [ ] **Step 5: 提交**
```bash
cd /home/walker/lifeware && git add frontend/src/usom/types/process.ts frontend/src/usom/types/__tests__/validation-result.test.ts && git commit -m "feat(usom): ValidationResult 补全 5 变体 + PassedWithWarning/NeedInput constructor（G3 T1）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: 聚合偏序 5 路（VALIDATION_RANK 扩展）

**Files:**
- Modify: `frontend/src/nexus/orchestrator/index.ts:109-114`（VALIDATION_RANK）
- Test: `frontend/src/nexus/orchestrator/__tests__/validation-aggregation.test.ts`

- [ ] **Step 1: 写失败测试** — import 补 PWW/NI constructor：
```ts
import {
  validationPassed,
  validationRejected,
  validationNeedConfirm,
  validationPassedWithWarning,
  validationNeedInput,
} from '@/usom/types/process'
```

把 `describe('aggregateValidation — 偏序 Rejected > NeedConfirm > Passed', ...)` 标题改为 `describe('aggregateValidation — 偏序 Rejected > NeedConfirm > NeedInput > PassedWithWarning > Passed', ...)`，并在该 describe 末尾（`Rejected > NeedConfirm` 测试之后）追加：
```ts
  it('PassedWithWarning > Passed：Passed × PWW → PassedWithWarning', () => {
    expect(aggregateValidation(validationPassed(), validationPassedWithWarning(['w'])).kind).toBe('PassedWithWarning')
  })

  it('NeedConfirm > PassedWithWarning：PWW × NeedConfirm → NeedConfirm', () => {
    expect(aggregateValidation(validationPassedWithWarning(['w']), validationNeedConfirm({})).kind).toBe('NeedConfirm')
  })

  it('NeedInput > PassedWithWarning：PWW × NeedInput → NeedInput', () => {
    expect(aggregateValidation(validationPassedWithWarning(['w']), validationNeedInput({})).kind).toBe('NeedInput')
  })

  it('NeedConfirm > NeedInput：NeedInput × NeedConfirm → NeedConfirm', () => {
    expect(aggregateValidation(validationNeedInput({}), validationNeedConfirm({})).kind).toBe('NeedConfirm')
  })
```

- [ ] **Step 2: 运行测试，预期 FAIL**（`VALIDATION_RANK` 缺 PWW/NI 键 → TS `Record` 报缺键编译错误；运行时 `VALIDATION_RANK['PassedWithWarning']` 为 undefined → 比较失败）

```bash
cd /home/walker/lifeware/frontend && npx vitest run src/nexus/orchestrator/__tests__/validation-aggregation.test.ts
```

- [ ] **Step 3: 实现** — 改 `orchestrator/index.ts:109-114` VALIDATION_RANK：
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
（`aggregateValidation` 函数体 :125-132 逻辑不变——Rejected 短路 + rank 比较；新 rank 自动生效。）

- [ ] **Step 4: 运行测试，预期 PASS**
```bash
cd /home/walker/lifeware/frontend && npx vitest run src/nexus/orchestrator/__tests__/validation-aggregation.test.ts
```

- [ ] **Step 5: 提交**
```bash
cd /home/walker/lifeware && git add frontend/src/nexus/orchestrator/index.ts frontend/src/nexus/orchestrator/__tests__/validation-aggregation.test.ts && git commit -m "feat(orchestrator): VALIDATION_RANK 扩 5 路偏序（G3 T2）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: ruleResultToValidation 接线（warning → PassedWithWarning，B 核心）

**Files:**
- Modify: `frontend/src/nexus/orchestrator/index.ts:92-107`（ruleResultToValidation + 上方注释）
- Test: `frontend/src/nexus/orchestrator/__tests__/validation-aggregation.test.ts:107-111`

- [ ] **Step 1: 翻转测试** — 改 `validation-aggregation.test.ts:107-111` 的 warning 断言：
```ts
  it("warning → PassedWithWarning（携带 warnings，G3 接线）", () => {
    // G3：warning 不再静默吞成 Passed，映射为 PassedWithWarning → suspend 警告卡
    const r = ruleResultToValidation({ result: 'warning', warnings: ['接近晚餐'], confirmations: [] })
    expect(r.kind).toBe('PassedWithWarning')
    if (r.kind === 'PassedWithWarning') {
      expect(r.warnings).toEqual(['接近晚餐'])
    }
  })
```

- [ ] **Step 2: 运行测试，预期 FAIL**（现实现 warning→Passed）
```bash
cd /home/walker/lifeware/frontend && npx vitest run src/nexus/orchestrator/__tests__/validation-aggregation.test.ts
```

- [ ] **Step 3: 实现** — 改 `orchestrator/index.ts:92-107`。函数 JSDoc + 体内加 warning 分支：
```ts
/**
 * 把 RuleEngine 结果映射为 ValidationResult。
 *
 * 映射策略（G3）：
 * - confirm → NeedConfirm({source:'rule', confirmations}) —— 需用户二次确认
 * - warning → PassedWithWarning({warnings}) —— 可通过但携带警告，路由到 suspend 警告卡
 *   （G3 起不再静默吞成 Passed；修复 ruleResultToValidation 静默吞 warning 缺口）
 * - pass    → Passed
 */
export function ruleResultToValidation(outcome: RuleEngineOutcome): ValidationResult {
  if (outcome.result === 'confirm') {
    return { kind: 'NeedConfirm', data: { source: 'rule', confirmations: outcome.confirmations ?? [] } }
  }
  if (outcome.result === 'warning') {
    return { kind: 'PassedWithWarning', warnings: outcome.warnings ?? [] }
  }
  return { kind: 'Passed' }
}
```

- [ ] **Step 4: 运行测试，预期 PASS**
```bash
cd /home/walker/lifeware/frontend && npx vitest run src/nexus/orchestrator/__tests__/validation-aggregation.test.ts
```

- [ ] **Step 5: 提交**
```bash
cd /home/walker/lifeware && git add frontend/src/nexus/orchestrator/index.ts frontend/src/nexus/orchestrator/__tests__/validation-aggregation.test.ts && git commit -m "fix(orchestrator): ruleResultToValidation 接线 warning→PassedWithWarning（G3 T3，修复静默吞警告）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Orchestrator 路由 PWW/NI suspend + suspended.reason 联合（⑤ 一等公民）

**Files:**
- Modify: `frontend/src/nexus/orchestrator/index.ts:179-185`（OrchestratorResult.suspended 类型）、`:518-549`（executeIntent 聚合后路由）
- Test: `frontend/src/nexus/orchestrator/__tests__/validation-aggregation.test.ts`（端到端 PWW suspend）、`frontend/src/nexus/orchestrator/__tests__/orchestrator.test.ts`（warning→suspend + confirmed 降级）

- [ ] **Step 1: 写失败测试（端到端 PWW suspend）** — 在 `validation-aggregation.test.ts` 的 `describe('executeIntent Suspend 路由（端到端）', ...)` 内，于现有 NeedConfirm 测试之后追加：
```ts
  it('onValidate Passed × RuleEngine warning → 聚合为 PassedWithWarning → Suspend(need_warning) + needsConfirmation', async () => {
    const { result } = await runWith('Passed', { result: 'warning', warnings: ['接近晚餐'] })
    expect(result.success).toBe(false)
    expect(result.suspended).toBeDefined()
    expect(result.suspended?.reason).toBe('need_warning')
    expect(result.needsConfirmation).toBe(true)
    expect(result.confirmationMessage).toBe('接近晚餐')
    expect(result.warnings).toEqual(['接近晚餐'])
  })
```

- [ ] **Step 2: 写失败测试（orchestrator.test.ts warning→suspend + confirmed 降级）** — 在 `describe('createOrchestrator', ...)` 内，于现有 `'confirm + confirmed=false ...'` 测试（:358-380）之后追加两个测试（镜像 confirm 测试，换 warning）：
```ts
  it('RuleEngine 返回 warning → needsConfirmation=true + suspend(need_warning)，不创建 timebox', async () => {
    const intentEngine = createMockIntentEngine()
    const ruleEngine = createMockRuleEngine('warning')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine,
      ruleEngine,
      getRepo: () => { throw new Error('should not reach SM') },
    })

    const result = await orchestrator.execute('安排时间盒', userId)

    expect(result.success).toBe(false)
    expect(result.suspended?.reason).toBe('need_warning')
    expect(result.needsConfirmation).toBe(true)
    expect(result.confirmationMessage).toBe('时间盒接近晚餐时段')
    expect(result.object).toBeUndefined()
    expect(eventRepo.append).not.toHaveBeenCalled()
  })

  it('warning + confirmed=true → 继续创建 timebox（「继续」降级）', async () => {
    const intentEngine = createMockIntentEngine()
    const ruleEngine = createMockRuleEngine('warning')
    const timeboxRepo = createMockTimeboxRepo()
    const eventRepo = createMockEventRepo()

    const orchestrator = createOrchestrator({
      eventRepo,
      intentEngine,
      ruleEngine,
      getRepo: createTimeboxGetRepo(timeboxRepo),
    })

    const result = await orchestrator.execute('安排时间盒', userId, true)

    expect(result.success).toBe(true)
    expect(result.object).toBeDefined()
    expect(result.needsConfirmation).toBeFalsy()
    expect(timeboxRepo.save).toHaveBeenCalled()
    expect(eventRepo.append).toHaveBeenCalled()
  })
```

- [ ] **Step 3: 运行测试，预期 FAIL**（PWW 聚合后无对应 suspend 分支 → 落入 Passed → 进写入口 → getRepo 抛错 / 走 SM）
```bash
cd /home/walker/lifeware/frontend && npx vitest run src/nexus/orchestrator/__tests__/validation-aggregation.test.ts src/nexus/orchestrator/__tests__/orchestrator.test.ts
```

- [ ] **Step 4: 实现 (a) OrchestratorResult.suspended 类型扩联合** — 改 `orchestrator/index.ts:179-185`，把 `suspended?: { reason: 'need_confirm'; data: unknown }` 改为：
```ts
  // [018] T10/[025-G3]：ValidationResult 聚合后 Suspend 路由产物。
  // G3 起多路由统一：PassedWithWarning→need_warning / NeedInput→need_input /
  // NeedConfirm→need_confirm。MVP 试点仅 Orchestrator 内部状态；
  // 完整 CNUI Suspend 回环（持久化/回填/UI 回流）延后到 ⑥。
  suspended?: { reason: 'need_confirm' | 'need_warning' | 'need_input'; data: unknown }
```

- [ ] **Step 5: 实现 (b) executeIntent 路由扩 PWW/NI 分支** — 改 `orchestrator/index.ts:525-549`。在现有 `if (aggregated.kind === 'Rejected')` 与 `if (aggregated.kind === 'NeedConfirm')` 之间插入 PWW 与 NI 两个分支，NeedConfirm 分支保持原样：

```ts
      if (aggregated.kind === 'Rejected') {
        return { success: false, error: aggregated.errors.join('; ') }
      }

      // G3 ⑤：Suspend 多路由统一 —— PassedWithWarning
      if (aggregated.kind === 'PassedWithWarning') {
        const warnings = aggregated.warnings
        return {
          success: false,
          suspended: { reason: 'need_warning', data: { warnings } },
          // 复用现有确认卡 surfacing：rule warning 走 needsConfirmation 卡，
          // 用户「继续」→ 重提交 confirmed=true → ruleValidation 降级 Passed（:494）→ 进写入口。
          needsConfirmation: true,
          confirmationMessage: warnings.join('; '),
          warnings,
        }
      }

      // G3 ⑤：Suspend 多路由统一 —— NeedInput（预留：本切片无生产者，待 ⑥ 字段补全回环）
      if (aggregated.kind === 'NeedInput') {
        return {
          success: false,
          suspended: { reason: 'need_input', data: aggregated.data },
        }
      }

      if (aggregated.kind === 'NeedConfirm') {
        // ……（现有 :529-549 NeedConfirm 分支逻辑完全保持不变）
      }
```

- [ ] **Step 6: 运行测试，预期 PASS**
```bash
cd /home/walker/lifeware/frontend && npx vitest run src/nexus/orchestrator/__tests__/validation-aggregation.test.ts src/nexus/orchestrator/__tests__/orchestrator.test.ts
```

- [ ] **Step 7: 跑全套确认 0 新增回归**
```bash
cd /home/walker/lifeware/frontend && npm test 2>&1 | tail -20
```
预期：`Tests 21 failed | <N> passed`（21 为预存基线，与本切片前一致；新增 PWW/NI 测试全过）。如出现 >21 失败需排查。

- [ ] **Step 8: 提交**
```bash
cd /home/walker/lifeware && git add frontend/src/nexus/orchestrator/index.ts frontend/src/nexus/orchestrator/__tests__/validation-aggregation.test.ts frontend/src/nexus/orchestrator/__tests__/orchestrator.test.ts && git commit -m "feat(orchestrator): Suspend 多路由统一 PWW/NeedInput + suspended.reason 联合（G3 T4，⑤ 一等公民）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: 文档同步（Tier-2/Tier-3，必做）

**Files:**
- Modify: `.specify/memory/constitution.md:410-429`（§VIII 判定模型）
- Modify: `docs/usom-design.md`（判定模型段）
- Modify: `manifest.md`（版本历史）

- [ ] **Step 1: 改宪法 §VIII** — `constitution.md` 的类型块（:411-415）补两变体：
```typescript
type ValidationResult =
  | { kind: 'Passed' }                          // 进入业务事实写入口
  | { kind: 'PassedWithWarning'; warnings: string[] }  // 可通过但携带警告 → Suspend 警告卡（G3）
  | { kind: 'NeedInput'; data: unknown }        // 需补全字段 → Suspend（G3 预留，待 ⑥ 回环）
  | { kind: 'NeedConfirm'; data: unknown }      // 结构化确认（携带确认数据）
  | { kind: 'Rejected'; errors: string[] }      // 结构性拒绝，终止
```
聚合偏序行（:417）改为：
```
**聚合偏序（全序，取最严格）**：`Rejected > NeedConfirm > NeedInput > PassedWithWarning > Passed`。
```
路由块（:420-424）补 PWW/NI 两行：
```
**路由**：
- `Passed` → 业务事实写入口（State Machine 或 Field Executor）
- `PassedWithWarning` → Suspend（警告卡「继续/取消」；G3 接 rule warning，复用 needsConfirmation + confirmed 降级）
- `NeedInput` → Suspend（字段补全；G3 类型预留，完整 CNUI 回环待 ⑥）
- `NeedConfirm` → Suspend（结构化确认卡；吸收原散落的 `needsCnuiConfirmation`，CNUI Surface 写确认即 NeedConfirm 的一个实例）
- `Rejected` → end
```
MVP 试点范围段（:426-429）改写为：
```
**G3 落地范围**：`Passed / PassedWithWarning / NeedConfirm / Rejected` 四变体已落地；
`PassedWithWarning` 接 rule engine warning（经 ruleResultToValidation）。`NeedInput`
类型与 Suspend 一等公民路由已落地，但其真实生产者（字段补全）与完整 CNUI 持久化
回环（挂起 Intent 存储 → Presentation → CNUI 回填 → 重生成 Intent）延后到 ⑥ 切片，
待首个字段补全场景出现。写入口路径（field-executor / domain-mutation-service）只判
`Rejected`，PWW/NI 为 intent 级（Orchestrator）概念。
```

- [ ] **Step 2: 改 docs/usom-design.md** — 定位判定模型段（grep `ValidationResult` / `判定模型`），同步类型为 5 变体、偏序、路由表（与宪法一致）。如该段为概述性引用宪法 §VIII，则补一句「G3 起五变体，详见宪法 §VIII」。

- [ ] **Step 3: 改 manifest.md** — 版本历史表新增一行（紧随 G2 行 2026_06_19 之后）：
```
| USOM 详细设计 | 2026_06_19 | 2026_06_19 | [018-G3] 判定模型补全 5 变体 + Suspend 多路由 + rule warning 接线 | <prev> |
```

- [ ] **Step 4: 校验文档与代码一致** — 人工核对：宪法 §VIII 5 变体 = process.ts 5 变体；偏序 = VALIDATION_RANK；路由 = executeIntent 分支。

- [ ] **Step 5: 提交**
```bash
cd /home/walker/lifeware && git add .specify/memory/constitution.md docs/usom-design.md manifest.md && git commit -m "docs(018-g3): 同步判定模型 5 变体 + Suspend 多路由（constitution §VIII + usom-design + manifest）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review（控制器在交付前自查）

1. **Spec 覆盖**：G3-1 类型（T1）✓ / G3-2 偏序（T2）✓ / G3-3 rule warning 接线（T3）✓ / G3-4 Suspend 多路由（T4）✓ / G3-5 PWW surfacing（T4 端到端测试）✓ / G3-6 文档（T5）✓。⑥ 推迟、NeedInput 无生产者、写入口不触碰 —— 均 OUT，无任务覆盖（正确）。
2. **类型一致性**：`PassedWithWarning.warnings` / `NeedInput.data` 在 T1/T2/T3/T4 测试与实现中拼写一致；`suspended.reason` 联合三值在 T4 类型与分支一致。
3. **占位扫描**：每个 Step 含完整代码/命令/预期，无 TBD。
4. **回归边界**：T4 Step7 显式断言 21 预存失败不变；写入口路径无任务触碰。
5. **NeedInput 端到端**：本切片无生产者，仅 T4 实现 (a)/(b) 落类型 + 路由分支（不可达），无端到端测试——已在 spec §6/§10 注明，符合「预留」语义。

## 执行后（finishing）

按 G2 先例走 subagent-driven-development：每 Task 派 implementer + spec/质量双评审 + 最终整体评审 → finishing-a-development-branch（本地合并回 main）。
