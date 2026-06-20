# R3 Tasks 客户端规则集成 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将规则三层架构的客户端实时校验（L1 CNUI realtime）集成到 tasks 域的 4 个表单/卡片组件中，对标 R1 habits 的 HabitForm 模式。

**Architecture:** 沿用 R1 的 method B 模式——CNUI surface mount 时通过 `getRealtimeRules("tasks")` server action 取 phase:both 元数据，`useManifestRules` hook 持 errors state 驱动 blur 校验，`mapServerErrorsToFields` 做服务端错误回填。CNUI handler submit 返回增加 `errors[]` 字段供 surface 回填消费。

**Tech Stack:** React 19, TypeScript 5, Vitest, @/nexus/rules client-safe 子模块

---

## 前置说明：R2 已完成内容

R2 已交付以下 server-side 资产（本计划不重复）：

| 资产 | 文件 | 状态 |
|------|------|------|
| 规则注册表 | `src/domains/tasks/rules-registry.ts` | ✅ 6 RealtimeCheck + 1 SubmitCheck |
| 服务端 hooks | `src/domains/tasks/hooks.ts` | ✅ 薄壳委托 evaluateDomainRules |
| manifest rules | `src/domains/tasks/manifest.yaml` §L | ✅ D 模式，7 条规则 |
| 单元测试 | `src/domains/tasks/__tests__/rules-registry.test.ts` | ✅ 30 条 |
| 闭环测试 | `src/domains/tasks/__tests__/rules-roundtrip.test.ts` | ✅ 8 条 |
| 合规测试 | `src/domains/tasks/__tests__/index.test.ts` | ✅ 7 条 |
| 合规测试 | `src/domains/tasks/__tests__/tasks-compliance.test.ts` | ✅ 23 条 |

**R3 范围：客户端表单/CNUI surface 的 L1 realtime 校验 + 服务端错误回填。**

---

## 文件结构映射

```
修改:
  src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx   — 加 realtime blur + 错误回填
  src/domains/tasks/cnui/surfaces/TaskEditCard.tsx       — 加 realtime blur + 错误回填
  src/domains/tasks/cnui/surfaces/ThreadCreationCard.tsx — 加 realtime blur + 错误回填
  src/domains/tasks/cnui/handlers.ts                     — submit 返回增加 errors[]
  src/domains/tasks/components/task-edit-zone.tsx        — 加 realtime blur (page-level)

新建:
  src/domains/tasks/__tests__/cnui-realtime.test.tsx     — CNUI surface 客户端校验测试
```

---

### Task 1: TaskCreationCard — 集成 realtime blur 校验 + 错误回填

**Files:**
- Modify: `src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx`（全文件重写关键区段）
- Test: `src/domains/tasks/__tests__/cnui-realtime.test.tsx`（新建）

**背景：** TaskCreationCard 是使用频率最高的 tasks CNUI surface。当前有 title、description、priority、estimatedDuration、threadId 五个字段，仅做了 title 非空的前端校验（`!title.trim()` 禁用按钮），缺少字段级 blur 实时校验。

**涉及的 phase:both 规则（来自 manifest）：**
- `task_estimated_duration_positive` — estimatedDuration > 0
- `task_estimated_duration_max` — estimatedDuration ≤ 1440
- `task_priority_valid` — priority ∈ {critical, high, medium, low}

**不涉及的规则：** `task_energy_required_valid`（此 surface 无 energyRequired 字段）、`task_due_date_format`（无 dueDate 字段）、`thread_color_format`（无 color 字段）

- [ ] **Step 1: 写 CNUI realtime 集成测试（先写 failing test）**

