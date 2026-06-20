# [018-G3] R1 Habits 端到端实现计划（规则三层架构试点）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 habits 域的校验逻辑声明式化：manifest `rules:` 区块 + registry（命令式处理器）+ onValidate 改调 `evaluateDomainRules` + habit-form 改用 `useManifestRules`，作为 R0 框架的第一个真实域验证；底层 5 变体/聚合/suspend 管线 + `aggregateValidation` 零改动复用。

**Architecture:** 声明式绑定（manifest `rules:` 只声明元数据）+ 命令式处理器（registry 按 id 注册 check）。**用户裁决 D（权威合并规则前置）**：一条 `phase: submit` 聚合规则（复刻现状 onValidate 全分支、返回全部 errors）置于 manifest 首位——submit 聚合时其 Rejected 先胜出、吞掉后续粒度规则的 Rejected，**golden 逐字保持、零 R0 契约变更**；另注册若干 `phase: both` 单字段纯函数规则做客户端 realtime blur（action-invariant 的格式/范围检查）。realtime 走 §4.5 **method B**：server action 取 phase:both 规则元数据，`evaluateRealtimeRules` 纯核心接收 rules 元数据数组（client-safe、不调 loader），解决 `node:fs` 进 client bundle 的构建隐患。

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5 / Zod（manifest schema）/ vitest（须在 `frontend/` cwd 跑，配 tsc 双验证）。Server action（`'use server'`）。

**权威设计：** `docs/superpowers/specs/2026-06-20-rules-three-tier-architecture-design.md`（v3，§4 模型 / §6 R1 / §7 Q1·Q6·Q7 已全决）。
**R0 基线：** `docs/superpowers/plans/2026-06-20-018-g3-r0-rules-framework.md`（已落地，commits cee1f90..5f28762）。

---

## 关键决策与约束（写代码前必读）

1. **D 模式（用户裁决）**：manifest `rules:` 中 `habit_action_fields_valid`（`phase: submit`）必须**置首**。它复刻现状 `onValidate` 全分支逻辑、返回 `validationRejected(全部 errors)`。submit 时 `evaluateDomainRules` 按 manifest 顺序折叠：聚合规则先 Rejected → `aggregateValidation`「首个 Rejected 胜出」→ 后续粒度 both 规则的 Rejected 被吞（无害）。golden 逐字保持。
2. **realtime 只覆盖 action-invariant 单字段检查**：duration 正数、minDuration 正数、frequencyType 枚举、defaultTime/earliestTime/latestStartTime 的 HH:MM 格式。**不做** title 必填的 realtime（title 必填仅 createHabit，是 action-variant；ClientRuleCtx 不加 action）。title 必填、时间窗口、min>default、各 action 必填字段（habitId/templateId/date/name/applicableDays）一律进聚合 submit 规则（submit-only）。
3. **文案逐字保持**：所有错误文案必须与现状 `habits/validation.ts` + `habits/hooks.ts` 完全一致（见 §现状文案清单）。golden 建立在「逐字」之上。
4. **warning 保持丢弃**：现状 `validateHabitFields` 产出的 `warnings`（默认时长≥180）被 `onValidate` 忽略（只用 `.errors`）。R1 保持丢弃（聚合 submit 规则只用 `validateHabitFields(...).errors`）。迁 PWW 属行为变更，不在 R1。
5. **零 R0 契约变更（除 realtime 纯核心签名）**：`aggregateValidation` / `evaluateDomainRules`(server) / `types.ts`(FieldIssue/ctx/registry) 全不动。唯一 R0 文件改动：`realtime.ts` 纯核心签名 `domainId → realtimeRules[]`（client-safe 必需，见 Task 7）、`use-manifest-rules.ts` 签名同步 + M3 ctx 稳定（Task 8）。
6. **M1/M2/M3/M4 handover 处置**：M1（evaluate.ts load-fail→Passed）—— habits manifest 经 build 校验恒加载成功，该分支对真实域不触发，保持 R0 行为不改；M2（registry 命名约定）—— Task 6 落地；M3（ctx 稳定）—— Task 8 落地；M4（测试 intent 工厂）—— Task 1/4 落地。

### 现状文案清单（逐字保持，源自 validation.ts + hooks.ts）

```
标题必填
默认时间必须是有效的 HH:MM 格式
最早开始时间必须是有效的 HH:MM 格式
最迟开始时间必须是有效的 HH:MM 格式
默认时间必须在最早开始时间和最迟开始时间之间
默认时长必须大于 0
最短时长必须大于 0
最短时长不能大于默认时长
频率类型必须是 daily/weekly/custom
habitId 必填
name 必填
applicableDays 不能为空
templateId 必填
date 必填
timeOverride 必须是有效的 HH:MM 格式
```

> 注：`validateHabitFields` 还产 warning `默认时长较长（≥180分钟），建议拆分为多个习惯`（约束 4：保持丢弃，不入 errors）。

---

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `frontend/src/domains/habits/__tests__/habit-validate.golden.test.ts` | golden：冻结现状 onValidate + validateHabitFields 精确 errors 输出 | Create |
| `frontend/src/domains/habits/manifest.yaml` | 新增 `rules:` 区块（聚合 submit 置首 + 6 条粒度 both） | Modify |
| `frontend/src/domains/habits/validation.ts` | C1：局部 `ValidationResult` 重命名为 `HabitFieldCheckResult`；其余不动 | Modify |
| `frontend/src/domains/habits/__tests__/validation.test.ts` | 跟随 C1 改名 | Modify |
| `frontend/src/domains/habits/rules-registry.ts` | habits 规则注册表：6 条 RealtimeCheck（both）+ 1 条 SubmitCheck（聚合，复刻 onValidate） | Create |
| `frontend/src/domains/habits/__tests__/rules-registry.test.ts` | registry 单测（realtime 各字段 + submit 聚合全分支，逐字对标 golden） | Create |
| `frontend/src/domains/habits/hooks.ts` | `onValidate` 改调 `evaluateDomainRules`；移除旧硬编码 body | Modify |
| `frontend/scripts/validate-manifest.ts` | habits rules id 完整性由 dormant→live；M2 命名约定精确取值 | Modify |
| `frontend/src/nexus/rules/realtime.ts` | 纯核心签名改为接收 `realtimeRules[]`（client-safe，移除 loader 调用）+ 导出 `RealtimeRuleMeta` | Modify |
| `frontend/src/nexus/rules/__tests__/realtime.test.ts` | 跟随签名改动 | Modify |
| `frontend/src/nexus/rules/server/get-realtime-rules.ts` | `'use server'` action：loadDomainManifest 过滤 phase:both → 返回元数据 | Create |
| `frontend/src/nexus/rules/use-manifest-rules.ts` | 签名改接收 `realtimeRules[]`；M3 `useMemo` 稳定 ctx；加 `validateAll` | Modify |
| `frontend/src/nexus/rules/index.ts` | 导出 `RealtimeRuleMeta`、`getRealtimeRules` | Modify |
| `frontend/src/nexus/rules/__tests__/server-error-mapping.test.ts` | submit 失败 errors→字段回填映射单测（M4 共享 intent 工厂） | Create |
| `frontend/src/nexus/rules/server-error-mapping.ts` | `mapServerErrorsToFields(serverErrors, realtimeRules)` 纯函数 | Create |
| `frontend/src/domains/habits/components/habit-form.tsx` | 接 `useManifestRules`：onBlur 校验、inline per-field 错误、submit 预检、失败回填；移除 validateHabitFields import | Modify |
| `docs/usom-design.md` | §4.4 habits 域规则层落地状态 | Modify |
| `manifest.md` | 索引同步本计划 | Modify |

---

## Task 1: golden 捕获（冻结现状 onValidate / validateHabitFields 精确输出）

**Files:**
- Create: `frontend/src/domains/habits/__tests__/habit-validate.golden.test.ts`

> 设计 §6 P5 / §8 #8：迁移前冻结各域 onValidate/hooks 输出（errors 文案/顺序/边界值）。本任务用**精确 errors 数组断言**（非 `.some` 子串）锁定现状，作为迁移回归网。迁移后须逐字通过。

- [ ] **Step 1: 写 golden 测试（捕获现状，此时应 PASS）**

