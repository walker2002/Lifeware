# [020] 系统规则管理重设计 — 去 manifest C/L 范式重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 tasks/habits 两域的规则定义从「manifest C/L 区声明 + registry 处理」收敛为「registry 即 SSOT」——删 manifest L 区 rules、C 区死字段（label/required），让 registry handler 自带 meta，消除 manifest↔registry 冗余镜像与循环论证校验。

**Architecture:** 规则三层收敛。`DomainRuleRegistry` 扩展为每条 rule 自带 `{ check, fields, message }`；服务端 `evaluateDomainRules` 与客户端 `evaluateRealtimeRules`/`useManifestRules` 直接消费 registry（不再经 manifest L 或 `get-realtime-rules` server action 中转）；validator 删 `G-rule-integrity`（循环论证消除）+ `FieldMetadataSchema` 删 label/required；constitution §IX/§VIII/§III 走 Amendment Procedure（MINOR 2.0.0→2.1.0）。

**Tech Stack:** TypeScript 5 / React 19 / Next.js 16 / Zod（manifest schema）/ Vitest / 自研 manifest+registry 规则三层。

---

## 背景与已锁定决策

- **上游 design doc**：`docs/superpowers/specs/2026-06-23-020-rules-management-redesign.md`（office-hours 产出，锁定 D1/D2/D3）。
- **上游问题存档**：`.specify/amendments/revisit-manifest-rules-design-tensions.md`（议题1 mutation_mode 正交轴裂缝 + 议题2 manifest C/L 过度设计）。
- **D1**：Business Rule 集中进代码（registry），「动态」指 Policy Rule 本次不做。
- **D2**：Tasks+Habits 完整做；OKR/Timebox 用 sunset 豁免显式记债。
- **D3**：批量编辑走聚合事务 + 聚合校验。**事务原子性已修**（updateTask/updateThread 已改 `service.execute`，commit `a47c418`）；**聚合校验（currentObject 注入）有未解设计风险，本 plan 不含，单独 defer**。

## Scope 边界

**本 plan 做：**
- manifest C 区 `field_metadata` 删死字段 `label`/`required`（两域），保留 `type`/`options`/`mutation_mode`。
- manifest L 区 `rules` 整块删除（两域），规则定义并入 registry。
- registry handler 自带 meta（`fields`/`message`）。
- `evaluateDomainRules`/`evaluateRealtimeRules`/`useManifestRules` 改读 registry；删 `get-realtime-rules` server action 中转 + 改 5 个消费组件直 import registry。
- validator：删 `integrity.ts`（G-rule-integrity）+ `validate-manifest.ts` 区块 G + `schema.ts` `FieldMetadataSchema` 删 label/required；sunset 清单显式记债。
- constitution §IX 约束 2/3 + §VIII + §III 修正，MINOR 2.0.0→2.1.0，走 Amendment Procedure。

**本 plan 不做（显式 defer / YAGNI）：**
- **D3 聚合校验**（currentObject 注入改 `evaluateDomainRules` 签名）——单独 plan，需先 brainstorm 设计。
- **E 区 `required_fields`**——调研发现被 AI intent parser 消费（`nexus/core/intent-engine/routing-context.ts:83-97` 构建 AI 字段 schema），是活字段，本次不动。
- **OKR/Timebox 两域**——维持现状（旧 C 范式 + 无 L rules + 无 registry），仅 sunset 记债。技术上自动兼容（ManifestSchema 非 strict 会 strip；脚本 validator 绕过 Zod 直接 YAML parse 不校验 field_metadata 字段）。

## File Structure

| 文件 | 责任 | 本 plan 动作 |
|---|---|---|
| `src/nexus/rules/types.ts` | 规则模型类型（registry 契约） | 扩展 `DomainRuleRegistry`：rule 自带 meta |
| `src/domains/{tasks,habits}/rules-registry.ts` | 两域规则注册表 | handler 包 `{ check, fields, message }` |
| `src/nexus/rules/evaluate.ts` | 服务端 `evaluateDomainRules` | 改读 registry（删 `loadDomainManifest` 读 rules） |
| `src/nexus/rules/realtime.ts` | 客户端 `evaluateRealtimeRules` + `RealtimeRuleMeta` | 改读 registry + 新增 `realtimeMetaFromRegistry` |
| `src/nexus/rules/use-manifest-rules.ts` | `useManifestRules`/`useServerErrorBackfill` | 改单参 registry，内部派生 meta |
| `src/nexus/rules/server/get-realtime-rules.ts` | server action 中转 meta | **删除** |
| `src/nexus/rules/index.ts` | barrel 导出 | 删 `getRealtimeRules` 导出 |
| 5 个消费组件（见 Phase 3 Task 3.4） | realtime blur 校验 | 删中转调用，直传 registry |
| `src/domains/{tasks,habits}/manifest.yaml` | 两域 manifest | 删 C label/required + L rules 区块 |
| `src/nexus/rules/integrity.ts` + `__tests__/integrity.test.ts` | G-rule-integrity | **删除**（循环论证消除） |
| `scripts/validate-manifest.ts` | manifest 诊断 | 删区块 G（rules id 完整性） |
| `src/domains/manifest-loader/schema.ts` | Zod schema | `FieldMetadataSchema` 删 label/required/default_value/description |
| `scripts/validate-domain-structure.ts` | 结构诊断 | `RULES_REGISTRY_EXEMPTIONS` reason 补充记债 |
| `.specify/memory/constitution.md` | 宪法 | §IX 2/3 + §VIII + §III 修正，2.1.0 |
| `.specify/amendments/proposed-IX-rules-ssot.md` | 修订提案 | 新建（PROPOSED→EFFECTIVE） |
| `manifest.md` / `docs/domain-development-guide.md` | 文档 | 版本历史 + 规则三层描述同步 |

## 关键设计：registry 即 SSOT

**类型扩展**（`types.ts`）——每条 rule 自带 meta：
```typescript
export interface RealtimeRule {
  check: RealtimeCheck      // 单字段纯函数（不变）
  fields: string[]          // phase: both 恰好 1 字段
  message: string           // 客户端提示 + 服务端回填匹配
}
export interface SubmitRule {
  check: SubmitCheck        // 整 intent 异步校验（不变）
  fields: string[]
  message: string
}
export interface DomainRuleRegistry {
  realtime: Record<string, RealtimeRule>
  submit: Record<string, SubmitRule>
}
```

**meta 派生**（`realtime.ts`）——registry 自带 meta 后，`RealtimeRuleMeta[]` 从 registry 派生，无需 server action 中转：
```typescript
export function realtimeMetaFromRegistry(registry: DomainRuleRegistry): RealtimeRuleMeta[] {
  return Object.entries(registry.realtime).map(([id, rule]) => ({
    id, fields: rule.fields, message: rule.message,
  }))
}
```

**D 模式顺序保持**：`evaluateDomainRules` 改读 registry 后，**先跑 submit 规则、再跑 realtime 规则**（submit 聚合的 Rejected 先进 results，`aggregateValidation` 折叠时首个 Rejected 胜出吞粒度——复刻原 manifest L 区「聚合规则置首」语义）。

---

## Phase 0: Amendment 提案（PROPOSED）

### Task 0.1: 创建 constitution 修订提案文件

**Files:**
- Create: `.specify/amendments/proposed-IX-rules-ssot.md`

- [ ] **Step 1: 写提案文件**（参照 `.specify/amendments/proposed-IX-domain-paradigm.md` 模板：状态行 + 提案文本 + Superseding Language + Rationale + Impact Analysis + 生效状态 check）

```markdown
# 宪法修订提案：§IX 规则三层范式收敛（registry 即 SSOT）+ 字段三分类澄清

> **状态**：🟡 **PROPOSED（2026-06-24）** — 待 §Amendment Procedure 审议
> **来源**：[020] 去 manifest C/L 范式重构（design doc `docs/superpowers/specs/2026-06-23-020-rules-management-redesign.md`）
> **版本影响**：**MINOR**——manifest `rules:` 声明层移除、registry 升为 SSOT（实质性治理扩展），2.0.0 → 2.1.0。

## 提案文本

### §IX 约束 2（跨字段红线）修正
删除现行第 531 行「否则 inline 编辑静默绕过业务规则」（诱导性措辞，把 inline 编辑与 FactField 绑死）。
修正后：「带跨字段/跨对象业务不变量的写入，禁止走字段路径（其不经全量 `onValidate`）；必须经 `executeIntent`（或显式 rule 校验 step）。」

### §IX 约束 3（规则三层）修正
删除「manifest `rules:` 声明规则」部分。
修正后：「每个有写路径的 Domain 必须在 `rules-registry` 注册处理器（registry 即 SSOT，自带 phase/fields/message meta）+ `onValidate` 委托 `evaluateDomainRules`。」

### §VIII 规则三层架构治理修正
删除「治理约束（manifest `rules:` 区块）」小节中「manifest 每个 `rule.id` 必须在域 registry 注册；`scripts/validate-manifest.ts` 强制」——manifest rules 区块已删，此约束自然消失。

### §III 字段三分类补充说明
在字段三分类表后补：「`FactField` ≠ 必须可 inline 编辑的字段——能否 inline 由是否存在 `phase: both` realtime rule 决定（UX 轴），与写入路径（mutation_mode 轴）正交。」

## Superseding Language
本提案 SUPERSEDE 现行 §IX 约束 3 中「manifest `rules:` 声明规则 + `rules-registry` 注册处理器」表述，改为「registry 即 SSOT」。跨字段红线（§IX 约束 2）原则不变，仅删诱导性措辞。

## Rationale
- 议题1：消除「inline 编辑 ⟹ FactField」诱导（mutation_mode 正交轴裂缝）。
- 议题2：manifest L 区 rules 是 registry 的冗余镜像，声明式承诺（改规则不改代码）未兑现，CI `G-rule-integrity` cross-check 是循环论证。

## Impact Analysis
- 原则冲突：无（registry 即 SSOT 不改变规则三层语义，仅消除冗余声明层）。
- 影响域：Tasks、Habits（完整迁移）；OKR/Timebox 维持旧范式，sunset 记债。
- 工具链：`scripts/validate-manifest.ts` 删区块 G；`integrity.ts` 删除。
- Tier-2 同步：`docs/domain-development-guide.md` 规则三层描述同步。

## 生效状态（待审议）
- [ ] 书面 rationale + impact analysis（上）✅
- [ ] 无原则冲突核验（上）✅
- [ ] 版本递增 MINOR 2.0.0→2.1.0 ⏳
- [ ] constitution.md 更新 + Spec Kit 模板一致性传播 ⏳
- [ ] manifest.md 版本历史更新 ⏳
```

