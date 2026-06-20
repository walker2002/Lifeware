# [018-G3] R0 规则三层架构 walking-skeleton 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地规则三层架构的机制地基（walking-skeleton）：manifest 声明式 `rules:` + registry 框架 + 两个消费者（服务端 `evaluateDomainRules` / 客户端 `useManifestRules`）+ 专用 fixture 域打通两层，底层 5 变体/聚合/suspend 管线零改动复用。

**Architecture:** 声明式绑定（manifest `rules:` 只声明元数据 id/phase/fields/message）+ 命令式处理器（registry 按 id 注册 check 函数）。`phase ∈ {submit, both}`（无 realtime-only，消灭绕过）；`RealtimeCheck` 单值同步纯函数（多字段进 `SubmitCheck`）；realtime 只硬错误（适配器空→Passed/非空→Rejected）；客户端 realtime fail-OPEN、服务端 submit fail-CLOSED；id 完整性落 build 脚本 + 纯函数 `validateRuleIntegrity`（测试与生产共用）。

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5 / Zod（manifest schema）/ vitest（单测，须在 `frontend/` cwd 跑，配 tsc 双验证）/ Drizzle ORM（本切片不触及）。

**权威设计：** `docs/superpowers/specs/2026-06-20-rules-three-tier-architecture-design.md`（v3，§4 模型 / §6 R0 / §7 Q1·Q6·Q7 已全决）。

**本切片边界（严守）：** 只铺框架 + fixture 域。**不动**任何真实四域（tasks/habits/okrs/timebox）的 manifest `rules:`、onValidate、表单——那是 R1-R4。**不动**写入口编排。复用管线零改动。

---

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `frontend/src/nexus/rules/types.ts` | 规则模型类型：`FieldIssue`/`ClientRuleCtx`/`ServerRuleCtx`/`RealtimeCheck`/`SubmitCheck`/`DomainRuleRegistry`/`ManifestRule` | Create |
| `frontend/src/nexus/rules/adapter.ts` | `fieldIssuesToValidationResult(issues)`：空→Passed / 非空→Rejected | Create |
| `frontend/src/nexus/rules/integrity.ts` | `validateRuleIntegrity(manifest, registry)`：id 完整性 + §4.2 不变式（纯函数，测试与 build 共用） | Create |
| `frontend/src/nexus/rules/evaluate.ts` | `evaluateDomainRules(domainId, intent, serverCtx)`：服务端消费者，聚合 both+submit | Create |
| `frontend/src/nexus/rules/realtime.ts` | `evaluateRealtimeRules(domainId, field, value, clientCtx)`：客户端纯核心（跑命中该字段的 both 规则） | Create |
| `frontend/src/nexus/rules/use-manifest-rules.ts` | `useManifestRules(domainId, clientCtx)`：客户端 React hook（薄壳，委托 realtime.ts） | Create |
| `frontend/src/nexus/rules/index.ts` | barrel 导出 | Create |
| `frontend/src/domains/manifest-loader/schema.ts` | 加 `RuleSchema` + `ManifestSchema.rules` 字段 | Modify |
| `frontend/src/usom/types/domain-types.ts` | 加 `Rule` 接口 + `DomainManifest.rules?` | Modify |
| `frontend/src/domains/_rulefixture/manifest.yaml` | fixture 域 manifest（2 tracer 规则） | Create |
| `frontend/src/domains/_rulefixture/rules-registry.ts` | fixture 域 registry（1 both + 1 submit tracer） | Create |
| `frontend/scripts/validate-manifest.ts` | 真实域的 rules id 完整性校验（dormant：真实域 R0 无 rules） | Modify |
| `frontend/src/nexus/rules/__tests__/*.test.ts` | 框架单测（adapter/integrity/evaluate/realtime） | Create |
| `.specify/memory/constitution.md` | Tier-2 新增「规则三层」概念 | Modify |
| `manifest.md` | 文档索引同步 | Modify |

**fixture 域命名 `_rulefixture`**：`validate-manifest.ts` 的 `getDomainIds()` 跳过 `_` 前缀目录（已核实 schema 上方 `getDomainIds:118`），故 fixture 不进生产校验、不污染四域；但 `loadDomainManifest('_rulefixture')` 可直接加载（loader 不跳过），供框架测试消费。R1-R4 对真实域迁移时，`_rulefixture` 作为框架一致性回归基线永久保留。

---

## Task 1: 规则模型类型 + manifest schema `rules:` 字段

**Files:**
- Create: `frontend/src/nexus/rules/types.ts`
- Modify: `frontend/src/domains/manifest-loader/schema.ts`（加 `RuleSchema`，`ManifestSchema` 加 `rules` 字段）
- Modify: `frontend/src/usom/types/domain-types.ts`（加 `Rule` 接口 + `DomainManifest.rules?`）
- Test: `frontend/src/nexus/rules/__tests__/types.test.ts`

- [ ] **Step 1: 写失败测试 — RuleSchema 结构不变式**

