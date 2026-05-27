# 习惯管理迭代优化设计

**日期**: 2026-05-27
**状态**: 待审核
**需求来源**: `mydocs/dev/当前开发内容.md` [004][005][006][007]
**前置 spec**: `2026-05-26-habit-create-intent-design.md`, `2026-05-26-habit-page-optimization-design.md`

## 概述

本次迭代覆盖四个需求：AI 助手界面优化、习惯保存 Bug 修复、GrowthMenu 习惯创建入口修改、CN-UI 习惯创建界面设计。同时确立"单表单组件"通用约定。

## 通用设计原则：单表单组件约定

每个 Domain action 只维护一个表单实现（如 HabitForm），通过适配层在三种上下文中复用：

| 入口 | 渲染方式 |
|---|---|
| Domain 页面编辑面板 | 直接使用 Form 组件 |
| GrowthMenu action 入口 | 导航到 Domain 页面，autoOpenCreate |
| AI 助手 CN-UI | CnuiFormAdapter 适配层内部渲染 Form 组件 |

字段定义的唯一来源是 manifest.yaml `required_fields`（Constitution Principle VI）。

本约定将以 PATCH 级别追加到宪章 CN-UI Protocol Constraints 章节。

---

## [005] 新建习惯保存 Bug 修复

### 根因

manifest.yaml `generation_actions.createHabit.contexts[0].id` 为 `existingHabits`，但 `context-providers.ts` 注册的 id 为 `activeHabits`，名称不匹配导致 ContextCapability 查找失败。

### 修复

**文件**: `frontend/src/domains/habits/manifest.yaml`

将 `generation_actions.createHabit.contexts[0].id` 从 `existingHabits` 改为 `activeHabits`。

---

## [004] AI 助手界面优化

### 4.1 新对话界面布局调整

**文件**: `frontend/src/components/layout/conversation-view.tsx`

当前空对话状态（messages.length === 0）布局从上到下：
1. 标题 "有什么可以帮你的？"
2. 常用意图按钮组（在输入框**上方**）
3. 输入框 + 附件（附件在输入框**外部上方**）
4. 最近对话

调整为：
1. 标题 + 欢迎语（整体上移，减少顶部空白，使用 `justify-start` + `pt-[15vh]` 替代 `justify-center`）
2. 输入框区域：
   - 附件按钮**内置**在输入框左侧
   - 附件标签显示在输入框**内部上方**
3. 常用意图按钮组（在输入框**下方**）
   - 显示格式：`意图名称 (/shortcut)`
   - 数据源从 manifest `intent_triggers` 动态加载
4. 最近对话

### 4.2 常用意图交互修改

**当前行为**: 点击 → 直接调用 `onSendMessage(action)`

**改为**: 点击 → 将 `/shortcut` 填入输入框 + 聚焦输入框，用户可继续输入补充信息后手动提交。

**数据源**: 新增 server action `fetchIntentTriggers()` 从各 Domain manifest 的 `intent_triggers` 动态读取，返回 `{ label, shortcut, domainId, action }[]`。替代当前硬编码 `DEFAULT_QUICK_ACTIONS`。

```typescript
// 返回结构
interface IntentTrigger {
  label: string          // "添加习惯"
  shortcut: string       // "/createHabit"
  domainId: string       // "habits"
  action: string         // "createHabit"
}
```

### 4.3 新对话行为修正

**文件**: `frontend/src/app/page.tsx`

**问题 1**: 已有对话中点"新对话"，主界面不刷新
**修复**: `onNewSession` 回调中，清空 `conversationMessages`，重置为空对话界面

**问题 2**: 反复点"新对话"产生空会话
**修复**: 如果当前会话无实质消息（仅有系统消息或 messages.length === 0），不创建新会话

---

## [006] GrowthMenu 习惯创建入口修改

### 当前流程

1. 用户点击 GrowthMenu "创建一个新习惯"
2. `mainViewState = { type: 'action', domainId: 'habits', action: 'createHabit' }`
3. `fetchActionData` → 获取 `required_fields`
4. 渲染 DynamicForm（字段不完整，仅 3 个字段）

### 改为

1. 用户点击 GrowthMenu "创建一个新习惯"
2. `mainViewState = { type: 'view', domainId: 'habits', action: 'createHabit' }`
3. 导航到 HabitListPage，`autoOpenCreate=true`
4. HabitListPage 自动打开完整的 HabitForm 编辑面板

### 清理范围

- 删除 page.tsx 中 `type: 'action'` 对 `createHabit` 的处理逻辑
- `VIEW_PAGE_COMPONENTS.habits.createHabit` 已映射到 HabitListPage（已完成）
- IntentForm 组件文件保留（其他 action 可能使用），仅删除 createHabit 对它的引用
- manifest.yaml 中 `actions` 块如有对 IntentForm 的引用，清理之

---

## [007] CN-UI 习惯创建界面 + 通用空意图机制

### 7.1 CN-UI 表单适配层

新建 `CnuiFormAdapter`，使 CN-UI 表面可以渲染任意 Domain 的 Form 组件。

**文件**: `frontend/src/components/cnui/cnui-form-adapter.tsx`

```typescript
interface FormAdapterConfig {
  component: React.ComponentType<FormComponentProps>
  fieldMapping: Record<string, string>  // CN-UI dataModel key → Form field name
  defaults: Record<string, unknown>
}

interface FormComponentProps {
  initial?: Record<string, unknown>
  onSubmit: (fields: Record<string, unknown>) => void
  onCancel?: () => void
}
```