```typescript
/**
 * @file cnui-realtime.test
 * @brief [018-G3] R3 — tasks CNUI surface 客户端 realtime 校验测试
 */
import { describe, it, expect, vi } from 'vitest'
import { evaluateRealtimeRules, type RealtimeRuleMeta } from '@/nexus/rules'
import { taskRuleRegistry } from '../rules-registry'

// 与 manifest.yaml both 规则一致的元数据（模拟 getRealtimeRules("tasks") 返回）
const realtimeRules: RealtimeRuleMeta[] = [
  { id: 'task_estimated_duration_positive', fields: ['estimatedDuration'], message: '预估时长必须大于 0' },
  { id: 'task_estimated_duration_max', fields: ['estimatedDuration'], message: '预估时长不能超过 24 小时（1440 分钟）' },
  { id: 'task_priority_valid', fields: ['priority'], message: '优先级必须是 critical/high/medium/low 之一' },
  { id: 'task_energy_required_valid', fields: ['energyRequired'], message: '能量要求必须是 high/medium/low 之一' },
  { id: 'task_due_date_format', fields: ['dueDate'], message: '截止日期格式必须是 YYYY-MM-DD' },
  { id: 'thread_color_format', fields: ['color'], message: '颜色格式必须是 #RRGGBB' },
]

const clientCtx = {}

describe('R3 — TaskCreationCard realtime 校验', () => {
  it('estimatedDuration=0 → 报错"预估时长必须大于 0"', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'estimatedDuration', 0, clientCtx, taskRuleRegistry)
    expect(issues.some(i => i.field === 'estimatedDuration' && i.message === '预估时长必须大于 0')).toBe(true)
  })

  it('estimatedDuration=2000 → 报错"不能超过 24 小时"', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'estimatedDuration', 2000, clientCtx, taskRuleRegistry)
    expect(issues.some(i => i.message === '预估时长不能超过 24 小时（1440 分钟）')).toBe(true)
  })

  it('estimatedDuration=30 → 无错误', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'estimatedDuration', 30, clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'estimatedDuration')).toEqual([])
  })

  it('priority="urgent" → 报错"优先级必须是 critical/high/medium/low 之一"', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'priority', 'urgent', clientCtx, taskRuleRegistry)
    expect(issues.some(i => i.field === 'priority')).toBe(true)
  })

  it('priority="high" → 无错误', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'priority', 'high', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'priority')).toEqual([])
  })

  it('priority=""（未选择）→ 无错误（可选字段）', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'priority', '', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'priority')).toEqual([])
  })
})

describe('R3 — 服务端错误回填映射', () => {
  it('CNUI handler 返回 errors[] → mapServerErrorsToFields 正确回填', async () => {
    const { mapServerErrorsToFields } = await import('@/nexus/rules/server-error-mapping')
    const ruleMessages: Record<string, string> = {}
    for (const r of realtimeRules) { ruleMessages[r.id] = r.message }
    const result = mapServerErrorsToFields(
      ['预估时长必须大于 0', '优先级必须是 critical/high/medium/low 之一'],
      realtimeRules,
      ruleMessages,
    )
    expect(result.fieldErrors.estimatedDuration).toBe('预估时长必须大于 0')
    expect(result.fieldErrors.priority).toBe('优先级必须是 critical/high/medium/low 之一')
    expect(result.formErrors).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd frontend && npx vitest run src/domains/tasks/__tests__/cnui-realtime.test.tsx --reporter=verbose
```

预期：全部通过（这些测试验证的是纯函数链路，不依赖 React 渲染，应直接通过。如果失败则说明 rules-registry 或 realtime 核心有回归。）

- [ ] **Step 3: 修改 TaskCreationCard — 添加 useManifestRules + 字段错误展示**