`frontend/src/nexus/rules/__tests__/types.test.ts`:
```ts
/**
 * @file types.test
 * @brief R0 Task1 — RuleSchema 结构不变式（§4.2：无 realtime-only / both⟹单字段）
 */
import { describe, it, expect } from 'vitest'
import { ManifestSchema } from '@/domains/manifest-loader/schema'

describe('RuleSchema 不变式', () => {
  it('合法：phase: both 单字段规则通过', () => {
    const r = ManifestSchema.safeParse({
      id: 'd', version: '1', name: 'n', description: 'd',
      intent_triggers: [], lifecycle: {}, field_metadata: {},
      list_actions: [], required_fields: {}, subscribed_events: [],
      rules: [{ id: 'x_required', phase: 'both', fields: ['x'], message: 'x 必填' }],
    })
    expect(r.success).toBe(true)
  })

  it('合法：phase: submit 多字段规则通过', () => {
    const r = ManifestSchema.safeParse({
      id: 'd', version: '1', name: 'n', description: 'd',
      intent_triggers: [], lifecycle: {}, field_metadata: {},
      list_actions: [], required_fields: {}, subscribed_events: [],
      rules: [{ id: 'rel', phase: 'submit', fields: ['a', 'b'], message: 'a/b 关系' }],
    })
    expect(r.success).toBe(true)
  })

  it('违法：phase: realtime（无 realtime-only）', () => {
    const r = ManifestSchema.safeParse({
      id: 'd', version: '1', name: 'n', description: 'd',
      intent_triggers: [], lifecycle: {}, field_metadata: {},
      list_actions: [], required_fields: {}, subscribed_events: [],
      rules: [{ id: 'x', phase: 'realtime' as any, fields: ['x'], message: 'm' }],
    })
    expect(r.success).toBe(false)
  })

  it('违法：phase: both 多字段（both⟹单字段）', () => {
    const r = ManifestSchema.safeParse({
      id: 'd', version: '1', name: 'n', description: 'd',
      intent_triggers: [], lifecycle: {}, field_metadata: {},
      list_actions: [], required_fields: {}, subscribed_events: [],
      rules: [{ id: 'x', phase: 'both', fields: ['a', 'b'], message: 'm' }],
    })
    expect(r.success).toBe(false)
  })

  it('合法：无 rules 字段（向后兼容，真实域 R0 无 rules）', () => {
    const r = ManifestSchema.safeParse({
      id: 'd', version: '1', name: 'n', description: 'd',
      intent_triggers: [], lifecycle: {}, field_metadata: {},
      list_actions: [], required_fields: {}, subscribed_events: [],
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.rules).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/types.test.ts`
Expected: FAIL（`ManifestSchema` 无 `rules` 字段，`r.data.rules` undefined 但前两例因 Zod 剥离未知字段仍 success——实际上 `realtime` 例应失败因为还没加 enum 约束；`both 多字段` 例会 success 因为还没 refine。总之测试红。）

- [ ] **Step 3: 实现 RuleSchema + ManifestSchema.rules**

在 `frontend/src/domains/manifest-loader/schema.ts` 的 `CnuiSurfaceSchema`（line ~231）之后、`ManifestSchema`（line ~241）之前插入：
```ts
/**
 * 规则模式（[018-G3] 规则三层架构）
 *
 * §4.2 不变式（Zod 层强制）：
 * - phase ∈ {submit, both}（无 realtime-only——消灭「规则只存单层可被绕过」病灶）
 * - phase: both ⟹ 单字段（多字段规则只能 submit：blur 单字段时其余字段未必就绪）
 */
const RuleSchema = z.object({
  /** 规则 id，全域唯一，绑定 registry 检查函数 */
  id: z.string(),
  /** 触发时机：both=客户端 realtime 提示 + 服务端权威；submit=仅服务端权威（多字段/查库） */
  phase: z.enum(['submit', 'both']),
  /** 该规则关注字段；both 必须单字段 */
  fields: z.array(z.string()).min(1),
  /** 面向用户的提示文案（i18n 留口，以 id 为 key） */
  message: z.string(),
}).refine(
  (r) => !(r.phase === 'both' && r.fields.length > 1),
  { message: 'phase: both 规则必须单字段（§4.2 不变式：多字段规则只能 phase: submit）' },
)
```

在 `ManifestSchema`（`cnui_surfaces` 之后、闭合 `})` 之前）加字段：
```ts
  /** 规则区块（[018-G3] 规则三层架构；可选，向后兼容） */
  rules: z.array(RuleSchema).optional(),
```

- [ ] **Step 4: 实现 TS 类型镜像**

在 `frontend/src/usom/types/domain-types.ts` 的 `FormField`（line ~62）之后、`DomainManifest`（line ~65）之前插入：
```ts
// ─── 区块 G: rules（[018-G3] 规则三层架构） ──────────────────────
/**
 * 规则声明（manifest.yaml rules 区块；逻辑在 registry）
 * @see docs/superpowers/specs/2026-06-20-rules-three-tier-architecture-design.md §4
 */
export interface Rule {
  /** 规则 id，全域唯一，绑定 registry 检查函数 */
  id: string
  /** both=客户端 realtime 提示 + 服务端权威；submit=仅服务端权威 */
  phase: 'submit' | 'both'
  /** 该规则关注字段；both 必须单字段 */
  fields: string[]
  /** 面向用户的提示文案 */
  message: string
}
```

在 `DomainManifest` 接口内（`subscribed_events` 之后）加：
```ts
  /** 区块 G: 规则声明（[018-G3]，可选） */
  rules?: Rule[]
```

- [ ] **Step 5: 创建 nexus/rules 类型文件**

`frontend/src/nexus/rules/types.ts`:
```ts
/**
 * @file types
 * @brief [018-G3] 规则三层架构 — 规则模型类型（registry 契约）
 *
 * §4.3：realtime 单值同步纯函数；submit 可异步查库。realtime 只硬错误；
 * ClientRuleCtx 无 now（realtime 纯函数零外部依赖）；ServerRuleCtx 带 userId（T-01~T04）+ now。
 * @see docs/superpowers/specs/2026-06-20-rules-three-tier-architecture-design.md §4.3
 */

import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import type { ValidationResult } from '@/usom/types/process'

/**
 * 字段级问题：realtime 检查产出。
 * field 用于 §4.4 提交失败按字段回填标红。
 */
export interface FieldIssue {
  field: string
  message: string
}

/**
 * 客户端 realtime 上下文：最小化。
 * 刻意不携带 now / userId —— 保证 RealtimeCheck 为纯函数（§4.3 不变式 3）。
 * StartTimeInFuture 等需时序的规则走 submit（ServerRuleCtx.now），不进 realtime。
 */
export interface ClientRuleCtx {
  /* 占位：当前无字段。未来若需透传只读元数据在此扩展，禁止携带可变/时序状态。 */
}

/**
 * 服务端 submit 上下文。
 * - repos：域仓储（多租户查询须带 userId，T-01~T-04）
 * - now：取自 USOMSnapshot.currentTime，供 StartTimeInFuture 等 submit 规则使用
 */
export interface ServerRuleCtx {
  repos: unknown
  userId: USOM_ID
  now: number
}

/**
 * realtime 检查：同步、纯函数、无 repo、不读 now/随机。
 * 按【单字段值】判定（多字段规则进 SubmitCheck）。
 */
export type RealtimeCheck = (value: unknown, ctx: ClientRuleCtx) => FieldIssue[]

/**
 * submit 检查：可异步、可查 repo。按【整个 Intent】判定（多字段/查库）。
 * 返回 5 变体 ValidationResult（复用已就绪判定模型）。
 */
export type SubmitCheck = (intent: StructuredIntent, ctx: ServerRuleCtx) => Promise<ValidationResult>

/**
 * 域规则注册表。
 * - realtime：仅 phase: both 规则注册（submit 阶段经适配器重跑同一套 check）
 * - submit：phase: submit 规则注册（phase: both 规则不在此重复注册，权威重跑走 realtime + 适配器）
 */
export interface DomainRuleRegistry {
  realtime: Record<string, RealtimeCheck>
  submit: Record<string, SubmitCheck>
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/types.test.ts`
Expected: PASS（5 例全绿）

