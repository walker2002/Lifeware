# 用户行为埋点与常用意图统计 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立用户行为埋点框架，在 AI 助手"新对话"页面展示个性化常用意图，并提供独立分析页面。

**Architecture:** 新建 `user_activities` 表统一记录所有用户行为，通过 `recordActivity()` Server Action 显式调用写入，`fetchFrequentIntents()` 用时间衰减 SQL 聚合查询返回 Top N 常用意图。

**Tech Stack:** Drizzle ORM, PostgreSQL, Next.js Server Actions, React hooks

---

## File Structure

| 操作 | 文件路径 | 职责 |
|---|---|---|
| 修改 | `frontend/src/lib/db/schema.ts` | 新增 user_activities 表定义 |
| 新建 | `frontend/src/lib/db/repositories/activity.repository.ts` | Activity Repository（insert + 聚合查询） |
| 新建 | `frontend/src/app/actions/activity.ts` | recordActivity + fetchFrequentIntents + 分析查询 Server Actions |
| 修改 | `frontend/src/app/actions/intent.ts` | executePipeline 成功后调用 recordActivity |
| 修改 | `frontend/src/app/page.tsx` | 加载 frequentIntents + 各交互点调用 recordActivity |
| 修改 | `frontend/src/components/layout/conversation-view.tsx` | 常用意图展示改造（Top 5 + 展开） |
| 修改 | `frontend/src/components/layout/growth-menu.tsx` | onAction 回调中记录 menu_click |
| 新建 | `frontend/src/hooks/use-page-view.ts` | 页面路由变化记录 hook |
| 新建 | `frontend/src/app/analytics/page.tsx` | 独立分析页面 |

---

### Task 1: 数据库 Schema — user_activities 表

**Files:**
- Modify: `frontend/src/lib/db/schema.ts:642`（在最后一个表定义后追加）

- [ ] **Step 1: 在 schema.ts 末尾追加 user_activities 表定义**

在 `memoryEpisodes` 表定义之后（约第 642 行之后），追加：

```typescript
// ─── 7. user_activities (用户行为埋点) ─────────────────────────
export const userActivities = pgTable('user_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  activityType: text('activity_type', {
    enum: ['intent_execute', 'menu_click', 'page_navigate', 'cnui_action']
  }).notNull(),

  source: text('source', {
    enum: ['ai_assistant', 'growth_menu', 'shortcut', 'page_route', 'cnui_surface']
  }).notNull(),

  targetDomain: text('target_domain'),
  targetAction: text('target_action'),

  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_user_activities_user_time').on(table.userId, table.createdAt),
  index('idx_user_activities_type').on(table.userId, table.activityType, table.createdAt),
])
```

- [ ] **Step 2: 生成并执行数据库迁移**

```bash
cd frontend && npm run db:generate
npm run db:migrate
```

Expected: 迁移成功，新表 `user_activities` 已创建。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/db/schema.ts frontend/drizzle/
git commit -m "feat: 新增 user_activities 表用于用户行为埋点"
```

---

### Task 2: Activity Repository

**Files:**
- Create: `frontend/src/lib/db/repositories/activity.repository.ts`

- [ ] **Step 1: 创建 ActivityRepository**

创建文件 `frontend/src/lib/db/repositories/activity.repository.ts`：

```typescript
import { sql } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'

export interface RecordActivityInput {
  activityType: 'intent_execute' | 'menu_click' | 'page_navigate' | 'cnui_action'
  source: 'ai_assistant' | 'growth_menu' | 'shortcut' | 'page_route' | 'cnui_surface'
  targetDomain?: string
  targetAction?: string
  metadata?: Record<string, unknown>
}

export interface FrequentIntentRow {
  targetDomain: string
  targetAction: string
  totalScore: number
}

export interface ActivityTypeCount {
  activityType: string
  count: number
}

export interface DailyActivityCount {
  date: string
  count: number
}

export class ActivityRepository {
  async insert(userId: string, input: RecordActivityInput): Promise<void> {
    await db.insert(s.userActivities).values({
      userId,
      activityType: input.activityType,
      source: input.source,
      targetDomain: input.targetDomain ?? null,
      targetAction: input.targetAction ?? null,
      metadata: input.metadata ?? {},
    })
  }