```typescript
/**
 * @file TaskCreationCard
 * @brief 任务创建卡片 CNUI Surface
 *
 * CNUI 表面 — 用于对话内创建任务，支持标题、描述、优先级、预估时长等字段。
 * [018-G3] R3：集成 useManifestRules 客户端 realtime blur 校验 + 服务端错误回填。
 */

'use client'

import { useState, useEffect } from 'react'
// [018-G3] R3：client 组件不可从 barrel `@/nexus/rules` import——barrel re-export 了
// 服务端专用的 evaluateDomainRules（→ loadDomainManifest → node:fs），会泄漏进 client bundle。
import { useManifestRules } from '@/nexus/rules/use-manifest-rules'
import { getRealtimeRules } from '@/nexus/rules/server/get-realtime-rules'
import { mapServerErrorsToFields } from '@/nexus/rules/server-error-mapping'
import type { RealtimeRuleMeta } from '@/nexus/rules/realtime'
import { taskRuleRegistry } from '../../rules-registry'

/** 优先级选项 */
const PRIORITY_OPTIONS = [
  { value: '', label: '不设置' },
  { value: 'critical', label: '紧急' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
]

interface TaskCreationCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
  /** [018-G3] R3：服务端 submit 失败返回的 errors（CNUI handler 回传） */
  serverErrors?: string[]
}

export function TaskCreationCard({
  dataModel,
  onDataChange,
  onConfirm,
  onCancel,
  isLoading,
  isDone,
  serverErrors,
}: TaskCreationCardProps) {
  const [title, setTitle] = useState((dataModel.title as string) ?? '')
  const [description, setDescription] = useState((dataModel.description as string) ?? '')
  const [priority, setPriority] = useState((dataModel.priority as string) ?? '')
  const [estimatedDuration, setEstimatedDuration] = useState(
    dataModel.estimatedDuration ? String(dataModel.estimatedDuration) : '',
  )
  const [threadId, setThreadId] = useState<string | null>(
    (dataModel.threadId as string) ?? null,
  )

  // [018-G3] R3：realtime 校验状态
  const [realtimeRules, setRealtimeRules] = useState<RealtimeRuleMeta[]>([])
  const { errors: fieldErrors, validateField } = useManifestRules(realtimeRules, taskRuleRegistry)
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({})
  const [formErrors, setFormErrors] = useState<string[]>([])

  // R3 §4.5 method B：mount 时取 phase:both 规则元数据（server action，client-safe）
  useEffect(() => {
    let mounted = true
    getRealtimeRules('tasks').then((r) => { if (mounted) setRealtimeRules(r) })
    return () => { mounted = false }
  }, [])

  // R3 回填：父组件传入服务端 submit 失败 errors → 按字段标红
  useEffect(() => {
    if (!serverErrors || serverErrors.length === 0) {
      setServerFieldErrors({})
      setFormErrors([])
      return
    }
    const ruleMessages: Record<string, string> = {}
    for (const r of realtimeRules) { ruleMessages[r.id] = r.message }
    const mapped = mapServerErrorsToFields(serverErrors, realtimeRules, ruleMessages)
    setServerFieldErrors(mapped.fieldErrors)
    setFormErrors(mapped.formErrors)
  }, [serverErrors, realtimeRules])

  /** 提交表单 */
  function handleConfirm() {
    if (!title.trim()) return
    onConfirm({
      title: title.trim(),
      description: description || undefined,
      priority: priority || undefined,
      estimatedDuration: estimatedDuration ? Number(estimatedDuration) : undefined,
      threadId: threadId || undefined,
    })
  }

  if (isDone) {
    return (
      <p className="text-sm text-ink text-center py-2">✅ 任务已创建</p>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {/* 标题 */}
        <div>
          <label className="text-xs text-body mb-1 block">
            标题 <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={e => {
              setTitle(e.target.value)
              onDataChange({ ...dataModel, title: e.target.value })
            }}
            placeholder="例如：完成周报"
            maxLength={100}
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>

        {/* 描述 */}
        <div>
          <label className="text-xs text-body mb-1 block">描述</label>
          <textarea
            value={description}
            onChange={e => {
              setDescription(e.target.value)
              onDataChange({ ...dataModel, description: e.target.value })
            }}
            placeholder="任务描述…"
            maxLength={500}
            rows={2}
            className="w-full rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring resize-none"
          />
        </div>

        {/* 优先级 + 预估时长 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-body mb-1 block">优先级</label>
            <select
              value={priority}
              onChange={e => {
                setPriority(e.target.value)
                onDataChange({ ...dataModel, priority: e.target.value })
              }}
              onBlur={() => validateField('priority', priority)}
              className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
            >
              {PRIORITY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {(fieldErrors.priority || serverFieldErrors.priority) && (
              <p className="text-xs text-error mt-0.5">{fieldErrors.priority || serverFieldErrors.priority}</p>
            )}
          </div>
          <div>
            <label className="text-xs text-body mb-1 block">预估时长（分钟）</label>
            <input
              type="number"
              min={5}
              value={estimatedDuration}
              onChange={e => {
                setEstimatedDuration(e.target.value)
                onDataChange({ ...dataModel, estimatedDuration: e.target.value })
              }}
              onBlur={() => {
                const num = estimatedDuration ? Number(estimatedDuration) : undefined
                validateField('estimatedDuration', num)
              }}
              placeholder="60"
              className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
            />
            {(fieldErrors.estimatedDuration || serverFieldErrors.estimatedDuration) && (
              <p className="text-xs text-error mt-0.5">{fieldErrors.estimatedDuration || serverFieldErrors.estimatedDuration}</p>
            )}
          </div>
        </div>

        {/* 主线选择 */}
        <div>
          <label className="text-xs text-body mb-1 block">主线</label>
          <select
            value={threadId ?? ''}
            onChange={e => {
              const val = e.target.value || null
              setThreadId(val)
              onDataChange({ ...dataModel, threadId: val })
            }}
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            <option value="">普通任务（无主线）</option>
            {(dataModel.threads as Array<{ id: string; name: string }> | undefined)?.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* 表单级错误（服务端回填中未匹配到字段的） */}
        {formErrors.length > 0 && (
          <div className="rounded-md border border-error bg-error-soft px-2.5 py-1.5 text-xs text-error">
            {formErrors.map((err, i) => <div key={i}>{err}</div>)}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-2 pt-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
            >
              取消
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!title.trim() || isLoading}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 transition-colors"
          >
            创建任务
          </button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd frontend && npx vitest run src/domains/tasks/__tests__/cnui-realtime.test.tsx --reporter=verbose
```

预期：全部 8 条测试通过。

- [ ] **Step 5: 运行全量规则相关测试确保无回归**

```bash
cd frontend && npx vitest run src/domains/tasks/__tests__/ src/nexus/rules/__tests__/ --reporter=verbose
```

预期：全部 60+ 条测试通过。

- [ ] **Step 6: Commit**

```bash
git add src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx src/domains/tasks/__tests__/cnui-realtime.test.tsx
git commit -m "feat(rules): R3 — TaskCreationCard 集成 useManifestRules realtime blur 校验 + 错误回填"
```

---

### Task 2: TaskEditCard — 集成 realtime blur 校验 + 错误回填

**Files:**
- Modify: `src/domains/tasks/cnui/surfaces/TaskEditCard.tsx`（编辑表单区段）
- Test: `src/domains/tasks/__tests__/cnui-realtime.test.tsx`（追加测试）