- [ ] **Step 7: tsc 双验证（vitest 不做类型检查）**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 8: 提交**

```bash
cd frontend
git add src/nexus/rules/types.ts src/nexus/rules/__tests__/types.test.ts \
        src/domains/manifest-loader/schema.ts src/usom/types/domain-types.ts
git commit -m "feat(nexus/rules): 规则模型类型 + manifest rules: schema（R0 Task1）

§4.2 不变式 Zod 强制：phase∈{submit,both}（无 realtime-only）、both⟹单字段。
RuleSchema/Rule 镜像 + FieldIssue/ClientRuleCtx(无now)/ServerRuleCtx({repos,userId,now})/
RealtimeCheck 单值/SubmitCheck/DomainRuleRegistry。"
```

---

## Task 2: fieldIssuesToValidationResult 适配器

**Files:**
- Create: `frontend/src/nexus/rules/adapter.ts`
- Test: `frontend/src/nexus/rules/__tests__/adapter.test.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/nexus/rules/__tests__/adapter.test.ts`:
```ts
/**
 * @file adapter.test
 * @brief R0 Task2 — fieldIssuesToValidationResult：空→Passed / 非空→Rejected
 */
import { describe, it, expect } from 'vitest'
import { fieldIssuesToValidationResult } from '../adapter'
import type { FieldIssue } from '../types'

describe('fieldIssuesToValidationResult', () => {
  it('空 issues → Passed', () => {
    expect(fieldIssuesToValidationResult([]).kind).toBe('Passed')
  })

  it('非空 issues → Rejected，errors 为各 issue 的 message', () => {
    const issues: FieldIssue[] = [
      { field: 'title', message: '标题必填' },
      { field: 'duration', message: '时长必须>0' },
    ]
    const r = fieldIssuesToValidationResult(issues)
    expect(r.kind).toBe('Rejected')
    if (r.kind === 'Rejected') expect(r.errors).toEqual(['标题必填', '时长必须>0'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/adapter.test.ts`
Expected: FAIL（`adapter` 模块不存在）

- [ ] **Step 3: 实现适配器**

`frontend/src/nexus/rules/adapter.ts`:
```ts
/**
 * @file adapter
 * @brief [018-G3] realtime FieldIssue[] → ValidationResult 适配器
 *
 * submit 权威阶段重跑 phase: both 规则的 RealtimeCheck 后，经本适配器转为 ValidationResult，
 * 与 phase: submit 规则的 5 变体结果一起喂 aggregateValidation（§4.3 聚合语义）。
 * realtime 只硬错误：非空 issue = Rejected。
 */
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { FieldIssue } from './types'

/**
 * 把 realtime 检查产出的 FieldIssue[] 适配为 ValidationResult。
 * - 空 → Passed
 * - 非空 → Rejected（errors = 各 issue.message；field 归属保留在 issue 中供 §4.4 回填）
 */
export function fieldIssuesToValidationResult(issues: FieldIssue[]): ReturnType<typeof validationPassed> | ReturnType<typeof validationRejected> {
  if (issues.length === 0) return validationPassed()
  return validationRejected(issues.map((i) => i.message))
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/adapter.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd frontend
git add src/nexus/rules/adapter.ts src/nexus/rules/__tests__/adapter.test.ts
git commit -m "feat(nexus/rules): fieldIssuesToValidationResult 适配器（R0 Task2）"
```

---

## Task 3: validateRuleIntegrity 纯函数（id 完整性 + 不变式交叉校验）

**Files:**
- Create: `frontend/src/nexus/rules/integrity.ts`
- Test: `frontend/src/nexus/rules/__tests__/integrity.test.ts`

> 说明：`loadDomainManifest()` 是纯 YAML loader，无法触及 TS registry（Codex P0-3）。id 完整性校验抽为纯函数 `validateRuleIntegrity(manifest, registry)`，由 `scripts/validate-manifest.ts`（真实域，build/CI）与框架测试（fixture）共用。

- [ ] **Step 1: 写失败测试**

