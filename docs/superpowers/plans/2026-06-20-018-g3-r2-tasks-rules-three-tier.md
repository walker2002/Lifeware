# [018-G3] R2 — Tasks 域规则三层架构落地

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 tasks 域接入规则三层架构（R1 habits 模式复刻），manifest 声明式规则 + rules-registry 命令式处理器 + hooks.ts 薄壳委托 + roundtrip 集成测试。

**Architecture:** R1 契约全锁定，R2 同模式零新设计。复用 `evaluateDomainRules`、`evaluateRealtimeRules`、`mapServerErrorsToFields` 等已有 Nexus 框架。tasks 域仅需产出 manifest rules 区块 + `rules-registry.ts` + 改 `hooks.ts` 薄壳 + 测试。

**Tech Stack:** TypeScript, Vitest, React 19 (useManifestRules hook — CNUI 可选集成)

**关键约束（从 R1 继承）：**
- ⚠️ **client 组件禁止从 `@/nexus/rules` barrel import**（会经 evaluate→loader 把 `node:fs` 泄漏进 client bundle）。client 表单须直接 import 子模块：`use-manifest-rules` / `realtime` / `server-error-mapping` / `server/get-realtime-rules`
- D 模式：聚合 submit 规则在 manifest 置首，submit 聚合时其 Rejected 先胜出
- realtime fail-OPEN（吞错记日志），submit fail-CLOSED（抛错→Rejected）
- phase∈{submit, both}，无 realtime-only；both 规则为 action-invariant 单字段纯函数
- 所有注释和文档使用简体中文

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `frontend/src/domains/tasks/manifest.yaml` | 修改 | 新增 `rules:` 区块（区块 L） |
| `frontend/src/domains/tasks/rules-registry.ts` | 创建 | RealtimeCheck + SubmitCheck 注册表 |
| `frontend/src/domains/tasks/hooks.ts` | 修改 | `onValidate` 改为薄壳委托 `evaluateDomainRules` |
| `frontend/src/domains/tasks/index.ts` | 修改 | 导出 `taskRuleRegistry` |
| `frontend/src/domains/tasks/__tests__/rules-registry.test.ts` | 创建 | realtime check 单元测试 |
| `frontend/src/domains/tasks/__tests__/rules-roundtrip.test.ts` | 创建 | realtime→submit→回填 闭环集成 |
| `frontend/src/domains/tasks/__tests__/tasks-compliance.test.ts` | 修改 | 更新 onValidate 测试（mock loadDomainManifest） |

---

### Task 1: 在 manifest.yaml 新增 rules 区块（区块 L）

**Files:**
- Modify: `frontend/src/domains/tasks/manifest.yaml`（在 cnui_surfaces 区块后追加）

- [ ] **Step 1: 追加 rules 区块到 manifest.yaml**

在 `manifest.yaml` 末尾（`cnui_surfaces:` 区块后）追加以下内容：

```yaml
# ─── 区块 L: rules（[018-G3] 规则三层架构，R2） ─────────────────
# D 模式（权威合并规则前置）：task_action_fields_valid 必须置首。
#   submit 时 evaluateDomainRules 按 manifest 顺序折叠，聚合规则先 Rejected
#   则 aggregateValidation「首个 Rejected 胜出」吞掉后续粒度规则的 Rejected，
#   保持「全部 errors」逐字输出（golden）。粒度 both 规则做客户端 realtime blur。
rules:
  # ── 权威聚合（phase: submit，复刻现状 onValidate 全分支）──
  - id: task_action_fields_valid
    phase: submit
    fields: [title, description, priority, energyRequired, estimatedDuration, dueDate, threadId, parentId, name, color, targetStatus, currentStatus, targetType]
    message: 任务/主线字段校验失败

  # ── 客户端 realtime（phase: both，action-invariant 单字段纯函数）──
  - id: task_estimated_duration_positive
    phase: both
    fields: [estimatedDuration]
    message: 预估时长必须大于 0
  - id: task_estimated_duration_max
    phase: both
    fields: [estimatedDuration]
    message: 预估时长不能超过 24 小时（1440 分钟）
  - id: task_priority_valid
    phase: both
    fields: [priority]
    message: 优先级必须是 critical/high/medium/low 之一
  - id: task_energy_required_valid
    phase: both
    fields: [energyRequired]
    message: 能量要求必须是 high/medium/low 之一
  - id: task_due_date_format
    phase: both
    fields: [dueDate]
    message: 截止日期格式必须是 YYYY-MM-DD
  - id: thread_color_format
    phase: both
    fields: [color]
    message: 颜色格式必须是 #RRGGBB
```

- [ ] **Step 2: 验证 manifest 语法**

```bash
cd frontend && node -e "const yaml = require('js-yaml'); const fs = require('fs'); yaml.load(fs.readFileSync('src/domains/tasks/manifest.yaml','utf8')); console.log('YAML OK')"
```

