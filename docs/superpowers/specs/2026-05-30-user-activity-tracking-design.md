# 用户行为埋点与常用意图统计

**日期**: 2026-05-30
**状态**: 待实施
**需求来源**: mydocs/dev/当前开发内容.md [002]

## 背景

AI 助手"新对话"页面当前显示的常用意图来自 Domain manifest 静态声明（`intent_triggers`），所有用户看到相同的内容。需要根据用户实际行为数据，展示个性化的常用意图，并建立体系化的用户行为埋点框架。

## 设计目标

1. **当前消费者**: AI 助手"新对话"页面展示用户常用意图（Top 5 默认，展开到 Top 20）
2. **框架定位**: 体系化的用户行为埋点基础设施，覆盖菜单点击、页面跳转、意图执行、CNUI 操作
3. **未来演进**: 数据持久保存，为后续软件使用评估、功能优化分析提供数据基础
4. **独立分析页**: 提供独立的 `/analytics` 页面查看行为数据，不走主菜单导航

## 架构决策

### 存储方案：独立 `user_activities` 表

**选择理由**：
- `structured_intents` 是 Nexus 管道的业务记录（意图解析结果、置信度），消费者是 Rule Engine / State Machine
- `user_activities` 是纯统计分析数据，消费者是 UI 展示和未来分析模块
- 职责完全不同，不应混合查询
- AI 意图执行时同时写一条 `user_activities`——这是两层唯一的交叉点

**未来演进路径**: 当分析查询复杂度增加（数据量大、多维分析），可将 `user_activities` 迁移到独立分析存储，接口层加一层抽象。

### 记录方案：Server Action 统一入口

**选择理由**：
- 最简单——一个函数、一张表、显式调用
- 每个埋点位置明确可控，容易审查和维护
- 不触碰 Repository 层、不修改 Nexus 管道、不引入 Middleware
- 符合 Constitution 的 Simplicity First 和 Repository Isolation (V)

### 统计策略：时间衰减窗口

半衰期 7 天的指数衰减。最近行为权重高，30 天前的数据仍参与计算但权重极低。

## 数据模型

### `user_activities` 表

```typescript
export const userActivities = pgTable('user_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  // 行为分类
  activityType: text('activity_type', {
    enum: ['intent_execute', 'menu_click', 'page_navigate', 'cnui_action']
  }).notNull(),

  // 行为来源
  source: text('source', {
    enum: ['ai_assistant', 'growth_menu', 'shortcut', 'page_route', 'cnui_surface']
  }).notNull(),

  // 行为目标（关联到 Domain + Action）
  targetDomain: text('target_domain'),
  targetAction: text('target_action'),

  // 附加信息（路由路径、CNUI surface ID 等）
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_user_activities_user_time').on(table.userId, table.createdAt),
  index('idx_user_activities_type').on(table.userId, table.activityType, table.createdAt),
])
```

**设计要点**：
- `targetDomain` + `targetAction` 可为空——页面跳转可能没有对应 action（如访问设置页）
- `metadata` 用 JSONB 存非结构化附加信息，遵循 Constitution JSONB Usage 约束（status/time 用独立列，metadata 用 JSONB）
- 索引覆盖两个常用查询模式：按用户+时间、按用户+类型+时间
- 符合 Multi-Tenancy (T-01)：包含 `user_id` 外键

### Constitution 合规检查

| 约束 | 合规 | 说明 |
|---|---|---|
| T-01 (user_id) | ✅ | 表包含 user_id 外键 |
| T-04 (USOMSnapshot) | ✅ | 不涉及 ContextSnapshot |
| R-01~R-04 (Repository) | ✅ | 新建独立 Repository，不触碰现有 Repository |
| Event Sourcing | ✅ | user_activities 是 append-only，只有 insert |
| Simplicity First | ✅ | 一张表、一个 Server Action、显式调用 |

## 记录层

### `recordActivity()` Server Action

```typescript
// frontend/src/app/actions/activity.ts

interface RecordActivityInput {
  activityType: 'intent_execute' | 'menu_click' | 'page_navigate' | 'cnui_action'
  source: 'ai_assistant' | 'growth_menu' | 'shortcut' | 'page_route' | 'cnui_surface'
  targetDomain?: string
  targetAction?: string
  metadata?: Record<string, unknown>
}

export async function recordActivity(input: RecordActivityInput): Promise<void>
```

**关键约束**：
- Fire-and-forget 调用，不阻塞主流程
- 记录失败不影响业务逻辑，catch 后仅 console.error
- 不走 Nexus 管道——纯统计逻辑，不是业务写入