  /**
   * 时间衰减聚合查询：半衰期 7 天，查询窗口 30 天。
   * 仅返回有 targetDomain + targetAction 的记录。
   */
  async fetchFrequentIntents(userId: string, limit: number): Promise<FrequentIntentRow[]> {
    const rows = await db
      .select({
        targetDomain: s.userActivities.targetDomain,
        targetAction: s.userActivities.targetAction,
        totalScore: sql<number>`sum(exp(-extract(epoch from (now() - ${s.userActivities.createdAt})) / 604800))`,
      })
      .from(s.userActivities)
      .where(
        sql`${s.userActivities.userId} = ${userId}
            AND ${s.userActivities.createdAt} > now() - interval '30 days'
            AND ${s.userActivities.targetDomain} IS NOT NULL
            AND ${s.userActivities.targetAction} IS NOT NULL`
      )
      .groupBy(s.userActivities.targetDomain, s.userActivities.targetAction)
      .orderBy(sql`total_score desc`)
      .limit(limit)
    return rows.map(r => ({
      targetDomain: r.targetDomain!,
      targetAction: r.targetAction!,
      totalScore: Number(r.totalScore),
    }))
  }

  async fetchActivityTypeCounts(userId: string, since: Date): Promise<ActivityTypeCount[]> {
    const rows = await db
      .select({
        activityType: s.userActivities.activityType,
        count: sql<number>`count(*)`,
      })
      .from(s.userActivities)
      .where(sql`${s.userActivities.userId} = ${userId} AND ${s.userActivities.createdAt} >= ${since}`)
      .groupBy(s.userActivities.activityType)
    return rows.map(r => ({ activityType: r.activityType, count: Number(r.count) }))
  }