`frontend/src/nexus/rules/__tests__/integrity.test.ts`:
```ts
/**
 * @file integrity.test
 * @brief R0 Task3 — validateRuleIntegrity：manifest rule.id ↔ registry 一致性
 */
import { describe, it, expect } from 'vitest'
import { validateRuleIntegrity } from '../integrity'
import type { DomainRuleRegistry, RealtimeCheck, SubmitCheck } from '../types'
import type { Rule } from '@/usom/types/domain-types'
import { validationPassed } from '@/usom/types/process'

const rt = (() => []) as RealtimeCheck
const sm = (async () => validationPassed()) as SubmitCheck

function manifestWith(rules: Rule[]) {
  return { rules } as { rules: Rule[] }
}

describe('validateRuleIntegrity', () => {
  it('合法：both 规则有 realtime check，submit 规则有 submit check', () => {
    const m = manifestWith([
      { id: 'a', phase: 'both', fields: ['x'], message: 'a' },
      { id: 'b', phase: 'submit', fields: ['y'], message: 'b' },
    ])
    const reg: DomainRuleRegistry = { realtime: { a: rt }, submit: { b: sm } }
    expect(validateRuleIntegrity(m, reg)).toEqual([])
  })

  it('违法：both 规则缺 realtime check（孤儿 id）', () => {
    const m = manifestWith([{ id: 'a', phase: 'both', fields: ['x'], message: 'a' }])
    const reg: DomainRuleRegistry = { realtime: {}, submit: {} }
    const errs = validateRuleIntegrity(m, reg)
    expect(errs.length).toBe(1)
    expect(errs[0]).toContain('a')
  })

  it('违法：submit 规则缺 submit check', () => {
    const m = manifestWith([{ id: 'b', phase: 'submit', fields: ['y'], message: 'b' }])
    const reg: DomainRuleRegistry = { realtime: {}, submit: {} }
    expect(validateRuleIntegrity(m, reg)).toHaveLength(1)
  })

  it('违法：both 规则的 check 注册在 submit 而非 realtime', () => {
    const m = manifestWith([{ id: 'a', phase: 'both', fields: ['x'], message: 'a' }])
    const reg: DomainRuleRegistry = { realtime: {}, submit: { a: sm } }
    expect(validateRuleIntegrity(m, reg)).toHaveLength(1)
  })

  it('合法：无 rules（真实域 R0）', () => {
    const reg: DomainRuleRegistry = { realtime: {}, submit: {} }
    expect(validateRuleIntegrity({ rules: undefined } as any, reg)).toEqual([])
  })

  it('违法：duplicate rule id', () => {
    const m = manifestWith([
      { id: 'a', phase: 'both', fields: ['x'], message: 'a' },
      { id: 'a', phase: 'both', fields: ['y'], message: 'a2' },
    ])
    const reg: DomainRuleRegistry = { realtime: { a: rt }, submit: {} }
    expect(validateRuleIntegrity(m, reg).length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/integrity.test.ts`
Expected: FAIL（`integrity` 模块不存在）

- [ ] **Step 3: 实现**

`frontend/src/nexus/rules/integrity.ts`:
```ts
/**
 * @file integrity
 * @brief [018-G3] manifest rule.id ↔ registry 完整性校验（纯函数）
 *
 *消灭「规则只在 manifest 声明、registry 漏注册」的静默 no-op（需求 problem 2 病灶）。
 * 由 scripts/validate-manifest.ts（真实域 build/CI）与框架测试（fixture）共用。
 */
import type { DomainRuleRegistry } from './types'

/** manifest 的 rules 区块形状（仅取所需字段，与 DomainManifest 解耦） */
interface ManifestWithRules {
  rules?: Array<{ id: string; phase: 'submit' | 'both'; fields: string[]; message: string }>
}

/**
 * 校验 manifest 声明的每条规则都在 registry 正确注册。
 * @returns 错误消息数组（空 = 通过）
 */
export function validateRuleIntegrity(
  manifest: ManifestWithRules,
  registry: DomainRuleRegistry,
): string[] {
  const errors: string[] = []
  const rules = manifest.rules
  if (!rules || rules.length === 0) return errors

  const seenIds = new Set<string>()
  for (const rule of rules) {
    // duplicate id
    if (seenIds.has(rule.id)) {
      errors.push(`规则 id 重复: "${rule.id}"`)
    }
    seenIds.add(rule.id)

    // phase ↔ registry 位置一致
    if (rule.phase === 'both') {
      if (!(rule.id in registry.realtime)) {
        errors.push(`规则 "${rule.id}" phase:both 但 registry.realtime 未注册其 check（孤儿 id，将静默 no-op）`)
      }
    } else {
      // phase: submit
      if (!(rule.id in registry.submit)) {
        errors.push(`规则 "${rule.id}" phase:submit 但 registry.submit 未注册其 check（孤儿 id，将静默 no-op）`)
      }
    }
  }
  return errors
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/integrity.test.ts`
Expected: PASS（6 例全绿）

- [ ] **Step 5: 提交**

```bash
cd frontend
git add src/nexus/rules/integrity.ts src/nexus/rules/__tests__/integrity.test.ts
git commit -m "feat(nexus/rules): validateRuleIntegrity id 完整性纯函数（R0 Task3）"
```

---

## Task 4: fixture 域（_rulefixture）— manifest + registry 两条 tracer

**Files:**
- Create: `frontend/src/domains/_rulefixture/manifest.yaml`
- Create: `frontend/src/domains/_rulefixture/rules-registry.ts`

- [ ] **Step 1: 写 fixture manifest**

`frontend/src/domains/_rulefixture/manifest.yaml`:
```yaml
# [018-G3] R0 walking-skeleton 专用 fixture 域。
# 仅用于证明规则三层框架（manifest rules → registry → 两消费者），不是真实业务域。
# validate-manifest.ts 的 getDomainIds() 跳过 _ 前缀，故不进生产校验；
# 但 loadDomainManifest('_rulefixture') 可直接加载供框架测试消费。
id: _rulefixture
version: "0.0.1"
name: 规则框架 fixture
description: R0 walking-skeleton 框架验证用 fixture 域，勿用于业务
intent_triggers: []
lifecycle: {}
field_metadata:
  name:
    type: string
    label: 名称
    required: true
  count:
    type: number
    label: 数量
    required: false
list_actions: []
required_fields: {}
subscribed_events: []
rules:
  - id: fixture_name_required
    phase: both
    fields: [name]
    message: 名称不能为空
  - id: fixture_count_positive
    phase: submit
    fields: [count]
    message: 数量必须为正数
```

- [ ] **Step 2: 写 fixture registry**