- [ ] **Step 2: Commit**

```bash
git add .specify/amendments/proposed-IX-rules-ssot.md
git commit -m "docs(constitution): [020] §IX 规则三层收敛 amendment 提案 (PROPOSED)"
```

---

## Phase 1: registry 自带 meta（核心类型）

> 依赖顺序：先改 types（Task 1.1）→ 两域 registry（1.2/1.3）。registry 改后 evaluate/realtime/useManifestRules 才能消费新结构（Phase 2/3）。
> **注意**：本 Phase 改 types 后，registry/evaluate/realtime/useManifestRules 会临时类型不匹配（tsc 红）——这是预期的中间态，Phase 2/3 收敛。每个 Task 末尾**只跑该 Task 自己的测试**，不跑全量 tsc，直到 Phase 3 末尾统一验证。

### Task 1.1: 扩展 `DomainRuleRegistry` 类型（rule 自带 meta）

**Files:**
- Modify: `src/nexus/rules/types.ts:55-63`
- Test: `src/nexus/rules/__tests__/types.test.ts`

- [ ] **Step 1: 写失败测试**（在 `types.test.ts` 末尾追加）

```typescript
import type { DomainRuleRegistry, RealtimeRule, SubmitRule } from '../types'
import { validationPassed } from '@/usom/types/process'

describe('[020] registry rule 自带 meta', () => {
  it('RealtimeRule 含 check/fields/message', () => {
    const rule: RealtimeRule = {
      check: () => [],
      fields: ['estimatedDuration'],
      message: '预估时长必须大于 0',
    }
    expect(rule.fields).toEqual(['estimatedDuration'])
    expect(rule.message).toBe('预估时长必须大于 0')
    expect(rule.check(5, {})).toEqual([])
  })

  it('SubmitRule 含 check/fields/message', () => {
    const rule: SubmitRule = {
      check: async () => validationPassed(),
      fields: ['title'],
      message: '字段校验失败',
    }
    expect(rule.fields).toEqual(['title'])
    expect(typeof rule.check).toBe('function')
  })

  it('DomainRuleRegistry 接受自带 meta 的 rule 结构', () => {
    const reg: DomainRuleRegistry = {
      realtime: { r1: { check: () => [], fields: ['a'], message: 'm' } },
      submit: { s1: { check: async () => validationPassed(), fields: ['a'], message: 'm' } },
    }
    expect(reg.realtime.r1.fields).toEqual(['a'])
    expect(reg.submit.s1.message).toBe('m')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/types.test.ts`
Expected: FAIL — `RealtimeRule`/`SubmitRule` 未导出（当前 types.ts 无此类型）。

- [ ] **Step 3: 改 types.ts**（替换 `types.ts:55-63` 的 `DomainRuleRegistry` 块）

```typescript
/**
 * realtime 规则：check + 元数据（[020] registry 即 SSOT，meta 自带）。
 * - check：同步、纯函数、无 repo、不读 now/随机。按【单字段值】判定。
 * - fields：phase: both 恰好 1 字段。
 * - message：客户端 blur 提示 + 服务端错误回填匹配。
 */
export interface RealtimeRule {
  check: RealtimeCheck
  fields: string[]
  message: string
}

/**
 * submit 规则：check + 元数据。
 * - check：可异步、可查 repo，按【整个 Intent】判定，返回 5 变体 ValidationResult。
 * - fields/message：记录覆盖字段与提示（meta）。
 */
export interface SubmitRule {
  check: SubmitCheck
  fields: string[]
  message: string
}

/**
 * 域规则注册表（[020] registry 即 SSOT）。
 * - realtime：phase: both 规则（自带 fields/message meta，客户端直 import）
 * - submit：phase: submit 规则（自带 fields/message meta）
 * manifest 不再声明 rules；本注册表为唯一权威来源。
 */
export interface DomainRuleRegistry {
  realtime: Record<string, RealtimeRule>
  submit: Record<string, SubmitRule>
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/types.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/nexus/rules/types.ts src/nexus/rules/__tests__/types.test.ts
git commit -m "refactor(rules): [020] DomainRuleRegistry 扩展——rule 自带 fields/message meta"
```

### Task 1.2: tasks `rules-registry.ts` 改造（handler 包 meta）

**Files:**
- Modify: `src/domains/tasks/rules-registry.ts:126-138`
- Test: 现有 registry 消费测试（Phase 2/3 的 evaluate/realtime test 会覆盖；本 Task 用一个内联结构断言）

- [ ] **Step 1: 写失败测试**（新建 `src/domains/tasks/__tests__/rules-registry.test.ts`）

```typescript
import { describe, it, expect } from 'vitest'
import { taskRuleRegistry } from '../rules-registry'

describe('[020] tasks registry rule 自带 meta', () => {
  it('每条 realtime rule 含 check/fields/message', () => {
    for (const [id, rule] of Object.entries(taskRuleRegistry.realtime)) {
      expect(typeof rule.check).toBe('function')
      expect(Array.isArray(rule.fields)).toBe(true)
      expect(rule.fields.length).toBe(1) // phase: both 恰 1 字段
      expect(typeof rule.message).toBe('string')
      expect(rule.message.length).toBeGreaterThan(0)
    }
  })

  it('submit 聚合规则 task_action_fields_valid 含 meta', () => {
    const rule = taskRuleRegistry.submit.task_action_fields_valid
    expect(rule).toBeDefined()
    expect(typeof rule.check).toBe('function')
    expect(Array.isArray(rule.fields)).toBe(true)
    expect(rule.message).toBe('任务/主线字段校验失败')
  })

  it('realtime 字段映射与原 manifest L 一致（无回归）', () => {
    expect(taskRuleRegistry.realtime.task_estimated_duration_positive.fields).toEqual(['estimatedDuration'])
    expect(taskRuleRegistry.realtime.task_priority_valid.fields).toEqual(['priority'])
    expect(taskRuleRegistry.realtime.thread_color_format.fields).toEqual(['color'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/domains/tasks/__tests__/rules-registry.test.ts`
Expected: FAIL — 当前 registry 导出的是裸函数（`rule.fields` undefined）。

- [ ] **Step 3: 改 `rules-registry.ts:126-138`**（替换导出块）

```typescript
export const taskRuleRegistry: DomainRuleRegistry = {
  realtime: {
    task_estimated_duration_positive: { check: estimatedDurationPositive, fields: ['estimatedDuration'], message: '预估时长必须大于 0' },
    task_estimated_duration_max: { check: estimatedDurationMax, fields: ['estimatedDuration'], message: '预估时长不能超过 24 小时（1440 分钟）' },
    task_priority_valid: { check: priorityValid, fields: ['priority'], message: '优先级必须是 critical/high/medium/low 之一' },
    task_energy_required_valid: { check: energyRequiredValid, fields: ['energyRequired'], message: '能量要求必须是 high/medium/low 之一' },
    task_due_date_format: { check: dueDateFormat, fields: ['dueDate'], message: '截止日期格式必须是 YYYY-MM-DD' },
    thread_color_format: { check: colorFormat, fields: ['color'], message: '颜色格式必须是 #RRGGBB' },
  },
  submit: {
    task_action_fields_valid: {
      check: actionFieldsValid,
      fields: ['title', 'description', 'priority', 'energyRequired', 'estimatedDuration', 'dueDate', 'threadId', 'parentId', 'name', 'color', 'targetStatus', 'currentStatus', 'targetType'],
      message: '任务/主线字段校验失败',
    },
  },
}
```