`frontend/src/domains/habits/__tests__/habit-validate.golden.test.ts`:
```ts
/**
 * @file habit-validate.golden
 * @brief [018-G3] R1 golden — 冻结 habits onValidate + validateHabitFields 精确 errors 输出
 *
 * 迁移到规则三层架构后，本测试须逐字通过（errors 文案/顺序/边界值不变）。
 * 设计 §6 P5 / §8 #8 迁移等价性护栏。
 */
import { describe, it, expect } from 'vitest'
import { vi } from 'vitest'
import type { ValidationResult } from '@/usom/types/process'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'

vi.mock('@/domains/manifest-loader', () => ({
  loadDomainManifest: () => ({
    success: true,
    manifest: {
      id: 'habits', version: '1.0.0', name: '习惯管理', description: 'd',
      intent_triggers: [], lifecycle: {},
      field_metadata: { frequencyType: { type: 'enum', label: '频率类型', required: true, options: ['daily', 'weekly', 'custom'] } },
      list_actions: [],
      required_fields: {},
      subscribed_events: [],
    },
  }),
}))

import { validateHabitFields } from '../validation'
import { habitsPlugin } from '../index'

/** 把 ValidationResult 折成 { kind, errors } 便于精确断言 */
function snap(r: ValidationResult): { kind: string; errors: string[] } {
  return { kind: r.kind, errors: r.kind === 'Rejected' ? r.errors : [] }
}

function makeIntent(overrides: Partial<StructuredIntent> = {}): StructuredIntent {
  return {
    id: 'i' as USOM_ID, intentionId: 'in' as USOM_ID, targetDomain: 'habits',
    action: 'createHabit',
    fields: { title: '晨跑', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 30, minDuration: 15, trackable: true, frequencyType: 'daily' },
    confidence: 0.95, resolvedBy: 'ai', createdAt: '2026-06-20T00:00:00Z',
    ...overrides,
  } as unknown as StructuredIntent
}

const snap_ = { userId: 'u' as USOM_ID, activeObjectives: [], activeKeyResults: [], activeTasks: [], pendingHabits: [], upcomingTimeboxes: [], pendingIntentions: [], currentTime: '2026-06-20T08:00:00Z', currentDate: '2026-06-20', dayOfWeek: 6, timeOfDay: 'morning', energyState: { inferredLevel: 7, calibratedLevel: null, activeLevel: 7, source: 'system' }, sourceSnapshotId: 's' as USOM_ID }

describe('[golden] validateHabitFields 精确 errors', () => {
  it('createHabit 缺 title + duration<=0 + 频率非法 → 三错误按序', () => {
    const r = validateHabitFields({ title: '', defaultDuration: 0, frequencyType: 'bad' }, 'createHabit')
    expect(r.errors).toEqual(['标题必填', '默认时长必须大于 0', '频率类型必须是 daily/weekly/custom'])
  })

  it('createHabit defaultTime 非法格式 → 含默认时间格式错误', () => {
    const r = validateHabitFields({ title: 't', defaultTime: '25:00', earliestTime: '06:30', latestStartTime: '08:00' }, 'createHabit')
    expect(r.errors).toEqual(['默认时间必须是有效的 HH:MM 格式'])
  })

  it('createHabit defaultTime 在窗口外 → 含窗口错误', () => {
    const r = validateHabitFields({ title: 't', defaultTime: '05:00', earliestTime: '06:30', latestStartTime: '08:00' }, 'createHabit')
    expect(r.errors).toEqual(['默认时间必须在最早开始时间和最迟开始时间之间'])
  })

  it('createHabit minDuration > defaultDuration → 含最短时长错误', () => {
    const r = validateHabitFields({ title: 't', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 15, minDuration: 30 }, 'createHabit')
    expect(r.errors).toEqual(['最短时长不能大于默认时长'])
  })

  it('完整有效 → 无 errors（warnings 仍可能含时长警告，errors 必空）', () => {
    const r = validateHabitFields({ title: '晨跑', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 30, minDuration: 15 }, 'createHabit')
    expect(r.errors).toEqual([])
  })
})

describe('[golden] habitsPlugin.onValidate 精确输出', () => {
  it('合法 createHabit → Passed', async () => {
    expect(snap(await habitsPlugin.onValidate(makeIntent(), snap_ as any))).toEqual({ kind: 'Passed', errors: [] })
  })

  it('createHabit 缺 title → Rejected 含「标题必填」', async () => {
    const r = await habitsPlugin.onValidate(makeIntent({ fields: { defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 30, minDuration: 15, trackable: true, frequencyType: 'daily' } }), snap_ as any)
    expect(snap(r)).toEqual({ kind: 'Rejected', errors: ['标题必填'] })
  })

  it('createHabit 多错误（缺 title + duration 0 + 频率非法）→ 全部 errors（D 模式逐字保持关键用例）', async () => {
    const r = await habitsPlugin.onValidate(makeIntent({ fields: { title: '', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 0, minDuration: 15, trackable: true, frequencyType: 'bad' } }), snap_ as any)
    expect(snap(r)).toEqual({ kind: 'Rejected', errors: ['标题必填', '默认时长必须大于 0', '频率类型必须是 daily/weekly/custom'] })
  })

  it('logHabit 缺 habitId → Rejected「habitId 必填」', async () => {
    const r = await habitsPlugin.onValidate(makeIntent({ action: 'logHabit', fields: { status: 'completed' } }), snap_ as any)
    expect(snap(r)).toEqual({ kind: 'Rejected', errors: ['habitId 必填'] })
  })

  it('createTemplate name 空 → Rejected「name 必填」', async () => {
    const r = await habitsPlugin.onValidate(makeIntent({ action: 'createTemplate', fields: { name: '', applicableDays: [1, 2, 3, 4, 5] } }), snap_ as any)
    expect(snap(r)).toEqual({ kind: 'Rejected', errors: ['name 必填'] })
  })

  it('applyTemplate 缺 date → Rejected「date 必填」', async () => {
    const r = await habitsPlugin.onValidate(makeIntent({ action: 'applyTemplate', fields: { templateId: 'tpl-001' } }), snap_ as any)
    expect(snap(r)).toEqual({ kind: 'Rejected', errors: ['date 必填'] })
  })
})
```

- [ ] **Step 2: 运行确认 PASS（捕获现状基线）**

Run: `cd frontend && npx vitest run src/domains/habits/__tests__/habit-validate.golden.test.ts`
Expected: PASS（全部用例对齐现状代码）。若某个用例与现状不符，**调整用例到现状真实输出**（golden 必须反映现状，不是期望）。

- [ ] **Step 3: tsc 双验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
cd frontend
git add src/domains/habits/__tests__/habit-validate.golden.test.ts
git commit -m "test(habits): golden 捕获 onValidate/validateHabitFields 精确输出（R1 Task1）"
```

---

## Task 2: habits manifest `rules:` 区块（D 模式：聚合 submit 置首 + 6 条粒度 both）

**Files:**
- Modify: `frontend/src/domains/habits/manifest.yaml`（在文件末尾 `cnui_surfaces` 区块之后追加 `rules:`）

> D 模式：`habit_action_fields_valid`（phase: submit）必须**第一条**。其 `fields` 列出聚合规则可能触及的全部字段（submit 规则的 fields 仅作元数据，不影响执行——submit check 拿整个 intent）。6 条 `phase: both` 单字段规则做 realtime。

- [ ] **Step 1: 追加 rules 区块**

在 `frontend/src/domains/habits/manifest.yaml` 末尾（`cnui_surfaces` 闭合之后）追加：
```yaml

# ─── 区块 L: rules（[018-G3] 规则三层架构，R1） ─────────────────
# D 模式（权威合并规则前置）：habit_action_fields_valid 必须置首。
#   submit 时 evaluateDomainRules 按 manifest 顺序折叠，聚合规则先 Rejected
#   则 aggregateValidation「首个 Rejected 胜出」吞掉后续粒度规则的 Rejected，
#   保持「全部 errors」逐字输出（golden）。粒度 both 规则做客户端 realtime blur。
rules:
  # ── 权威聚合（phase: submit，复刻现状 onValidate 全分支，返回全部 errors）──
  - id: habit_action_fields_valid
    phase: submit
    fields: [title, defaultTime, earliestTime, latestStartTime, defaultDuration, minDuration, frequencyType, habitId, name, applicableDays, templateId, date, timeOverride]
    message: 习惯字段校验失败

  # ── 客户端 realtime（phase: both，action-invariant 单字段纯函数）──
  - id: habit_default_duration_positive
    phase: both
    fields: [defaultDuration]
    message: 默认时长必须大于 0
  - id: habit_min_duration_positive
    phase: both
    fields: [minDuration]
    message: 最短时长必须大于 0
  - id: habit_frequency_type_valid
    phase: both
    fields: [frequencyType]
    message: 频率类型必须是 daily/weekly/custom
  - id: habit_default_time_format
    phase: both
    fields: [defaultTime]
    message: 默认时间必须是有效的 HH:MM 格式
  - id: habit_earliest_time_format
    phase: both
    fields: [earliestTime]
    message: 最早开始时间必须是有效的 HH:MM 格式
  - id: habit_latest_time_format
    phase: both
    fields: [latestStartTime]
    message: 最迟开始时间必须是有效的 HH:MM 格式
```

- [ ] **Step 2: 跑 validate-manifest.ts（此时 habits 无 registry，G 区块会报「声明了 rules 但未找到 registry」——预期，Task 4/6 修复）**

Run: `cd frontend && npx tsx scripts/validate-manifest.ts; echo "EXIT=$?"`
Expected: EXIT≠0，错误含 habits 的 `G-registry-missing`（因 Task 4 registry 尚未创建）。**记下错误**，Task 6 后须 EXIT=0。

- [ ] **Step 3: 提交（manifest 单独提交；registry 在 Task 4，校验 Task 6 转绿）**

```bash
cd frontend
git add src/domains/habits/manifest.yaml
git commit -m "feat(habits): manifest 新增 rules 区块（D 模式：聚合 submit 置首 + 6 粒度 both）（R1 Task2）"
```

---

## Task 3: C1 碰撞消解 — validation.ts 局部 ValidationResult 改名

**Files:**
- Modify: `frontend/src/domains/habits/validation.ts`（`ValidationResult` → `HabitFieldCheckResult`）
- Modify: `frontend/src/domains/habits/__tests__/validation.test.ts`（跟随改名）

> C1：`validation.ts` 局部 `ValidationResult { valid, errors, warnings }` 与全局 5 变体 `ValidationResult` 同名碰撞。改为 `HabitFieldCheckResult`。`validateHabitFields` 逻辑**完全不动**（registry 复用它，见 Task 4）。

- [ ] **Step 1: 改名 validation.ts**

`frontend/src/domains/habits/validation.ts` —— 把接口名 `ValidationResult` 改为 `HabitFieldCheckResult`（接口定义处 + `validateHabitFields` 返回类型处）：
```ts
/**
 * 校验结果（[018-G3] C1：改名避免与全局 5 变体 ValidationResult 碰撞）
 */