`frontend/src/domains/_rulefixture/rules-registry.ts`:
```ts
/**
 * @file rules-registry
 * @brief [018-G3] R0 fixture 域规则注册表（2 条 tracer，打通两层）
 *
 * - fixture_name_required (phase: both)：单字段 RealtimeCheck，空字符串→FieldIssue
 * - fixture_count_positive (phase: submit)：SubmitCheck，count<=0→Rejected
 */
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { DomainRuleRegistry, RealtimeCheck, SubmitCheck } from '@/nexus/rules/types'

const nameRequired: RealtimeCheck = (value, _ctx) => {
  if (typeof value !== 'string' || value.trim() === '') {
    return [{ field: 'name', message: '名称不能为空' }]
  }
  return []
}

const countPositive: SubmitCheck = async (intent, _ctx) => {
  const count = intent.fields['count']
  if (typeof count === 'number' && count <= 0) {
    return validationRejected(['数量必须为正数'])
  }
  return validationPassed()
}

export const fixtureRuleRegistry: DomainRuleRegistry = {
  realtime: { fixture_name_required: nameRequired },
  submit: { fixture_count_positive: countPositive },
}
```

- [ ] **Step 3: tsc 验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
cd frontend
git add src/domains/_rulefixture/manifest.yaml src/domains/_rulefixture/rules-registry.ts
git commit -m "feat(domains/_rulefixture): R0 walking-skeleton fixture 域（2 tracer 规则）"
```

---

## Task 5: evaluateDomainRules（服务端消费者）+ fixture round-trip

**Files:**
- Create: `frontend/src/nexus/rules/evaluate.ts`
- Test: `frontend/src/nexus/rules/__tests__/evaluate.test.ts`

> `evaluateDomainRules(domainId, intent, serverCtx)`：读 manifest 取 phase∈{both,submit} 规则 → both 规则用 RealtimeCheck 重跑+适配、submit 规则用 SubmitCheck → aggregateValidation 折叠。submit fail-CLOSED（抛错→Rejected）。

- [ ] **Step 1: 写失败测试**

`frontend/src/nexus/rules/__tests__/evaluate.test.ts`:
```ts
/**
 * @file evaluate.test
 * @brief R0 Task5 — evaluateDomainRules 聚合 + fail-closed + fixture round-trip
 */
import { describe, it, expect } from 'vitest'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import { evaluateDomainRules } from '../evaluate'
import { loadDomainManifest } from '@/domains/manifest-loader'
import { fixtureRuleRegistry } from '@/domains/_rulefixture/rules-registry'

const ctx = { repos: {}, userId: 'u-1' as USOM_ID, now: 0 }

function intent(fields: Record<string, unknown>): StructuredIntent {
  return {
    id: 'i', intentionId: 'in', targetDomain: '_rulefixture',
    action: 'create', fields, confidence: 1, resolvedBy: 'template_form',
    createdAt: '2026-06-20T00:00:00Z',
  } as unknown as StructuredIntent
}

describe('evaluateDomainRules — fixture round-trip', () => {
  it('both 规则空 name → Rejected（realtime 重跑 + 适配）', async () => {
    const r = await evaluateDomainRules('_rulefixture', intent({ name: '', count: 5 }), ctx, fixtureRuleRegistry)
    expect(r.kind).toBe('Rejected')
  })

  it('both 规则合法 name + submit 规则 count>0 → Passed', async () => {
    const r = await evaluateDomainRules('_rulefixture', intent({ name: 'ok', count: 5 }), ctx, fixtureRuleRegistry)
    expect(r.kind).toBe('Passed')
  })

  it('submit 规则 count<=0 → Rejected', async () => {
    const r = await evaluateDomainRules('_rulefixture', intent({ name: 'ok', count: 0 }), ctx, fixtureRuleRegistry)
    expect(r.kind).toBe('Rejected')
  })

  it('无 rules 的域 → Passed（真实域 R0 兼容）', async () => {
    // 用临时空 registry + 不存在的域：evaluateDomainRules 找不到 manifest 应 Passed（无规则可跑）
    const r = await evaluateDomainRules('__nonexistent__', intent({}), ctx, { realtime: {}, submit: {} })
    expect(r.kind).toBe('Passed')
  })
})

