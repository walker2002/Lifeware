# CN-UI 对话流集成设计

**日期**: 2026-05-27
**状态**: 待审核
**来源**: `/createHabit` 无 payload 时违反 Conversation-closed-loop 约束

## 问题

当前 `/createHabit`（无附加内容）直接导航到 `HabitListPage`（`type: 'view'`），违反了宪章 CN-UI Protocol Constraints 第 3 条：

> **Conversation-closed-loop**: CN-UI interactions MUST complete within the conversation flow. CN-UI MUST NOT navigate users to separate pages.

## 设计

### 数据流

```
用户输入 /createHabit
  ↓
resolveSlashCommand() → { isSlashCommand, hasPayload: false, action: "createHabit" }
  ↓
resolveShortcut() → { domainId: "habits", action: "createHabit" }
  ↓
openCnuiSurface("habits", "createHabit")   ← 新增 server action
  → 根据 manifest 查找 cnui_surface_type（"habit-creation-card"）
  → 从 FormRegistry 获取 defaults 作为初始 dataModel
  → 返回 CnuiSurfaceMessage
  ↓
page.tsx 收到 CnuiSurfaceMessage
  → 构造 ChatMessage（含 cnuiSurface 字段）加入 conversationMessages
  ↓
conversation-view.tsx 渲染消息
  → 检测 cnuiSurface → 渲染 <CnuiRenderer>
  → HabitCreationCard → CnuiFormAdapter → HabitForm
  ↓
用户填写 → onConfirm(fields)
  → submitCnuiSurface(cnuiSurfaceId, fields)  ← 新增 server action
  → FormRegistry.fieldMapping 逆映射 → submitHabitIntent(fields)
```

### 改动清单

| 文件 | 改动 | 说明 |
|---|---|---|
| `usom/types/objects.ts` | 修改 | `ChatMessage` 增加可选 `cnuiSurface?: CnuiSurfaceMessage` |
| `components/layout/conversation-view.tsx` | 修改 | 消息渲染中检测 `cnuiSurface` → 渲染 `CnuiRenderer` |
| `app/actions/intent.ts` | 新增 | `openCnuiSurface(domainId, action)` server action |
| `app/actions/intent.ts` | 新增 | `submitCnuiSurface(cnuiSurfaceId, domainId, action, fields)` server action |
| `app/page.tsx` | 修改 | slash 命令无 payload 分支调用 `openCnuiSurface`，`handleConversationSend` 支持返回 CN-UI 消息 |

### 不改的

- `HabitForm` / `HabitCreationCard` / `CnuiFormAdapter` / `FormRegistry` / `CnuiRenderer` — 已就绪
- `CnuiManager` / `SurfaceStore` — 服务端 surface 生命周期已实现（但本次简化不用，surface 状态由前端 `useState` 管理）
- `manifest.yaml` — 不需要改

### openCnuiSurface 实现要点

```typescript
// actions/intent.ts
export async function openCnuiSurface(
  domainId: string,
  action: string,
): Promise<CnuiSurfaceMessage> {
  const { findDomain } = await import("@/domains/registry")
  const domain = findDomain(domainId)
  const manifest = domain?.manifest

  // 从 generation_actions 获取 cnui_surface_type
  const genAction = manifest?.generation_actions?.[action]
  const surfaceType = genAction?.cnui_surface_type ?? `${domainId}-${action}`

  // 从 FormRegistry 获取 defaults 作为初始 dataModel
  const config = FormRegistry.get(domainId, action)
  const dataModel = config?.defaults ? { ...config.defaults } : {}

  return {
    role: "assistant",
    content: `请填写 ${action}`,
    cnuiSurfaceId: crypto.randomUUID(),
    cnuiSurfaceType: surfaceType as CnuiComponentType,
    action,
    dataSnapshot: dataModel,
  }
}
```

### submitCnuiSurface 实现要点

```typescript
export async function submitCnuiSurface(
  _cnuiSurfaceId: string,
  domainId: string,
  action: string,
  fields: Record<string, unknown>,
): Promise<HabitActionResult> {
  // 通过 FormRegistry.fieldMapping 将 CN-UI dataModel 映射为 Domain fields
  const config = FormRegistry.get(domainId, action)
  let mappedFields = fields
  if (config) {
    mappedFields = {}
    for (const [cnuiKey, formKey] of Object.entries(config.fieldMapping)) {
      if (cnuiKey in fields) mappedFields[formKey] = fields[cnuiKey]
    }
  }

  if (domainId === "habits" && action === "createHabit") {
    return submitHabitIntent(mappedFields as CreateHabitInput)
  }

  throw new Error(`Unknown CN-UI action: ${domainId}/${action}`)
}
```

### conversation-view.tsx 渲染改动

在消息渲染循环中，检测 `msg.cnuiSurface` 并在文本内容下方渲染 CN-UI 组件：

```tsx
{msg.cnuiSurface && (
  <div className="mt-3 rounded-lg border border-hairline bg-surface-soft p-4">
    <CnuiRenderer
      surfaceType={msg.cnuiSurface.cnuiSurfaceType}
      dataModel={msg.cnuiSurface.dataSnapshot ?? {}}
      onDataChange={(data) => { /* 本地状态更新 */ }}
      onConfirm={async (data) => {
        await submitCnuiSurface(
          msg.cnuiSurface!.cnuiSurfaceId,
          domainId,
          msg.cnuiSurface!.action,
          data,
        )
      }}
    />
  </div>
)}
```

### 边界情况

- **FormRegistry 未注册**: `CnuiFormAdapter` 已处理，显示 "表单未注册" 提示
- **未知 surfaceType**: `CnuiRenderer` 已处理，显示 "未知的卡片类型" 提示
- **提交失败**: `submitCnuiSurface` 返回 error，前端显示错误消息
- **多次提交**: `HabitForm` 的 `isLoading` 状态禁用提交按钮

## Constitution 合规

| 原则 | 说明 |
|---|---|
| Conversation-closed-loop | CN-UI 在对话流内渲染、交互、提交，不导航到独立页面 |
| Form Component Reuse | 通过 CnuiFormAdapter 复用 HabitForm，不维护独立字段定义 |
| Single-Writer | onConfirm → submitCnuiSurface → submitHabitIntent → Orchestrator，不直接写库 |
| Domain Plugin | FormRegistry 注册在 Domain index.ts，Nexus 不感知具体表单实现 |