> `fields`/`message` 值逐字取自原 `src/domains/tasks/manifest.yaml:490-521` 的 L 区声明（无语义变更）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/domains/tasks/__tests__/rules-registry.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/domains/tasks/rules-registry.ts src/domains/tasks/__tests__/rules-registry.test.ts
git commit -m "refactor(tasks): [020] rules-registry handler 包 fields/message meta（registry 即 SSOT）"
```

### Task 1.3: habits `rules-registry.ts` 改造（同构）

**Files:**
- Modify: `src/domains/habits/rules-registry.ts:104-116`
- Test: 新建 `src/domains/habits/__tests__/rules-registry.test.ts`

- [ ] **Step 1: 写失败测试**（新建 `src/domains/habits/__tests__/rules-registry.test.ts`）

```typescript
import { describe, it, expect } from 'vitest'
import { habitRuleRegistry } from '../rules-registry'

describe('[020] habits registry rule 自带 meta', () => {
  it('每条 realtime rule 含 check/fields/message 且恰 1 字段', () => {
    for (const [id, rule] of Object.entries(habitRuleRegistry.realtime)) {
      expect(typeof rule.check).toBe('function')
      expect(rule.fields.length).toBe(1)
      expect(rule.message.length).toBeGreaterThan(0)
    }
  })

  it('submit 聚合规则 habit_action_fields_valid 含 meta', () => {
    const rule = habitRuleRegistry.submit.habit_action_fields_valid
    expect(rule).toBeDefined()
    expect(rule.message).toBe('习惯字段校验失败')
  })

  it('realtime 字段映射与原 manifest L 一致', () => {
    expect(habitRuleRegistry.realtime.habit_default_duration_positive.fields).toEqual(['defaultDuration'])
    expect(habitRuleRegistry.realtime.habit_latest_time_format.fields).toEqual(['latestStartTime'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/domains/habits/__tests__/rules-registry.test.ts`
Expected: FAIL — 裸函数导出。

- [ ] **Step 3: 改 `rules-registry.ts:104-116`**（替换导出块）

```typescript
export const habitRuleRegistry: DomainRuleRegistry = {
  realtime: {
    habit_default_duration_positive: { check: defaultDurationPositive, fields: ['defaultDuration'], message: '默认时长必须大于 0' },
    habit_min_duration_positive: { check: minDurationPositive, fields: ['minDuration'], message: '最短时长必须大于 0' },
    habit_frequency_type_valid: { check: frequencyTypeValid, fields: ['frequencyType'], message: '频率类型必须是 daily/weekly/custom' },
    habit_default_time_format: { check: timeFormatCheck('defaultTime', '默认时间'), fields: ['defaultTime'], message: '默认时间必须是有效的 HH:MM 格式' },
    habit_earliest_time_format: { check: timeFormatCheck('earliestTime', '最早开始时间'), fields: ['earliestTime'], message: '最早开始时间必须是有效的 HH:MM 格式' },
    habit_latest_time_format: { check: timeFormatCheck('latestStartTime', '最迟开始时间'), fields: ['latestStartTime'], message: '最迟开始时间必须是有效的 HH:MM 格式' },
  },
  submit: {
    habit_action_fields_valid: {
      check: actionFieldsValid,
      fields: ['title', 'defaultTime', 'earliestTime', 'latestStartTime', 'defaultDuration', 'minDuration', 'frequencyType', 'habitId', 'name', 'applicableDays', 'templateId', 'date', 'timeOverride'],
      message: '习惯字段校验失败',
    },
  },
}
```

> `fields`/`message` 逐字取自原 `src/domains/habits/manifest.yaml:332-363` L 区声明。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/domains/habits/__tests__/rules-registry.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/domains/habits/rules-registry.ts src/domains/habits/__tests__/rules-registry.test.ts
git commit -m "refactor(habits): [020] rules-registry handler 包 fields/message meta（registry 即 SSOT）"
```

---

## Phase 2: 服务端消费者迁移

### Task 2.1: `evaluateDomainRules` 改读 registry

**Files:**
- Modify: `src/nexus/rules/evaluate.ts:14-64`
- Test: `src/nexus/rules/__tests__/evaluate.test.ts`

- [ ] **Step 1: 先读现有 `evaluate.test.ts`**，理解 fixture 构造方式（它用 `fixtureRuleRegistry` + manifest fixture）。本 Task 改造后测试不再依赖 manifest rules，改用 registry 直传。

- [ ] **Step 2: 写失败测试**（在 `evaluate.test.ts` 追加，用自带 meta 的 registry fixture）

```typescript
import { evaluateDomainRules } from '../evaluate'
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { DomainRuleRegistry } from '../types'
import type { StructuredIntent } from '@/usom/types/objects'

const baseIntent = (action: string, fields: Record<string, unknown> = {}): StructuredIntent =>
  ({ id: 'i1', domainId: 'test', objectType: 'task', action, fields, steps: [] } as unknown as StructuredIntent)

describe('[020] evaluateDomainRules 读 registry（不经 manifest）', () => {
  it('先跑 submit 聚合、其 Rejected 先胜出（D 模式）', async () => {
    const reg: DomainRuleRegistry = {
      realtime: { rt1: { check: () => [{ field: 'a', message: 'rt-err' }], fields: ['a'], message: 'rt' } },
      submit: { s1: { check: async () => validationRejected(['submit-err']), fields: ['a'], message: 'submit' } },
    }
    const res = await evaluateDomainRules('test', baseIntent('x', { a: 1 }), { repos: {}, userId: 'u' as never, now: 0 }, reg)
    expect(res.kind).toBe('Rejected')
    // submit 聚合 Rejected 先胜出，errors 含 submit-err
    expect((res as any).errors).toEqual(expect.arrayContaining(['submit-err']))
  })

  it('submit 全过 + realtime 命中 → Rejected', async () => {
    const reg: DomainRuleRegistry = {
      realtime: { rt1: { check: (v: unknown) => (typeof v === 'number' && v < 0 ? [{ field: 'a', message: '负数' }] : []), fields: ['a'], message: 'rt' } },
      submit: { s1: { check: async () => validationPassed(), fields: ['a'], message: 'submit' } },
    }
    const res = await evaluateDomainRules('test', baseIntent('x', { a: -1 }), { repos: {}, userId: 'u' as never, now: 0 }, reg)
    expect(res.kind).toBe('Rejected')
  })

  it('registry 无规则 → Passed', async () => {
    const res = await evaluateDomainRules('test', baseIntent('x'), { repos: {}, userId: 'u' as never, now: 0 }, { realtime: {}, submit: {} })
    expect(res.kind).toBe('Passed')
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/evaluate.test.ts`
Expected: FAIL — 当前 `evaluateDomainRules` 读 manifest rules，不读 registry 的 fields/message（realtime 用 `rule.fields[0]` 来自 manifest，非 registry）。

- [ ] **Step 4: 改 `evaluate.ts`**（替换 `evaluate.ts:11-64`，删 `loadDomainManifest` 读 rules，改遍历 registry）

```typescript
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { ValidationResult } from '@/usom/types/process'
import { aggregateValidation } from '@/nexus/orchestrator'
import { fieldIssuesToValidationResult } from './adapter'
import type { ClientRuleCtx, DomainRuleRegistry, ServerRuleCtx } from './types'
import type { StructuredIntent } from '@/usom/types/objects'

/**
 * 评估域规则（服务端权威，[020] registry 即 SSOT）。
 *
 * D 模式顺序：先跑 submit 聚合规则、再跑 realtime 规则（submit 的 Rejected 先进
 * results，aggregateValidation 折叠时首个 Rejected 胜出吞粒度——复刻原 manifest L
 * 区「聚合规则置首」语义）。
 *
 * @param domainId 域 id（保留供日志/未来扩展；不再读 manifest）
 * @param intent 结构化意图
 * @param serverCtx 服务端上下文（repos/userId/now）
 * @param registry 本域规则注册表（SSOT，自带 meta）
 */
export async function evaluateDomainRules(
  domainId: string,
  intent: StructuredIntent,
  serverCtx: ServerRuleCtx,
  registry: DomainRuleRegistry,
): Promise<ValidationResult> {
  const clientCtx: ClientRuleCtx = {} // 最小化；realtime 重跑无需 now
  const results: ValidationResult[] = []

  // 1. submit 聚合规则（权威，可查库，fail-CLOSED）
  for (const [id, rule] of Object.entries(registry.submit)) {
    try {
      results.push(await rule.check(intent, serverCtx))
    } catch (e) {
      console.error(`[rules] submit 规则 "${id}" 抛错（fail-closed）:`, e)
      results.push(validationRejected([`规则校验失败，请重试 (${id})`]))
    }
  }

  // 2. realtime 规则 submit 阶段权威重跑（单字段）
  for (const [id, rule] of Object.entries(registry.realtime)) {
    for (const field of rule.fields) {
      try {
        const issues = rule.check(intent.fields[field], clientCtx)
        results.push(fieldIssuesToValidationResult(issues))
      } catch (e) {
        console.error(`[rules] realtime 规则 "${id}" 重跑抛错（fail-closed）:`, e)
        results.push(validationRejected([`规则校验失败，请重试 (${id})`]))
      }
    }
  }

  return results.reduce((acc, r) => aggregateValidation(acc, r), validationPassed() as ValidationResult)
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/evaluate.test.ts`
Expected: PASS（若旧测试因 manifest fixture 失效，同步更新为 registry fixture——旧测试断言的是行为，不是 manifest 读取）。

- [ ] **Step 6: Commit**

```bash
git add src/nexus/rules/evaluate.ts src/nexus/rules/__tests__/evaluate.test.ts
git commit -m "refactor(rules): [020] evaluateDomainRules 改读 registry（删 loadDomainManifest 读 rules，D 模式顺序保持）"
```

---

## Phase 3: 客户端迁移 + 删中转

### Task 3.1: `realtime.ts` 改读 registry + 新增 `realtimeMetaFromRegistry`

**Files:**
- Modify: `src/nexus/rules/realtime.ts:30-50`
- Test: `src/nexus/rules/__tests__/realtime.test.ts`

- [ ] **Step 1: 写失败测试**（在 `realtime.test.ts` 追加）

```typescript
import { evaluateRealtimeRules, realtimeMetaFromRegistry } from '../realtime'
import type { DomainRuleRegistry } from '../types'

const reg: DomainRuleRegistry = {
  realtime: {
    r1: { check: (v: unknown) => (v === 'bad' ? [{ field: 'a', message: '错' }] : []), fields: ['a'], message: 'a 提示' },
    r2: { check: () => [], fields: ['b'], message: 'b 提示' },
  },
  submit: {},
}

describe('[020] realtime 读 registry', () => {
  it('realtimeMetaFromRegistry 从 registry 派生 meta', () => {
    const meta = realtimeMetaFromRegistry(reg)
    expect(meta).toEqual([
      { id: 'r1', fields: ['a'], message: 'a 提示' },
      { id: 'r2', fields: ['b'], message: 'b 提示' },
    ])
  })

  it('evaluateRealtimeRules 直接读 registry（单参 registry）', () => {
    const issues = evaluateRealtimeRules(reg, 'a', 'bad', {})
    expect(issues).toEqual([{ field: 'a', message: '错' }])
    // 命中字段过滤：b 字段规则不跑
    expect(evaluateRealtimeRules(reg, 'b', 'x', [])).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/realtime.test.ts`
Expected: FAIL — `evaluateRealtimeRules` 当前签名 `(realtimeRules, field, value, ctx, registry)`，不接受单参 registry；`realtimeMetaFromRegistry` 未导出。

- [ ] **Step 3: 改 `realtime.ts`**（替换 `realtime.ts:22-50`）

```typescript
/**
 * 从 registry 派生 phase: both 规则元数据（[020] registry 即 SSOT，取代 get-realtime-rules server action 中转）。
 * 供 useManifestRules / useServerErrorBackfill 等客户端消费者按需取 meta。
 */
export function realtimeMetaFromRegistry(registry: DomainRuleRegistry): RealtimeRuleMeta[] {
  return Object.entries(registry.realtime).map(([id, rule]) => ({
    id,
    fields: rule.fields,
    message: rule.message,
  }))
}

/**
 * 评估命中指定字段的所有 phase: both 规则（[020] 直接读 registry）。
 * @param registry 本域注册表（realtime rule 自带 fields/message/check）
 * @param field blur 的字段名
 * @param value 该字段当前值
 * @param ctx 客户端上下文（最小化，无 now）
 */
export function evaluateRealtimeRules(
  registry: DomainRuleRegistry,
  field: string,
  value: unknown,
  ctx: ClientRuleCtx,
): FieldIssue[] {
  const issues: FieldIssue[] = []
  for (const [id, rule] of Object.entries(registry.realtime)) {
    if (!rule.fields.includes(field)) continue
    try {
      issues.push(...rule.check(value, ctx))
    } catch (e) {
      // fail-OPEN：realtime 坏不阻断用户，吞错+记日志，submit 权威兜底
      console.error(`[rules] realtime 规则 "${id}" 抛错（fail-open，已吞）:`, e)
    }
  }
  return issues
}
```

> `RealtimeRuleMeta` 接口（`realtime.ts:14-20`）保留——`realtimeMetaFromRegistry` 返回它，供 `useServerErrorBackfill` 内部用。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/realtime.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/nexus/rules/realtime.ts src/nexus/rules/__tests__/realtime.test.ts
git commit -m "refactor(rules): [020] evaluateRealtimeRules 改读 registry + 新增 realtimeMetaFromRegistry"
```

### Task 3.2: `use-manifest-rules.ts` 改单参 registry

**Files:**
- Modify: `src/nexus/rules/use-manifest-rules.ts:33-113`
- Test: `src/nexus/rules/__tests__/` 下若有 use-manifest-rules 测试则更新；否则新建内联结构测试

- [ ] **Step 1: 写失败测试**（新建 `src/nexus/rules/__tests__/use-manifest-rules.test.ts`，用 @testing-library/react renderHook 或直接测纯函数派生）

```typescript
import { describe, it, expect } from 'vitest'
import { realtimeMetaFromRegistry } from '../realtime'
import { taskRuleRegistry } from '@/domains/tasks/rules-registry'

describe('[020] useManifestRules 单参 registry 派生 meta', () => {
  it('从 registry 派生的 meta 与原 getRealtimeRules(tasks) 等价', () => {
    const meta = realtimeMetaFromRegistry(taskRuleRegistry)
    // 原 manifest L phase:both 规则 id 全覆盖
    const ids = meta.map((m) => m.id)
    expect(ids).toEqual(expect.arrayContaining([
      'task_estimated_duration_positive', 'task_estimated_duration_max',
      'task_priority_valid', 'task_energy_required_valid',
      'task_due_date_format', 'thread_color_format',
    ]))
    expect(meta.length).toBe(6)
  })
})
```

- [ ] **Step 2: 跑测试确认通过**（此测试验证派生正确性，应直接 PASS——确认 meta 来源切换无损）

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/use-manifest-rules.test.ts`
Expected: PASS（派生逻辑已在 Task 3.1 验证）。

- [ ] **Step 3: 改 `use-manifest-rules.ts`**（`useManifestRules` 与 `useServerErrorBackfill` 改单参 registry，内部 `realtimeMetaFromRegistry` 派生）

替换 `use-manifest-rules.ts:15-113`：

```typescript
import { useState, useCallback, useMemo } from 'react'
import { evaluateRealtimeRules, realtimeMetaFromRegistry, type RealtimeRuleMeta } from './realtime'
import { mapServerErrorsToFields } from './server-error-mapping'
import type { ClientRuleCtx, DomainRuleRegistry } from './types'

export interface UseManifestRulesResult {
  errors: Record<string, string>
  validateField: (field: string, value: unknown) => void
  clearField: (field: string) => void
  validateAll: (values: Record<string, unknown>) => boolean
}

/**
 * [020] registry 即 SSOT：realtime meta 从 registry 派生，不再经 get-realtime-rules server action。
 * @param registry 本域注册表（client import，realtime rule 自带 fields/message）
 * @param ctx 客户端上下文（最小化）
 */
export function useManifestRules(
  registry: DomainRuleRegistry,
  ctx: ClientRuleCtx = {},
): UseManifestRulesResult {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const stableCtx = useMemo<ClientRuleCtx>(() => ctx, []) // eslint-disable-line react-hooks/exhaustive-deps
  const realtimeRules = useMemo<RealtimeRuleMeta[]>(() => realtimeMetaFromRegistry(registry), [registry])

  const validateField = useCallback(
    (field: string, value: unknown) => {
      const issues = evaluateRealtimeRules(registry, field, value, stableCtx)
      setErrors((prev) => {
        const next = { ...prev }
        const hit = issues.find((i) => i.field === field)
        if (hit) next[field] = hit.message
        else delete next[field]
        return next
      })
    },
    [registry, stableCtx],
  )

  const validateAll = useCallback(
    (values: Record<string, unknown>): boolean => {
      const fields = new Set(realtimeRules.flatMap((r) => r.fields))
      const next: Record<string, string> = {}
      for (const f of fields) {
        const issues = evaluateRealtimeRules(registry, f, values[f], stableCtx)
        const hit = issues.find((i) => i.field === f)
        if (hit) next[f] = hit.message
      }
      setErrors(next)
      return Object.keys(next).length === 0
    },
    [registry, realtimeRules, stableCtx],
  )

  const clearField = useCallback((field: string) => {
    setErrors((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  return { errors, validateField, clearField, validateAll }
}

export interface ServerErrorBackfillResult {
  serverFieldErrors: Record<string, string>
  formErrors: string[]
}

/**
 * [020] realtimeRules 从 registry 派生。
 */
export function useServerErrorBackfill(
  serverErrors: string[] | undefined,
  registry: DomainRuleRegistry,
): ServerErrorBackfillResult {
  return useMemo(() => {
    if (!serverErrors || serverErrors.length === 0) {
      return { serverFieldErrors: {} as Record<string, string>, formErrors: [] as string[] }
    }
    const realtimeRules = realtimeMetaFromRegistry(registry)
    const ruleMessages: Record<string, string> = {}
    for (const r of realtimeRules) {
      ruleMessages[r.id] = r.message
    }
    const mapped = mapServerErrorsToFields(serverErrors, realtimeRules, ruleMessages)
    return { serverFieldErrors: mapped.fieldErrors, formErrors: mapped.formErrors }
  }, [serverErrors, registry])
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/use-manifest-rules.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/nexus/rules/use-manifest-rules.ts src/nexus/rules/__tests__/use-manifest-rules.test.ts
git commit -m "refactor(rules): [020] useManifestRules/useServerErrorBackfill 改单参 registry（删 get-realtime-rules 中转依赖）"
```

### Task 3.3: 删 `get-realtime-rules.ts` + 清理 `rules/index.ts` 导出

**Files:**
- Delete: `src/nexus/rules/server/get-realtime-rules.ts`
- Modify: `src/nexus/rules/index.ts`（删 `getRealtimeRules` 导出 + `server/get-realtime-rules` 相关注释）

- [ ] **Step 1: 改 `rules/index.ts`**——删除 `export { getRealtimeRules } from './server/get-realtime-rules'` 行（`index.ts:24`），并更新文件头注释（`index.ts:8` 提到 client-safe 子模块含 server/get-realtime-rules，移除该提及）。

- [ ] **Step 2: 删文件**

```bash
git rm src/nexus/rules/server/get-realtime-rules.ts
```

- [ ] **Step 3: 确认无残留 import**

Run: `cd frontend && grep -rn "get-realtime-rules\|getRealtimeRules" src --include=*.ts --include=*.tsx | grep -v __tests__`
Expected: 无输出（Task 3.4 已改完所有消费组件后；若此时仍有输出，属 Task 3.4 未完成，先完成 3.4）。

> **顺序提示**：Task 3.3 与 3.4 有循环依赖（删 get-realtime-rules 后组件不能再 import）。**建议先做 Task 3.4（改组件不再 import getRealtimeRules），再回来执行 3.3 的删除 + index.ts 清理**。本 Task 编号在前仅为归类，执行时 3.4 先于 3.3 的 Step 2。

- [ ] **Step 4: Commit**（与 3.4 合并提交，或单独）

```bash
git add src/nexus/rules/index.ts
git commit -m "refactor(rules): [020] 删 get-realtime-rules server action + 清理 barrel 导出"
```

### Task 3.4: 改 5 个消费组件（删中转，直传 registry）

**Files（5 个，模式相同）:**
- `src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx`（:14-15, :68-78）
- `src/domains/tasks/cnui/surfaces/TaskEditCard.tsx`（:17-18, ~:94-98）
- `src/domains/tasks/cnui/surfaces/ThreadCreationCard.tsx`（:14-15, ~:57-61）
- `src/domains/tasks/components/task-edit-zone.tsx`（:21-22, ~:221-225）
- `src/domains/habits/components/habit-form.tsx`（:18-19, ~:106-113）

每个组件的改动模式（以 `TaskCreationCard.tsx` 为例）：

- [ ] **Step 1: 删 getRealtimeRules import + RealtimeRuleMeta import + realtimeRules state + useEffect**

`TaskCreationCard.tsx` 改动：
- 删 `:15` `import { getRealtimeRules } from '@/nexus/rules/server/get-realtime-rules'`
- 删 `:16` `import type { RealtimeRuleMeta } from '@/nexus/rules/realtime'`（若不再用）
- 删 `:68` `const [realtimeRules, setRealtimeRules] = useState<RealtimeRuleMeta[]>([])`
- 删 `:70-75` `useEffect(() => { ... getRealtimeRules('tasks') ... }, [])`
- `:69` `useManifestRules(realtimeRules, taskRuleRegistry)` → `useManifestRules(taskRuleRegistry)`
- `:78` `useServerErrorBackfill(serverErrors, realtimeRules)` → `useServerErrorBackfill(serverErrors, taskRuleRegistry)`

- [ ] **Step 2: 对其余 4 个组件重复相同模式**

各组件对应改动点（行号近似，执行时以实际为准）：
- **TaskEditCard.tsx**：删 `:18` getRealtimeRules import、realtimeRules state、useEffect；`:94` `useManifestRules(realtimeRules, taskRuleRegistry)` → `useManifestRules(taskRuleRegistry)`；`useServerErrorBackfill(serverErrors, realtimeRules)` → `useServerErrorBackfill(serverErrors, taskRuleRegistry)`。
- **ThreadCreationCard.tsx**：同 TaskCreationCard 模式（`:15`/`:57`/`:61`）。
- **task-edit-zone.tsx**：删 `:22` getRealtimeRules import、realtimeRules state、`:225` useEffect；`:221` `useManifestRules(realtimeRules, taskRuleRegistry)` → `useManifestRules(taskRuleRegistry)`。
- **habit-form.tsx**：删 `:19` getRealtimeRules import、realtimeRules state、`:113` useEffect；`:106` `useManifestRules(realtimeRules, habitRuleRegistry)` → `useManifestRules(habitRuleRegistry)`；`useServerErrorBackfill(serverErrors, realtimeRules)` → `useServerErrorBackfill(serverErrors, habitRuleRegistry)`。

- [ ] **Step 3: tsc + vitest 全量验证（Phase 3 收敛点）**

Run:
```bash
cd frontend
grep -rn "getRealtimeRules\|get-realtime-rules" src --include=*.ts --include=*.tsx   # 应无输出
npx vitest run src/nexus/rules src/domains/tasks src/domains/habits                    # rules + 两域全绿
npx tsc --noEmit 2>&1 | grep -E "rules|TaskCreationCard|TaskEditCard|ThreadCreationCard|task-edit-zone|habit-form"   # 改动文件无类型错误
```
Expected: grep 无输出；vitest 全绿；tsc 改动文件零错误（预存其他文件错误与本 plan 无关，记录但不修）。

- [ ] **Step 4: Commit**（与 Task 3.3 合并）

```bash
git add src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx src/domains/tasks/cnui/surfaces/TaskEditCard.tsx src/domains/tasks/cnui/surfaces/ThreadCreationCard.tsx src/domains/tasks/components/task-edit-zone.tsx src/domains/habits/components/habit-form.tsx
git commit -m "refactor(ui): [020] 5 个 realtime 消费组件直传 registry（删 getRealtimeRules 中转调用）"
```

---

## Phase 4: 去 manifest C/L

### Task 4.1: tasks manifest 删 C label/required + L rules

**Files:**
- Modify: `src/domains/tasks/manifest.yaml`

- [ ] **Step 1: 删 L 区 rules 整块**（`manifest.yaml:485-522`，含区块头注释 `# ─── 区块 L: rules ...`）。manifest 不再声明 rules（registry 即 SSOT）。

- [ ] **Step 2: 删 C 区 field_metadata 每个字段的 `label`/`required` 行**（`manifest.yaml:248-309`）。删后 `field_metadata` 形态（保留 `type`/`options`/`mutation_mode`）：

```yaml
# ─── 区块 C: field_metadata（[020] 仅保留 type/options/mutation_mode 供 field-executor 消费；label/required 移除——前端表单手写硬编码）──
field_metadata:
  title:
    type: string
    mutation_mode: ContentField
  name:
    type: string
    mutation_mode: ContentField
  description:
    type: string
    mutation_mode: ContentField
  priority:
    type: enum
    options: [critical, high, medium, low]
    mutation_mode: FactField
  energyRequired:
    type: enum
    options: [high, medium, low]
    mutation_mode: FactField
  estimatedDuration:
    type: number
    mutation_mode: FactField
  dueDate:
    type: date
    mutation_mode: FactField
  color:
    type: string
    mutation_mode: ContentField
  threadId:
    type: string
    mutation_mode: FactField
  # 完成任务时记录的实际时长/备注（completeTask 走字段执行器，须在此声明）
  actualDuration:
    type: number
    mutation_mode: FactField
  notes:
    type: string
    mutation_mode: ContentField
```

> **E 区 `required_fields`（区块 E）不动**——被 AI intent parser 消费。

- [ ] **Step 3: 验证**

Run:
```bash
cd frontend
npm run validate:manifest     # tasks manifest 校验通过（区块 G 因 rawRules.length=0 自动 no-op）
npm run validate:structure    # 结构校验通过
npx vitest run src/domains/tasks   # tasks 域测试全绿（registry 已自带 meta，manifest rules 删除不影响运行时）
```
Expected: validator 通过；vitest 全绿。

- [ ] **Step 4: Commit**

```bash
git add src/domains/tasks/manifest.yaml
git commit -m "refactor(tasks): [020] manifest 删 C 区 label/required + L 区 rules（registry 即 SSOT）"
```

### Task 4.2: habits manifest 删 C label/required + L rules

**Files:**
- Modify: `src/domains/habits/manifest.yaml`

- [ ] **Step 1: 删 L 区 rules 整块**（`manifest.yaml:327-364`，含区块头注释）。

- [ ] **Step 2: 删 C 区 field_metadata 每字段 `label`/`required` 行**（`manifest.yaml:135-216`）。删后形态（保留 `type`/`options`/`mutation_mode`，删 `[018-G1]` 注释中提及 label/required 的措辞）：

```yaml
# ─── 区块 C: field_metadata（[020] 仅保留 type/options/mutation_mode；label/required 移除）──
# 字段执行器对未声明字段拒绝写入（F-1），须与 irepository.ts CreateHabitInput 一致。
field_metadata:
  title:
    type: string
    mutation_mode: ContentField
  description:
    type: string
    mutation_mode: ContentField
  startDate:
    type: date
    mutation_mode: ContentField
  endDate:
    type: date
    mutation_mode: ContentField
  keyResultId:
    type: string
    mutation_mode: ContentField
  tags:
    type: json
    mutation_mode: ContentField
  defaultTime:
    type: time
    mutation_mode: FactField
  earliestTime:
    type: time
    mutation_mode: FactField
  latestStartTime:
    type: time
    mutation_mode: FactField
  defaultDuration:
    type: number
    mutation_mode: FactField
  minDuration:
    type: number
    mutation_mode: FactField
  trackable:
    type: boolean
    mutation_mode: FactField
  frequencyType:
    type: enum
    options: [daily, weekly, custom]
    mutation_mode: FactField
  daysOfWeek:
    type: json
    mutation_mode: FactField
```

> **E 区 `required_fields` + 区块 H `templates` 不动**。

- [ ] **Step 3: 验证**

Run:
```bash
cd frontend
npm run validate:manifest
npm run validate:structure
npx vitest run src/domains/habits
```
Expected: 全绿。

- [ ] **Step 4: Commit**

```bash
git add src/domains/habits/manifest.yaml
git commit -m "refactor(habits): [020] manifest 删 C 区 label/required + L 区 rules（registry 即 SSOT）"
```

---

## Phase 5: validator

### Task 5.1: 删 `integrity.ts` + 其测试

**Files:**
- Delete: `src/nexus/rules/integrity.ts`
- Delete: `src/nexus/rules/__tests__/integrity.test.ts`

- [ ] **Step 1: 确认无其他 import**

Run: `cd frontend && grep -rn "rules/integrity\|validateRuleIntegrity" src scripts --include=*.ts`
Expected: 仅 `validate-manifest.ts`（Task 5.2 删除该调用）+ `integrity.test.ts`（本 Task 删）。

- [ ] **Step 2: 删文件**

```bash
git rm src/nexus/rules/integrity.ts src/nexus/rules/__tests__/integrity.test.ts
```

- [ ] **Step 3: Commit**（与 Task 5.2 合并提交更连贯；可单独）

```bash
git commit -m "refactor(rules): [020] 删 integrity.ts（G-rule-integrity 循环论证消除）"
```

### Task 5.2: `validate-manifest.ts` 删区块 G

**Files:**
- Modify: `scripts/validate-manifest.ts:348-376`

- [ ] **Step 1: 删区块 G**（`validate-manifest.ts:348-376`，从 `// ── 区块 G: rules id 完整性` 注释到对应 `}` 闭合）。该区块 require rules-registry + `validateRuleIntegrity`，manifest 删 rules 后 `rawRules.length===0` 本就 no-op；显式删除以消除循环论证代码 + 对 `integrity.ts` 的依赖。

- [ ] **Step 2: 检查是否还有 `path`/`require` 未用 import**

Run: `cd frontend && npx tsc --noEmit scripts/validate-manifest.ts 2>&1 | head`
Expected: 无 unused import 错误（若 `path` 仍被他处用则保留）。

- [ ] **Step 3: 验证 validator 仍通过**

Run: `cd frontend && npm run validate:manifest`
Expected: ✓ 全部通过（无 G-rule-integrity / G-registry-missing 诊断）。

- [ ] **Step 4: 更新 validator 测试**（若 `scripts/__tests__/` 有断言区块 G 的测试，删除/更新该断言）

Run: `cd frontend && grep -rn "G-rule-integrity\|G-registry\|区块 G\|rules id 完整性" scripts/__tests__ src/nexus/rules/__tests__`
Expected: 定位到相关断言后删除（manifest 已无 rules，该规则不再触发）。

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-manifest.ts
git commit -m "refactor(validator): [020] validate-manifest 删区块 G（rules id 完整性，随 manifest L 删除失效）"
```

### Task 5.3: `schema.ts` `FieldMetadataSchema` 删 label/required

**Files:**
- Modify: `src/domains/manifest-loader/schema.ts:70-85`

- [ ] **Step 1: 改 `FieldMetadataSchema`**（删 `label`/`required`/`default_value`/`description`，保留 `type`/`options`/`mutation_mode`）

```typescript
/**
 * 字段元数据模式（[020] 仅保留运行时消费字段：type/options/mutation_mode。
 * label/required/default_value/description 已删——前端表单手写硬编码，零运行时消费。
 * ManifestSchema 非 strict，旧域（okrs/timebox）残留的 label/required 会被 strip 不报错。）
 */
const FieldMetadataSchema = z.object({
  /** 字段类型（field-executor 校验消费） */
  type: z.enum(['string', 'number', 'boolean', 'date', 'time', 'enum', 'json', 'lifecycle_timestamp']),
  /** 枚举选项（field-executor enum 校验消费） */
  options: z.array(z.string()).optional(),
  /** 字段写入分类（resolveMutationMode 消费）：FactField 走写入口 / ContentField 直走 Repo / PresentationField 本地态 */
  mutation_mode: z.enum(['FactField', 'ContentField', 'PresentationField']).optional(),
})
```

> **`FieldPromptSchema`（E 区，`schema.ts:102-117`）不动**——E 区被 AI parser 消费。

- [ ] **Step 2: 验证**（loader 用 safeParse，非 strict strip；okrs/timebox 残留 label/required 被 strip）

Run:
```bash
cd frontend
npm run validate:manifest                          # 全域通过（含 okrs/timebox 旧 C 残留被 strip）
npx vitest run src/domains/manifest-loader          # loader 测试全绿
npx tsc --noEmit 2>&1 | grep "schema.ts"            # schema.ts 无类型错误
```
Expected: 全绿。

- [ ] **Step 3: Commit**

```bash
git add src/domains/manifest-loader/schema.ts
git commit -m "refactor(schema): [020] FieldMetadataSchema 删 label/required/default_value/description（零运行时消费）"
```

### Task 5.4: `validate-domain-structure.ts` sunset 显式记债

**Files:**
- Modify: `scripts/validate-domain-structure.ts:474-478`（`RULES_REGISTRY_EXEMPTIONS`）

- [ ] **Step 1: 补充豁免 reason**（显式记录 okrs/timebox 维持旧 C 范式 + 无 registry 的债；技术上已豁免，此处补 reason 描述让分叉可见）

```typescript
/** rules-registry 豁免（缺 L3 + [020] C/L 旧范式，带 sunset） */
export const RULES_REGISTRY_EXEMPTIONS = [
  { domain: 'okrs', reason: '无 rules-registry + C 区 field_metadata 仍带旧范式（[020] 未迁，registry 即 SSOT 的例外）', sunset: 'okrs 全量 onboarding' },
  { domain: 'timebox', reason: '写域缺 L3 规则三层 + C 区 field_metadata 仍带旧范式（[020] 未迁）', sunset: 'timebox L3 补齐 + 全量 onboarding' },
] as const
```

- [ ] **Step 2: 验证**

Run: `cd frontend && npm run validate:structure`
Expected: ✓ 通过（okrs/timebox 仍豁免）。

- [ ] **Step 3: Commit**

```bash
git add scripts/validate-domain-structure.ts
git commit -m "chore(validator): [020] sunset 清单显式记录 okrs/timebox C/L 旧范式债"
```

---

## Phase 6: constitution EFFECTIVE + 文档同步

### Task 6.1: `constitution.md` 修正 + version 2.1.0

**Files:**
- Modify: `.specify/memory/constitution.md`（§III ~150-156、§VIII ~475-489、§IX ~529-535、version ~1270）

- [ ] **Step 1: §IX 约束 2 删诱导句**（`constitution.md:529-531`）——删除「否则 inline 编辑静默绕过业务规则」，保留跨字段红线原则。
- [ ] **Step 2: §IX 约束 3 删 manifest 声明**（`constitution.md:533-535`）——「manifest `rules:` 声明规则 + `rules-registry` 注册处理器」改为「`rules-registry` 注册处理器（registry 即 SSOT，自带 phase/fields/message meta）」。
- [ ] **Step 3: §VIII 规则三层架构治理**（`constitution.md:482-487`）——删「治理约束（manifest `rules:` 区块）」+「manifest 每个 `rule.id` 必须在域 registry 注册；scripts/validate-manifest.ts 强制」；规则三层（L1 realtime / L2 onValidate / L3 RuleEngine）描述保留，来源改为 registry。
- [ ] **Step 4: §III 字段三分类补充**（`constitution.md:150-156` 表后）——加一句：「`FactField` ≠ 必须可 inline 编辑的字段——能否 inline 由是否存在 `phase: both` realtime rule 决定（UX 轴），与写入路径（mutation_mode 轴）正交。」
- [ ] **Step 5: version bump**（`constitution.md:1270`）——2.0.0 → 2.1.0，Last Amended: 2026-06-24，附 [020] MINOR 说明。

- [ ] **Step 6: 验证 constitution 自洽**

Run: `cd /home/walker/lifeware && grep -n "manifest rules:\|manifest \`rules:\|inline 编辑静默" .specify/memory/constitution.md`
Expected: 无输出（诱导句 + manifest rules 声明均已移除）。

- [ ] **Step 7: Commit**

```bash
git add .specify/memory/constitution.md
git commit -m "docs(constitution): [020] §IX/§VIII/§III 修正——registry 即 SSOT + 字段三分类澄清 (v2.1.0 MINOR)"
```

### Task 6.2: amendment 标 EFFECTIVE

**Files:**
- Modify: `.specify/amendments/proposed-IX-rules-ssot.md`

- [ ] **Step 1: 状态行 PROPOSED → ✅ EFFECTIVE**，生效状态 check 全部打 ✅。

- [ ] **Step 2: Commit**

```bash
git add .specify/amendments/proposed-IX-rules-ssot.md
git commit -m "docs(constitution): [020] §IX 规则三层收敛 amendment EFFECTIVE (v2.1.0)"
```

### Task 6.3: `manifest.md` + `domain-development-guide.md` 同步

**Files:**
- Modify: `manifest.md`（版本历史表）
- Modify: `docs/domain-development-guide.md`（规则三层描述）

- [ ] **Step 1: `manifest.md` 版本历史**——加 constitution v2.1.0 条目（[020] MINOR：§IX 规则三层收敛 registry 即 SSOT + 字段三分类澄清）。

- [ ] **Step 2: `docs/domain-development-guide.md`**——更新规则三层描述：manifest 不再声明 rules，registry 即 SSOT（handler 自带 phase/fields/message meta）；跨字段红线措辞同步（删 inline 诱导）。

- [ ] **Step 3: 验证 Tier-2 文档同步**（CLAUDE.md 约束）

Run: `cd /home/walker/lifeware && grep -n "manifest rules\|registry 即 SSOT\|规则三层" docs/domain-development-guide.md | head`
Expected: 描述已更新，无残留「manifest 声明 rules」表述。

- [ ] **Step 4: Commit**

```bash
git add manifest.md docs/domain-development-guide.md
git commit -m "docs: [020] manifest 版本历史 + domain-development-guide 规则三层描述同步 (constitution v2.1.0)"
```

---

## 最终验收（Change Delivery Gate）

- [ ] **全量验证**：
```bash
cd frontend
npm run validate:manifest        # ✓
npm run validate:structure       # ✓
npx vitest run                    # 全绿（含新 registry/evaluate/realtime 测试 + 两域 + validator）
npx tsc --noEmit                  # 改动文件零类型错误（预存债记录但不属本 plan）
```
- [ ] **去 C/L 零残留**：`grep -rn "getRealtimeRules\|get-realtime-rules\|validateRuleIntegrity\|rules/integrity" src scripts` 无输出。
- [ ] **manifest L 零残留**：`grep -n "^rules:" src/domains/tasks/manifest.yaml src/domains/habits/manifest.yaml` 无输出。
- [ ] **constitution 自洽**：诱导句 + manifest rules 声明已移除，v2.1.0。
- [ ] **E 区 / D3 未触动**：`routing-context.ts` 未改（E 区保留）；`evaluateDomainRules` 签名未加 currentObject（D3 defer）。

---

## Self-Review（plan 作者自检）

**1. Spec coverage（design doc §6 逐项）：**
- §6.1 去 manifest C/L → Phase 1（registry meta）+ Phase 4（删 C/L）。✅
- §6.2 规则代码化（registry 自带 meta）→ Phase 1。✅
- §6.3 修字段写入路径（D3）→ **显式 defer**（Scope 边界 + 最终验收）。事务原子性已在 commit a47c418 修。✅（defer 有据）
- §6.4 validator（G-rule-integrity 删 / mutation_mode / sunset）→ Phase 5。✅
- §6.5 constitution 修订 → Phase 0 + Phase 6。✅

**2. Placeholder scan：** 无 TBD/TODO；每个代码 step 给完整代码或精确 old→new；manifest 删除给完整目标结构。✅

**3. Type consistency：** `RealtimeRule`/`SubmitRule`（Task 1.1 定义）在 Task 1.2/1.3/2.1/3.1/3.2 一致使用；`realtimeMetaFromRegistry`（Task 3.1 定义）在 Task 3.2 消费；`evaluateRealtimeRules(registry, field, value, ctx)`（Task 3.1 新签名）在 Task 3.2 useManifestRules 调用一致。✅

**4. 顺序依赖：** Phase 1（types+registry）→ Phase 2（evaluate）→ Phase 3（realtime+useManifestRules+组件，3.4 先于 3.3 删除）→ Phase 4（manifest）→ Phase 5（validator）→ Phase 6（constitution）。每个 Phase 末尾有验证 checkpoint。✅

---

## ⚠️ A1 连续性警告（plan-eng-review，执行必读）

**Phase 1→2→3 是运行时不可用的中间态窗口。** Task 1.2/1.3 把 registry 从「裸函数」改为 `{check,fields,message}` 对象后，`evaluate.ts`（Phase 2 才改）仍 `registry.realtime[id](...)` 把对象当函数调、`hooks.ts` 传真实 registry → **运行时 break**（不只是 tsc 红）。逐 Task commit 是 feature-branch 中间红常态，**但 Phase 1-3 必须连续完成后才可部署/跑集成测试**；各 Task commit 末尾只跑该 Task 自己的单测，**不**跑全量集成。Phase 3 末尾（Task 3.4 Step 3）是第一个全量 tsc+vitest 收敛点。

---

## NOT in scope（plan-eng-review 确认）

- **D3 聚合校验**（currentObject 注入改 `evaluateDomainRules` 签名）——单独 plan，需先 brainstorm 设计。
- **E 区 `required_fields`**——被 AI intent parser 消费（`routing-context.ts:83-97`），活字段，不动。
- **OKR/Timebox 代码迁移**——维持旧 C 范式 + 无 registry，仅 sunset 记债。
- **F1 仅收敛 realtime↔submit 重叠 message**——`validation.ts` 中非 realtime 对应的 error（如 required 必填）仍本地字符串，不纳入常量化（超 scope）。
- **message 单源跨域**——`TASK_RULE_MESSAGES` / `HABIT_RULE_MESSAGES` 各域独立，不做跨域统一（YAGNI）。

## What already exists（复用，不重建）

- **registry**（[018-G3]）：`{realtime, submit}` 结构已存在，本 plan 仅扩展 rule 自带 meta + 删 manifest 冗余声明，不建并行系统。
- **`aggregateValidation`**（`orchestrator/index.ts:129`）：D 模式 `a.kind==='Rejected' return a` 已实现，本 plan 的「先 submit 后 realtime」顺序复用它，零新规则。
- **field-executor**：已消费 `type`/`options`/`mutation_mode`，本 plan 保留 C 区这三字段不动。
- **`mapServerErrorsToFields`**（`server-error-mapping.ts:31`）：精确字符串回填已实现，F1 常量化保护其契约。
- **sunset 豁免机制**（`validate-domain-structure.ts:466`）：`RULES_REGISTRY_EXEMPTIONS` 已托管 okrs/timebox，本 plan 仅补 reason 文案。

## Failure modes（新 codepath 生产失败场景）

| Codepath | 失败场景 | 测试 | 错误处理 | 用户可见 |
|---|---|---|---|---|
| `evaluateDomainRules` 读 registry | registry 漏注册某 rule（运行时 `rule.check` undefined） | C1 CI 强制 + evaluate `if(!check)continue` 守卫 | 跳过+日志 | 静默（submit 兜底） |
| `evaluateRealtimeRules` 单参 registry | rule 多字段（违反单字段约束） | **C1 CI 强制**（否则静默跑多次） | 无 | blur 语义错乱 → **C1 堵这个** |
| message 双源漂移 | registry msg ≠ validation.ts msg → 回填失配 | **F1 常量化**（单源消除）+ 断言 | 无 | 标红失效 → **F1 堵这个** |
| okrs/timebox 旧 C 残留 | 未来 ManifestSchema 改 `.strict()` → 两域炸 | **F3 loader 单测**保护 | safeParse 报错 | 加载失败 → **F3 早期信号** |
| `useManifestRules` 单参迁移 | 签名迁移细微偏差 | **T3 hook 行为测试** | 无 | blur 校验失效 → **T3 堵** |
| D 模式吞粒 regression | aggregate 改合并 errors → realtime 错混入 | **T1 regression test**（not.toContain） | 无 | 错误冗余 → **T1 堵** |

**无「无测试+无处理+静默」的 critical gap**——每个失败模式都被一项 review 决策堵住。

## Worktree parallelization

**Sequential，无并行机会。** Phase 1-3 强耦合（registry 结构变 → evaluate/realtime/useManifestRules/5组件 必须同步迁移），共享 `src/nexus/rules/` + 两域 registry，任何并行都会撞同一模块。Phase 4-6 依赖 Phase 1-3 完成。单 worktree 顺序执行。

## Implementation Tasks（评审决策修订，synthesized from plan-eng-review）

> 以下 task 由 plan-eng-review 产生，叠在原 plan 各 Phase 之上执行。每条标影响的原 Task。

- [ ] **RT1 (P1, human: ~1h / CC: ~10min)** — F1 message 单源 — 提取 `TASK_RULE_MESSAGES` / `HABIT_RULE_MESSAGES` 常量
  - Surfaced by: Outside voice F1（message 三源，回填精确匹配易漂移，用户选 B 彻底收敛）
  - Files: `src/domains/tasks/validation.ts`、`src/domains/habits/validation.ts`、两域 `rules-registry.ts`
  - 改动：在 `tasks/validation.ts` 顶部导出常量，`validateTaskFields` 内硬编码串改引用；`tasks/rules-registry.ts` 的 `message` 改引用同一常量。habits 同构。
  ```typescript
  // tasks/validation.ts 顶部
  /** [020] F1：rule message 单源，registry realtime 与 submit 校验共用，防漂移致回填失配。 */
  export const TASK_RULE_MESSAGES = {
    estimatedDurationPositive: '预估时长必须大于 0',
    estimatedDurationMax: '预估时长不能超过 24 小时（1440 分钟）',
    priorityValid: '优先级必须是 critical/high/medium/low 之一',
    energyRequiredValid: '能量要求必须是 high/medium/low 之一',
    dueDateFormat: '截止日期格式必须是 YYYY-MM-DD',
    colorFormat: '颜色格式必须是 #RRGGBB',
  } as const
  // validateTaskFields 内：errors.push('预估时长必须大于 0') → errors.push(TASK_RULE_MESSAGES.estimatedDurationPositive)
  // tasks/rules-registry.ts：message: '预估时长必须大于 0' → message: TASK_RULE_MESSAGES.estimatedDurationPositive
  ```
  - 验证：`npx vitest run src/domains/tasks src/domains/habits` + 新断言 `expect(TASK_RULE_MESSAGES.estimatedDurationPositive).toBe(taskRuleRegistry.realtime.task_estimated_duration_positive.message)`
  - 顺序：并入原 Task 1.2/1.3（registry 改造时同步引用常量；先提取常量再改 registry）。

- [ ] **RT2 (P1, human: ~30min / CC: ~5min)** — C1 单字段 CI 强制 — 替代删掉的 integrity.ts 约束
  - Surfaced by: Code-quality C1（删 integrity 连带丢「realtime 恰 1 字段」强制，prior learning `declarative-rule-realtime-singlefield` 9/10）
  - Files: `scripts/validate-domain-structure.ts`（`checkRulesRegistry` 扩展）或 `scripts/validate-manifest.ts`
  - 改动：在 registry 遍历处对非豁免域（tasks/habits）每条 `realtime` rule 校验 `fields.length === 1`，否则报 `L3-realtime-singlefield`。需 load registry（参考原区块 G 的 `require(rules-registry)` 方式）。
  ```typescript
  for (const [id, rule] of Object.entries(registry.realtime)) {
    if (rule.fields.length !== 1) {
      addError(domain, 'L3-realtime-singlefield', `realtime 规则 "${id}" 必须恰 1 字段，当前 ${rule.fields.length}（多字段用 phase: submit）`)
    }
  }
  ```
  - 验证：`npm run validate:structure` 通过；构造一个多字段 realtime fixture 验证报错。
  - 顺序：并入原 Phase 5（Task 5.1 删 integrity 后补此 check）。

- [ ] **RT3 (P1, REGRESSION, human: ~20min / CC: ~5min)** — T1+F6 D 模式吞粒 regression test
  - Surfaced by: Test T1（REGRESSION RULE 强制）+ Outside voice F6（`arrayContaining` 掩盖吞粒）
  - Files: `src/nexus/rules/__tests__/evaluate.test.ts`
  - 改动：Task 2.1 第一个用例补精确断言——submit Rejected + realtime 也产错时，结果 errors 含 submit-err 且**不含** realtime 错。
  ```typescript
  it('D 模式吞粒：submit Rejected 先胜出，realtime 错被吞', async () => {
    const reg: DomainRuleRegistry = {
      realtime: { rt1: { check: () => [{ field: 'a', message: 'RT_ERROR_SHOULD_BE_SWALLOWED' }], fields: ['a'], message: 'rt' } },
      submit: { s1: { check: async () => validationRejected(['submit-err']), fields: ['a'], message: 'submit' } },
    }
    const res = await evaluateDomainRules('test', baseIntent('x', { a: 1 }), { repos: {}, userId: 'u' as never, now: 0 }, reg)
    expect(res.kind).toBe('Rejected')
    const errors = (res as any).errors as string[]
    expect(errors).toContain('submit-err')
    expect(errors.some(e => e.includes('RT_ERROR_SHOULD_BE_SWALLOWED'))).toBe(false) // realtime 错被吞
  })
  ```
  - 顺序：并入原 Task 2.1。

- [ ] **RT4 (P2, human: ~30min / CC: ~10min)** — T3 useManifestRules hook 行为测试
  - Surfaced by: Test T3（breaking 签名变更配直接测试）
  - Files: `src/nexus/rules/__tests__/use-manifest-rules.test.ts`（@testing-library/react `renderHook`）
  - 改动：单参 `useManifestRules(registry)` 后，`validateField('estimatedDuration', -1)` 产 error、`validateAll` 跑全部字段。锁签名迁移零行为损失。
  - 顺序：并入原 Task 3.2。

- [ ] **RT5 (P2, human: ~20min / CC: ~5min)** — F3 okrs/timebox strip 兼容回归测试
  - Surfaced by: Outside voice F3（strip 静默无保护）
  - Files: `src/domains/manifest-loader/__tests__/loader.test.ts`（或同名）
  - 改动：`loadDomainManifest('okrs')` 返回 success，且 `manifest.field_metadata.title` 不含 `label`（被 strip）。
  ```typescript
  it('[020] okrs 旧 C 残留 label/required 被 strip，load 成功', () => {
    const loaded = loadDomainManifest('okrs')
    expect(loaded.success).toBe(true)
    expect(loaded.manifest.field_metadata?.title).not.toHaveProperty('label')
  })
  ```
  - 顺序：并入原 Task 5.3。

- [ ] **RT6 (P2, human: ~5min / CC: ~2min)** — F4 改过期 message 文案
  - Surfaced by: Outside voice F4（`validate-domain-structure.ts:311` message「须声明 rules」删 L 后误导）
  - Files: `scripts/validate-domain-structure.ts:~312`
  - 改动：message 去掉「须声明 rules」措辞，改为「须注册 rules-registry 处理器 + onValidate 委托 evaluateDomainRules（registry 即 SSOT）」。
  - 顺序：并入原 Task 5.4。

- [ ] **RT7 (P2, human: ~5min / CC: ~2min)** — F5 Task 3.3 barrel 消费者 grep
  - Surfaced by: Outside voice F5（删 barrel 导出前未验证无 barrel 消费者）
  - Files: 原 Task 3.3 Step 1 前
  - 改动：执行 `grep -rn "getRealtimeRules.*from '@/nexus/rules'" src` 确认无 barrel 消费者（当前 5 组件走子模块路径，安全）。
  - 顺序：并入原 Task 3.3 Step 1。

- [ ] **RT8 (P2, human: ~10min / CC: ~3min)** — T2 realtime.test.ts 旧签名更新
  - Surfaced by: Test T2（旧测试 5 参签名，Task 3.1 改签名后 break）
  - Files: `src/nexus/rules/__tests__/realtime.test.ts`
  - 改动：旧用例从 `evaluateRealtimeRules(realtimeRules, field, value, ctx, registry)` 改为 `evaluateRealtimeRules(registry, field, value, ctx)`。
  - 顺序：并入原 Task 3.1。

- [ ] **RT9 (P3, human: ~10min / CC: ~3min)** — A2 D 模式 ASCII 图 + A3 domainId
  - Surfaced by: Architecture A2（D 模式折叠值得图）+ A3（domainId dead param）
  - Files: `src/nexus/rules/evaluate.ts`（代码注释加 ASCII 图）、`evaluateDomainRules` 签名
  - 改动：evaluate.ts 顶部加 D 模式数据流 ASCII 注释；`domainId` param 删（改调用方 hooks.ts 两处）或注释保留供日志。

**Lake Score：9/9 review 决策均选 complete 选项（A1 细粒度但加连续性警告、C1 CI 强制、T1 mandatory、T3 hook 测试、F1 彻底收敛、F3-F6 全采纳）。**

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 9 issues (A1/A2/A3/C1/T1/T2/T3/F1-F6), 全 resolve; 4-section + outside voice |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**CODEX:** codex 因 5min 超时未产出最终总结（fallback 至 Claude subagent），但超时前已读 `aggregateValidation` 源码确认 D 模式 `a.kind==='Rejected' return a` 语义与 plan「先 submit 后 realtime」顺序一致——交叉印证 T1。
**CROSS-MODEL:** Claude review（4-section）与 Claude subagent outside voice 无方向分歧；subagent 补充 6 项遗漏（F1-F6），其中 F1（message 双源）经核实为真实 P1，已采纳用户决策 B（彻底收敛）；F2（先例未跟踪）经核实为误报（已 git 跟踪）。
**VERDICT:** ENG CLEARED — plan 经 4-section + outside voice 评审，9 项 findings 全部 resolve 并落入 Implementation Tasks RT1-RT9；ready to implement。

NO UNRESOLVED DECISIONS