describe('evaluateDomainRules — fail-closed', () => {
  it('SubmitCheck 抛错 → Rejected（fail-closed，不放过）', async () => {
    const throwingRegistry = {
      realtime: {},
      submit: {
        fixture_count_positive: (async () => { throw new Error('repo down') }) as any,
      },
    }
    const r = await evaluateDomainRules('_rulefixture', intent({ name: 'ok', count: 5 }), ctx, throwingRegistry)
    expect(r.kind).toBe('Rejected')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/evaluate.test.ts`
Expected: FAIL（`evaluate` 模块不存在）

- [ ] **Step 3: 实现 evaluateDomainRules**

`frontend/src/nexus/rules/evaluate.ts`:
```ts
/**
 * @file evaluate
 * @brief [018-G3] 服务端消费者 — evaluateDomainRules
 *
 * 读 manifest 取 phase∈{both,submit} 规则：
 * - both：用 registry.realtime[id] 重跑 RealtimeCheck（单字段）→ fieldIssuesToValidationResult 适配
 * - submit：用 registry.submit[id] 跑 SubmitCheck（异步，可查库）
 * 全部结果经 aggregateValidation 折叠（复用 VALIDATION_RANK，零新规则）。
 * submit fail-CLOSED：SubmitCheck 抛错 → 该条计 Rejected + 记日志（宁可阻断也不放过无效数据）。
 */
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { ValidationResult } from '@/usom/types/process'
import type { aggregateValidation as AggregateT } from '@/nexus/orchestrator'
import { aggregateValidation } from '@/nexus/orchestrator'
import { loadDomainManifest } from '@/domains/manifest-loader'
import { fieldIssuesToValidationResult } from './adapter'
import type { ClientRuleCtx, DomainRuleRegistry, ServerRuleCtx } from './types'
import type { StructuredIntent } from '@/usom/types/objects'

/**
 * 评估域规则（服务端权威）。
 * @param domainId 域 id（闭包绑定本域）
 * @param intent 结构化意图
 * @param serverCtx 服务端上下文（repos/userId/now）
 * @param registry 本域规则注册表（由各域注入；真实域在 hooks 闭包内绑定，fixture 在测试直传）
 */
export async function evaluateDomainRules(
  domainId: string,
  intent: StructuredIntent,
  serverCtx: ServerRuleCtx,
  registry: DomainRuleRegistry,
): Promise<ValidationResult> {
  const loaded = loadDomainManifest(domainId)
  // 域不存在或加载失败 → 无规则可跑 → Passed（兼容真实域 R0 无 rules）
  if (!loaded.success) return validationPassed()
  const rules = loaded.manifest.rules
  if (!rules || rules.length === 0) return validationPassed()

  const clientCtx: ClientRuleCtx = {} // 最小化；realtime 重跑无需 now（both 规则不含时序）
  const results: ValidationResult[] = []

  for (const rule of rules) {
    if (rule.phase === 'both') {
      const check = registry.realtime[rule.id]
      if (!check) continue // id 完整性由 validateRuleIntegrity 兜底；运行期缺 check 跳过（realtime 是提示）
      const fieldValue = intent.fields[rule.fields[0]]
      const issues = check(fieldValue, clientCtx)
      results.push(fieldIssuesToValidationResult(issues))
    } else {
      // phase: submit
      const check = registry.submit[rule.id]
      if (!check) continue
      try {
        results.push(await check(intent, serverCtx))
      } catch (e) {
        // fail-CLOSED：submit 抛错 → Rejected + 记日志
        console.error(`[rules] submit 规则 "${rule.id}" 抛错（fail-closed）:`, e)
        results.push(validationRejected([`规则校验失败，请重试 (${rule.id})`]))
      }
    }
  }

  // 折叠所有结果（复用 VALIDATION_RANK，零新规则）
  return results.reduce((acc, r) => aggregateValidation(acc, r), validationPassed() as ValidationResult)
}
```

> 注：`aggregateValidation` 已导出于 `@/nexus/orchestrator`（核实于 `orchestrator/index.ts:129`，G3 已用）。类型导入 `AggregateT` 仅为文档示意，实际只需值导入 `aggregateValidation`——若 tsc 报未用类型导入告警，删除该行。

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/evaluate.test.ts`
Expected: PASS（5 例全绿）

- [ ] **Step 5: tsc 双验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误（若 `AggregateT` 未用告警，删该行重跑）

- [ ] **Step 6: 提交**

```bash
cd frontend
git add src/nexus/rules/evaluate.ts src/nexus/rules/__tests__/evaluate.test.ts
git commit -m "feat(nexus/rules): evaluateDomainRules 服务端消费者 + fail-closed（R0 Task5）"
```

---

## Task 6: realtime 纯核心 + useManifestRules 客户端 hook

**Files:**
- Create: `frontend/src/nexus/rules/realtime.ts`
- Create: `frontend/src/nexus/rules/use-manifest-rules.ts`
- Test: `frontend/src/nexus/rules/__tests__/realtime.test.ts`

> 客户端 realtime = 附加提示，fail-OPEN。`evaluateRealtimeRules` 为纯核心（可单测）；`useManifestRules` 为薄 React hook（委托纯核心，React 集成测试留 R1 真实表单）。

- [ ] **Step 1: 写失败测试（纯核心）**

`frontend/src/nexus/rules/__tests__/realtime.test.ts`:
```ts
/**
 * @file realtime.test
 * @brief R0 Task6 — evaluateRealtimeRules 纯核心：命中字段的 both 规则
 */
import { describe, it, expect } from 'vitest'
import { evaluateRealtimeRules } from '../realtime'
import { fixtureRuleRegistry } from '@/domains/_rulefixture/rules-registry'

const ctx = {}

describe('evaluateRealtimeRules — fixture', () => {
  it('blur name=空 → 命中 fixture_name_required，返回 1 issue', () => {
    const issues = evaluateRealtimeRules('_rulefixture', 'name', '', ctx, fixtureRuleRegistry)
    expect(issues).toEqual([{ field: 'name', message: '名称不能为空' }])
  })

  it('blur name=合法 → 无 issue', () => {
    const issues = evaluateRealtimeRules('_rulefixture', 'name', 'ok', ctx, fixtureRuleRegistry)
    expect(issues).toEqual([])
  })

  it('blur count → 无 both 规则命中 count（fixture_count_positive 是 submit，不进 realtime）', () => {
    const issues = evaluateRealtimeRules('_rulefixture', 'count', -1, ctx, fixtureRuleRegistry)
    expect(issues).toEqual([])
  })

  it('realtime check 抛错 → fail-OPEN（吞错，返回空，不崩）', () => {
    const throwingRegistry = {
      realtime: { fixture_name_required: (() => { throw new Error('boom') }) as any },
      submit: {},
    }
    const issues = evaluateRealtimeRules('_rulefixture', 'name', 'x', ctx, throwingRegistry)
    expect(issues).toEqual([])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/realtime.test.ts`
Expected: FAIL（`realtime` 模块不存在）

- [ ] **Step 3: 实现纯核心**

`frontend/src/nexus/rules/realtime.ts`:
```ts
/**
 * @file realtime
 * @brief [018-G3] 客户端 realtime 评估纯核心
 *
 * blur 单字段时，跑命中该字段的 phase: both 规则（fields 含该字段）。
 * fail-OPEN：realtime 是附加提示，check 抛错吞掉+记日志，不崩 onBlur handler（submit 权威兜底）。
 */
import { loadDomainManifest } from '@/domains/manifest-loader'
import type { ClientRuleCtx, DomainRuleRegistry, FieldIssue } from './types'

/**
 * 评估命中指定字段的所有 phase: both 规则。
 * @param domainId 域 id
 * @param field blur 的字段名
 * @param value 该字段当前值
 * @param ctx 客户端上下文（最小化，无 now）
 * @param registry 本域注册表（realtime 元数据+check 由 Server Component props 透传，见 §4.5）
 */
export function evaluateRealtimeRules(
  domainId: string,
  field: string,
  value: unknown,
  ctx: ClientRuleCtx,
  registry: DomainRuleRegistry,
): FieldIssue[] {
  const loaded = loadDomainManifest(domainId)
  if (!loaded.success) return []
  const rules = loaded.manifest.rules
  if (!rules) return []

  const issues: FieldIssue[] = []
  for (const rule of rules) {
    if (rule.phase !== 'both') continue // submit 规则不进 realtime
    if (!rule.fields.includes(field)) continue // 未命中该字段
    const check = registry.realtime[rule.id]
    if (!check) continue
    try {
      issues.push(...check(value, ctx))
    } catch (e) {
      // fail-OPEN：realtime 坏不阻断用户，吞错+记日志，submit 权威兜底
      console.error(`[rules] realtime 规则 "${rule.id}" 抛错（fail-open，已吞）:`, e)
    }
  }
  return issues
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/realtime.test.ts`
Expected: PASS（4 例全绿）

- [ ] **Step 5: 实现薄 hook**

`frontend/src/nexus/rules/use-manifest-rules.ts`:
```ts
/**
 * @file use-manifest-rules
 * @brief [018-G3] 客户端 realtime 校验 React hook（薄壳，委托 realtime 纯核心）
 *
 * §4.5 method A：realtime 规则元数据（id/fields/message）由渲染表单的 Server Component
 * 经 loadDomainManifest 提取后作为 props 透传；check 函数由 client import registry 子集。
 * 本 hook 持 errors state，blur 时调 evaluateRealtimeRules。
 * React 集成测试（renderHook + 真实表单）留 R1；R0 只测纯核心。
 */
'use client'

import { useState, useCallback } from 'react'
import { evaluateRealtimeRules } from './realtime'
import type { ClientRuleCtx, DomainRuleRegistry } from './types'

export interface UseManifestRulesResult {
  errors: Record<string, string>
  validateField: (field: string, value: unknown) => void
  clearField: (field: string) => void
}

/**
 * @param domainId 域 id
 * @param registry realtime check 注册表（client import 子集；仅 phase: both 规则）
 * @param ctx 客户端上下文（最小化）
 */
export function useManifestRules(
  domainId: string,
  registry: DomainRuleRegistry,
  ctx: ClientRuleCtx = {},
): UseManifestRulesResult {
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateField = useCallback(
    (field: string, value: unknown) => {
      const issues = evaluateRealtimeRules(domainId, field, value, ctx, registry)
      setErrors((prev) => {
        const next = { ...prev }
        const hit = issues.find((i) => i.field === field)
        if (hit) next[field] = hit.message
        else delete next[field]
        return next
      })
    },
    [domainId, registry, ctx],
  )

  const clearField = useCallback((field: string) => {
    setErrors((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  return { errors, validateField, clearField }
}
```

- [ ] **Step 6: tsc 双验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 7: 提交**

```bash
cd frontend
git add src/nexus/rules/realtime.ts src/nexus/rules/use-manifest-rules.ts \
        src/nexus/rules/__tests__/realtime.test.ts
git commit -m "feat(nexus/rules): evaluateRealtimeRules 纯核心 + useManifestRules hook（R0 Task6）"
```

---

## Task 7: barrel 导出 + 接线 validate-manifest.ts（真实域 id 完整性）

**Files:**
- Create: `frontend/src/nexus/rules/index.ts`
- Modify: `frontend/scripts/validate-manifest.ts`（真实域 rules id 完整性；R0 dormant）

- [ ] **Step 1: barrel 导出**

`frontend/src/nexus/rules/index.ts`:
```ts
/**
 * @file index
 * @brief [018-G3] 规则三层架构框架 barrel
 */
export type {
  FieldIssue,
  ClientRuleCtx,
  ServerRuleCtx,
  RealtimeCheck,
  SubmitCheck,
  DomainRuleRegistry,
} from './types'
export { fieldIssuesToValidationResult } from './adapter'
export { validateRuleIntegrity } from './integrity'
export { evaluateDomainRules } from './evaluate'
export { evaluateRealtimeRules } from './realtime'
export { useManifestRules } from './use-manifest-rules'
export type { UseManifestRulesResult } from './use-manifest-rules'
```

- [ ] **Step 2: 接线 validate-manifest.ts**

在 `frontend/scripts/validate-manifest.ts` 的 `validateDomain(domainId)` 函数末尾（`// ── query_actions ...` 校验之后、函数闭合 `}` 之前，约 line 346）插入 rules id 完整性校验：
```ts
  // ── 区块 G: rules id 完整性（[018-G3]） ───────────────────────
  // 真实域 R0 无 rules，此校验 dormant；R1+ 域加 rules 后生效。
  // manifest 若声明 rules，其每个 id 必须在该域 rules-registry.ts 注册。
  const rawRules = (manifest.rules ?? []) as Array<{ id: string; phase: string; fields: string[] }>
  if (rawRules.length > 0) {
    try {
      const registryPath = path.resolve(domainDir, 'rules-registry')
      const registry = require(registryPath)
      // registry 导出形如 { xxxRuleRegistry: DomainRuleRegistry }，取第一个 DomainRuleRegistry
      const reg = Object.values(registry).find(
        (v) => v && typeof v === 'object' && 'realtime' in (v as object) && 'submit' in (v as object),
      ) as { realtime: Record<string, unknown>; submit: Record<string, unknown> } | undefined
      if (!reg) {
        addError(domainId, 'G-registry-missing', `manifest 声明了 ${rawRules.length} 条 rules 但未找到 rules-registry 导出`)
      } else {
        const { validateRuleIntegrity } = require(path.resolve(ROOT_DIR, 'src', 'nexus', 'rules', 'integrity'))
        const errs = validateRuleIntegrity({ rules: rawRules as any }, reg as any)
        for (const e of errs) addError(domainId, 'G-rule-integrity', e)
      }
    } catch (e: unknown) {
      const err = e as { message?: string }
      addError(domainId, 'G-registry-load', `rules-registry 加载失败: ${err.message ?? String(e)}`)
    }
  }
```

- [ ] **Step 3: 跑 validate-manifest.ts 确认真实域不受影响（dormant）**

Run: `cd frontend && npx tsx scripts/validate-manifest.ts; echo "EXIT=$?"`
Expected: EXIT=0（真实域无 rules，rules 校验 dormant；其他既有校验不变）。`_rulefixture` 被 `getDomainIds()` 跳过，不出现。

- [ ] **Step 4: 跑全部新增测试 + tsc**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/ && npx tsc --noEmit`
Expected: 全 PASS，无类型错误

- [ ] **Step 5: 提交**

```bash
cd frontend
git add src/nexus/rules/index.ts scripts/validate-manifest.ts
git commit -m "feat(nexus/rules): barrel 导出 + validate-manifest 接线 rules id 完整性（R0 Task7）"
```

---

## Task 8: 宪法 Tier-2「规则三层」概念 + manifest.md 同步

**Files:**
- Modify: `.specify/memory/constitution.md`（Tier-2 新增规则三层概念）
- Modify: `manifest.md`（文档索引同步本计划 + 设计 v3）

- [ ] **Step 1: 宪法 Tier-2 新增规则三层概念**

在 `.specify/memory/constitution.md` 的 Tier-2 治理节（定位「USOM Governance / 规则」相关区域）追加：
```markdown
### 规则三层架构（[018-G3]）

Domain 校验规则分三层执行位置（非三套不同规则）：
- **L1 CNUI realtime（附加提示）**：客户端 blur 即时反馈，可被绕过、不可信；仅为体验优化。
- **L2 Domain onValidate（权威）**：服务端业务合法性，经 `evaluateDomainRules` 聚合。
- **L3 Nexus RuleEngine（全局）**：跨域系统级一致性。

**治理约束（manifest `rules:` 区块）：**
- `phase ∈ {submit, both}`，**无 realtime-only**——每条规则都进权威层（L2/L3），realtime 是 `both` 规则的附加提示。消灭「规则只存单层、可被绕过」病灶。
- `phase: both ⟹ 单字段`；多字段规则只能 `submit`。
- `phase: both` 的 RealtimeCheck 必须同步纯函数（不查库/不读 now）。
- **id 完整性**：manifest 每个 `rule.id` 必须在域 registry 注册；`scripts/validate-manifest.ts`(build/CI) 强制。
- 异常不对称：客户端 realtime fail-OPEN / 服务端 submit fail-CLOSED。

详见 `docs/superpowers/specs/2026-06-20-rules-three-tier-architecture-design.md`。
```

- [ ] **Step 2: manifest.md 索引同步**

在 `manifest.md` 的设计文档/计划索引区追加本计划与设计 v3 的条目（按既有格式）：
```markdown
- [018-G3] 规则三层架构设计 v3 — docs/superpowers/specs/2026-06-20-rules-three-tier-architecture-design.md（plan-eng-review CLEAN）
- [018-G3] R0 walking-skeleton 实现计划 — docs/superpowers/plans/2026-06-20-018-g3-r0-rules-framework.md
```

- [ ] **Step 3: 提交**

```bash
git add .specify/memory/constitution.md manifest.md
git commit -m "docs(governance): 宪法 Tier-2 规则三层概念 + manifest 索引同步（R0 Task8）"
```

---

## Self-Review

**1. Spec 覆盖（对照设计 §4/§6 R0）：**
- §4.1 manifest 声明（砍 level / phase∈{submit,both}）→ Task 1 RuleSchema ✅
- §4.2 不变式（无 realtime-only / both⟹单字段 / 同步纯函数 / id 完整性）→ Task 1（Zod enum+refine）+ Task 3（integrity）+ Task 7（validate-manifest 接线）✅
- §4.3 registry 类型（RealtimeCheck 单值/SubmitCheck/FieldIssue/ctx）→ Task 1 types.ts ✅
- §4.3 适配器 fieldIssuesToValidationResult → Task 2 ✅
- §4.3 异常不对称（realtime fail-OPEN / submit fail-CLOSED）→ Task 5（submit fail-closed）+ Task 6（realtime fail-open）✅
- §4.4 消费者 A evaluateDomainRules → Task 5 ✅
- §4.4 消费者 B useManifestRules → Task 6 ✅
- §6 R0 walking-skeleton（≥1 both tracer + ≥1 submit tracer 打通两层）→ Task 4 fixture（fixture_name_required both + fixture_count_positive submit）+ Task 5/6 round-trip ✅
- §7 Q7 fixture 域（不碰真实四域）→ `_rulefixture` 被 getDomainIds 跳过 ✅
- 宪法 Tier-2 + manifest.md → Task 8 ✅
- 复用底层 5 变体/aggregateValidation/suspend 零改动 → Task 5 直接 import aggregateValidation，无改动 ✅

**2. 占位扫描：** 无 TBD/TODO/"implement later"；每步含完整代码或确切命令。✅

**3. 类型一致性：** `FieldIssue`/`ClientRuleCtx`/`ServerRuleCtx`/`DomainRuleRegistry`/`RealtimeCheck`/`SubmitCheck` 跨任务一致；`evaluateDomainRules`/`evaluateRealtimeRules`/`validateRuleIntegrity`/`fieldIssuesToValidationResult` 签名跨定义与测试一致；fixture registry id (`fixture_name_required`/`fixture_count_positive`) 跨 manifest/registry/test 一致。✅

**R0 不做（留给 R1-R4）：** 真实四域 manifest rules、onValidate 改调 evaluateDomainRules、表单改用 useManifestRules、React 集成测试、golden 捕获、E2E、CUC。R2-R4 须 R1 sign-off 后放行。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-20-018-g3-r0-rules-framework.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — 每个 Task 派 fresh subagent，任务间 review，快速迭代。

**2. Inline Execution** — 本会话内用 executing-plans 批量执行 + 检查点。

**Which approach?**