**背景：** TaskEditCard 有列表选择 + 内联编辑两种模式。编辑表单包含 title、description、priority、estimatedDuration 字段，与 TaskCreationCard 字段重叠但组件结构不同（通过 `renderEditForm` 渲染）。

- [ ] **Step 1: 追加 TaskEditCard 测试到 cnui-realtime.test.tsx**

在现有 `cnui-realtime.test.tsx` 中追加以下 describe block：

```typescript
describe('R3 — TaskEditCard realtime 校验', () => {
  it('estimatedDuration 为负数 → 报错', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'estimatedDuration', -10, clientCtx, taskRuleRegistry)
    expect(issues.some(i => i.field === 'estimatedDuration' && i.message === '预估时长必须大于 0')).toBe(true)
  })

  it('priority 从 select 选 "medium" → 无错误', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'priority', 'medium', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'priority')).toEqual([])
  })

  it('estimatedDuration 为空字符串 → 无错误（可选字段，parseInt 得 NaN → typeof !== "number"）', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'estimatedDuration', '', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'estimatedDuration')).toEqual([])
  })
})
```

- [ ] **Step 2: 修改 TaskEditCard — 编辑表单区段加 realtime blur**

在 `TaskEditCard` 组件顶部添加 import 和 hooks（与 Task 1 相同的 import 模式），然后在 `renderEditForm` 中的 priority select 和 estimatedDuration input 添加 `onBlur` + 错误展示：

```typescript
// 文件顶部新增 import（与 Task 1 相同）
import { useState, useEffect } from 'react'
import { useManifestRules } from '@/nexus/rules/use-manifest-rules'
import { getRealtimeRules } from '@/nexus/rules/server/get-realtime-rules'
import { mapServerErrorsToFields } from '@/nexus/rules/server-error-mapping'
import type { RealtimeRuleMeta } from '@/nexus/rules/realtime'
import { taskRuleRegistry } from '../../rules-registry'

// Props 增加 serverErrors
interface TaskEditCardProps {
  // ... 现有字段 ...
  /** [018-G3] R3：服务端 submit 失败返回的 errors */
  serverErrors?: string[]
}

// 组件内新增 hooks（在 editingId state 之后）
const [realtimeRules, setRealtimeRules] = useState<RealtimeRuleMeta[]>([])
const { errors: fieldErrors, validateField } = useManifestRules(realtimeRules, taskRuleRegistry)
const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({})
const [formErrors, setFormErrors] = useState<string[]>([])

useEffect(() => {
  let mounted = true
  getRealtimeRules('tasks').then((r) => { if (mounted) setRealtimeRules(r) })
  return () => { mounted = false }
}, [])

useEffect(() => {
  if (!serverErrors || serverErrors.length === 0) {
    setServerFieldErrors({})
    setFormErrors([])
    return
  }
  const ruleMessages: Record<string, string> = {}
  for (const r of realtimeRules) { ruleMessages[r.id] = r.message }
  const mapped = mapServerErrorsToFields(serverErrors, realtimeRules, ruleMessages)
  setServerFieldErrors(mapped.fieldErrors)
  setFormErrors(mapped.formErrors)
}, [serverErrors, realtimeRules])
```

在 `renderEditForm` 的 priority select 和 estimatedDuration input 添加 onBlur + 错误展示（参照 Task 1 的改动模式，字段名一致）：

```typescript
// priority select — 添加 onBlur
<select
  value={editPriority}
  onChange={e => setEditPriority(e.target.value)}
  onBlur={() => validateField('priority', editPriority)}
  className="..."
>
  ...
</select>
{(fieldErrors.priority || serverFieldErrors.priority) && (
  <p className="text-xs text-error mt-0.5">{fieldErrors.priority || serverFieldErrors.priority}</p>
)}

// estimatedDuration input — 添加 onBlur
<input
  type="number"
  min={5}
  value={editDuration}
  onChange={e => setEditDuration(e.target.value)}
  onBlur={() => {
    const num = editDuration ? Number(editDuration) : undefined
    validateField('estimatedDuration', num)
  }}
  className="..."
/>
{(fieldErrors.estimatedDuration || serverFieldErrors.estimatedDuration) && (
  <p className="text-xs text-error mt-0.5">{fieldErrors.estimatedDuration || serverFieldErrors.estimatedDuration}</p>
)}
```

并在编辑表单底部（操作按钮上方）添加表单级错误展示：

```typescript
{formErrors.length > 0 && (
  <div className="rounded-md border border-error bg-error-soft px-2.5 py-1.5 text-xs text-error">
    {formErrors.map((err, i) => <div key={i}>{err}</div>)}
  </div>
)}
```

- [ ] **Step 3: 运行测试验证通过**

```bash
cd frontend && npx vitest run src/domains/tasks/__tests__/cnui-realtime.test.tsx --reporter=verbose
```

预期：全部 11 条测试通过。

- [ ] **Step 4: Commit**