Expected: `YAML OK`

- [ ] **Step 3: 提交**

```bash
git add frontend/src/domains/tasks/manifest.yaml
git commit -m "feat(tasks): manifest.yaml 新增 rules 区块（R2 规则三层，1 submit + 6 both）"
```

---

### Task 2: 创建 rules-registry.ts

**Files:**
- Create: `frontend/src/domains/tasks/rules-registry.ts`

- [ ] **Step 1: 编写 rules-registry.ts**

```typescript
/**
 * @file rules-registry
 * @brief [018-G3] R2 tasks 域规则注册表（命令式处理器）
 *
 * 纯 TS 模块（无 React / 无 fs），client + server 皆可 import。
 * - realtime（phase: both）：action-invariant 单字段纯函数，客户端 blur
 * - submit（phase: submit）：task_action_fields_valid 聚合规则，逐字复刻现状
 *   hooks.ts onValidate 全分支（复用 validateTaskFields / validateThreadFields），
 *   返回 validationRejected(全部 errors)
 *
 * D 模式：聚合规则在 manifest 中置首，submit 聚合时其 Rejected 先胜出、吞掉粒度规则。
 * @see docs/superpowers/specs/2026-06-20-rules-three-tier-architecture-design.md §4
 */
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { DomainRuleRegistry, RealtimeCheck, SubmitCheck } from '@/nexus/rules/types'
import { Priority, EnergyLevel } from '@/usom/types/primitives'
import { validateTaskFields, validateThreadFields } from './validation'
import { taskTransitions, threadTransitions } from './transitions'

const VALID_PRIORITIES = Object.values(Priority)
const VALID_ENERGY_LEVELS = Object.values(EnergyLevel)
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/

// ── realtime checks（phase: both，action-invariant 单字段纯函数）──────────

/** 仅在值「存在且为 number 且 ≤0」时报错（允许 update 部分更新时不传该字段） */
const estimatedDurationPositive: RealtimeCheck = (value) => {
  if (typeof value === 'number' && value <= 0) {
    return [{ field: 'estimatedDuration', message: '预估时长必须大于 0' }]
  }
  return []
}

const estimatedDurationMax: RealtimeCheck = (value) => {
  if (typeof value === 'number' && value > 1440) {
    return [{ field: 'estimatedDuration', message: '预估时长不能超过 24 小时（1440 分钟）' }]
  }
  return []
}

const priorityValid: RealtimeCheck = (value) => {
  if (typeof value === 'string' && value !== '' && !VALID_PRIORITIES.includes(value as Priority)) {
    return [{ field: 'priority', message: '优先级必须是 critical/high/medium/low 之一' }]
  }
  return []
}

const energyRequiredValid: RealtimeCheck = (value) => {
  if (typeof value === 'string' && value !== '' && !VALID_ENERGY_LEVELS.includes(value as EnergyLevel)) {
    return [{ field: 'energyRequired', message: '能量要求必须是 high/medium/low 之一' }]
  }
  return []
}

/** 仅在字段「有值且非 null」时校验格式（undefined/null 跳过，允许部分更新） */
const dueDateFormat: RealtimeCheck = (value) => {
  if (value !== undefined && value !== null && value !== '') {
    if (typeof value !== 'string' || !DATE_REGEX.test(value)) {
      return [{ field: 'dueDate', message: '截止日期格式必须是 YYYY-MM-DD' }]
    }
  }
  return []
}

const colorFormat: RealtimeCheck = (value) => {
  if (value !== undefined && value !== null && value !== '') {
    if (typeof value !== 'string' || !COLOR_REGEX.test(value)) {
      return [{ field: 'color', message: '颜色格式必须是 #RRGGBB' }]
    }
  }
  return []
}

// ── submit 聚合（phase: submit）—— 逐字复刻现状 hooks.ts onValidate body ──
const actionFieldsValid: SubmitCheck = async (intent) => {
  const errors: string[] = []
  const { fields, action } = intent

  if (action === 'createTask' || action === 'updateTask') {
    errors.push(...validateTaskFields(fields, action as 'createTask' | 'updateTask').errors)
  }

  if (action === 'createThread' || action === 'updateThread') {
    errors.push(...validateThreadFields(fields, action as 'createThread' | 'updateThread').errors)
  }

  // 生命周期状态转换验证（多字段 → submit）
  const targetStatus = fields['targetStatus'] as string | undefined
  const currentStatus = fields['currentStatus'] as string | undefined
  const targetType = fields['targetType'] as 'task' | 'thread' | undefined

  if (targetStatus && currentStatus && targetType) {
    const transitions = targetType === 'thread' ? threadTransitions : taskTransitions
    const allowed = transitions[currentStatus] ?? []
    if (!allowed.includes(targetStatus)) {
      errors.push(`${currentStatus} 状态不能转换为 ${targetStatus}`)
    }
  }

  return errors.length === 0 ? validationPassed() : validationRejected(errors)
}

export const taskRuleRegistry: DomainRuleRegistry = {
  realtime: {
    task_estimated_duration_positive: estimatedDurationPositive,
    task_estimated_duration_max: estimatedDurationMax,
    task_priority_valid: priorityValid,
    task_energy_required_valid: energyRequiredValid,
    task_due_date_format: dueDateFormat,
    thread_color_format: colorFormat,
  },
  submit: {
    task_action_fields_valid: actionFieldsValid,
  },
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit src/domains/tasks/rules-registry.ts 2>&1 | head -20
```

