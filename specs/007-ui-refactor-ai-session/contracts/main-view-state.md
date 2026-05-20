# UI Contract: MainViewState

**Feature**: 007-ui-refactor-ai-session
**Type**: Internal UI state contract
**Updated**: 2026-05-17 (添加 settings 视图类型)

## State Definition

```typescript
type MainViewState =
  | ScheduleView
  | ConversationView
  | ActionView
  | SettingsView

interface ScheduleView {
  type: 'schedule'
  date: Date
  viewMode: DateViewMode  // 'day' | 'week' | 'month'
}

interface ConversationView {
  type: 'conversation'
  sessionId: string
  splitWith?: StructuredContent  // 设置时触发分裂视图
}

interface ActionView {
  type: 'action'
  domainId: string
  action: string
}

interface SettingsView {
  type: 'settings'
  section?: 'general' | 'llm' | 'timezone' | 'templates'  // 可选：定位到特定配置区域
}

interface StructuredContent {
  mode: 'form' | 'markdown'
  domain: string
  action: string
  // mode='form':
  fields?: Record<string, unknown>
  // mode='markdown':
  content?: string
}
```

## State Transition Rules

| From | Trigger | To | Pre-action |
|---|---|---|---|
| any | Home 点击 | schedule | 自动保存当前对话 |
| any | 左侧"新对话" | conversation (新 sessionId) | 创建会话 + 自动保存 |
| any | 左侧"旧对话" | conversation (已有 sessionId) | 加载历史 + 状态合并 |
| any | 成长领域菜单点击 | action | 自动保存当前对话 |
| any | 快捷方式 `/xxx` | action | 跳过 Phase A |
| conversation | AI 解析出 StructuredIntent | conversation + splitWith | 分裂主显示区 |
| conversation + splitWith | 用户确认执行成功 | conversation (splitWith=undefined) | 折叠分裂视图 |
| any | 右上角设置按钮 | settings | 自动保存当前对话 |
| any | LLM 提示"前往设置" | settings (section='llm') | 导航到 LLM 区域 |
| settings | Home 点击 | schedule | 无 |

## Invariants

1. `splitWith` 只有在 `type='conversation'` 时才有意义
2. `ActionView` 的 `domainId` 必须存在于 Registry
3. `SettingsView` 是独立视图，不通过 action 路由进入
4. 状态切换时绝不丢弃未保存的对话内容
5. Home 永远是安全的"逃生舱"——任何时候返回 schedule 视图