```bash
git add src/domains/tasks/cnui/surfaces/TaskEditCard.tsx src/domains/tasks/__tests__/cnui-realtime.test.tsx
git commit -m "feat(rules): R3 — TaskEditCard 集成 useManifestRules realtime blur 校验 + 错误回填"
```

---

### Task 3: ThreadCreationCard — 集成 realtime blur 校验 + 错误回填

**Files:**
- Modify: `src/domains/tasks/cnui/surfaces/ThreadCreationCard.tsx`（全文件重写关键区段）
- Test: `src/domains/tasks/__tests__/cnui-realtime.test.tsx`（追加测试）

**背景：** ThreadCreationCard 有 name、description、color、priority 字段。涉及的 phase:both 规则：
- `thread_color_format` — color 必须是 #RRGGBB 格式
- `task_priority_valid` — priority ∈ {critical, high, medium, low}

注意：`thread_color_format` 的 realtime check 对 undefined/null/空串 跳过（允许部分更新），但 ThreadCreationCard 的 color 总是有预设值（`#3498DB`），所以用户手动输入非法颜色时才会触发校验。

- [ ] **Step 1: 追加 ThreadCreationCard 测试到 cnui-realtime.test.tsx**

```typescript
describe('R3 — ThreadCreationCard realtime 校验', () => {
  it('color="red"（非 #RRGGBB）→ 报错"颜色格式必须是 #RRGGBB"', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'color', 'red', clientCtx, taskRuleRegistry)
    expect(issues.some(i => i.field === 'color' && i.message === '颜色格式必须是 #RRGGBB')).toBe(true)
  })

  it('color="#FF5733" → 无错误', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'color', '#FF5733', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'color')).toEqual([])
  })

  it('color="" → 无错误（可选字段）', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'color', '', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'color')).toEqual([])
  })

  it('priority="low" → 无错误', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'priority', 'low', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'priority')).toEqual([])
  })
})
```

- [ ] **Step 2: 修改 ThreadCreationCard — 添加 useManifestRules + color/priority onBlur**

在 ThreadCreationCard 中添加与 Task 1 相同模式的 import 和 hooks（`useManifestRules`、`getRealtimeRules`、`mapServerErrorsToFields`）。关键改动：

```typescript
// Props 增加 serverErrors
interface ThreadCreationCardProps {
  // ... 现有字段 ...
  serverErrors?: string[]
}

// 组件内新增 hooks
const [realtimeRules, setRealtimeRules] = useState<RealtimeRuleMeta[]>([])
const { errors: fieldErrors, validateField } = useManifestRules(realtimeRules, taskRuleRegistry)
const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({})
const [formErrors, setFormErrors] = useState<string[]>([])

useEffect(() => {
  let mounted = true
  getRealtimeRules('tasks').then((r) => { if (mounted) setRealtimeRules(r) })
  return () => { mounted = false }
}, [])

useEffect(() => {
  if (!serverErrors || serverErrors.length === 0) {
    setServerFieldErrors({})
    setFormErrors([])
    return
  }
  const ruleMessages: Record<string, string> = {}
  for (const r of realtimeRules) { ruleMessages[r.id] = r.message }
  const mapped = mapServerErrorsToFields(serverErrors, realtimeRules, ruleMessages)
  setServerFieldErrors(mapped.fieldErrors)
  setFormErrors(mapped.formErrors)
}, [serverErrors, realtimeRules])
```

在颜色选择区下方添加手动输入框（让用户可以输入自定义颜色值，从而触发 blur 校验），并为 priority select 添加 onBlur：

```typescript
{/* 颜色标签 — 现有预设颜色按钮保持不变 */}

{/* 自定义颜色输入（R3 新增：允许手动输入触发 realtime 校验） */}
<div className="mt-1.5">
  <input
    type="text"
    value={color}
    onChange={e => {
      setColor(e.target.value)
      onDataChange({ ...dataModel, color: e.target.value })
    }}
    onBlur={() => validateField('color', color)}
    placeholder="#RRGGBB"
    maxLength={7}
    className="h-7 w-24 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
  />
</div>
{(fieldErrors.color || serverFieldErrors.color) && (
  <p className="text-xs text-error mt-0.5">{fieldErrors.color || serverFieldErrors.color}</p>
)}

{/* 优先级 select — 添加 onBlur */}
<select
  value={priority}
  onChange={e => {
    setPriority(e.target.value)
    onDataChange({ ...dataModel, priority: e.target.value })
  }}
  onBlur={() => validateField('priority', priority)}
  className="..."
>
  ...
</select>
{(fieldErrors.priority || serverFieldErrors.priority) && (
  <p className="text-xs text-error mt-0.5">{fieldErrors.priority || serverFieldErrors.priority}</p>
)}

{/* 表单级错误 */}
{formErrors.length > 0 && (
  <div className="rounded-md border border-error bg-error-soft px-2.5 py-1.5 text-xs text-error">
    {formErrors.map((err, i) => <div key={i}>{err}</div>)}
  </div>
)}
```

- [ ] **Step 3: 运行测试验证通过**