Expected: 无新增类型错误（可能有预存错误，聚焦 `rules-registry.ts` 相关行）

- [ ] **Step 3: 提交**

```bash
git add frontend/src/domains/tasks/rules-registry.ts
git commit -m "feat(tasks): 创建 rules-registry.ts（R2 规则注册表，6 realtime + 1 submit）"
```

---

### Task 3: 更新 hooks.ts — onValidate 改为薄壳委托

**Files:**
- Modify: `frontend/src/domains/tasks/hooks.ts:92-126`（onValidate 函数体）

- [ ] **Step 1: 修改 import 区块**

在文件头部 import 区域添加新依赖，移除不再直接使用的 import：

```typescript
// 新增 import（在现有 import 后追加）
import { evaluateDomainRules } from '@/nexus/rules'
import { taskRuleRegistry } from './rules-registry'

// 移除不再直接使用的 import（validation 函数现在由 rules-registry 调用，hooks.ts 不再直接引用）
// 注意：如果 hooks.ts 中其他位置使用了 validateTaskFields/validateThreadFields，保留 import。
// 当前 hooks.ts 中仅 onValidate 使用这两个函数，改为 evaluateDomainRules 后不再需要。
```

最终 import 区域应为：

```typescript
import type {
  USOMSnapshot,
  SystemEvent,
  DerivedSignals,
  ActionCandidate,
  ActionSurfaceSuggestion,
  MetricUpdate,
  ValidationResult,
} from '../../usom/types/process'
import { validationPassed, validationRejected } from '../../usom/types/process'
import type { StructuredIntent } from '../../usom/types/objects'
import type { USOM_ID, ActionCategory } from '../../usom/types/primitives'
import type { DomainManifest } from '../../domains/manifest-loader/schema'
import { evaluateDomainRules } from '@/nexus/rules'
import { taskRuleRegistry } from './rules-registry'
```

- [ ] **Step 2: 重写 onValidate 函数**

将现有同步 `onValidate` 函数（第 93-126 行）替换为以下异步薄壳：

```typescript
  /**
   * 验证意图（[018-G3] R2：改调 evaluateDomainRules，规则声明式化）
   * 规则逻辑全部迁入 taskRuleRegistry（见 ./rules-registry）；本处仅薄壳委托。
   * normalizeFieldValues 保留为预处理（中文→枚举、日期格式规范化），
   * 规范化后的 fields 传入 evaluateDomainRules。
   * D 模式：聚合 submit 规则在 manifest 置首，submit 聚合保持「全部 errors」逐字输出。
   */
  async function onValidate(
    intent: StructuredIntent,
    snapshot: USOMSnapshot,
  ): Promise<ValidationResult> {
    // 规范化字段值（中文→枚举、日期格式等），保持与旧逻辑一致
    const normalizedFields = normalizeFieldValues(intent.fields)
    const normalizedIntent = { ...intent, fields: normalizedFields }
    return evaluateDomainRules('tasks', normalizedIntent, {
      repos: {},
      userId: snapshot.userId,
      now: snapshot.currentTime ? Date.parse(snapshot.currentTime) : 0,
    }, taskRuleRegistry)
  }
```

- [ ] **Step 3: 验证 onEvent 和 onActionSurfaceRequest 未受影响**

确认 `onEvent`（第 134 行起）和 `onActionSurfaceRequest`（第 247 行起）的函数签名和逻辑不变。

检查要点：
- `onEvent` 仍使用 `subscribedEvents`、`taskTransitions`、`threadTransitions`（这些仍在 `createTasksHooks` 闭包中定义）
- `onActionSurfaceRequest` 仍使用快照数据
- 这两个函数不受 rules 重构影响，无需修改