  async fetchDailyActivityCounts(userId: string, since: Date): Promise<DailyActivityCount[]> {
    const rows = await db
      .select({
        date: sql<string>`date_trunc('day', ${s.userActivities.createdAt})::text`,
        count: sql<number>`count(*)`,
      })
      .from(s.userActivities)
      .where(sql`${s.userActivities.userId} = ${userId} AND ${s.userActivities.createdAt} >= ${since}`)
      .groupBy(sql`date_trunc('day', ${s.userActivities.createdAt})`)
      .orderBy(sql`date_trunc('day', ${s.userActivities.createdAt})`)
    return rows.map(r => ({ date: r.date.slice(0, 10), count: Number(r.count) }))
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/db/repositories/activity.repository.ts
git commit -m "feat: 新增 ActivityRepository（写入 + 聚合查询）"
```

---

### Task 3: Activity Server Actions

**Files:**
- Create: `frontend/src/app/actions/activity.ts`

- [ ] **Step 1: 创建 activity Server Actions**

创建文件 `frontend/src/app/actions/activity.ts`：

```typescript
'use server'

import { ActivityRepository, type RecordActivityInput } from '@/lib/db/repositories/activity.repository'
import { type IntentTrigger, fetchIntentTriggers } from './intent'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

export type { RecordActivityInput }

export interface FrequentIntent {
  targetDomain: string
  targetAction: string
  label: string
  shortcut: string
  score: number
}

/**
 * 记录一条用户行为。Fire-and-forget：调用方不需要 await。
 */
export async function recordActivity(input: RecordActivityInput): Promise<void> {
  try {
    const repo = new ActivityRepository()
    await repo.insert(MVP_USER_ID, input)
  } catch (err) {
    console.error('[recordActivity] 记录失败:', err)
  }
}

/**
 * 获取用户常用意图（时间衰减加权 Top N）。
 * 将聚合结果与 manifest 的 intent_triggers 关联，补充 label 和 shortcut。
 */
export async function fetchFrequentIntents(limit: number = 5): Promise<FrequentIntent[]> {
  const repo = new ActivityRepository()
  const rows = await repo.fetchFrequentIntents(MVP_USER_ID, limit * 2) // 多取一些用于匹配

  // 从 manifest 获取 label/shortcut 映射
  const triggers = await fetchIntentTriggers()
  const triggerMap = new Map<string, IntentTrigger>()
  for (const t of triggers) {
    triggerMap.set(`${t.domainId}:${t.action}`, t)
  }

  const result: FrequentIntent[] = []
  for (const row of rows) {
    const key = `${row.targetDomain}:${row.targetAction}`
    const trigger = triggerMap.get(key)
    result.push({
      targetDomain: row.targetDomain,
      targetAction: row.targetAction,
      label: trigger?.label ?? row.targetAction,
      shortcut: trigger?.shortcut ?? '',
      score: row.totalScore,
    })
    if (result.length >= limit) break
  }

  return result
}

/**
 * 获取行为类型统计（分析页面用）。
 */
export async function fetchActivityStats(sinceDays: number = 30) {
  const repo = new ActivityRepository()
  const since = new Date()
  since.setDate(since.getDate() - sinceDays)
  const [typeCounts, dailyCounts] = await Promise.all([
    repo.fetchActivityTypeCounts(MVP_USER_ID, since),
    repo.fetchDailyActivityCounts(MVP_USER_ID, since),
  ])
  return { typeCounts, dailyCounts, sinceDays }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/actions/activity.ts
git commit -m "feat: 新增 activity Server Actions（recordActivity + fetchFrequentIntents）"
```

---

### Task 4: 埋点接入 — AI 意图执行

**Files:**
- Modify: `frontend/src/app/actions/intent.ts:155-160`

- [ ] **Step 1: 在 executePipeline 成功路径添加 recordActivity 调用**

在 `frontend/src/app/actions/intent.ts` 文件顶部 import 区域添加：

```typescript
import { recordActivity } from './activity'
```

在 `executePipeline` 函数中，找到成功返回之前的位置（约第 158-159 行之间），在 `const result = await orchestrator.execute(...)` 之后、`if (!result.success)` 判断之后、成功返回之前，插入 recordActivity 调用。

具体位置：在第 173 行 `if (logger) logger.endSession('success');` 之后，第 174 行 `return {` 之前，插入：

```typescript
    // 记录用户行为（fire-and-forget）
    const si = parseResult.intent
    void recordActivity({
      activityType: 'intent_execute',
      source: 'ai_assistant',
      targetDomain: si.targetDomain,
      targetAction: si.action,
    })
```

这段代码在 `if (logger) logger.endSession('success');` 之后、`return {` 之前。

- [ ] **Step 2: 验证编译通过**

```bash
cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/actions/intent.ts
git commit -m "feat: AI 意图执行成功后记录用户行为"
```

---

### Task 5: 埋点接入 — GrowthMenu 点击

**Files:**
- Modify: `frontend/src/app/page.tsx:434-456`

- [ ] **Step 1: 在 handleGrowthAction 中添加 recordActivity 调用**

在 `frontend/src/app/page.tsx` 文件顶部 import 区域，在现有的 intent action import 行中添加 `recordActivity`：

```typescript
// 找到这一行（约第 27 行）：
import { submitIntent, ..., fetchIntentTriggers, openCnuiSurface, submitCnuiSurface, isCnuiSurface, getActionResponse } from "./actions/intent"
// 在后面追加新 import：
import { recordActivity } from "./actions/activity"
```

在 `handleGrowthAction` 函数中（约第 434 行），在 `saveCurrentConversation()` 之后、第一个 if 判断之前，插入：

```typescript
    // 记录 GrowthMenu 点击行为
    void recordActivity({
      activityType: 'menu_click',
      source: 'growth_menu',
      targetDomain: domainId,
      targetAction: action,
    })
```

- [ ] **Step 2: 验证编译通过**

```bash
cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: GrowthMenu 点击记录用户行为"
```

---

### Task 6: 埋点接入 — CNUI 操作

**Files:**
- Modify: `frontend/src/app/page.tsx:482-515`

- [ ] **Step 1: 在 handleCnuiConfirm 成功路径添加 recordActivity 调用**

在 `handleCnuiConfirm` 函数中（约第 482 行），找到 `if (result.success)` 分支内，在 `addChatMessage(msg)` 之后插入：

```typescript
        // 记录 CNUI 操作行为
        void recordActivity({
          activityType: 'cnui_action',
          source: 'cnui_surface',
          targetDomain: domainId,
          targetAction: action,
        })
```

- [ ] **Step 2: 验证编译通过**

```bash
cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: CNUI 操作确认后记录用户行为"
```

---

### Task 7: 埋点接入 — 页面路由变化

**Files:**
- Create: `frontend/src/hooks/use-page-view.ts`
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: 创建 usePageView hook**

创建文件 `frontend/src/hooks/use-page-view.ts`：

```typescript
'use client'

import { useEffect } from 'react'
import { recordActivity } from '@/app/actions/activity'

/**
 * 记录页面路由变化。在页面组件的顶层调用。
 * 仅记录 domain 关联的页面路由（如 /habits, /tasks）。
 */
export function usePageView(domainId?: string, action?: string) {
  useEffect(() => {
    if (!domainId || !action) return
    void recordActivity({
      activityType: 'page_navigate',
      source: 'page_route',
      targetDomain: domainId,
      targetAction: action,
    })
  }, [domainId, action])
}
```

- [ ] **Step 2: 在 page.tsx 中使用 usePageView**

在 `frontend/src/app/page.tsx` 顶部 import 区域添加：

```typescript
import { usePageView } from '@/hooks/use-page-view'
```

在组件内部（约第 96 行之后，state 定义区域），添加调用：

```typescript
  // 记录页面路由变化
  usePageView(
    mainViewState.type === 'action' ? mainViewState.domainId : undefined,
    mainViewState.type === 'action' ? mainViewState.action : undefined,
  )
```

这利用了已有的 `mainViewState`：当视图切换到 `action` 类型（即 Domain 页面）时，自动记录页面导航行为。

- [ ] **Step 3: 验证编译通过**

```bash
cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/use-page-view.ts frontend/src/app/page.tsx
git commit -m "feat: 页面路由变化记录用户行为"
```

---

### Task 8: 常用意图展示改造 — ConversationView

**Files:**
- Modify: `frontend/src/components/layout/conversation-view.tsx:9-25, 237-253`
- Modify: `frontend/src/app/page.tsx:98, 110-113, 770-779`

- [ ] **Step 1: 扩展 ConversationView props 接口**

在 `frontend/src/components/layout/conversation-view.tsx` 中，在 `IntentTrigger` 接口之后添加：

```typescript
export interface FrequentIntent {
  targetDomain: string
  targetAction: string
  label: string
  shortcut: string
  score: number
}
```

修改 `ConversationViewProps` 接口（约第 16-25 行），添加 `frequentIntents` 属性：

```typescript
interface ConversationViewProps {
  messages: ChatMessage[]
  onSendMessage: (content: string, attachments?: File[]) => void
  isLoading?: boolean
  recentSessions?: AISessionSummary[]
  onSelectSession?: (sessionId: string) => void
  intentTriggers?: IntentTrigger[]
  frequentIntents?: FrequentIntent[]
  onCnuiConfirm?: (cnuiSurfaceId: string, domainId: string, action: string, data: Record<string, unknown>) => void
  onSurfaceStateChange?: (surfaceId: string, state: SurfaceState) => void
}
```

更新函数签名解构（约第 33 行）：

```typescript
export function ConversationView({ messages, onSendMessage, isLoading, recentSessions, onSelectSession, intentTriggers, frequentIntents, onCnuiConfirm, onSurfaceStateChange }: ConversationViewProps) {
```

- [ ] **Step 2: 替换常用意图渲染区域**

在组件内部，state 声明区域后（约第 36 行之后），添加展开状态：

```typescript
  const [showAllIntents, setShowAllIntents] = useState(false)
```

替换第 236-253 行的常用意图渲染代码：

```typescript
          {/* 常用意图（在输入框下方） */}
          {(() => {
            // 优先使用行为统计，fallback 到静态 intentTriggers
            const items: Array<{ key: string; label: string; shortcut: string; onClick: () => void }> = []

            if (frequentIntents && frequentIntents.length > 0) {
              const visible = showAllIntents ? frequentIntents : frequentIntents.slice(0, 5)
              for (const fi of visible) {
                items.push({
                  key: `${fi.targetDomain}:${fi.targetAction}`,
                  label: fi.label,
                  shortcut: fi.shortcut,
                  onClick: () => {
                    if (fi.shortcut) {
                      setInput(fi.shortcut + ' ')
                    }
                    inputRef.current?.focus()
                  },
                })
              }
            } else if (intentTriggers && intentTriggers.length > 0) {
              for (const trigger of intentTriggers) {
                items.push({
                  key: `${trigger.domainId}:${trigger.action}`,
                  label: trigger.label,
                  shortcut: trigger.shortcut,
                  onClick: () => {
                    setInput(trigger.shortcut + ' ')
                    inputRef.current?.focus()
                  },
                })
              }
            }

            if (items.length === 0) return null

            return (
              <div className="mt-4 w-full max-w-xl">
                <div className="flex max-w-xl flex-wrap justify-center gap-2">
                  {items.map(item => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={item.onClick}
                      className="rounded-full border border-hairline px-3 py-1.5 text-sm text-body hover:bg-surface-soft hover:text-ink transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                {frequentIntents && frequentIntents.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllIntents(prev => !prev)}
                    className="mt-2 block mx-auto text-xs text-body/50 hover:text-body transition-colors"
                  >
                    {showAllIntents ? '收起' : '更多'}
                  </button>
                )}
              </div>
            )
          })()}
```

- [ ] **Step 3: 在 page.tsx 中加载 frequentIntents 并传入 ConversationView**

在 `frontend/src/app/page.tsx` 中，找到 import 行（约第 27 行），添加：

```typescript
import { fetchFrequentIntents, recordActivity } from "./actions/activity"
```

找到 `intentTriggers` state（约第 98 行），在其后添加 frequentIntents state：

```typescript
  const [frequentIntents, setFrequentIntents] = useState<Awaited<ReturnType<typeof fetchFrequentIntents>>>([])
```

找到 `fetchIntentTriggers` 的 useEffect（约第 109-113 行），在其后添加：

```typescript
  useEffect(() => {
    fetchFrequentIntents(20)
      .then(setFrequentIntents)
      .catch(err => console.error('[fetchFrequentIntents] 加载失败:', err))
  }, []);
```

找到 ConversationView 传参位置（约第 770-779 行），在 `intentTriggers={intentTriggers}` 之后添加：

```typescript
          frequentIntents={frequentIntents}
```

- [ ] **Step 4: 验证编译通过**

```bash
cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 5: 启动 dev server 手动验证**

```bash
cd frontend && npm run dev
```

验证：
1. 打开 AI 助手"新对话"页面
2. 无行为数据时应显示静态 intentTriggers
3. 执行一个意图后刷新页面，应显示行为统计的常用意图
4. 超过 5 个时应显示"更多"按钮

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/conversation-view.tsx frontend/src/app/page.tsx
git commit -m "feat: AI 助手新对话页面展示个性化常用意图（Top 5 + 展开）"
```

---

### Task 9: 独立分析页面

**Files:**
- Create: `frontend/src/app/analytics/page.tsx`

- [ ] **Step 1: 创建分析页面**

创建文件 `frontend/src/app/analytics/page.tsx`：

```typescript
import { fetchActivityStats, fetchFrequentIntents } from '../actions/activity'

export default async function AnalyticsPage() {
  const [{ typeCounts, dailyCounts, sinceDays }, topIntents] = await Promise.all([
    fetchActivityStats(30),
    fetchFrequentIntents(20),
  ])

  const totalCount = typeCounts.reduce((sum, t) => sum + t.count, 0)
  const maxDaily = Math.max(...dailyCounts.map(d => d.count), 1)

  const ACTIVITY_TYPE_LABELS: Record<string, string> = {
    intent_execute: '意图执行',
    menu_click: '菜单点击',
    page_navigate: '页面导航',
    cnui_action: 'CNUI 操作',
  }

  return (
    <div className="min-h-screen bg-background text-ink p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">用户行为分析</h1>
        <p className="text-sm text-body/60 mb-8">过去 {sinceDays} 天共记录 {totalCount} 条行为数据</p>

        {/* 行为类型分布 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">行为类型分布</h2>
          <div className="space-y-2">
            {typeCounts.map(tc => (
              <div key={tc.activityType} className="flex items-center gap-3">
                <span className="w-24 text-sm text-body/70">{ACTIVITY_TYPE_LABELS[tc.activityType] ?? tc.activityType}</span>
                <div className="flex-1 h-6 bg-surface-soft rounded overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded"
                    style={{ width: `${totalCount > 0 ? (tc.count / totalCount) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-12 text-sm text-right">{tc.count}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 每日活跃度 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">每日活跃度</h2>
          <div className="flex items-end gap-1 h-32">
            {dailyCounts.map(dc => (
              <div
                key={dc.date}
                className="flex-1 bg-primary/50 rounded-t min-w-[4px]"
                style={{ height: `${(dc.count / maxDaily) * 100}%` }}
                title={`${dc.date}: ${dc.count}`}
              />
            ))}
          </div>
          {dailyCounts.length > 0 && (
            <div className="flex justify-between text-xs text-body/40 mt-1">
              <span>{dailyCounts[0]?.date}</span>
              <span>{dailyCounts[dailyCounts.length - 1]?.date}</span>
            </div>
          )}
        </section>

        {/* 常用意图排行 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">常用意图排行 (Top 20)</h2>
          <div className="space-y-1">
            {topIntents.map((intent, i) => (
              <div key={`${intent.targetDomain}:${intent.targetAction}`} className="flex items-center gap-3 text-sm">
                <span className="w-6 text-body/40 text-right">{i + 1}</span>
                <span className="w-20 text-body/60">{intent.targetDomain}</span>
                <span className="flex-1">{intent.label}</span>
                <span className="text-body/40">{intent.score.toFixed(1)}</span>
              </div>
            ))}
            {topIntents.length === 0 && (
              <p className="text-sm text-body/40">暂无数据</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证页面可访问**

```bash
cd frontend && npm run dev
```

打开 `http://localhost:3000/analytics`，应看到分析页面。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/analytics/page.tsx
git commit -m "feat: 独立用户行为分析页面 (/analytics)"
```

---

### Task 10: 端到端验证

- [ ] **Step 1: 启动完整应用并执行端到端测试**

```bash
cd frontend && npm run dev
```

逐项验证：

1. **AI 意图执行埋点**: 在 AI 助手中输入 `/createHabit` 并完成操作，检查数据库 `user_activities` 表有 `intent_execute` 记录
2. **GrowthMenu 点击埋点**: 点击成长领域中的任意 action，检查有 `menu_click` 记录
3. **CNUI 操作埋点**: 在对话中完成一个 CNUI 创建操作，检查有 `cnui_action` 记录
4. **页面导航埋点**: 通过 GrowthMenu 跳转到 Domain 页面，检查有 `page_navigate` 记录
5. **常用意图展示**: 执行多个操作后刷新新对话页面，应显示常用意图列表
6. **展开/收起**: 超过 5 个常用意图时，"更多"按钮可展开到 Top 20
7. **分析页面**: 访问 `/analytics`，应显示行为类型分布、每日活跃度、常用意图排行

- [ ] **Step 2: 检查数据库记录**

```bash
cd frontend && npx drizzle-kit studio
```

在 Drizzle Studio 中查看 `user_activities` 表的记录是否正确。

- [ ] **Step 3: 最终 Commit（如有修复）**

```bash
git add -A
git commit -m "fix: 端到端验证修复"
```

---

## 实现偏差记录

### 1. GrowthMenu 埋点位置变更（Task 5）

**计划：** 修改 `growth-menu.tsx` 的 `onAction` 回调记录 `menu_click`。
**实际：** 埋点在 `page.tsx` 的 `handleGrowthAction` 中完成，`growth-menu.tsx` 未修改。
**原因：** 父组件统一处理副作用，子组件保持纯展示，架构更合理。

### 2. activity.ts 拆分为两个文件（Task 3）

**计划：** 单一 `activity.ts` 包含 `recordActivity` + `fetchFrequentIntents` + `fetchActivityStats`。
**实际：** 拆分为 `activity.ts`（仅查询）和 `activity-recorder.ts`（仅写入），`fetchIntentTriggers` 提取到 `intent-triggers.ts`。
**原因：** 消除 `intent.ts ↔ activity.ts` 的循环依赖。动态 `import()` 虽能运行，但静态导入独立模块更清晰。

### 3. usePageView 增加 useRef 去重（Task 7）

**计划：** 直接在 useEffect 中调用 `recordActivity`。
**实际：** 增加 `useRef` 追踪已记录的 key，防止 React re-render 导致重复写入。
**原因：** Code review 发现同一路由重复挂载会刷高行为分数。

### 4. FrequentIntent 接口统一（Task 8）

**计划：** `conversation-view.tsx` 独立定义 `FrequentIntent` 接口。
**实际：** 从 `activity.ts` 导入，避免接口漂移。