export interface HabitFieldCheckResult {
  /** 是否有效 */
  valid: boolean
  /** 错误列表 */
  errors: string[]
  /** 警告列表 */
  warnings: string[]
}
```
`validateHabitFields` 签名返回类型改为 `HabitFieldCheckResult`（函数体不变）。

- [ ] **Step 2: 跟随改名 validation.test.ts**

`frontend/src/domains/habits/__tests__/validation.test.ts` 中若引用了 `ValidationResult` 类型，改为 `HabitFieldCheckResult`（该测试主要用 `result.valid/errors/warnings`，大概率无类型引用；若有则改）。

- [ ] **Step 3: 运行既有测试确认无回归**

Run: `cd frontend && npx vitest run src/domains/habits/__tests__/validation.test.ts && npx tsc --noEmit`
Expected: PASS + 无类型错误

- [ ] **Step 4: 提交**

```bash
cd frontend
git add src/domains/habits/validation.ts src/domains/habits/__tests__/validation.test.ts
git commit -m "refactor(habits): C1 局部 ValidationResult 改名 HabitFieldCheckResult（R1 Task3）"
```

---

## Task 4: habits rules-registry.ts（命令式处理器）+ registry 单测

**Files:**
- Create: `frontend/src/domains/habits/rules-registry.ts`
- Create: `frontend/src/domains/habits/__tests__/rules-registry.test.ts`

> registry 是纯 TS 模块（无 React/无 fs），client + server 皆可 import。6 条 RealtimeCheck（both，action-invariant 单字段纯函数）+ 1 条 SubmitCheck（聚合，**逐字复刻** hooks.ts 现状 onValidate body，复用 `validateHabitFields`）。submit 聚合返回 `validationRejected(全部 errors)`。

- [ ] **Step 1: 写 registry 单测（先失败）**

`frontend/src/domains/habits/__tests__/rules-registry.test.ts`:
```ts
/**
 * @file rules-registry.test
 * @brief [018-G3] R1 Task4 — habits registry：realtime 单字段 + submit 聚合全分支
 *
 * submit 聚合逐字对标 golden（Task1）；realtime 各字段独立纯函数。
 */
import { describe, it, expect } from 'vitest'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import { habitRuleRegistry } from '../rules-registry'
import type { ServerRuleCtx, ClientRuleCtx } from '@/nexus/rules/types'

function intent(action: string, fields: Record<string, unknown>): StructuredIntent {
  return {
    id: 'i' as USOM_ID, intentionId: 'in' as USOM_ID, targetDomain: 'habits',
    action, fields, confidence: 1, resolvedBy: 'template_form', createdAt: '2026-06-20T00:00:00Z',
  } as unknown as StructuredIntent
}
const serverCtx: ServerRuleCtx = { repos: {}, userId: 'u' as USOM_ID, now: 0 }
const clientCtx: ClientRuleCtx = {}

describe('habits realtime checks（phase: both）', () => {
  it('defaultDuration<=0 → FieldIssue', () => {
    expect(habitRuleRegistry.realtime.habit_default_duration_positive(0, clientCtx))
      .toEqual([{ field: 'defaultDuration', message: '默认时长必须大于 0' }])
  })
  it('defaultDuration 正数 → 空', () => {
    expect(habitRuleRegistry.realtime.habit_default_duration_positive(30, clientCtx)).toEqual([])
  })
  it('minDuration<=0 → FieldIssue', () => {
    expect(habitRuleRegistry.realtime.habit_min_duration_positive(0, clientCtx))
      .toEqual([{ field: 'minDuration', message: '最短时长必须大于 0' }])
  })
  it('frequencyType 非法 → FieldIssue', () => {
    expect(habitRuleRegistry.realtime.habit_frequency_type_valid('bad', clientCtx))
      .toEqual([{ field: 'frequencyType', message: '频率类型必须是 daily/weekly/custom' }])
  })
  it('frequencyType 合法 → 空', () => {
    expect(habitRuleRegistry.realtime.habit_frequency_type_valid('daily', clientCtx)).toEqual([])
  })
  it('defaultTime 非法格式 → FieldIssue', () => {
    expect(habitRuleRegistry.realtime.habit_default_time_format('25:00', clientCtx))
      .toEqual([{ field: 'defaultTime', message: '默认时间必须是有效的 HH:MM 格式' }])
  })
  it('defaultTime 缺省（undefined）→ 空（仅在有值时校验格式）', () => {
    expect(habitRuleRegistry.realtime.habit_default_time_format(undefined, clientCtx)).toEqual([])
  })
  it('realtime 不覆盖 title（无 habit_title_required check）', () => {
    expect(habitRuleRegistry.realtime.habit_title_required).toBeUndefined()
  })
})