- [ ] **Step 4: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit src/domains/tasks/hooks.ts 2>&1 | head -20
```

Expected: 无新增类型错误

- [ ] **Step 5: 运行现有合规测试确认不退化**

```bash
cd frontend && npx vitest run src/domains/tasks/__tests__/tasks-compliance.test.ts 2>&1
```

Expected: 部分测试可能因 onValidate 改为异步而需要更新（见 Task 7），先记录当前状态

- [ ] **Step 6: 提交**

```bash
git add frontend/src/domains/tasks/hooks.ts
git commit -m "feat(tasks): hooks.ts onValidate 改为 evaluateDomainRules 薄壳委托（R2）"
```

---

### Task 4: 更新 index.ts — 导出 ruleRegistry

**Files:**
- Modify: `frontend/src/domains/tasks/index.ts`

- [ ] **Step 1: 追加 ruleRegistry 导出**

在现有 `index.ts` 的导出区域（`export { createTasksHooks }` 行之后）追加一行：

```typescript
export { taskRuleRegistry } from './rules-registry'
```

变更后的 `index.ts` 导出区域：

```typescript
export { createTasksHooks } from './hooks'
export { taskRuleRegistry } from './rules-registry'
export { taskTransitions, threadTransitions, findTransition } from './transitions'
export { ThreadRepository, TaskRepository } from './repository'
export { calculateClarity, calculateComplexity, calculateDecomposition, recalculateAITags } from './tag-calculator'
```

- [ ] **Step 2: 验证导出可被解析**

```bash
cd frontend && node -e "require('./src/domains/tasks/rules-registry.ts')" 2>&1 || echo "(expected — TS file can't be required directly; verify via tsc instead)"
```

```bash
cd frontend && npx tsc --noEmit src/domains/tasks/index.ts 2>&1 | head -20
```

Expected: 无新增类型错误

- [ ] **Step 3: 提交**

```bash
git add frontend/src/domains/tasks/index.ts
git commit -m "feat(tasks): index.ts 导出 taskRuleRegistry（R2）"
```

---

### Task 5: 编写 realtime check 单元测试

**Files:**
- Create: `frontend/src/domains/tasks/__tests__/rules-registry.test.ts`

- [ ] **Step 1: 编写单元测试**

```typescript
/**
 * @file rules-registry.test
 * @brief [018-G3] R2 — tasks 域 realtime check 单元测试
 */
import { describe, it, expect } from 'vitest'
import { taskRuleRegistry } from '../rules-registry'

const { realtime } = taskRuleRegistry

describe('task_estimated_duration_positive', () => {
  const check = realtime.task_estimated_duration_positive

  it('number > 0 → 无错误', () => {
    expect(check(30, {})).toEqual([])
    expect(check(1, {})).toEqual([])
  })

  it('number = 0 → 报错', () => {
    const issues = check(0, {})
    expect(issues).toHaveLength(1)
    expect(issues[0].field).toBe('estimatedDuration')
    expect(issues[0].message).toBe('预估时长必须大于 0')
  })

  it('number < 0 → 报错', () => {
    const issues = check(-5, {})
    expect(issues).toHaveLength(1)
  })

  it('undefined / null → 无错误（允许部分更新）', () => {
    expect(check(undefined, {})).toEqual([])
    expect(check(null, {})).toEqual([])
  })

  it('非 number（string）→ 无错误（realtime 不做类型转换，提交时由 validateTaskFields 覆盖）', () => {
    expect(check('abc', {})).toEqual([])
  })
})

describe('task_estimated_duration_max', () => {
  const check = realtime.task_estimated_duration_max

  it('number ≤ 1440 → 无错误', () => {
    expect(check(1440, {})).toEqual([])
    expect(check(60, {})).toEqual([])
  })

  it('number > 1440 → 报错', () => {
    const issues = check(1441, {})
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toBe('预估时长不能超过 24 小时（1440 分钟）')
  })

  it('undefined / null → 无错误', () => {
    expect(check(undefined, {})).toEqual([])
    expect(check(null, {})).toEqual([])
  })
})

describe('task_priority_valid', () => {
  const check = realtime.task_priority_valid

  it.each(['critical', 'high', 'medium', 'low'])('有效值 "%s" → 无错误', (val) => {
    expect(check(val, {})).toEqual([])
  })

  it('非法值 → 报错', () => {
    const issues = check('urgent', {})
    expect(issues).toHaveLength(1)
    expect(issues[0].field).toBe('priority')
  })

  it('空字符串 → 无错误（可选字段，用户可能未选择）', () => {
    expect(check('', {})).toEqual([])
  })

  it('undefined → 无错误', () => {
    expect(check(undefined, {})).toEqual([])
  })
})

describe('task_energy_required_valid', () => {
  const check = realtime.task_energy_required_valid

  it.each(['high', 'medium', 'low'])('有效值 "%s" → 无错误', (val) => {
    expect(check(val, {})).toEqual([])
  })

  it('非法值 → 报错', () => {
    const issues = check('extreme', {})
    expect(issues).toHaveLength(1)
    expect(issues[0].field).toBe('energyRequired')
  })

  it('空字符串 → 无错误', () => {
    expect(check('', {})).toEqual([])
  })
})

