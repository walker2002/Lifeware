# CN-UI 优化与习惯管理校验设计

> **日期**: 2026-05-27
> **需求来源**: mydocs/dev/当前开发内容.md [008] [009]
> **治理参考**: .specify/memory/constitution.md v1.7.2

---

## 目标

1. **[008] CN-UI 生命周期管理**：保存/取消后结束 CN-UI 对话生命周期，表单变为只读；保存/取消均需二次确认；回车不触发保存。
2. **[009] 习惯管理校验**：Domain 层统一校验逻辑，客户端与服务端复用；支持错误阻断 + 警告提示。

---

## 架构

采用**提取 CN-UI 生命周期管理器**的方案。将生命周期管理抽离为独立 hook 和包装组件，为后续多个 CN-UI 表面复用打好基础。

核心组件层次：

```
ConversationView (现有)
├── useCnuiLifecycle (新增 hook)
│   ├── surfaceStates: Map<surfaceId, 'active' | 'saved' | 'cancelled'>
│   ├── surfaceData: Map<surfaceId, Record<string, unknown>>
│   ├── confirmDialog: { open, type, surfaceId, title, message }
│   └── submitWithValidation(): 客户端校验 → 二次确认 → 提交
│
└── 消息列表中的每个 CN-UI 消息
    └── CnuiSurfaceWrapper (新增组件)
        ├── AlertDialog (shadcn/ui，二次确认)
        ├── 状态层 (active → 正常表单, saved/cancelled → 遮罩+标签)
        └── CnuiRenderer (现有，透传 isDone 状态)
            └── HabitCreationCard (新增 onCancel 透传)
                └── CnuiFormAdapter (新增 onCancel 透传)
                    └── HabitForm (新增 disableEnterSubmit 等)
```

---

## 文件清单

### 新建文件

| 文件 | 职责 |
|---|---|
| `components/cnui/use-cnui-lifecycle.ts` | Hook，管理所有 surface 的生命周期状态和提交流程 |
| `components/cnui/CnuiSurfaceWrapper.tsx` | 包裹单个 CN-UI 表面，管理确认弹窗和只读遮罩 |
| `components/cnui/cnui-confirm-dialog.tsx` | 可复用的确认弹窗组件（基于 shadcn/ui AlertDialog） |
| `domains/habits/validation.ts` | 纯函数校验模块，客户端/服务端复用 |

### 修改文件

| 文件 | 修改内容 |
|---|---|
| `components/layout/conversation-view.tsx` | 使用 useCnuiLifecycle，替换现有 surfaceDataCache/loadingSurfaceId |
| `components/cnui/CnuiRenderer.tsx` | 新增 `isDone` prop，透传给 Renderer |
| `components/cnui/surfaces/HabitCreationCard.tsx` | 新增 `onCancel` 透传，新增 `isDone` 处理 |
| `components/cnui/cnui-form-adapter.tsx` | 新增 `onCancel` 透传，新增 `isDone` 处理 |
| `domains/habits/components/habit-form.tsx` | 新增 `disableEnterSubmit` prop，回车不触发表单提交 |
| `domains/habits/hooks.ts` | `onValidate` 复用 validation.ts |
| `app/actions/intent.ts` | `submitCnuiSurface` 前加入客户端校验调用 |

---

## [008] CN-UI 生命周期管理

### 状态机

```
active ──[保存点击]──> confirming-save ──[确认]──> saved ──(永久)──> done
     │                                              │
     └──[取消点击]──> confirming-cancel ──[确认]──> cancelled ──(永久)──> done
```

- `active`：表单可编辑，可提交/取消
- `confirming-save` / `confirming-cancel`：AlertDialog 打开中
- `saved`：提交成功，表单变只读
- `cancelled`：取消确认，表单变只读
- `done`：不可逆状态，不再响应任何交互

### useCnuiLifecycle Hook

```typescript
export interface CnuiLifecycleState {
  surfaceStates: Record<string, 'active' | 'saved' | 'cancelled'>
  surfaceData: Record<string, Record<string, unknown>>
  submittingId: string | null
  validationErrors: Record<string, string[]>
  confirmDialog: {
    open: boolean
    type: 'save' | 'cancel' | 'save-with-warnings'
    surfaceId: string
    title: string
    message: string
    pendingData?: Record<string, unknown>
  }
}

export interface CnuiLifecycleActions {
  requestSave(surfaceId: string, domainId: string, action: string, data: Record<string, unknown>): void
  requestCancel(surfaceId: string): void
  confirmDialog(): void
  dismissDialog(): void
  updateData(surfaceId: string, data: Record<string, unknown>): void
  clearValidationErrors(surfaceId: string): void
}
```

### 提交流程

```
requestSave(surfaceId, domainId, action, data)
  ├── 调用 Domain 校验函数 (validateHabitFields)
  │     ├── 有 errors → 显示错误，流程终止
  │     ├── 有 warnings → 打开 "save-with-warnings" 确认弹窗
  │     └── 无 errors/warnings → 打开 "save" 确认弹窗
  ├── 用户点击确认
  │     ├── 调用 submitCnuiSurface() API
  │     ├── API 成功 → surfaceState 设为 saved，success 消息加入对话流
  │     └── API 失败 → 显示错误，surfaceState 保持 active
  └── 用户点击取消 → surfaceState 保持 active
```

### 确认弹窗文案

| 场景 | 标题 | 描述 |
|---|---|---|
| 保存确认 | 确认保存 | 确定要保存此习惯吗？ |
| 保存+警告 | 确认保存 | 默认时长较长（≥180分钟），建议拆分为多个习惯。确定继续吗？ |
| 取消确认 | 确认取消 | 确定要取消吗？已填写的内容将不会保存。 |