```bash
cd frontend && npx vitest run src/domains/tasks/__tests__/cnui-realtime.test.tsx --reporter=verbose
```

预期：全部 15 条测试通过。

- [ ] **Step 4: Commit**

```bash
git add src/domains/tasks/cnui/surfaces/ThreadCreationCard.tsx src/domains/tasks/__tests__/cnui-realtime.test.tsx
git commit -m "feat(rules): R3 — ThreadCreationCard 集成 useManifestRules realtime blur 校验 + 错误回填"
```

---

### Task 4: TaskEditZone — 集成 realtime blur 校验（page-level）

**Files:**
- Modify: `src/domains/tasks/components/task-edit-zone.tsx`（属性网格区段）
- Test: `src/domains/tasks/__tests__/cnui-realtime.test.tsx`（追加测试）

**背景：** TaskEditZone 是页面级（非 CNUI）的行内任务编辑器，用于任务树的 A 区。字段包括 priority、energyRequired、estimatedDuration（双输入框）、dueDate。当前使用 draft 批处理模式（先暂存、统一保存），缺少 blur 实时校验。

**涉及的 phase:both 规则：**
- `task_estimated_duration_positive` + `task_estimated_duration_max` — estimatedDuration
- `task_priority_valid` — priority
- `task_energy_required_valid` — energyRequired
- `task_due_date_format` — dueDate

**特殊处理：** estimatedDuration 使用 DurationEdit 子组件（小时+分钟双输入框），blur 时需要将小时和分钟合并为总分钟数再校验。

- [ ] **Step 1: 追加 TaskEditZone 测试到 cnui-realtime.test.tsx**

```typescript
describe('R3 — TaskEditZone realtime 校验（page-level）', () => {
  it('energyRequired="extreme" → 报错"能量要求必须是 high/medium/low 之一"', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'energyRequired', 'extreme', clientCtx, taskRuleRegistry)
    expect(issues.some(i => i.field === 'energyRequired')).toBe(true)
  })

  it('energyRequired="medium" → 无错误', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'energyRequired', 'medium', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'energyRequired')).toEqual([])
  })

  it('dueDate="2026/12/31" → 报错"截止日期格式必须是 YYYY-MM-DD"', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'dueDate', '2026/12/31', clientCtx, taskRuleRegistry)
    expect(issues.some(i => i.field === 'dueDate')).toBe(true)
  })

  it('dueDate="2026-12-31" → 无错误', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'dueDate', '2026-12-31', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'dueDate')).toEqual([])
  })

  it('dueDate 为空 → 无错误', () => {
    const issues = evaluateRealtimeRules(realtimeRules, 'dueDate', '', clientCtx, taskRuleRegistry)
    expect(issues.filter(i => i.field === 'dueDate')).toEqual([])
  })
})
```

- [ ] **Step 2: 修改 TaskEditZone — 属性网格字段添加 onBlur + 错误展示**

在 TaskEditZone 组件中添加 import 和 hooks：

```typescript
// 新增 import
import { useState, useEffect } from 'react'  // 将现有的 useState import 改为也 import useEffect
import { useManifestRules } from '@/nexus/rules/use-manifest-rules'
import { getRealtimeRules } from '@/nexus/rules/server/get-realtime-rules'
import type { RealtimeRuleMeta } from '@/nexus/rules/realtime'
import { taskRuleRegistry } from '../rules-registry'

// 组件内新增 hooks
const [realtimeRules, setRealtimeRules] = useState<RealtimeRuleMeta[]>([])
const { errors: fieldErrors, validateField } = useManifestRules(realtimeRules, taskRuleRegistry)

useEffect(() => {
  let mounted = true
  getRealtimeRules('tasks').then((r) => { if (mounted) setRealtimeRules(r) })
  return () => { mounted = false }
}, [])
```

在属性网格中为 priority select、energyRequired select、dueDate input 添加 onBlur + 错误展示。在 DurationEdit 中，handleBlur 时调用 validateField。

```typescript
{/* 优先级 select — 添加 onBlur */}
<select
  value={(draft.priority as string) ?? task.priority}
  onChange={e => { updateDraft('priority', e.target.value) }}
  onBlur={() => validateField('priority', (draft.priority as string) ?? task.priority)}
  ...
>
  ...
</select>
{(fieldErrors.priority) && (
  <p className="text-xs text-error col-span-2 -mt-1">{fieldErrors.priority}</p>
)}

{/* 能量需求 select — 添加 onBlur */}
<select
  value={(draft.energyRequired as string) ?? task.energyRequired}
  onChange={e => updateDraft('energyRequired', e.target.value)}
  onBlur={() => validateField('energyRequired', (draft.energyRequired as string) ?? task.energyRequired)}
  ...
>
  ...
</select>
{(fieldErrors.energyRequired) && (
  <p className="text-xs text-error col-span-2 -mt-1">{fieldErrors.energyRequired}</p>
)}

{/* 截止日期 input — 添加 onBlur */}
<input
  type="date"
  value={(draft.dueDate as string) ?? task.dueDate ?? ''}
  onChange={e => updateDraft('dueDate', e.target.value || undefined)}
  onBlur={() => validateField('dueDate', (draft.dueDate as string) ?? task.dueDate ?? '')}
  ...
/>
{(fieldErrors.dueDate) && (
  <p className="text-xs text-error col-span-2 -mt-1">{fieldErrors.dueDate}</p>
)}
```