describe('task_due_date_format', () => {
  const check = realtime.task_due_date_format

  it('有效格式 YYYY-MM-DD → 无错误', () => {
    expect(check('2026-12-31', {})).toEqual([])
  })

  it('无效格式 → 报错', () => {
    const issues = check('2026/12/31', {})
    expect(issues).toHaveLength(1)
    expect(issues[0].field).toBe('dueDate')
  })

  it('空字符串 → 无错误（可选字段）', () => {
    expect(check('', {})).toEqual([])
  })

  it('undefined / null → 无错误', () => {
    expect(check(undefined, {})).toEqual([])
    expect(check(null, {})).toEqual([])
  })
})

describe('thread_color_format', () => {
  const check = realtime.thread_color_format

  it('有效格式 #RRGGBB → 无错误', () => {
    expect(check('#FF5733', {})).toEqual([])
    expect(check('#00aabb', {})).toEqual([])
  })

  it('无效格式 → 报错', () => {
    const issues = check('red', {})
    expect(issues).toHaveLength(1)
    expect(issues[0].field).toBe('color')
  })

  it('空字符串 → 无错误', () => {
    expect(check('', {})).toEqual([])
  })

  it('undefined / null → 无错误', () => {
    expect(check(undefined, {})).toEqual([])
    expect(check(null, {})).toEqual([])
  })
})

describe('task_action_fields_valid (submit — 聚合规则)', () => {
  const check = taskRuleRegistry.submit.task_action_fields_valid

  it('createTask 缺 title → Rejected', async () => {
    const result = await check(
      { id: '1', intentionId: 'i1', targetDomain: 'tasks', action: 'createTask', fields: { title: '' }, confidence: 1, resolvedBy: 'form', createdAt: '' } as any,
      { repos: {}, userId: 'u' as any, now: 0 },
    )
    expect(result.kind).toBe('Rejected')
    if (result.kind === 'Rejected') {
      expect(result.errors).toContain('任务标题必填')
    }
  })

  it('createTask 所有字段合法 → Passed', async () => {
    const result = await check(
      { id: '1', intentionId: 'i1', targetDomain: 'tasks', action: 'createTask', fields: { title: '测试任务', priority: 'high', estimatedDuration: 60, dueDate: '2026-12-31' }, confidence: 1, resolvedBy: 'form', createdAt: '' } as any,
      { repos: {}, userId: 'u' as any, now: 0 },
    )
    expect(result.kind).toBe('Passed')
  })

  it('createThread 缺 name → Rejected', async () => {
    const result = await check(
      { id: '1', intentionId: 'i1', targetDomain: 'tasks', action: 'createThread', fields: { name: '' }, confidence: 1, resolvedBy: 'form', createdAt: '' } as any,
      { repos: {}, userId: 'u' as any, now: 0 },
    )
    expect(result.kind).toBe('Rejected')
    if (result.kind === 'Rejected') {
      expect(result.errors).toContain('主线名称必填')
    }
  })

  it('生命周期：非法状态转换 → Rejected', async () => {
    const result = await check(
      { id: '1', intentionId: 'i1', targetDomain: 'tasks', action: 'updateTask', fields: { title: 't', currentStatus: 'completed', targetStatus: 'todo', targetType: 'task' }, confidence: 1, resolvedBy: 'form', createdAt: '' } as any,
      { repos: {}, userId: 'u' as any, now: 0 },
    )
    expect(result.kind).toBe('Rejected')
    if (result.kind === 'Rejected') {
      expect(result.errors.some(e => e.includes('状态不能转换'))).toBe(true)
    }
  })

  it('生命周期：合法状态转换 → Passed', async () => {
    const result = await check(
      { id: '1', intentionId: 'i1', targetDomain: 'tasks', action: 'updateTask', fields: { title: 't', currentStatus: 'todo', targetStatus: 'planned', targetType: 'task' }, confidence: 1, resolvedBy: 'form', createdAt: '' } as any,
      { repos: {}, userId: 'u' as any, now: 0 },
    )
    // 注意：title 为 't' 不是空，且状态转换合法 → Passed
    expect(result.kind).toBe('Passed')
  })
})
```

- [ ] **Step 2: 运行单元测试**

```bash
cd frontend && npx vitest run src/domains/tasks/__tests__/rules-registry.test.ts 2>&1
```

Expected: 全部 PASS

- [ ] **Step 3: 提交**

```bash
git add frontend/src/domains/tasks/__tests__/rules-registry.test.ts
git commit -m "test(tasks): rules-registry 单元测试（6 realtime + submit 聚合，R2）"
```

---

### Task 6: 编写 roundtrip 集成测试

**Files:**
- Create: `frontend/src/domains/tasks/__tests__/rules-roundtrip.test.ts`

- [ ] **Step 1: 编写 roundtrip 集成测试**

```typescript
/**
 * @file rules-roundtrip.test
 * @brief [018-G3] R2 — realtime→submit→回填 闭环集成（tasks 域）
 */
import { describe, it, expect } from 'vitest'
import { vi } from 'vitest'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import { evaluateRealtimeRules, evaluateDomainRules, mapServerErrorsToFields, type RealtimeRuleMeta } from '@/nexus/rules'
import { taskRuleRegistry } from '../rules-registry'