describe('habits submit 聚合 habit_action_fields_valid（逐字对标 golden）', () => {
  it('合法 createHabit → Passed', async () => {
    const r = await habitRuleRegistry.submit.habit_action_fields_valid(
      intent('createHabit', { title: '晨跑', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 30, minDuration: 15, trackable: true, frequencyType: 'daily' }),
      serverCtx,
    )
    expect(r.kind).toBe('Passed')
  })
  it('createHabit 多错误 → Rejected 全部 errors 按序', async () => {
    const r = await habitRuleRegistry.submit.habit_action_fields_valid(
      intent('createHabit', { title: '', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 0, minDuration: 15, trackable: true, frequencyType: 'bad' }),
      serverCtx,
    )
    expect(r.kind).toBe('Rejected')
    if (r.kind === 'Rejected') expect(r.errors).toEqual(['标题必填', '默认时长必须大于 0', '频率类型必须是 daily/weekly/custom'])
  })
  it('logHabit 缺 habitId → Rejected「habitId 必填」', async () => {
    const r = await habitRuleRegistry.submit.habit_action_fields_valid(intent('logHabit', { status: 'completed' }), serverCtx)
    expect(r.kind === 'Rejected' && r.errors).toEqual(['habitId 必填'])
  })
  it('createTemplate name 空 → Rejected「name 必填」', async () => {
    const r = await habitRuleRegistry.submit.habit_action_fields_valid(intent('createTemplate', { name: '', applicableDays: [1, 2, 3, 4, 5] }), serverCtx)
    expect(r.kind === 'Rejected' && r.errors).toEqual(['name 必填'])
  })
  it('addHabitToTemplate timeOverride 非法 → Rejected 含 timeOverride', async () => {
    const r = await habitRuleRegistry.submit.habit_action_fields_valid(intent('addHabitToTemplate', { templateId: 't1', habitId: 'h1', timeOverride: 'bad' }), serverCtx)
    expect(r.kind === 'Rejected' && r.errors.some((e) => e.includes('timeOverride'))).toBe(true)
  })
  it('未知 action → Passed（无匹配分支）', async () => {
    const r = await habitRuleRegistry.submit.habit_action_fields_valid(intent('unknownAction', {}), serverCtx)
    expect(r.kind).toBe('Passed')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/domains/habits/__tests__/rules-registry.test.ts`
Expected: FAIL（`../rules-registry` 不存在）

- [ ] **Step 3: 实现 rules-registry.ts**

`frontend/src/domains/habits/rules-registry.ts`:
```ts
/**
 * @file rules-registry
 * @brief [018-G3] R1 habits 域规则注册表（命令式处理器）
 *
 * 纯 TS 模块（无 React / 无 fs），client + server 皆可 import。
 * - realtime（phase: both）：action-invariant 单字段纯函数，客户端 blur
 * - submit（phase: submit）：habit_action_fields_valid 聚合规则，逐字复刻现状
 *   hooks.ts onValidate 全分支（复用 validateHabitFields），返回 validationRejected(全部 errors)
 *
 * D 模式：聚合规则在 manifest 中置首，submit 聚合时其 Rejected 先胜出、吞掉粒度规则。
 * @see docs/superpowers/specs/2026-06-20-rules-three-tier-architecture-design.md §4
 */
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { DomainRuleRegistry, RealtimeCheck, SubmitCheck } from '@/nexus/rules/types'
import type { StructuredIntent } from '@/usom/types/objects'
import { validateHabitFields, isValidHHMM } from './validation'

const VALID_FREQUENCY_TYPES = ['daily', 'weekly', 'custom']

// ── realtime checks（phase: both，action-invariant 单字段纯函数）──────────
/** 仅在值「存在且为 number 且 ≤0」时报错（允许 update 部分更新时不传该字段） */
const defaultDurationPositive: RealtimeCheck = (value) => {
  if (typeof value === 'number' && value <= 0) {
    return [{ field: 'defaultDuration', message: '默认时长必须大于 0' }]
  }
  return []
}
const minDurationPositive: RealtimeCheck = (value) => {
  if (typeof value === 'number' && value <= 0) {
    return [{ field: 'minDuration', message: '最短时长必须大于 0' }]
  }
  return []
}
const frequencyTypeValid: RealtimeCheck = (value) => {
  if (typeof value === 'string' && !VALID_FREQUENCY_TYPES.includes(value)) {
    return [{ field: 'frequencyType', message: '频率类型必须是 daily/weekly/custom' }]
  }
  return []
}
/** 仅在字段「有值」时校验格式（undefined/null 跳过，允许部分更新） */
function timeFormatCheck(field: string, label: string): RealtimeCheck {
  return (value) => {
    if (value !== undefined && value !== null && !isValidHHMM(value)) {
      return [{ field, message: `${label}必须是有效的 HH:MM 格式` }]
    }
    return []
  }
}

// ── submit 聚合（phase: submit）—— 逐字复刻现状 hooks.ts onValidate body ──
const actionFieldsValid: SubmitCheck = async (intent) => {
  const errors: string[] = []
  const { fields } = intent
  const action = intent.action

  if (action === 'createHabit' || action === 'updateHabit') {
    errors.push(...validateHabitFields(fields, action as 'createHabit' | 'updateHabit').errors)
  }

  if (action === 'logHabit') {
    const habitId = fields['habitId']
    if (!habitId || typeof habitId !== 'string') errors.push('habitId 必填')
  }

  const lifecycleActions = ['activateHabit', 'suspendHabit', 'archiveHabit', 'reactivateHabit']
  if (lifecycleActions.includes(action)) {
    const habitId = fields['habitId']
    if (!habitId || typeof habitId !== 'string') errors.push('habitId 必填')
  }

  if (action === 'createTemplate') {
    const name = fields['name']
    if (!name || (typeof name === 'string' && name.trim() === '')) errors.push('name 必填')
    const applicableDays = fields['applicableDays']
    if (!Array.isArray(applicableDays) || applicableDays.length === 0) errors.push('applicableDays 不能为空')
  }

  if (action === 'addHabitToTemplate') {
    const templateId = fields['templateId']
    if (!templateId || typeof templateId !== 'string') errors.push('templateId 必填')
    const habitId = fields['habitId']
    if (!habitId || typeof habitId !== 'string') errors.push('habitId 必填')
    const timeOverride = fields['timeOverride']
    if (timeOverride !== undefined && !isValidHHMM(timeOverride)) errors.push('timeOverride 必须是有效的 HH:MM 格式')
  }

  if (action === 'removeHabitFromTemplate') {
    const templateId = fields['templateId']
    if (!templateId || typeof templateId !== 'string') errors.push('templateId 必填')
    const habitId = fields['habitId']
    if (!habitId || typeof habitId !== 'string') errors.push('habitId 必填')
  }

  if (action === 'applyTemplate') {
    const templateId = fields['templateId']
    if (!templateId || typeof templateId !== 'string') errors.push('templateId 必填')
    const date = fields['date']
    if (!date || typeof date !== 'string') errors.push('date 必填')
  }

  return errors.length === 0 ? validationPassed() : validationRejected(errors)
}

export const habitRuleRegistry: DomainRuleRegistry = {
  realtime: {
    habit_default_duration_positive: defaultDurationPositive,
    habit_min_duration_positive: minDurationPositive,
    habit_frequency_type_valid: frequencyTypeValid,
    habit_default_time_format: timeFormatCheck('defaultTime', '默认时间'),
    habit_earliest_time_format: timeFormatCheck('earliestTime', '最早开始时间'),
    habit_latest_time_format: timeFormatCheck('latestStartTime', '最迟开始时间'),
  },
  submit: {
    habit_action_fields_valid: actionFieldsValid,
  },
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/domains/habits/__tests__/rules-registry.test.ts`
Expected: PASS（全绿）

- [ ] **Step 5: tsc 双验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
cd frontend
git add src/domains/habits/rules-registry.ts src/domains/habits/__tests__/rules-registry.test.ts
git commit -m "feat(habits): rules-registry（6 both + 1 submit 聚合，复刻 onValidate）（R1 Task4）"
```

---

## Task 5: onValidate 改调 evaluateDomainRules

**Files:**
- Modify: `frontend/src/domains/habits/hooks.ts`

> `onValidate` 变为薄壳调 `evaluateDomainRules('habits', intent, serverCtx, habitRuleRegistry)`。`onEvent` / `onActionSurfaceRequest` 完全不动。`DomainPlugin.onValidate` 返回类型本就允许 `Promise<ValidationResult>`（process.ts:126），异步化无契约破坏。

- [ ] **Step 1: 改 hooks.ts**

`frontend/src/domains/habits/hooks.ts`：
- 顶部 import 增加：
```ts
import { evaluateDomainRules } from '@/nexus/rules'
import { habitRuleRegistry } from './rules-registry'
```
- 移除 `import { validateHabitFields, isValidHHMM } from './validation'`（若 `isValidHHMM` 在 hooks.ts 内已无使用——核实：现状 hooks.ts 仅 `addHabitToTemplate` 分支用 `isValidHHMM`，该逻辑已迁入 registry；故此 import 可整行移除）。
- 把 `onValidate` 函数体（line 56-139 的全部硬编码 body）替换为：
```ts
  /**
   * 验证意图（[018-G3] R1：改调 evaluateDomainRules，规则声明式化）
   * 规则逻辑全部迁入 habitRuleRegistry（见 ./rules-registry）；本处仅薄壳委托。
   */
  async function onValidate(
    intent: StructuredIntent,
    snapshot: USOMSnapshot,
  ): Promise<ValidationResult> {
    return evaluateDomainRules('habits', intent, {
      repos: {},
      userId: snapshot.userId,
      now: snapshot.currentTime ? Date.parse(snapshot.currentTime) : 0,
    }, habitRuleRegistry)
  }
```
- 保留 `createHabitsHooks` 其余部分（`subscribedEvents`/`validFrequencyTypes` 计算若变未使用可留，不强制清理——`validFrequencyTypes` 现仅旧 onValidate 用，现已无引用；为避免「unused」告警，若 tsc 报未用变量则删除 `validFrequencyTypes` 两行；`subscribedEvents` 仍被 `onEvent` 使用，保留）。

- [ ] **Step 2: 跑 golden + 既有 habit-domain 测试确认逐字通过**

Run: `cd frontend && npx vitest run src/domains/habits/__tests__/habit-validate.golden.test.ts src/domains/habits/__tests__/habit-domain.test.ts`
Expected: PASS（D 模式生效：聚合规则置首，多错误用例逐字通过）

- [ ] **Step 3: tsc 双验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误（若 `validFrequencyTypes` 未用告警则删之重跑）

- [ ] **Step 4: 提交**

```bash
cd frontend
git add src/domains/habits/hooks.ts
git commit -m "feat(habits): onValidate 改调 evaluateDomainRules（R1 Task5，golden 逐字保持）"
```

---

## Task 6: validate-manifest 接线 habits registry（dormant→live）+ M2 命名约定

**Files:**
- Modify: `frontend/scripts/validate-manifest.ts`

> R0 的 G 区块用 duck-typing 找 registry。M2：改**命名约定精确取值**——优先取导出名 `${domainId}RuleRegistry`（habits → `habitRuleRegistry`），fallback duck-typing（保留 fixture 兼容）。habits 现在有 registry，id 完整性校验由 dormant 转 live。

- [ ] **Step 1: 改 validate-manifest.ts 的 G 区块**

定位 `frontend/scripts/validate-manifest.ts` 中 R0 Task7 加的「区块 G: rules id 完整性」段，把 registry 取值逻辑改为命名约定优先：
```ts
  // ── 区块 G: rules id 完整性（[018-G3]） ───────────────────────
  // M2：命名约定优先——导出名 `<domainId 单数驼峰>RuleRegistry`（habits→habitRuleRegistry）。
  const rawRules = (manifest.rules ?? []) as Array<{ id: string; phase: string; fields: string[] }>
  if (rawRules.length > 0) {
    try {
      const registryPath = path.resolve(domainDir, 'rules-registry')
      const registry = require(registryPath)
      // 命名约定精确取值；找不到再 fallback duck-typing（兼容 fixture 的 fixtureRuleRegistry）
      const convName = `${domainId}RuleRegistry`
      let reg = registry[convName] as { realtime: Record<string, unknown>; submit: Record<string, unknown> } | undefined
      if (!reg) {
        reg = Object.values(registry).find(
          (v) => v && typeof v === 'object' && 'realtime' in (v as object) && 'submit' in (v as object),
        ) as { realtime: Record<string, unknown>; submit: Record<string, unknown> } | undefined
      }
      if (!reg) {
        addError(domainId, 'G-registry-missing', `manifest 声明了 ${rawRules.length} 条 rules 但未找到 rules-registry 导出（约定名 ${convName}）`)
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

> 注：`${domainId}RuleRegistry` 对 habits = `habitsRuleRegistry`，但 Task 4 导出的是 `habitRuleRegistry`（单数）。**二选一对齐**：本计划统一用**单数驼峰**——把上面 `convName` 改为按 domainId 去掉尾 `s` 再 `RuleRegistry`：`const singular = domainId.endsWith('s') ? domainId.slice(0, -1) : domainId; const convName = \`${singular}RuleRegistry\``（habits→habitRuleRegistry ✓；tasks→taskRuleRegistry；fixture `_rulefixture`→`_rulefixtureRuleRegistry` 无，走 fallback ✓）。**实现时用此单数形式**。

- [ ] **Step 2: 跑 validate-manifest.ts 确认 EXIT=0**

Run: `cd frontend && npx tsx scripts/validate-manifest.ts; echo "EXIT=$?"`
Expected: EXIT=0（habits registry 命名约定命中、id 完整性通过；其余三域无 rules 仍 dormant）

- [ ] **Step 3: 提交**

```bash
cd frontend
git add scripts/validate-manifest.ts
git commit -m "feat(scripts): validate-manifest habits rules id 完整性 live + M2 命名约定（R1 Task6）"
```

---

## Task 7: realtime 纯核心客户端化（method B 前半：移除 loader 调用）

**Files:**
- Modify: `frontend/src/nexus/rules/realtime.ts`
- Modify: `frontend/src/nexus/rules/__tests__/realtime.test.ts`

> R0 的 `evaluateRealtimeRules(domainId, ...)` 调 `loadDomainManifest`（`import fs`，server-only）。客户端 blur 走此链会把 `node:fs` 拽进 client bundle → 构建失败。**签名改为接收 `realtimeRules: RealtimeRuleMeta[]`**（phase:both 规则元数据，由 server action 取得后透传），纯核心不再调 loader → client-safe。

- [ ] **Step 1: 改 realtime.ts**

`frontend/src/nexus/rules/realtime.ts` 整体替换为：
```ts
/**
 * @file realtime
 * @brief [018-G3] 客户端 realtime 评估纯核心（client-safe）
 *
 * R1（method B）：纯核心不再调 loadDomainManifest（其 import fs 为 server-only，
 * 进 client bundle 会构建失败）。改为接收 realtimeRules 元数据（phase:both 规则的
 * id/fields，由 server action getRealtimeRules 取得后透传），使本模块 client-safe。
 *
 * blur 单字段时跑命中该字段的 phase: both 规则。fail-OPEN：check 抛错吞掉+记日志，
 * 不崩 onBlur handler（submit 权威兜底）。
 */
import type { ClientRuleCtx, DomainRuleRegistry, FieldIssue } from './types'

/** phase: both 规则元数据（client-safe，由 server action 提供） */
export interface RealtimeRuleMeta {
  id: string
  fields: string[]
}

/**
 * 评估命中指定字段的所有 phase: both 规则。
 * @param realtimeRules phase: both 规则元数据（id/fields）
 * @param field blur 的字段名
 * @param value 该字段当前值
 * @param ctx 客户端上下文（最小化，无 now）
 * @param registry 本域注册表（realtime check 由 client import）
 */
export function evaluateRealtimeRules(
  realtimeRules: RealtimeRuleMeta[],
  field: string,
  value: unknown,
  ctx: ClientRuleCtx,
  registry: DomainRuleRegistry,
): FieldIssue[] {
  const issues: FieldIssue[] = []
  for (const rule of realtimeRules) {
    if (!rule.fields.includes(field)) continue
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

- [ ] **Step 2: 跟随改 realtime.test.ts（domainId → rules 元数据数组）**

`frontend/src/nexus/rules/__tests__/realtime.test.ts` —— 把所有 `evaluateRealtimeRules('_rulefixture', 'name', ...)` 改为传入 fixture 的 phase:both 元数据。替换测试为：
```ts
/**
 * @file realtime.test
 * @brief R0/R1 — evaluateRealtimeRules 纯核心：命中字段的 both 规则（client-safe）
 */
import { describe, it, expect } from 'vitest'
import { evaluateRealtimeRules, type RealtimeRuleMeta } from '../realtime'
import { fixtureRuleRegistry } from '@/domains/_rulefixture/rules-registry'

const ctx = {}
const fixtureBothRules: RealtimeRuleMeta[] = [
  { id: 'fixture_name_required', fields: ['name'] },
]

describe('evaluateRealtimeRules — fixture', () => {
  it('blur name=空 → 命中 fixture_name_required，返回 1 issue', () => {
    expect(evaluateRealtimeRules(fixtureBothRules, 'name', '', ctx, fixtureRuleRegistry))
      .toEqual([{ field: 'name', message: '名称不能为空' }])
  })
  it('blur name=合法 → 无 issue', () => {
    expect(evaluateRealtimeRules(fixtureBothRules, 'name', 'ok', ctx, fixtureRuleRegistry)).toEqual([])
  })
  it('blur count → 无 both 规则命中 count（fixture_count_positive 是 submit，不进 realtime）', () => {
    expect(evaluateRealtimeRules(fixtureBothRules, 'count', -1, ctx, fixtureRuleRegistry)).toEqual([])
  })
  it('realtime check 抛错 → fail-OPEN（吞错，返回空，不崩）', () => {
    const throwingRegistry = {
      realtime: { fixture_name_required: (() => { throw new Error('boom') }) as any },
      submit: {},
    }
    expect(evaluateRealtimeRules(fixtureBothRules, 'name', 'x', ctx, throwingRegistry)).toEqual([])
  })
})
```

- [ ] **Step 3: 运行确认通过**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/realtime.test.ts && npx tsc --noEmit`
Expected: PASS + 无类型错误

- [ ] **Step 4: 提交**

```bash
cd frontend
git add src/nexus/rules/realtime.ts src/nexus/rules/__tests__/realtime.test.ts
git commit -m "refactor(nexus/rules): evaluateRealtimeRules client-safe（method B，移除 loader 调用）（R1 Task7）"
```

---

## Task 8: server action getRealtimeRules + useManifestRules 客户端化（M3 ctx 稳定）

**Files:**
- Create: `frontend/src/nexus/rules/server/get-realtime-rules.ts`
- Modify: `frontend/src/nexus/rules/use-manifest-rules.ts`
- Modify: `frontend/src/nexus/rules/index.ts`

> method B 后半：`'use server'` action 从 manifest 取 phase:both 元数据（server-only loader）；`useManifestRules` 签名改接收 `realtimeRules[]`（不再持 domainId 调 loader），M3 用 `useMemo` 稳定 ctx，加 `validateAll` 供 submit 预检。

- [ ] **Step 1: 写 server action**

`frontend/src/nexus/rules/server/get-realtime-rules.ts`:
```ts
/**
 * @file get-realtime-rules
 * @brief [018-G3] R1 §4.5 method B — 取 phase: both 规则元数据的 server action
 *
 * loadDomainManifest 是 server-only（import fs），client 组件不可直接调。
 * 本 action 在服务端读取 manifest、过滤 phase: both 规则、返回可序列化元数据，
 * 供 client 表单（useManifestRules）消费。check 函数本身由 client import registry 子集。
 */
'use server'

import { loadDomainManifest } from '@/domains/manifest-loader'
import type { RealtimeRuleMeta } from '../realtime'

/**
 * 取指定域的 phase: both 规则元数据（id/fields）。
 * @param domainId 域 id
 * @returns phase: both 规则元数据数组（加载失败或无规则 → 空数组）
 */
export async function getRealtimeRules(domainId: string): Promise<RealtimeRuleMeta[]> {
  const loaded = loadDomainManifest(domainId)
  if (!loaded.success) return []
  const rules = loaded.manifest.rules ?? []
  return rules.filter((r) => r.phase === 'both').map((r) => ({ id: r.id, fields: r.fields }))
}
```

- [ ] **Step 2: 改 use-manifest-rules.ts**

`frontend/src/nexus/rules/use-manifest-rules.ts` 整体替换为：
```ts
/**
 * @file use-manifest-rules
 * @brief [018-G3] R1 客户端 realtime 校验 React hook（client-safe，委托 realtime 纯核心）
 *
 * §4.5 method B：realtimeRules 元数据由 server action getRealtimeRules 取得后传入；
 * check 函数由 client import registry 子集。本 hook 持 errors state，blur 时调
 * evaluateRealtimeRules，submit 前 validateAll 跑全部 both 规则做尽力预检。
 * M3：ctx 经 useMemo 稳定，避免 validateField 每次 render 变更 identity。
 */
'use client'

import { useState, useCallback, useMemo } from 'react'
import { evaluateRealtimeRules, type RealtimeRuleMeta } from './realtime'
import type { ClientRuleCtx, DomainRuleRegistry } from './types'

export interface UseManifestRulesResult {
  errors: Record<string, string>
  validateField: (field: string, value: unknown) => void
  clearField: (field: string) => void
  /** submit 前预检：跑所有 both 规则覆盖的字段，返回是否全通过 */
  validateAll: (values: Record<string, unknown>) => boolean
}

/**
 * @param realtimeRules phase: both 规则元数据（server action 提供）
 * @param registry realtime check 注册表（client import 子集）
 * @param ctx 客户端上下文（最小化）
 */
export function useManifestRules(
  realtimeRules: RealtimeRuleMeta[],
  registry: DomainRuleRegistry,
  ctx: ClientRuleCtx = {},
): UseManifestRulesResult {
  const [errors, setErrors] = useState<Record<string, string>>({})
  // M3：稳定 ctx identity（ClientRuleCtx 当前无字段；未来扩展只读元数据时按需 memo 依赖）
  const stableCtx = useMemo<ClientRuleCtx>(() => ctx, []) // eslint-disable-line react-hooks/exhaustive-deps

  const validateField = useCallback(
    (field: string, value: unknown) => {
      const issues = evaluateRealtimeRules(realtimeRules, field, value, stableCtx, registry)
      setErrors((prev) => {
        const next = { ...prev }
        const hit = issues.find((i) => i.field === field)
        if (hit) next[field] = hit.message
        else delete next[field]
        return next
      })
    },
    [realtimeRules, registry, stableCtx],
  )

  const validateAll = useCallback(
    (values: Record<string, unknown>): boolean => {
      const fields = new Set(realtimeRules.flatMap((r) => r.fields))
      const next: Record<string, string> = {}
      for (const f of fields) {
        const issues = evaluateRealtimeRules(realtimeRules, f, values[f], stableCtx, registry)
        const hit = issues.find((i) => i.field === f)
        if (hit) next[f] = hit.message
      }
      setErrors(next)
      return Object.keys(next).length === 0
    },
    [realtimeRules, registry, stableCtx],
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
```

- [ ] **Step 3: 更新 index.ts 导出**

`frontend/src/nexus/rules/index.ts` —— 在既有 barrel 中追加：
```ts
export type { RealtimeRuleMeta } from './realtime'
export { getRealtimeRules } from './server/get-realtime-rules'
```

- [ ] **Step 4: tsc 双验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 5: 跑全部 rules 测试确认无回归**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
cd frontend
git add src/nexus/rules/server/get-realtime-rules.ts src/nexus/rules/use-manifest-rules.ts src/nexus/rules/index.ts
git commit -m "feat(nexus/rules): getRealtimeRules server action + useManifestRules client-safe（M3 ctx 稳定）（R1 Task8）"
```

---

## Task 9: submit 失败 errors→字段回填映射（纯函数 + 单测）

**Files:**
- Create: `frontend/src/nexus/rules/server-error-mapping.ts`
- Create: `frontend/src/nexus/rules/__tests__/server-error-mapping.test.ts`

> §4.4 消费者B回填：服务端 onValidate 返回 Rejected(errors) 时，按 realtime 规则的 message→field 映射把能匹配的错误标红到字段；匹配不上的走表单级。本任务只做**纯映射函数 + 单测**（接线在 Task 10）。

- [ ] **Step 1: 写单测（先失败）**

`frontend/src/nexus/rules/__tests__/server-error-mapping.test.ts`:
```ts
/**
 * @file server-error-mapping.test
 * @brief [018-G3] R1 Task9 — mapServerErrorsToFields：服务端 errors → 字段回填
 */
import { describe, it, expect } from 'vitest'
import { mapServerErrorsToFields } from '../server-error-mapping'
import type { RealtimeRuleMeta } from '../realtime'

const rules: RealtimeRuleMeta[] = [
  { id: 'habit_default_duration_positive', fields: ['defaultDuration'] },
  { id: 'habit_default_time_format', fields: ['defaultTime'] },
]
// 模拟 registry 中规则的 message（映射靠 message 匹配）
const ruleMessages: Record<string, string> = {
  habit_default_duration_positive: '默认时长必须大于 0',
  habit_default_time_format: '默认时间必须是有效的 HH:MM 格式',
}

describe('mapServerErrorsToFields', () => {
  it('能匹配 realtime 规则 message 的 error → 回填到字段', () => {
    const r = mapServerErrorsToFields(['默认时长必须大于 0'], rules, ruleMessages)
    expect(r.fieldErrors).toEqual({ defaultDuration: '默认时长必须大于 0' })
    expect(r.formErrors).toEqual([])
  })
  it('匹配不上的 error（如「标题必填」非 realtime）→ 走 formErrors', () => {
    const r = mapServerErrorsToFields(['标题必填'], rules, ruleMessages)
    expect(r.fieldErrors).toEqual({})
    expect(r.formErrors).toEqual(['标题必填'])
  })
  it('混合：部分匹配字段、部分走表单', () => {
    const r = mapServerErrorsToFields(['标题必填', '默认时间必须是有效的 HH:MM 格式'], rules, ruleMessages)
    expect(r.fieldErrors).toEqual({ defaultTime: '默认时间必须是有效的 HH:MM 格式' })
    expect(r.formErrors).toEqual(['标题必填'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/server-error-mapping.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现映射函数**

`frontend/src/nexus/rules/server-error-mapping.ts`:
```ts
/**
 * @file server-error-mapping
 * @brief [018-G3] R1 §4.4 消费者B回填 — 服务端 errors → 字段映射
 *
 * 服务端 onValidate 返回 Rejected(errors) 时，把能匹配某 realtime 规则 message 的
 * 错误回填到该规则字段（标红）；匹配不上的走表单级提示（toast/banner）。
 */
import type { RealtimeRuleMeta } from './realtime'

export interface MappedServerErrors {
  /** 能映射到字段的错误（field → message） */
  fieldErrors: Record<string, string>
  /** 匹配不上的错误（表单级） */
  formErrors: string[]
}

/**
 * @param serverErrors 服务端 Rejected.errors
 * @param realtimeRules phase: both 规则元数据（id/fields）
 * @param ruleMessages 各 realtime 规则的 message（id → message，由 manifest 元数据提供）
 */
export function mapServerErrorsToFields(
  serverErrors: string[],
  realtimeRules: RealtimeRuleMeta[],
  ruleMessages: Record<string, string>,
): MappedServerErrors {
  const fieldErrors: Record<string, string> = {}
  const formErrors: string[] = []
  for (const err of serverErrors) {
    // 找 message === err 的 realtime 规则，回填其首个字段
    const matched = realtimeRules.find((r) => ruleMessages[r.id] === err)
    if (matched) {
      fieldErrors[matched.fields[0]] = err
    } else {
      formErrors.push(err)
    }
  }
  return { fieldErrors, formErrors }
}
```

- [ ] **Step 4: 运行确认通过 + tsc**

Run: `cd frontend && npx vitest run src/nexus/rules/__tests__/server-error-mapping.test.ts && npx tsc --noEmit`
Expected: PASS + 无错误

- [ ] **Step 5: 提交**

```bash
cd frontend
git add src/nexus/rules/server-error-mapping.ts src/nexus/rules/__tests__/server-error-mapping.test.ts
git commit -m "feat(nexus/rules): mapServerErrorsToFields 服务端 errors→字段回填（R1 Task9）"
```

---

## Task 10: HabitForm 接 useManifestRules（realtime blur + inline 错误 + submit 预检 + 失败回填）

**Files:**
- Modify: `frontend/src/domains/habits/components/habit-form.tsx`

> habit-form 是 `'use client'`。改用 `useManifestRules`：mount 时 `getRealtimeRules('habits')` 取元数据；各 realtime 字段 onBlur 调 `validateField`；inline 显示 `errors[field]`；submit 前 `validateAll` 预检（both 规则）；移除 `validateHabitFields` import 与 `clientErrors`。失败回填通过可选 `serverErrors` prop + `mapServerErrorsToFields`（父组件在 submit 失败时传入；R1 内实现回填逻辑，父接线在 E2E 验证）。

- [ ] **Step 1: 改 imports + 接口 + hook 装配**

`frontend/src/domains/habits/components/habit-form.tsx`：
- 移除 `import { validateHabitFields } from '../validation'`
- 增加：
```ts
import { useManifestRules, getRealtimeRules, mapServerErrorsToFields, type RealtimeRuleMeta } from "@/nexus/rules"
import { habitRuleRegistry } from "../rules-registry"
import { useEffect, useState } from "react"
```
（`useEffect`/`useState` 已在既有 import `react` 行，按需补全；既有 `import { useState, useCallback, useRef, useEffect } from "react"` 已含，无需重复。）
- `HabitFormProps` 增加：
```ts
  /** 服务端 submit 失败返回的 errors（R1 §4.4 回填：按字段标红，匹配不上走表单级） */
  serverErrors?: string[]
```
- 在 `HabitForm` 函数体顶部（既有 useState 群之后）增加：
```ts
  const [realtimeRules, setRealtimeRules] = useState<RealtimeRuleMeta[]>([])
  useEffect(() => {
    // §4.5 method B：mount 时取 phase:both 规则元数据（server action）
    let mounted = true
    getRealtimeRules("habits").then((r) => { if (mounted) setRealtimeRules(r) })
    return () => { mounted = false }
  }, [])
  const { errors: fieldErrors, validateField, validateAll } = useManifestRules(realtimeRules, habitRuleRegistry)
  const [formErrors, setFormErrors] = useState<string[]>([])
```
- 移除既有 `const [clientErrors, setClientErrors] = useState<string[]>([])`。
- 增加 serverErrors 回填 effect（props.serverErrors 变化时映射）：
```ts
  useEffect(() => {
    if (!serverErrors || serverErrors.length === 0) return
    // 用 manifest message 映射（与 registry 各 both 规则 message 一致）
    const ruleMessages: Record<string, string> = {
      habit_default_duration_positive: "默认时长必须大于 0",
      habit_min_duration_positive: "最短时长必须大于 0",
      habit_frequency_type_valid: "频率类型必须是 daily/weekly/custom",
      habit_default_time_format: "默认时间必须是有效的 HH:MM 格式",
      habit_earliest_time_format: "最早开始时间必须是有效的 HH:MM 格式",
      habit_latest_time_format: "最迟开始时间必须是有效的 HH:MM 格式",
    }
    const mapped = mapServerErrorsToFields(serverErrors, realtimeRules, ruleMessages)
    setFormErrors(mapped.formErrors)
    // fieldErrors 由 useManifestRules 持有，这里通过 validateField 间接写入命中字段
    for (const [field, msg] of Object.entries(mapped.fieldErrors)) {
      validateField(field, msg === "" ? undefined : currentFieldsRef.current[field])
    }
  }, [serverErrors, realtimeRules, validateField])
```
> 上述用 `currentFieldsRef` 读当前字段值——需新增 `const currentFieldsRef = useRef<Record<string, unknown>>({})` 并在每次字段 setState 处同步（或更简：回填时直接把 mapped.fieldErrors 合并进一个本地 `serverFieldErrors` state 显示）。**为降低复杂度，采用「本地 serverFieldErrors state」方案**：把上面 effect 改为只 setFormErrors + setServerFieldErrors(mapped.fieldErrors)，inline 错误显示时合并 `fieldErrors[field] || serverFieldErrors[field]`。实现：
```ts
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!serverErrors || serverErrors.length === 0) { setServerFieldErrors({}); setFormErrors([]); return }
    const ruleMessages: Record<string, string> = {
      habit_default_duration_positive: "默认时长必须大于 0",
      habit_min_duration_positive: "最短时长必须大于 0",
      habit_frequency_type_valid: "频率类型必须是 daily/weekly/custom",
      habit_default_time_format: "默认时间必须是有效的 HH:MM 格式",
      habit_earliest_time_format: "最早开始时间必须是有效的 HH:MM 格式",
      habit_latest_time_format: "最迟开始时间必须是有效的 HH:MM 格式",
    }
    const mapped = mapServerErrorsToFields(serverErrors, realtimeRules, ruleMessages)
    setServerFieldErrors(mapped.fieldErrors)
    setFormErrors(mapped.formErrors)
  }, [serverErrors, realtimeRules])
```
（去掉 currentFieldsRef 方案，用 serverFieldErrors state。）

- [ ] **Step 2: 改 handleSubmit（validateAll 预检替代 validateHabitFields）**

把 `handleSubmit` 中：
```ts
    const validation = validateHabitFields(fields as unknown as Record<string, unknown>, 'createHabit')
    if (!validation.valid) {
      setClientErrors(validation.errors)
      return
    }
    setClientErrors([])
```
替换为：
```ts
    // [018-G3] R1：客户端预检仅跑 phase: both 规则（尽力而为，服务端 onValidate 权威兜底）
    setFormErrors([])
    if (!validateAll(fields as unknown as Record<string, unknown>)) {
      return
    }
```

- [ ] **Step 3: 给 realtime 字段接 onBlur + inline 错误显示**

为 6 个 realtime 字段加 `onBlur` 调 `validateField`，并在其 Label 下显示错误。**逐字段改法**（每处把字段当前值喂给 validateField）：

(a) 默认时间 `habit-default-time`（既有 Input 已有 `onBlur={handleDefaultTimeBlur}`）→ 追加一个 onBlur 触发校验。改为：
```tsx
        <Input
          id="habit-default-time"
          type="time"
          value={defaultTime}
          onChange={(e) => { setDefaultTime(e.target.value); onDirtyChange?.(true) }}
          onBlur={() => { handleDefaultTimeBlur(); validateField("defaultTime", defaultTime) }}
        />
        {((fieldErrors.defaultTime) || (serverFieldErrors.defaultTime)) && (
          <p className="text-xs text-error">{fieldErrors.defaultTime || serverFieldErrors.defaultTime}</p>
        )}
```

(b) 最早开始 `habit-earliest`（无既有 onBlur）：
```tsx
        <Input
          id="habit-earliest"
          type="time"
          value={earliestTime}
          onChange={(e) => { setEarliestTime(e.target.value); onDirtyChange?.(true) }}
          onBlur={() => validateField("earliestTime", earliestTime)}
        />
        {(fieldErrors.earliestTime || serverFieldErrors.earliestTime) && (
          <p className="text-xs text-error">{fieldErrors.earliestTime || serverFieldErrors.earliestTime}</p>
        )}
```

(c) 最迟开始 `habit-latest`：
```tsx
        <Input
          id="habit-latest"
          type="time"
          value={latestStartTime}
          onChange={(e) => { setLatestEndTime(e.target.value); onDirtyChange?.(true) }}
          onBlur={() => validateField("latestStartTime", latestStartTime)}
        />
        {(fieldErrors.latestStartTime || serverFieldErrors.latestStartTime) && (
          <p className="text-xs text-error">{fieldErrors.latestStartTime || serverFieldErrors.latestStartTime}</p>
        )}
```

(d) 默认时长 `habit-duration`（既有 `onBlur={handleDurationBlur}`）：
```tsx
        <Input
          id="habit-duration"
          type="number"
          min={5}
          max={480}
          value={defaultDuration}
          onChange={(e) => { setDefaultDuration(Number(e.target.value)); onDirtyChange?.(true) }}
          onBlur={() => { handleDurationBlur(); validateField("defaultDuration", defaultDuration) }}
        />
        {(fieldErrors.defaultDuration || serverFieldErrors.defaultDuration) && (
          <p className="text-xs text-error">{fieldErrors.defaultDuration || serverFieldErrors.defaultDuration}</p>
        )}
```

(e) 最短时长 `habit-min-duration`：
```tsx
        <Input
          id="habit-min-duration"
          type="number"
          min={5}
          max={defaultDuration}
          value={minDuration}
          onChange={(e) => { setMinDuration(Number(e.target.value)); onDirtyChange?.(true) }}
          onBlur={() => validateField("minDuration", minDuration)}
        />
        {(fieldErrors.minDuration || serverFieldErrors.minDuration) && (
          <p className="text-xs text-error">{fieldErrors.minDuration || serverFieldErrors.minDuration}</p>
        )}
```

(f) 频率（按钮组，无单一 input blur；在 frequencyType 变化时校验——改 onClick）：
```tsx
              onClick={() => { setFrequencyType(ft); onDirtyChange?.(true); validateField("frequencyType", ft) }}
```
并在频率区块 Label 下加错误：
```tsx
      {(fieldErrors.frequencyType || serverFieldErrors.frequencyType) && (
        <p className="text-xs text-error">{fieldErrors.frequencyType || serverFieldErrors.frequencyType}</p>
      )}
```

- [ ] **Step 4: 改底部错误展示（clientErrors → formErrors）**

把既有：
```tsx
      {clientErrors.length > 0 && (
        <div className="rounded-lg border border-error bg-error-soft px-3 py-2 text-xs text-error">
          {clientErrors.map((err, i) => (
            <div key={i}>{err}</div>
          ))}
        </div>
      )}
```
替换为：
```tsx
      {formErrors.length > 0 && (
        <div className="rounded-lg border border-error bg-error-soft px-3 py-2 text-xs text-error">
          {formErrors.map((err, i) => (
            <div key={i}>{err}</div>
          ))}
        </div>
      )}
```

- [ ] **Step 5: tsc 双验证 + 既有 habits 组件测试**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误

Run: `cd frontend && npx vitest run src/domains/habits/__tests__/`
Expected: PASS（golden + domain + validation + rules-registry 全绿）

- [ ] **Step 6: 提交**

```bash
cd frontend
git add src/domains/habits/components/habit-form.tsx
git commit -m "feat(habits): HabitForm 接 useManifestRules（realtime blur + inline 错误 + 预检 + 回填）（R1 Task10）"
```

---

## Task 11: 集成测试（realtime→submit→回填 loop）+ CUC-01~12 自测

**Files:**
- Create: `frontend/src/domains/habits/__tests__/rules-roundtrip.test.ts`

> vitest 集成层验证「realtime 抓得到 → submit 权威也抓 → 回填映射正确」闭环。浏览器 E2E（blur 标红 → 修正 → submit 通过；realtime 过 → submit 查库拒绝 → 回填）走 gstack `/qa`（见 Execution Handoff），本任务提供逻辑层闭环 + CUC 自测清单。

- [ ] **Step 1: 写集成测试**

`frontend/src/domains/habits/__tests__/rules-roundtrip.test.ts`:
```ts
/**
 * @file rules-roundtrip.test
 * @brief [018-G3] R1 Task11 — realtime→submit→回填 闭环集成
 */
import { describe, it, expect } from 'vitest'
import { vi } from 'vitest'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import { evaluateRealtimeRules, evaluateDomainRules, mapServerErrorsToFields, type RealtimeRuleMeta } from '@/nexus/rules'
import { habitRuleRegistry } from '../rules-registry'

vi.mock('@/domains/manifest-loader', () => {
  // 与真实 habits manifest rules 区块一致的内存 manifest（供 evaluateDomainRules 读）
  const bothRules = [
    { id: 'habit_default_duration_positive', phase: 'both', fields: ['defaultDuration'], message: '默认时长必须大于 0' },
    { id: 'habit_min_duration_positive', phase: 'both', fields: ['minDuration'], message: '最短时长必须大于 0' },
    { id: 'habit_frequency_type_valid', phase: 'both', fields: ['frequencyType'], message: '频率类型必须是 daily/weekly/custom' },
    { id: 'habit_default_time_format', phase: 'both', fields: ['defaultTime'], message: '默认时间必须是有效的 HH:MM 格式' },
    { id: 'habit_earliest_time_format', phase: 'both', fields: ['earliestTime'], message: '最早开始时间必须是有效的 HH:MM 格式' },
    { id: 'habit_latest_time_format', phase: 'both', fields: ['latestStartTime'], message: '最迟开始时间必须是有效的 HH:MM 格式' },
  ]
  const submitRule = { id: 'habit_action_fields_valid', phase: 'submit', fields: [], message: '习惯字段校验失败' }
  return {
    loadDomainManifest: () => ({
      success: true,
      manifest: { id: 'habits', version: '1.0.0', name: '习惯管理', description: 'd', intent_triggers: [], lifecycle: {}, field_metadata: {}, list_actions: [], required_fields: {}, subscribed_events: [], rules: [submitRule, ...bothRules] },
    }),
    __bothRules: bothRules,
  }
})

function intent(fields: Record<string, unknown>): StructuredIntent {
  return { id: 'i' as USOM_ID, intentionId: 'in' as USOM_ID, targetDomain: 'habits', action: 'createHabit', fields, confidence: 1, resolvedBy: 'form', createdAt: '2026-06-20T00:00:00Z' } as unknown as StructuredIntent
}
const serverCtx = { repos: {}, userId: 'u' as USOM_ID, now: 0 }
const clientCtx = {}
// realtime 元数据（与 manifest both 规则一致）
const realtimeRules: RealtimeRuleMeta[] = [
  { id: 'habit_default_duration_positive', fields: ['defaultDuration'] },
  { id: 'habit_default_time_format', fields: ['defaultTime'] },
]
const ruleMessages: Record<string, string> = {
  habit_default_duration_positive: '默认时长必须大于 0',
  habit_default_time_format: '默认时间必须是有效的 HH:MM 格式',
}

describe('[roundtrip] realtime 抓得到 → submit 权威也抓', () => {
  it('defaultDuration=0：realtime 抓到 + submit Rejected 含同一文案', async () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'defaultDuration', 0, clientCtx, habitRuleRegistry)
    expect(issues.some((i) => i.message === '默认时长必须大于 0')).toBe(true)
    const result = await evaluateDomainRules('habits', intent({ title: 't', defaultDuration: 0 }), serverCtx, habitRuleRegistry)
    expect(result.kind === 'Rejected' && result.errors.includes('默认时长必须大于 0')).toBe(true)
  })
})

describe('[roundtrip] 回填映射', () => {
  it('submit errors 含 realtime 文案 → 回填到字段', () => {
    const mapped = mapServerErrorsToFields(['默认时长必须大于 0', '标题必填'], realtimeRules, ruleMessages)
    expect(mapped.fieldErrors.defaultDuration).toBe('默认时长必须大于 0')
    expect(mapped.formErrors).toEqual(['标题必填'])
  })
})

describe('[roundtrip] D 模式：多错误 submit 全显', () => {
  it('缺 title + duration 0 + 频率非法 → submit 返回 3 条 errors（聚合规则置首）', async () => {
    const result = await evaluateDomainRules('habits', intent({ title: '', defaultDuration: 0, frequencyType: 'bad' }), serverCtx, habitRuleRegistry)
    expect(result.kind === 'Rejected' && result.errors).toEqual(['标题必填', '默认时长必须大于 0', '频率类型必须是 daily/weekly/custom'])
  })
})
```

- [ ] **Step 2: 运行确认通过**

Run: `cd frontend && npx vitest run src/domains/habits/__tests__/rules-roundtrip.test.ts`
Expected: PASS

- [ ] **Step 3: 全量回归（base/head 失败集合对比）**

Run: `cd frontend && npx vitest run src/domains/habits/__tests__/ src/nexus/rules/__tests__/`
Expected: 全 PASS；与 R0 基线对比无新增失败（用 base/head 失败集合，不数硬编码数，见 memory `feedback-change-gate-baseline`）。

Run: `cd frontend && npx tsc --noEmit && npx tsx scripts/validate-manifest.ts; echo "EXIT=$?"`
Expected: tsc 无错误；validate-manifest EXIT=0。

- [ ] **Step 4: CUC-01~12 自测（涉及 CNUI/表单改动强制）**

按 `docs/UI-DESIGN-SPEC.md §11.10` CUC-01~CUC-12 逐条自测 HabitForm realtime 改动（颜色用 CSS 变量令牌 `text-error`/`bg-error-soft`/`border-error`，非 Tailwind 默认色；inline 错误不破坏三栏布局；频率按钮组错误显示不重叠等）。**记录自测结果**到提交说明。浏览器实际验证走 `/qa`（Execution Handoff）。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add src/domains/habits/__tests__/rules-roundtrip.test.ts
git commit -m "test(habits): realtime→submit→回填 闭环集成 + CUC-01~12 自测（R1 Task11）"
```

---

## Task 12: Tier-2 文档同步（usom-design §4.4 + manifest.md）

**Files:**
- Modify: `docs/usom-design.md`（§4.4 habits 域规则层落地状态）
- Modify: `manifest.md`（索引同步本计划）

- [ ] **Step 1: usom-design §4.4 标注 habits 规则层落地**

在 `docs/usom-design.md` §4.4（域落地状态表/段）记录 habits 域规则三层已接入：manifest `rules:` 区块（D 模式：聚合 submit 置首 + 6 粒度 both）+ `rules-registry.ts` + onValidate 改调 `evaluateDomainRules` + habit-form 接 `useManifestRules`（method B）。标注 R2-R4 待办。

- [ ] **Step 2: manifest.md 索引同步**

在 `manifest.md` 计划索引区追加：
```markdown
- [018-G3] R1 habits 端到端实现计划 — docs/superpowers/plans/2026-06-20-018-g3-r1-habits-end-to-end.md
```

- [ ] **Step 3: 提交**

```bash
git add docs/usom-design.md manifest.md
git commit -m "docs: usom-design §4.4 habits 规则层落地 + manifest 索引（R1 Task12）"
```

---

## Self-Review

**1. Spec 覆盖（对照设计 §4/§6 R1）：**
- §4.1 manifest 声明（rules: 区块）→ Task 2 ✅
- §4.2 不变式（both⟹单字段、无 realtime-only）→ Task 2（6 条 both 全单字段；聚合 submit 多字段合规）✅
- §4.3 registry（RealtimeCheck 单值 + SubmitCheck）+ 适配器复用 → Task 4 ✅
- §4.3 异常不对称（realtime fail-OPEN / submit fail-CLOSED）→ R0 已落地，R1 复用（evaluate.ts 不动）✅
- §4.4 消费者A onValidate 调 evaluateDomainRules → Task 5 ✅
- §4.4 消费者B 表单用 useManifestRules + 回填 → Task 8/9/10 ✅
- §4.5 client/server 数据流 method B → Task 7/8（server action + client-safe 纯核心）✅
- §6 R1（habits 试点 + golden + E2E + CUC）→ Task 1/11 ✅
- §6 P5 golden 逐字保持 → Task 1 + Task 5（D 模式保多错误）✅
- 复用底层管线零改动 → Task 5 直接 import evaluateDomainRules，aggregateValidation 不动 ✅
- C1 碰撞消解 → Task 3 ✅
- M1/M2/M3/M4 handover → 约束 6 + Task 6/8/1 ✅
- Tier-2 文档同步 → Task 12 ✅

**2. 占位扫描：** 无 TBD/TODO；每步含完整代码或确切命令。Task 10 的 UI 改动给出 6 字段逐处完整 JSX 片段（非「similar to」）。✅

**3. 类型一致性：** `RealtimeRuleMeta` 跨 realtime.ts/use-manifest-rules.ts/server action/test 一致；`evaluateRealtimeRules(realtimeRules, field, value, ctx, registry)` 跨定义与所有测试一致；`habitRuleRegistry` 的 realtime key（6 条）与 manifest both 规则 id 一致、submit key `habit_action_fields_valid` 与 manifest 首条一致；`mapServerErrorsToFields(serverErrors, realtimeRules, ruleMessages)` 跨 Task 9/10/11 一致。✅

**R1 不做（留给 R2-R4 / 后续）：** tasks/okrs/timebox 规则迁移；okrs 写入口编排重构；timebox submit stub 落地；warning→PWW 迁移（行为变更，独立决策）；HabitCreationCard/CnuiFormAdapter 的 realtime（独立表单系统）；title 必填的 realtime（action-variant，需 ClientRuleCtx 加 action，推迟）。R2-R4 须 R1 sign-off 后放行。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-20-018-g3-r1-habits-end-to-end.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — 每个 Task 派 fresh subagent，任务间 review（spec + 质量双审），快速迭代。

**2. Inline Execution** — 本会话内用 executing-plans 批量执行 + 检查点。

**浏览器 E2E（Task 11 Step 4 之后）：** 走 gstack `/qa` 验证两个关键路径——(a) HabitForm blur 标红 → 修正 → submit 通过；(b) realtime 过 → 服务端 submit 拒绝 → 按字段回填标红。CUC-01~12 在 `/qa` 中实测。

**Which approach?**