### 各行为类型埋点位置

| 行为类型 | 源 (source) | 调用位置 | 时机 |
|---|---|---|---|
| `intent_execute` | `ai_assistant` / `shortcut` | `submitIntent()` | 意图成功执行后 |
| `menu_click` | `growth_menu` | `GrowthMenu.onAction` 回调 | 用户点击 action 时 |
| `page_navigate` | `page_route` | `usePageView` Hook | 页面路由变化时 |
| `cnui_action` | `cnui_surface` | CNUI lifecycle confirm/submit | 用户确认/提交 CNUI 表面时 |

## 聚合层

### `fetchFrequentIntents()` Server Action

```typescript
interface FrequentIntent {
  targetDomain: string
  targetAction: string
  label: string       // 从 manifest intent_triggers 读取 description
  shortcut: string    // 从 manifest intent_triggers 读取 shortcut
  score: number       // 时间衰减加权分数
}

export async function fetchFrequentIntents(
  userId: string,
  limit: number = 5
): Promise<FrequentIntent[]>
```

### 时间衰减 SQL

```sql
SELECT target_domain, target_action,
       SUM(decay_score) as total_score
FROM (
  SELECT *,
    exp(-extract(epoch from (now() - created_at)) / 604800) as decay_score
  FROM user_activities
  WHERE user_id = $1
    AND created_at > now() - interval '30 days'
    AND target_domain IS NOT NULL
    AND target_action IS NOT NULL
) sub
GROUP BY target_domain, target_action
ORDER BY total_score DESC
LIMIT $2
```

半衰期 7 天：7 天内权重约 0.63，14 天前约 0.37，30 天前极低但参与计算。

## 展示层：AI 助手"新对话"页面

### 改动范围

`conversation-view.tsx` + `page.tsx`

### 数据流

```
page.tsx
  → fetchFrequentIntents(userId, 20)
  → 传入 ConversationView (替换/补充当前 intentTriggers)
  → 空状态渲染：显示前 5 个 + "更多"按钮
```

### 展示逻辑

- 有行为数据时：优先显示 `frequentIntents`（来自统计）
- 无行为数据时（新用户）：fallback 到当前静态 `intentTriggers`
- 默认显示 Top 5，点击"更多"展开到 Top 20
- 保持当前 pill 按钮样式，去掉 `(shortcut)` 后缀

## 独立分析页面

### 路由

`/analytics` — 不在主菜单导航，通过直接访问 URL 进入。

### 页面组件位置

`frontend/src/app/analytics/page.tsx`

### 功能模块

1. **行为总览**: 按行为类型分组的统计（今日/本周/本月）
2. **常用意图排行**: Top N 意图及其使用趋势
3. **活跃度概览**: 每日行为数量时间线
4. **时间范围筛选**: 支持选择时间范围

### 技术方案

- Next.js 页面组件
- 数据查询通过 Server Action（`fetchActivityStats`、`fetchActivityTimeline` 等）
- 图表优先使用简单 CSS 条形图，如需要再引入 Recharts

## 实施范围

### MVP（本次实施）

1. `user_activities` 表 + Repository
2. `recordActivity()` Server Action + 4 个埋点位置
3. `fetchFrequentIntents()` 聚合查询
4. AI 助手"新对话"页面展示改造
5. `/analytics` 独立分析页面（基础版）

### 后续迭代

- 分析页面增强（更多图表、导出功能）
- 活跃度洞察（基于行为数据的智能建议）
- 独立分析存储迁移（如需要）

## 文件变更预估

| 操作 | 文件路径 | 说明 |
|---|---|---|
| 修改 | `frontend/src/lib/db/schema.ts` | 新增 user_activities 表 |
| 新建 | `frontend/src/lib/db/repositories/activity.repository.ts` | Activity Repository |
| 新建 | `frontend/src/app/actions/activity.ts` | recordActivity + fetchFrequentIntents + 分析查询 |
| 修改 | `frontend/src/app/actions/intent.ts` | submitIntent 中添加 recordActivity 调用 |
| 修改 | `frontend/src/app/page.tsx` | 加载 frequentIntents 数据 |
| 修改 | `frontend/src/components/layout/conversation-view.tsx` | 常用意图展示改造 |
| 修改 | `frontend/src/components/layout/growth-menu.tsx` | onAction 中添加 recordActivity 调用 |
| 新建 | `frontend/src/hooks/use-page-view.ts` | 页面路由变化记录 Hook |
| 新建 | `frontend/src/app/analytics/page.tsx` | 独立分析页面 |