vi.mock('@/domains/manifest-loader', () => {
  // 与真实 tasks manifest rules 区块一致的内存 manifest（供 evaluateDomainRules 读）
  const bothRules = [
    { id: 'task_estimated_duration_positive', phase: 'both', fields: ['estimatedDuration'], message: '预估时长必须大于 0' },
    { id: 'task_estimated_duration_max', phase: 'both', fields: ['estimatedDuration'], message: '预估时长不能超过 24 小时（1440 分钟）' },
    { id: 'task_priority_valid', phase: 'both', fields: ['priority'], message: '优先级必须是 critical/high/medium/low 之一' },
    { id: 'task_energy_required_valid', phase: 'both', fields: ['energyRequired'], message: '能量要求必须是 high/medium/low 之一' },
    { id: 'task_due_date_format', phase: 'both', fields: ['dueDate'], message: '截止日期格式必须是 YYYY-MM-DD' },
    { id: 'thread_color_format', phase: 'both', fields: ['color'], message: '颜色格式必须是 #RRGGBB' },
  ]
  const submitRule = { id: 'task_action_fields_valid', phase: 'submit', fields: [], message: '任务/主线字段校验失败' }
  return {
    loadDomainManifest: () => ({
      success: true,
      manifest: { id: 'tasks', version: '2.0.0', name: '任务管理', description: 'd', intent_triggers: [], lifecycle: { task: { states: [], transitions: [] }, thread: { states: [], transitions: [] } }, field_metadata: {}, list_actions: [], required_fields: {}, subscribed_events: [], rules: [submitRule, ...bothRules] },
    }),
  }
})

function intent(fields: Record<string, unknown>, action: string = 'createTask'): StructuredIntent {
  return { id: 'i' as USOM_ID, intentionId: 'in' as USOM_ID, targetDomain: 'tasks', action, fields, confidence: 1, resolvedBy: 'form', createdAt: '2026-06-20T00:00:00Z' } as unknown as StructuredIntent
}
const serverCtx = { repos: {}, userId: 'u' as USOM_ID, now: 0 }
const clientCtx = {}

// realtime 元数据（与 manifest both 规则一致）
const realtimeRules: RealtimeRuleMeta[] = [
  { id: 'task_estimated_duration_positive', fields: ['estimatedDuration'] },
  { id: 'task_estimated_duration_max', fields: ['estimatedDuration'] },
  { id: 'task_priority_valid', fields: ['priority'] },
  { id: 'task_due_date_format', fields: ['dueDate'] },
]
const ruleMessages: Record<string, string> = {
  task_estimated_duration_positive: '预估时长必须大于 0',
  task_estimated_duration_max: '预估时长不能超过 24 小时（1440 分钟）',
  task_priority_valid: '优先级必须是 critical/high/medium/low 之一',
  task_due_date_format: '截止日期格式必须是 YYYY-MM-DD',
}

describe('[roundtrip] realtime 抓得到 → submit 权威也抓', () => {
  it('estimatedDuration=0：realtime 抓到 + submit Rejected 含同一文案', async () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'estimatedDuration', 0, clientCtx, taskRuleRegistry)
    expect(issues.some((i) => i.message === '预估时长必须大于 0')).toBe(true)
    const result = await evaluateDomainRules('tasks', intent({ title: 't', estimatedDuration: 0 }), serverCtx, taskRuleRegistry)
    expect(result.kind === 'Rejected' && result.errors.includes('预估时长必须大于 0')).toBe(true)
  })

  it('priority 非法：realtime 抓到 + submit Rejected 含同一文案', async () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'priority', 'urgent', clientCtx, taskRuleRegistry)
    expect(issues.some((i) => i.message === '优先级必须是 critical/high/medium/low 之一')).toBe(true)
    const result = await evaluateDomainRules('tasks', intent({ title: 't', priority: 'urgent' }), serverCtx, taskRuleRegistry)
    expect(result.kind === 'Rejected' && result.errors.includes('优先级必须是 critical/high/medium/low 之一')).toBe(true)
  })

  it('dueDate 格式非法：realtime 抓到 + submit Rejected 含同一文案', async () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'dueDate', '2026/12/31', clientCtx, taskRuleRegistry)
    expect(issues.some((i) => i.message === '截止日期格式必须是 YYYY-MM-DD')).toBe(true)
    const result = await evaluateDomainRules('tasks', intent({ title: 't', dueDate: '2026/12/31' }), serverCtx, taskRuleRegistry)
    expect(result.kind === 'Rejected' && result.errors.includes('截止日期格式必须是 YYYY-MM-DD')).toBe(true)
  })

  it('estimatedDuration=2000（超上限）：realtime 抓到 + submit 也抓到', async () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'estimatedDuration', 2000, clientCtx, taskRuleRegistry)
    // estimatedDuration 命中两条 both 规则：positive（通过，>0） + max（失败，>1440）
    expect(issues.some((i) => i.message === '预估时长不能超过 24 小时（1440 分钟）')).toBe(true)
    const result = await evaluateDomainRules('tasks', intent({ title: 't', estimatedDuration: 2000 }), serverCtx, taskRuleRegistry)
    expect(result.kind === 'Rejected' && result.errors.includes('预估时长不能超过 24 小时（1440 分钟）')).toBe(true)
  })
})