**FormRegistry**: 全局注册表，Domain 注册时声明 action 对应的 Form 组件。

```typescript
// domains/habits/index.ts
FormRegistry.register('habits', 'createHabit', {
  component: HabitForm,
  fieldMapping: {
    name: 'title',
    defaultTime: 'defaultTime',
    defaultDuration: 'defaultDuration',
    frequencyType: 'frequencyType',
    trackable: 'trackable',
  },
  defaults: {
    defaultDuration: 30,
    trackable: true,
    frequencyType: 'daily',
  },
})
```

### 7.2 HabitCreationCard 改造

**文件**: `frontend/src/components/cnui/surfaces/HabitCreationCard.tsx`

**当前**: 独立实现字段（name, defaultTime, frequencyType, trackable）

**改为**: 薄适配层
- 内部通过 `CnuiFormAdapter` 渲染 `HabitForm`
- 只做 CN-UI dataModel ↔ HabitForm props 的数据转换
- 不再自己维护字段和验证逻辑

```typescript
export function HabitCreationCard({ dataModel, onDataChange, onConfirm }: HabitCreationCardProps) {
  const config = FormRegistry.get('habits', 'createHabit')
  if (!config) return <div>表单未注册</div>

  const mappedData = mapDataToForm(dataModel, config.fieldMapping, config.defaults)

  return (
    <config.component
      initial={mappedData}
      onSubmit={(fields) => onConfirm(mapFormToData(fields, config.fieldMapping))}
      onCancel={() => onDataChange(dataModel)}
    />
  )
}
```

### 7.3 通用空意图处理机制

**文件**: `frontend/src/app/page.tsx` + 新增 `frontend/src/lib/slash-command.ts`

当用户输入 `/actionName`（无附加内容）时，在对话流中渲染对应 Form。

```typescript
// slash-command.ts
export function resolveSlashCommand(
  content: string
): { isSlashCommand: boolean; hasPayload: boolean; domainId?: string; action?: string; payload?: string }

// 示例:
// "/createHabit"          → { isSlashCommand: true, hasPayload: false, domainId: "habits", action: "createHabit" }
// "/createHabit 每天跑步"  → { isSlashCommand: true, hasPayload: true, domainId: "habits", action: "createHabit", payload: "每天跑步" }
// "帮我创建习惯"          → { isSlashCommand: false }
```

**page.tsx handleConversationSend 中的处理**:

```
用户输入
  ↓
resolveShortcut(content)     ← 现有 view_route 快捷命令
  ↓ 未命中
resolveSlashCommand(content) ← 新增
  ↓ slash 命令
  ├─ hasPayload=true  → AI 解析字段 → 填充后渲染 CN-UI Form
  └─ hasPayload=false → 创建空 CN-UI Surface → CnuiFormAdapter 渲染 Form
```

### 7.4 数据流总结

```
AI 助手输入
    ↓
resolveShortcut()
    ↓ view_route → 导航到页面
    ↓ slash 命令
resolveSlashCommand()
    ↓ hasPayload?
    ├─ 是 → AI 解析字段 → 填充 CN-UI Surface → 对话流中显示 Form
    └─ 否 → 空 CN-UI Surface → CnuiFormAdapter 渲染 Form → 对话流中显示
    ↓
用户填写/修改 → 提交
    ↓
onConfirm → submitHabitIntent (Orchestrator 管道)
```

---

## 改动文件清单

| 文件 | 改动类型 | 需求 |
|---|---|---|
| `components/layout/conversation-view.tsx` | 修改 | [004] 布局调整 + 意图交互 |
| `app/page.tsx` | 修改 | [004] 新对话行为 + [006] 导航修改 + [007] slash 命令处理 |
| `app/actions/intent.ts` | 新增函数 | [004] fetchIntentTriggers |
| `lib/slash-command.ts` | 新建 | [007] 通用 slash 命令解析 |
| `components/cnui/cnui-form-adapter.tsx` | 新建 | [007] CN-UI 表单适配层 |
| `components/cnui/surfaces/HabitCreationCard.tsx` | 重构 | [007] 改为薄适配层 |
| `domains/habits/manifest.yaml` | 修改 | [005] existingHabits→activeHabits |
| `domains/habits/index.ts` | 修改 | [007] FormRegistry 注册 |

## 不做的事

- GrowthMenu 动态读取 manifest 的全面重构（仅 createHabit 导航修改）
- IntentForm 组件删除（保留文件，其他 action 可能使用）
- CN-UI 协议本身的修改
- HabitForm 字段增减
- 其他 Domain 的 FormAdapter 注册（后续迭代按需添加）

## Constitution 合规性

| 原则 | 合规说明 |
|---|---|
| I Intent-Driven | 所有创建操作仍走 Intent Engine / Orchestrator 管道 |
| III Single-Writer | CN-UI onConfirm 触发 submitHabitIntent，不直接写库 |
| VI Domain Plugin | FormAdapter 注册在 Domain index.ts，Nexus 不感知 |
| VI Manifest Runtime | 常用意图从 manifest intent_triggers 动态加载 |
| VIII AI/Rule Boundary | AI 仅参与意图解析，表单提交走确定性管道 |

## 宪章 PATCH 追加

在 CN-UI Protocol Constraints 章节追加：

> **Form Component Reuse Constraint**: 当 CN-UI 表面需要渲染与 Domain 页面编辑面板相同的表单时，MUST 通过适配层复用 Domain 的 Form 组件，MUST NOT 维护独立的字段定义和验证逻辑。Domain 的 Form 组件是表单实现的唯一来源。