### 只读状态视觉

```tsx
// saved 状态
<div className="relative">
  <div className="pointer-events-none opacity-50">
    <CnuiRenderer ... />
  </div>
  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-muted/30">
    <div className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow">
      已保存
    </div>
  </div>
</div>

// cancelled 状态（标签样式不同）
<div className="relative">
  <div className="pointer-events-none opacity-50">
    <CnuiRenderer ... />
  </div>
  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-muted/30">
    <div className="rounded-md bg-muted px-4 py-2 text-sm font-medium text-muted-foreground shadow">
      已取消
    </div>
  </div>
</div>
```

### 回车拦截

`HabitForm` 新增 `disableEnterSubmit` prop。当为 `true` 时：
- 在表单内按 Enter 键不触发表单提交
- 实现方式：在 `form` 的 `onKeyDown` 中拦截 Enter 键，或确保保存按钮不是默认提交按钮

### Props 透传链

```
CnuiSurfaceWrapper
  └── CnuiRenderer (新增 isDone, onCancel)
        └── HabitCreationCard (新增 isDone, onCancel)
              └── CnuiFormAdapter (新增 isDone, onCancel)
                    └── HabitForm (新增 disableEnterSubmit, onCancel)
```

---

## [009] 习惯管理校验

### 校验模块 (domains/habits/validation.ts)

```typescript
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * 纯函数校验 — 客户端和服务端复用
 * 不依赖 React、不依赖数据库
 */
export function validateHabitFields(
  fields: Record<string, unknown>,
  action: 'createHabit' | 'updateHabit',
): ValidationResult
```

### 校验规则

| 规则 | 类型 | 说明 |
|---|---|---|
| 标题必填 | error | createHabit 时 title 不能为空 |
| 时间格式 | error | defaultTime/earliestTime/latestStartTime 必须是 HH:MM |
| 时间窗口 | error | defaultTime 必须在 earliestTime 和 latestStartTime 之间 |
| 默认时长 > 0 | error | defaultDuration 必须大于 0 |
| 最短时长 > 0 | error | minDuration 必须大于 0 |
| 最短时长 <= 默认时长 | error | minDuration 不能大于 defaultDuration |
| 默认时长 >= 180 | warning | 建议拆分为多个习惯 |

### 时间窗口校验实现

```typescript
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

// 校验：defaultTime 必须在 earliestTime 和 latestStartTime 之间
const dt = timeToMinutes(defaultTime)
const et = timeToMinutes(earliestTime)
const lt = timeToMinutes(latestStartTime)
if (dt < et || dt > lt) {
  errors.push('默认时间必须在最早开始时间和最迟开始时间之间')
}
```

### hooks.ts onValidate 复用

```typescript
import { validateHabitFields } from './validation'

function onValidate(intent: StructuredIntent, _snapshot: USOMSnapshot) {
  const { fields, action } = intent
  
  if (action === 'createHabit' || action === 'updateHabit') {
    const result = validateHabitFields(fields, action as 'createHabit' | 'updateHabit')
    // onValidate 只返回 valid + errors，warnings 由客户端处理
    return { valid: result.valid, errors: result.errors }
  }
  // ... 其他 action 的校验不变
}
```

### 客户端调用位置

```typescript
// useCnuiLifecycle.ts
import { validateHabitFields } from '@/domains/habits/validation'

async function requestSave(surfaceId, domainId, action, data) {
  if (domainId === 'habits' && action === 'createHabit') {
    const result = validateHabitFields(data, 'createHabit')
    if (!result.valid) {
      setValidationErrors(prev => ({ ...prev, [surfaceId]: result.errors }))
      return
    }
    if (result.warnings.length > 0) {
      openConfirmDialog('save-with-warnings', surfaceId, result.warnings, data)
      return
    }
  }
  openConfirmDialog('save', surfaceId, [], data)
}
```

---

## Constitution 合规性

| 约束 | 状态 | 说明 |
|---|---|---|
| Principle III (Single-Writer) | ✅ | CN-UI 提交走 submitCnuiSurface → Intent Engine → Rule Engine → State Machine |
| Principle VI (Domain Passivity) | ✅ | validation.ts 纯函数，无状态写入 |
| Constraint 3 (Conversation-closed-loop) | ✅ | 保存/取消后表单变只读，不导航到新页面 |
| Constraint 4 (Form Component Reuse) | ✅ | 通过 CnuiFormAdapter 复用 HabitForm |
| Rule Engine 三态 (pass/warning/confirm) | ✅ | warning 由客户端驱动，不侵入 onValidate 返回类型 |
| R-01~R-04 (Repository Isolation) | ✅ | validation.ts 不调用 Drizzle |
| T-01~T-04 (Multi-Tenancy) | ✅ | 不涉及用户数据访问 |

---

## 测试要点

1. **生命周期状态转换**：active → confirming-save → saved → done
2. **二次确认**：保存/取消均弹出 AlertDialog，确认后才执行
3. **回车拦截**：CN-UI 场景下按 Enter 不触发表单提交
4. **只读渲染**：saved/cancelled 状态下 opacity-50 + 遮罩 + 状态标签
5. **校验规则**：
   - 默认时间在最早/最迟之间 → error 阻断
   - 默认时长 >= 180 → warning 弹窗确认
   - 标题为空 → error 阻断
6. **错误显示**：validationErrors 按 surfaceId 显示在表单上方