describe('[roundtrip] 回填映射', () => {
  it('submit errors 含 realtime 文案 → 回填到字段', () => {
    const mapped = mapServerErrorsToFields(
      ['预估时长必须大于 0', '标题必填'],
      realtimeRules,
      ruleMessages,
    )
    expect(mapped.fieldErrors.estimatedDuration).toBe('预估时长必须大于 0')
    expect(mapped.formErrors).toEqual(['标题必填'])
  })

  it('多条 realtime 错误均正确回填', () => {
    const mapped = mapServerErrorsToFields(
      ['预估时长必须大于 0', '优先级必须是 critical/high/medium/low 之一', '截止日期格式必须是 YYYY-MM-DD'],
      realtimeRules,
      ruleMessages,
    )
    expect(mapped.fieldErrors.estimatedDuration).toBe('预估时长必须大于 0')
    expect(mapped.fieldErrors.priority).toBe('优先级必须是 critical/high/medium/low 之一')
    expect(mapped.fieldErrors.dueDate).toBe('截止日期格式必须是 YYYY-MM-DD')
    expect(mapped.formErrors).toEqual([])
  })
})

describe('[roundtrip] D 模式：多错误 submit 全显', () => {
  it('缺 title + duration 0 + priority 非法 → submit 返回 3 条 errors（聚合规则置首）', async () => {
    const result = await evaluateDomainRules('tasks', intent({ title: '', estimatedDuration: 0, priority: 'bad' }), serverCtx, taskRuleRegistry)
    expect(result.kind === 'Rejected' && result.errors).toEqual([
      '任务标题必填',
      '预估时长必须大于 0',
      '优先级必须是 critical/high/medium/low 之一',
    ])
  })

  it('createThread：缺 name + color 非法 → 2 条 errors', async () => {
    const result = await evaluateDomainRules('tasks', intent({ name: '', color: 'red' }, 'createThread'), serverCtx, taskRuleRegistry)
    expect(result.kind === 'Rejected')
    if (result.kind === 'Rejected') {
      expect(result.errors).toContain('主线名称必填')
      expect(result.errors).toContain('颜色格式必须是 #RRGGBB')
    }
  })
})
```

- [ ] **Step 2: 运行 roundtrip 集成测试**

```bash
cd frontend && npx vitest run src/domains/tasks/__tests__/rules-roundtrip.test.ts 2>&1
```

Expected: 全部 PASS（13 个测试用例）

- [ ] **Step 3: 提交**

```bash
git add frontend/src/domains/tasks/__tests__/rules-roundtrip.test.ts
git commit -m "test(tasks): rules-roundtrip 集成测试（realtime→submit→回填闭环，R2）"
```

---

### Task 7: 更新现有合规测试以适配异步 onValidate

**Files:**
- Modify: `frontend/src/domains/tasks/__tests__/tasks-compliance.test.ts:111-158`（T016 onValidate 测试）

- [ ] **Step 1: 更新 onValidate 测试为异步**

在 `tasks-compliance.test.ts` 中，将 `onValidate` 调用改为异步。需要变更的测试用例（约第 111-158 行）：

**变更前（第 150-158 行）：**
```typescript
    const { onValidate } = createTasksHooks(mockManifest as any)
    const result = onValidate(
      { id: '1', intentionId: 'i1', targetDomain: 'tasks', action: 'createTask', fields: {}, confidence: 1, resolvedBy: 'template_form', createdAt: '' },
      { currentTime: '', currentDate: '', dayOfWeek: 1, timeOfDay: 'morning', energyState: { inferredLevel: 5, calibratedLevel: null, activeLevel: 5, source: 'system' }, activeObjectives: [], activeKeyResults: [], activeTasks: [], pendingHabits: [], upcomingTimeboxes: [], pendingIntentions: [] } as any,
    )
    expect(result.kind).toBe('Rejected')
    if (result.kind === 'Rejected') {
      expect(result.errors).toContain('任务标题必填')
    }
```

**变更后：**
```typescript
    const { onValidate } = createTasksHooks(mockManifest as any)
    const result = await onValidate(
      { id: '1', intentionId: 'i1', targetDomain: 'tasks', action: 'createTask', fields: {}, confidence: 1, resolvedBy: 'template_form', createdAt: '' },
      { currentTime: '', currentDate: '', dayOfWeek: 1, timeOfDay: 'morning', energyState: { inferredLevel: 5, calibratedLevel: null, activeLevel: 5, source: 'system' }, activeObjectives: [], activeKeyResults: [], activeTasks: [], pendingHabits: [], upcomingTimeboxes: [], pendingIntentions: [], userId: 'u' } as any,
    )
    expect(result.kind).toBe('Rejected')
    if (result.kind === 'Rejected') {
      expect(result.errors).toContain('任务标题必填')
    }