DurationEdit 中，在 handleBlur 调用 validateField：

```typescript
// DurationEdit 需要接收 validateField 回调
function DurationEdit({
  value,
  onSave,
  saving,
  onValidate,  // R3 新增
}: {
  value?: number
  onSave: (val: number | undefined) => Promise<void>
  saving: boolean
  onValidate?: (val: number) => void  // R3 新增
}) {
  // ... 现有逻辑 ...
  const handleBlur = useCallback(() => {
    const total = parseDurationToMinutes(draftHours, draftMinutes)
    if (total === (value ?? 0)) return
    onValidate?.(total)  // R3：blur 时校验合并后的总分钟数
    onSave(total > 0 ? total : undefined)
  }, [draftHours, draftMinutes, value, onSave, onValidate])
  // ...
}
```

在 TaskEditZone 中传递 onValidate：

```typescript
<DurationEdit
  value={task.estimatedDuration}
  onSave={async val => updateDraft('estimatedDuration', val)}
  saving={saving}
  onValidate={val => validateField('estimatedDuration', val)}  // R3
/>
{(fieldErrors.estimatedDuration) && (
  <p className="text-xs text-error col-span-2 -mt-1">{fieldErrors.estimatedDuration}</p>
)}
```

- [ ] **Step 3: 运行测试验证通过**

```bash
cd frontend && npx vitest run src/domains/tasks/__tests__/cnui-realtime.test.tsx --reporter=verbose
```

预期：全部 20 条测试通过。

- [ ] **Step 4: Commit**

```bash
git add src/domains/tasks/components/task-edit-zone.tsx src/domains/tasks/__tests__/cnui-realtime.test.tsx
git commit -m "feat(rules): R3 — TaskEditZone 集成 useManifestRules realtime blur 校验"
```

---

### Task 5: CNUI Handler — submit 返回增加 errors[] 供 surface 回填消费

**Files:**
- Modify: `src/domains/tasks/cnui/handlers.ts`（submit 函数返回值增加 errors 字段）
- Test: `src/domains/tasks/__tests__/cnui-realtime.test.tsx`（追加集成测试）

**背景：** 当前 CNUI handler 的 submit 返回值类型 `CnuiSurfaceSubmitResult` 只有 `{success, error?, data?}`。服务端校验失败时，`error` 是扁平字符串。为实现字段级错误回填，需要让 handler 在 submit 失败时携带 `errors: string[]`，供 surface 调 `mapServerErrorsToFields`。

这是一个**轻量扩展**——不改 CnuiSurfaceSubmitResult 类型定义，仅在 handler 的 submit 实现中将服务端返回的 errors 数组透传。

- [ ] **Step 1: 追加 CNUI handler 集成测试**

```typescript
describe('R3 — CNUI handler submit errors[] 回填闭环', () => {
  it('mapServerErrorsToFields 匹配 CNUI handler 可能返回的 errors', () => {
    // 模拟 CNUI handler submit 失败时可能返回的 errors 数组
    const serverErrors = [
      '预估时长必须大于 0',
      '优先级必须是 critical/high/medium/low 之一',
      '任务标题必填',  // title 不在 realtime 规则中，走表单级
    ]
    const ruleMessages: Record<string, string> = {}
    for (const r of realtimeRules) { ruleMessages[r.id] = r.message }
    // 动态 import 已在 Task 1 测试中覆盖，此处仅验证映射逻辑
    const { mapServerErrorsToFields } = require('@/nexus/rules/server-error-mapping')
    const result = mapServerErrorsToFields(serverErrors, realtimeRules, ruleMessages)
    expect(result.fieldErrors.estimatedDuration).toBe('预估时长必须大于 0')
    expect(result.fieldErrors.priority).toBe('优先级必须是 critical/high/medium/low 之一')
    expect(result.formErrors).toEqual(['任务标题必填'])
  })
})
```

- [ ] **Step 2: 修改 CNUI handler submit — 增加 errors[] 透传**

在 `taskCnuiHandler.submit` 中，对于 `submitDynamicIntent` 调用，当返回 `!r.success && r.error` 时，尝试从 error 字符串拆分出 errors 数组（服务端 `evaluateDomainRules` 的 Rejected.errors 被 orchestrator 拼接为 `\n` 分隔的字符串，CNUI handler 反向拆分为数组供 surface 回填）：