```

> **注意**：`onValidate` 现在内部调用 `evaluateDomainRules` → `loadDomainManifest`。由于 `tasks-compliance.test.ts` 没有 mock `@/domains/manifest-loader`，`loadDomainManifest` 会实际读取 `manifest.yaml` 文件。这在 vitest 中是可以的（fs 可用），但需要注意 vitest 不会自动解析 `@/` 别名对 fs 路径的影响。
>
> 如果测试失败（找不到 manifest），需要在测试文件中添加 mock：
> ```typescript
> vi.mock('@/domains/manifest-loader', () => ({ ... }))
> ```
> 但更简单的做法是确保 vitest 的 `@/` 别名正确解析，使 `loadDomainManifest('tasks')` 能在测试环境中找到 manifest 文件。

- [ ] **Step 2: 运行更新后的合规测试**

```bash
cd frontend && npx vitest run src/domains/tasks/__tests__/tasks-compliance.test.ts 2>&1
```

Expected: T015（manifest 六区块完整性）、T016（hooks 纯函数验证，含更新后的异步 onValidate 测试）、T017（transitions 转换表）、T018（index 插件入口）全部 PASS。

如果 T016 中的 onValidate 测试因缺少 mock 而失败，需要添加 `vi.mock('@/domains/manifest-loader', ...)` mock，参考 Task 6 的 mock 模式。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/domains/tasks/__tests__/tasks-compliance.test.ts
git commit -m "test(tasks): 更新合规测试适配异步 onValidate（R2）"
```

---

### Task 8: 全量回归测试

**Files:**
- 无新建/修改（仅运行测试）

- [ ] **Step 1: 运行 tasks 域全部测试**

```bash
cd frontend && npx vitest run src/domains/tasks/ 2>&1
```

Expected: 全部 PASS（预估约 30+ 测试用例）

- [ ] **Step 2: 运行 habits 域全部测试（确认无回归）**

```bash
cd frontend && npx vitest run src/domains/habits/ 2>&1
```

Expected: 全部 PASS（149 通过 / 1 预存失败）

- [ ] **Step 3: TypeScript 类型检查（确认无新增错误）**

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -5
```

Expected: 42 个预存错误，0 个新增（R2 不引入新类型错误）

---

## Self-Review Checklist

### 1. Spec Coverage

| 需求 | 对应 Task |
|------|----------|
| manifest rules 区块（1 submit + 6 both） | Task 1 |
| rules-registry.ts（6 RealtimeCheck + 1 SubmitCheck） | Task 2 |
| hooks.ts 薄壳委托 | Task 3 |
| index.ts 导出 ruleRegistry | Task 4 |
| realtime check 单元测试 | Task 5 |
| roundtrip 集成测试（realtime→submit→回填） | Task 6 |
| 现有合规测试更新 | Task 7 |
| 全量回归 | Task 8 |

### 2. Placeholder Scan

- ✅ 无 "TBD" / "TODO" / "implement later"
- ✅ 所有函数体完整展示
- ✅ 所有测试用例包含完整断言
- ✅ 所有命令包含预期输出

### 3. Type Consistency

- ✅ `taskRuleRegistry` 在 Task 2 创建、Task 4 导出、Task 3/5/6 引用，名称一致
- ✅ `DomainRuleRegistry` 类型接口与 R1 habits 一致（`realtime: Record<string, RealtimeCheck>` + `submit: Record<string, SubmitCheck>`）
- ✅ `evaluateDomainRules` 签名与 R1 调用一致：`(domainId, intent, serverCtx, registry)`
- ✅ `mapServerErrorsToFields` 参数三元组 `(serverErrors, realtimeRules, ruleMessages)` 在 Task 6 中一致
- ✅ manifest rules 的 `id` 与 registry keys 完全对应（`task_estimated_duration_positive` 等 6 个 realtime + `task_action_fields_valid` submit）

### 4. R1 契约合规

- ✅ D 模式：聚合规则在 manifest 置首
- ✅ phase∈{submit, both}，无 realtime-only
- ✅ realtime check 为单字段纯函数，无副作用
- ✅ submit check 可 async，可调用现有 validation 函数
- ✅ barrelexport `@/nexus/rules` 仅 server 使用；client 表单走子模块 import（本 R2 不涉及 client 表单，但文档已标注约束）

---

## Execution Handoff

Plan complete. R2 covers the full tasks domain rules infrastructure following the R1 habits pattern, with zero new framework code — only domain-level manifest + registry + hooks shell + tests.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