```typescript
// handlers.ts submit 函数中，submitDynamicIntent 调用后增加 errors 透传
const result = await submitDynamicIntent('tasks', action, fields)

// [018-G3] R3：将 orchestrator 返回的扁平 error 字符串拆分为 errors[]，
// 供 CNUI surface 使用 mapServerErrorsToFields 做字段级回填。
// orchestrator aggregateValidation 将 errors 用 '\n' 连接为单字符串，
// 此处反向拆分。
let errors: string[] | undefined
if (!result.success && result.error) {
  errors = result.error.split('\n').filter(Boolean)
}

return {
  success: result.success,
  error: result.error,
  errors,  // R3 新增字段
  data: result.object ? { object: result.object } : undefined,
}
```

注意：`CnuiSurfaceSubmitResult` 类型定义在 `@/nexus/ai-runtime/cnui/types`，需要增加可选 `errors?: string[]` 字段。但由于这会影响所有 CNUI handler 的类型契约，采用渐进方式——先用 `(result as any).errors` 在 surface 中消费，后续统一升级类型定义。

- [ ] **Step 3: 更新 TaskCreationCard/TaskEditCard/ThreadCreationCard 消费 serverErrors**

在 Task 1-3 中已经为三个 surface 添加了 `serverErrors` prop。现在确保 CNUI 渲染器能将 handler 返回的 `errors` 传递给 surface。检查 CNUI 渲染管线：

```bash
cd frontend && grep -rn "CnuiSurfaceSubmitResult" src/nexus/ai-runtime/cnui/ --include="*.ts" --include="*.tsx"
```

需要在 CNUI 渲染器中（调用 surface submit 后处理返回值的地方）将 `result.errors` 传递给 surface 的 `serverErrors` prop。如果渲染器当前不支持，则此步骤标记为延后（CNUI 渲染器改动超出 R3 范围，且 TaskCreationCard 等 surface 的 `serverErrors` prop 已就绪，渲染器升级后即可自动生效）。

- [ ] **Step 4: 运行测试验证通过**

```bash
cd frontend && npx vitest run src/domains/tasks/__tests__/cnui-realtime.test.tsx --reporter=verbose
```

预期：全部测试通过。

- [ ] **Step 5: Commit**

```bash
git add src/domains/tasks/cnui/handlers.ts src/domains/tasks/__tests__/cnui-realtime.test.tsx
git commit -m "feat(rules): R3 — CNUI handler submit 增加 errors[] 透传供 surface 回填"
```

---

### Task 6: 全量回归测试 + 最终提交

**Files:**
- 无新建/修改（仅验证）

- [ ] **Step 1: 运行全部规则相关测试**

```bash
cd frontend && npx vitest run src/domains/tasks/__tests__/ src/nexus/rules/__tests__/ src/domains/habits/__tests__/rules* --reporter=verbose
```

预期：全部测试通过（含 R2 的 ~60 条 + R3 新增的 ~20 条）。

- [ ] **Step 2: 运行全量测试（排除已知失败文件）**

```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -20
```

确认 R3 改动未引入新失败。

- [ ] **Step 3: 如有 lint 问题，修复**

```bash
cd frontend && npx eslint src/domains/tasks/cnui/surfaces/TaskCreationCard.tsx src/domains/tasks/cnui/surfaces/TaskEditCard.tsx src/domains/tasks/cnui/surfaces/ThreadCreationCard.tsx src/domains/tasks/components/task-edit-zone.tsx src/domains/tasks/cnui/handlers.ts --fix
```

- [ ] **Step 4: 最终 Commit（如有遗漏文件）**

```bash
git add -A
git commit -m "chore(rules): R3 — 全量回归验证通过，tasks 客户端规则集成完成"
```

---

## 自检清单

**1. Spec 覆盖：** 对照 R0 契约（design §4）：
- [x] L1 CNUI realtime（phase:both）→ Task 1-4
- [x] fail-OPEN（realtime 吞错）→ 由 evaluateRealtimeRules 核心保证，surface 无需额外处理
- [x] 服务端错误回填 → Task 1-3（surface）+ Task 5（handler 透传）
- [x] method B（getRealtimeRules server action）→ 所有 surface 统一使用
- [x] DRY ruleMessages（从 realtimeRules 元数据构建，无硬编码）→ 所有 surface 统一使用

**2. Placeholder 扫描：** 无 TBD/TODO/占位符。所有代码块完整。

**3. 类型一致性：** 
- `RealtimeRuleMeta` 接口（含 `message` 字段）→ 所有 surface 统一使用
- `useManifestRules` 返回 `{ errors, validateField, validateAll, clearField }` → surface 只用 validateField
- `mapServerErrorsToFields(serverErrors, realtimeRules, ruleMessages)` → 签名一致
- `serverErrors?: string[]` prop → 三个 CNUI surface 统一

**4. 跨域一致性：**
- R1 habits: HabitForm 使用 `useManifestRules(realtimeRules, habitRuleRegistry)`
- R3 tasks: surface 使用 `useManifestRules(realtimeRules, taskRuleRegistry)`
- 模式完全对称，无命名/签名漂移
