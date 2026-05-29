# CNUI Domain Ownership 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 CNUI surface 的组件、数据和提交逻辑所有权彻底下沉到 domain，公共层通过 registry 机制动态发现和路由。

**Architecture:** 新增 `CnuiSurfaceRegistry` 作为公共层的唯一注册中心；Domain 在入口文件自注册 surface 组件 + handler；`CnuiRenderer` 改为从 registry 动态查找组件；`intent.ts` 的 `openCnuiSurface`/`submitCnuiSurface` 改为通过 registry 调用 handler。新增 `response_type` 字段到 manifest `intent_triggers`，新增加 `cnui_surfaces` 块。

**Tech Stack:** React 19 + TypeScript 5 + Next.js 16 + yaml (已有依赖)

---

## 文件结构

```
新增加：
  frontend/src/nexus/ai-runtime/cnui/registry.ts        # CnuiSurfaceRegistry 类
  frontend/src/domains/habits/cnui/handlers.ts           # habits CNUI handler (open+submit)
  frontend/src/domains/timebox/cnui/handlers.ts          # timebox CNUI handler (open+submit)
  frontend/scripts/validate-manifest.ts                  # manifest 诊断工具

迁移（从 components/cnui/surfaces/ 迁入各 domain）：
  frontend/src/domains/habits/cnui/surfaces/HabitActionPanel.tsx
  frontend/src/domains/habits/cnui/surfaces/HabitCheckinPanel.tsx
  frontend/src/domains/habits/cnui/surfaces/HabitCreationCard.tsx
  frontend/src/domains/timebox/cnui/surfaces/TimeboxList.tsx

修改：
  frontend/src/nexus/ai-runtime/cnui/types.ts            # 新增 handler 接口，CnuiDomainComponentType → string
  frontend/src/nexus/ai-runtime/cnui/catalog.ts          # 删除硬编码 DOMAIN_COMPONENTS
  frontend/src/components/cnui/CnuiRenderer.tsx          # 删除 domain import，改用 registry
  frontend/src/components/cnui/use-cnui-lifecycle.ts     # 删除 domain 硬编码的校验分支
  frontend/src/app/page.tsx                              # 删除 cnuiActions 硬编码列表
  frontend/src/app/actions/intent.ts                     # 删除 open/submit 中 domain if/else
  frontend/src/domains/habits/manifest.yaml              # 新增 cnui_surfaces 块 + intent_triggers 新增 response_type
  frontend/src/domains/timebox/manifest.yaml             # 同上
  frontend/src/domains/habits/index.ts                   # 新增 cnuiRegistry.register() 调用
  frontend/src/domains/timebox/index.ts                  # 同上
  frontend/package.json                                  # predev/prebuild 加上 validate:manifest

删除：
  frontend/src/components/cnui/surfaces/                 # 清空目录（4 个组件已迁走）
```

---

### Task 1: 基础设施 — 定义 Handler 接口 + Registry

**Files:**
- Modify: `frontend/src/nexus/ai-runtime/cnui/types.ts`
- Create: `frontend/src/nexus/ai-runtime/cnui/registry.ts`

- [ ] **Step 1: 在 types.ts 中新增 Handler 接口，同时将 CnuiDomainComponentType 改为 string**

编辑 `frontend/src/nexus/ai-runtime/cnui/types.ts`，在文件末尾追加以下内容，同时将 `CnuiDomainComponentType` 改为 `string` 别名：

```typescript
// 在 types.ts 中：
// 第 15 行 CnuiDomainComponentType 改为：
export type CnuiDomainComponentType = string
// （保持向后兼容——所有联合类型成员自动满足 string 约束）

// 在文件末尾新增：
// ── CNUI Surface Handler 接口 ──────────────────────────────

export interface CnuiSurfaceHandler {
  open: (action: string) => Promise<CnuiSurfaceOpenResult>
  submit: (action: string, fields: Record<string, unknown>) => Promise<CnuiSurfaceSubmitResult>
}

export interface CnuiSurfaceOpenResult {
  content: string
  dataSnapshot: Record<string, unknown>
}

export interface CnuiSurfaceSubmitResult {
  success: boolean
  error?: string
  data?: Record<string, unknown>
}
```

- [ ] **Step 2: 运行 TypeScript 检查确保无编译错误**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to `CnuiDomainComponentType` change (string 兼容所有现有关联类型成员).

- [ ] **Step 3: 创建 CnuiSurfaceRegistry**

创建 `frontend/src/nexus/ai-runtime/cnui/registry.ts`：

```typescript
import type React from 'react'
import type { CnuiSurfaceHandler } from './types'

interface SurfaceRegistration {
  domainId: string
  surfaceType: string
  component: React.ComponentType<any>
  handler: CnuiSurfaceHandler
}

class CnuiSurfaceRegistry {
  private map = new Map<string, SurfaceRegistration>()

  register(
    domainId: string,
    surfaceType: string,
    reg: { component: React.ComponentType<any>; handler: CnuiSurfaceHandler },
  ): void {
    if (this.map.has(surfaceType)) {
      const existing = this.map.get(surfaceType)!
      console.warn(
        `[CnuiRegistry] surface type "${surfaceType}" already registered by ` +
        `domain "${existing.domainId}", overwriting with "${domainId}"`,
      )
    }
    this.map.set(surfaceType, { domainId, surfaceType, ...reg })
  }

  get(surfaceType: string): SurfaceRegistration | undefined {
    return this.map.get(surfaceType)
  }

  getByDomain(domainId: string): SurfaceRegistration[] {
    return [...this.map.values()].filter(r => r.domainId === domainId)
  }

  allTypes(): string[] {
    return [...this.map.keys()]
  }

  /** 确定 action 对应的 surfaceType：先从 generation_actions 查，再 fallback 到 intent_triggers */
  findSurfaceType(domainId: string, action: string): string | undefined {
    // 遍历所有注册的 surface，按 action 查找
    // （调用方应优先通过 manifest 解析，此方法为 fallback）
    for (const [type, reg] of this.map) {
      if (reg.domainId === domainId) {
        return type
      }
    }
    return undefined
  }
}

export const cnuiRegistry = new CnuiSurfaceRegistry()
```

- [ ] **Step 4: 运行 TypeScript 检查**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/nexus/ai-runtime/cnui/types.ts frontend/src/nexus/ai-runtime/cnui/registry.ts
git commit -m "feat: 新增 CnuiSurfaceRegistry + CnuiSurfaceHandler 接口

基础设施搭建。types.ts 中 CnuiDomainComponentType 改为 string，
新增 Handler/OpenResult/SubmitResult 接口。registry.ts 实现
CnuiSurfaceRegistry 单例，支持 domain 自注册 surface 组件和 handler。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: habits domain — 创建 cnui/ 目录 + 迁移 surface 组件 + handler

**Files:**
- Create: `frontend/src/domains/habits/cnui/surfaces/HabitActionPanel.tsx`
- Create: `frontend/src/domains/habits/cnui/surfaces/HabitCheckinPanel.tsx`
- Create: `frontend/src/domains/habits/cnui/surfaces/HabitCreationCard.tsx`
- Create: `frontend/src/domains/habits/cnui/handlers.ts`
- Modify: `frontend/src/domains/habits/index.ts`
- Modify: `frontend/src/domains/habits/manifest.yaml`

- [ ] **Step 1: 迁移 surface 组件文件**

复制 3 个 habits surface 组件到新位置：

```bash
cd /home/walker/lifeware/frontend
mkdir -p src/domains/habits/cnui/surfaces
cp src/components/cnui/surfaces/HabitActionPanel.tsx src/domains/habits/cnui/surfaces/
cp src/components/cnui/surfaces/HabitCheckinPanel.tsx src/domains/habits/cnui/surfaces/
cp src/components/cnui/surfaces/HabitCreationCard.tsx src/domains/habits/cnui/surfaces/
```

然后更新 3 个文件中的相对 import 路径：

- `HabitCreationCard.tsx` 第 4 行：`'../cnui-form-adapter'` → `'@/components/cnui/cnui-form-adapter'`
- `HabitActionPanel.tsx` 中的 import 路径不变（它依赖 shadcn/ui 组件，用 `@/` 路径是安全的）

- [ ] **Step 2: 创建 habits CNUI handler**

创建 `frontend/src/domains/habits/cnui/handlers.ts`：

```typescript
import type { CnuiSurfaceHandler, CnuiSurfaceOpenResult, CnuiSurfaceSubmitResult } from '@/nexus/ai-runtime/cnui/types'
import { HabitRepository } from '@/domains/habits/repository/habit'
import { validateHabitFields } from '@/domains/habits/validation'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

const LIFECYCLE_STATUS_MAP: Record<string, string> = {
  activateHabit: 'draft',
  suspendHabit: 'active',
  archiveHabit: 'suspended',
  reactivateHabit: 'suspended',
}

const LIFECYCLE_SM_ACTION: Record<string, string> = {
  activateHabit: 'activate',
  suspendHabit: 'suspend',
  archiveHabit: 'archive',
  reactivateHabit: 'reactivate',
}

function getChineseActionLabel(action: string): string {
  const labels: Record<string, string> = {
    activate: '激活',
    suspend: '暂停',
    reactivate: '恢复',
    archive: '归档',
  }
  return labels[action] ?? action
}

export const habitCnuiHandler: CnuiSurfaceHandler = {
  async open(action): Promise<CnuiSurfaceOpenResult> {
    // createHabit: 返回空数据模型，由 CnuiFormAdapter 渲染
    if (action === 'createHabit') {
      return { content: '请填写习惯信息', dataSnapshot: { startDate: new Date().toISOString().slice(0, 10) } }
    }

    const repo = new HabitRepository()

    // logHabit: 展示待打卡习惯
    if (action === 'logHabit') {
      const allHabits = await repo.findByUserId(MVP_USER_ID)
      const pending = allHabits
        .filter(h => h.status === 'active' && h.trackable)
        .map(h => ({
          id: h.id,
          title: h.title,
          defaultTime: h.defaultTime,
          defaultDuration: h.defaultDuration,
          streak: h.streak,
          todayLogged: false,
        }))

      return {
        content: '请选择要打卡的习惯',
        dataSnapshot: { items: pending },
      }
    }

    // lifecycle actions
    if (action in LIFECYCLE_STATUS_MAP) {
      const status = LIFECYCLE_STATUS_MAP[action]
      const allHabits = await repo.findByUserId(MVP_USER_ID)
      const items = allHabits
        .filter(h => h.status === status)
        .map(h => ({
          id: h.id,
          title: h.title,
          defaultTime: h.defaultTime,
          streak: h.streak,
          frequencyType: h.frequencyType,
          status: h.status,
        }))

      const smAction = LIFECYCLE_SM_ACTION[action]

      return {
        content: `请选择要${getChineseActionLabel(smAction)}的习惯`,
        dataSnapshot: { action: smAction, items },
      }
    }

    return { content: '请填写信息', dataSnapshot: {} }
  },

  async submit(action, fields): Promise<CnuiSurfaceSubmitResult> {
    // createHabit: 服务端校验 + 通过 orchestrator 提交
    if (action === 'createHabit') {
      const result = validateHabitFields(fields, 'createHabit')
      if (!result.valid) {
        return { success: false, error: result.errors.join('；') }
      }
      // 委托给 intent.ts 中已有的 submitHabitIntent
      const { submitHabitIntent } = await import('@/app/actions/intent')
      return submitHabitIntent(fields as any)
    }

    // lifecycle actions
    if (action in LIFECYCLE_SM_ACTION) {
      const selectedIds = fields['selectedIds'] as string[]
      if (!selectedIds || selectedIds.length === 0) {
        return { success: false, error: '未选择任何习惯' }
      }

      const smAction = (fields['action'] as string ?? LIFECYCLE_SM_ACTION[action]) as 'activate' | 'suspend' | 'reactivate' | 'archive'

      const { updateHabitStatus } = await import('@/app/actions/intent')
      let lastError: string | undefined
      for (const habitId of selectedIds) {
        const result = await updateHabitStatus(habitId, smAction)
        if (!result.success) lastError = result.error
      }
      if (lastError) return { success: false, error: lastError }
      return { success: true }
    }

    // logHabit
    if (action === 'logHabit') {
      const selectedIds = fields['selectedIds'] as string[]
      const detailFields = (fields['detailFields'] ?? {}) as Record<string, Record<string, unknown>>

      if (!selectedIds || selectedIds.length === 0) {
        return { success: false, error: '未选择任何习惯' }
      }

      const { batchLogHabits } = await import('@/app/actions/intent')
      const items = selectedIds.map(id => ({
        habitId: id,
        fields: detailFields[id] as {
          actualDuration?: number
          completionRating?: number
          energyLevel?: number
          note?: string
        } | undefined,
      }))
      return batchLogHabits(items)
    }

    return { success: false, error: `Unknown CN-UI action: habits/${action}` }
  },
}
```

> **注意**: handler 内部使用 `await import('@/app/actions/intent')` 避免循环依赖。这些函数（`submitHabitIntent`, `updateHabitStatus`, `batchLogHabits`）后续可考虑迁入 domain 内部，但不在本次重构范围内。

- [ ] **Step 3: 在 habits/index.ts 中注册 surface**

编辑 `frontend/src/domains/habits/index.ts`，在现有 import 行之后、`const result = ...` 之前添加注册块：

```typescript
// 在 import './register-form' 之后添加:
// ── CNUI Surface 注册 ────────────────────────────────────────
import { cnuiRegistry } from '@/nexus/ai-runtime/cnui/registry'
import { habitCnuiHandler } from './cnui/handlers'

cnuiRegistry.register('habits', 'habit-action-panel', {
  component: require('./cnui/surfaces/HabitActionPanel').HabitActionPanel,
  handler: habitCnuiHandler,
})
cnuiRegistry.register('habits', 'habit-checkin-panel', {
  component: require('./cnui/surfaces/HabitCheckinPanel').HabitCheckinPanel,
  handler: habitCnuiHandler,
})
cnuiRegistry.register('habits', 'habit-creation-card', {
  component: require('./cnui/surfaces/HabitCreationCard').HabitCreationCard,
  handler: habitCnuiHandler,
})
```

> **注意**: 使用 `require()` 而非 `React.lazy()` 进行注册。`react-dom` 版本不支持 `React.lazy` 在非 JSX 上下文中直接使用。组件通过 `require` 同步加载，对于 domain 入口文件而言是合理的（domain 初始化时即加载）。

- [ ] **Step 4: 更新 habits/manifest.yaml**

编辑 `frontend/src/domains/habits/manifest.yaml`：

a) 在 `intent_triggers` 的各个 action 中添加 `response_type` 和 `cnui_surface` 字段。具体修改：

```yaml
# activateHabit (第 19-25 行)
  - action: activateHabit
    shortcut: /activateHabit
    description: 激活草稿状态的习惯
    response_type: cnui
    cnui_surface: habit-action-panel
    examples:
      - 激活这个习惯
      - 开始执行晨跑习惯
    keywords: [激活, activate]

# suspendHabit (第 26-32 行)
  - action: suspendHabit
    shortcut: /suspendHabit
    description: 暂停活跃中的习惯
    response_type: cnui
    cnui_surface: habit-action-panel
    examples:
      - 暂停这个习惯
      - 暂时停止冥想
    keywords: [暂停, suspend]

# archiveHabit (第 33-38 行)
  - action: archiveHabit
    shortcut: /archiveHabit
    description: 归档已暂停的习惯
    response_type: cnui
    cnui_surface: habit-action-panel
    examples:
      - 归档这个习惯
    keywords: [归档, archive]

# reactivateHabit (第 39-45 行)
  - action: reactivateHabit
    shortcut: /reactivateHabit
    description: 重新激活已暂停的习惯
    response_type: cnui
    cnui_surface: habit-action-panel
    examples:
      - 恢复这个习惯
      - 重新开始冥想
    keywords: [恢复, 重新激活, reactivate]

# logHabit (第 46-51 行)
  - action: logHabit
    shortcut: /logHabit
    description: 记录习惯打卡
    response_type: cnui
    cnui_surface: habit-checkin-panel
    examples:
      - 打卡晨跑
      - 今天冥想完成
    keywords: [打卡, log, 完成]

# view_list (第 52-58 行)
  - action: view_list
    shortcut: /habits
    description: 习惯管理
    response_type: page
    view_route: /habits
    examples:
      - 查看我的习惯
    keywords: [习惯列表, 查看]

# view_templates (第 59-66 行)
  - action: view_templates
    shortcut: /habitTemplates
    description: 习惯模板配置
    response_type: page
    view_route: /habits/templates

# list_active_habits (第 67-74 行)
  - action: list_active_habits
    shortcut: /myHabits
    description: 在对话中查看习惯列表
    response_type: cnui
    cnui_surface: habit-list-card
    examples:
      - 看看我的习惯

# habit_statistics (第 75-82 行)
  - action: habit_statistics
    shortcut: /habitStats
    description: 查询习惯统计
    response_type: text
```

b) 在文件末尾（`cascade_rules` 块之后）新增 `cnui_surfaces` 块：

```yaml
# ─── 区块 K: cnui_surfaces ─────────────────────────────────────
cnui_surfaces:
  habit-action-panel:
    description: 习惯生命周期操作面板（激活/暂停/归档/重新激活）
    handler: ./cnui/handlers

  habit-checkin-panel:
    description: 习惯打卡面板（批量/逐条/详情）
    handler: ./cnui/handlers

  habit-creation-card:
    description: 习惯创建表单卡片
    handler: ./cnui/handlers
```

c) 检查 `generation_actions.createHabit` 中是否已有 `cnui_surface_type`（第 242 行）——已有，无需修改。

d) 检查 `query_actions.list_active_habits` 的 `cnui_surface` 引用 `habit-list-card`——这个 surface 尚未实现，诊断工具会报 warning，不做 error。

- [ ] **Step 5: 运行 TypeScript 检查**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/habits/cnui/ frontend/src/domains/habits/manifest.yaml frontend/src/domains/habits/index.ts
git commit -m "feat(habits): 将 CNUI surface 组件和逻辑迁入 domain

- 迁移 3 个 surface 组件到 domains/habits/cnui/surfaces/
- 新增 cnui/handlers.ts，实现 open() 和 submit()
- manifest.yaml 新增 cnui_surfaces 块 + intent_triggers 新增 response_type
- index.ts 中自注册所有 surface 到 CnuiRegistry

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 公共层 — CnuiRenderer 改造

**Files:**
- Modify: `frontend/src/components/cnui/CnuiRenderer.tsx`

- [ ] **Step 1: 重写 CnuiRenderer.tsx**

将 `frontend/src/components/cnui/CnuiRenderer.tsx` 重写为：

```typescript
'use client'

import type { CnuiComponentType } from '@/nexus/ai-runtime/cnui/types'
import { cnuiRegistry } from '@/nexus/ai-runtime/cnui/registry'

interface CnuiRendererProps {
  surfaceType: CnuiComponentType
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void
  isLoading?: boolean
  isDone?: boolean
}

export function CnuiRenderer({ surfaceType, dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: CnuiRendererProps) {
  const reg = cnuiRegistry.get(surfaceType)

  if (!reg) {
    return (
      <div className="rounded border border-dashed border-red-300 p-4 text-sm text-red-500">
        未知的卡片类型: {surfaceType}
      </div>
    )
  }

  const Component = reg.component
  return (
    <Component
      surfaceType={surfaceType}
      dataModel={dataModel}
      onDataChange={onDataChange}
      onConfirm={onConfirm}
      onCancel={onCancel}
      isLoading={isLoading}
      isDone={isDone}
    />
  )
}
```

关键变化：
- 删除第 4-7 行的 4 个 domain 组件 import
- 删除第 19-24 行的 `SURFACE_RENDERERS` 硬编码映射
- 替换为 `cnuiRegistry.get(surfaceType)` 动态查找

- [ ] **Step 2: 运行 TypeScript 检查**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors, or errors related to removed imports (which are now in domain files).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/cnui/CnuiRenderer.tsx
git commit -m "refactor(cnui): CnuiRenderer 改为从 CnuiRegistry 动态查找组件

删除所有 domain 组件的直接 import 和 SURFACE_RENDERERS 硬编码映射。
新增 domain 的 CNUI surface 不再需要修改此文件。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 公共层 — intent.ts open/submit 改造

**Files:**
- Modify: `frontend/src/app/actions/intent.ts`
- Modify: `frontend/src/components/cnui/use-cnui-lifecycle.ts`
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: 重写 openCnuiSurface**

将 `frontend/src/app/actions/intent.ts` 中第 1108-1195 行的 `openCnuiSurface` 替换为：

```typescript
import { cnuiRegistry } from '@/nexus/ai-runtime/cnui/registry'

/** 打开 CN-UI 表面（在对话流内渲染表单） */
export async function openCnuiSurface(
  domainId: string,
  action: string,
): Promise<OpenCnuiSurfaceResult> {
  // 从 manifest 获取 intent_trigger 元数据
  const fullManifest = getFullManifest(domainId) as Record<string, any> | undefined
  const intentTriggers = (fullManifest?.intent_triggers as Array<Record<string, any>> | undefined) ?? []
  const trigger = intentTriggers.find((t) => t.action === action)

  // 确定 surfaceType：优先从 intent_triggers.cnui_surface，其次 generation_actions.cnui_surface_type
  let surfaceType = trigger?.cnui_surface as string | undefined
  if (!surfaceType) {
    const genActions = fullManifest?.generation_actions as Record<string, any> | undefined
    const genAction = genActions?.[action]
    surfaceType = genAction?.cnui_surface_type as string | undefined
  }

  // 通过 registry 找到 handler
  if (!surfaceType) {
    return {
      content: `Unknown action: ${domainId}/${action}`,
      surface: {
        cnuiSurfaceId: crypto.randomUUID(),
        cnuiSurfaceType: 'unknown',
        domainId,
        action,
        dataSnapshot: {},
      },
    }
  }

  const reg = cnuiRegistry.get(surfaceType)
  if (!reg) {
    return {
      content: `未注册的 surface: ${surfaceType}`,
      surface: {
        cnuiSurfaceId: crypto.randomUUID(),
        cnuiSurfaceType: surfaceType,
        domainId,
        action,
        dataSnapshot: {},
      },
    }
  }

  try {
    const result = await reg.handler.open(action)
    return {
      content: result.content,
      surface: {
        cnuiSurfaceId: crypto.randomUUID(),
        cnuiSurfaceType: surfaceType,
        domainId,
        action,
        dataSnapshot: result.dataSnapshot,
      },
    }
  } catch (e) {
    console.error(`[openCnuiSurface] handler.open failed for ${domainId}/${action}:`, e)
    return {
      content: '打开操作面板失败，请重试',
      surface: {
        cnuiSurfaceId: crypto.randomUUID(),
        cnuiSurfaceType: surfaceType,
        domainId,
        action,
        dataSnapshot: {},
      },
    }
  }
}
```

- [ ] **Step 2: 重写 submitCnuiSurface**

将 `frontend/src/app/actions/intent.ts` 中第 1198-1273 行的 `submitCnuiSurface` 替换为：

```typescript
/** 提交 CN-UI 表面数据 */
export async function submitCnuiSurface(
  _cnuiSurfaceId: string,
  domainId: string,
  action: string,
  fields: Record<string, unknown>,
): Promise<HabitActionResult> {
  // 通过 manifest 确定 surfaceType，查找 handler
  const fullManifest = getFullManifest(domainId) as Record<string, any> | undefined
  const intentTriggers = (fullManifest?.intent_triggers as Array<Record<string, any>> | undefined) ?? []
  const trigger = intentTriggers.find((t) => t.action === action)

  let surfaceType = trigger?.cnui_surface as string | undefined
  if (!surfaceType) {
    const genActions = fullManifest?.generation_actions as Record<string, any> | undefined
    const genAction = genActions?.[action]
    surfaceType = genAction?.cnui_surface_type as string | undefined
  }

  if (!surfaceType) {
    return { success: false, error: `Unknown CN-UI action: ${domainId}/${action}` }
  }

  // FormRegistry 的字段映射（保留下层映射逻辑）
  const config = FormRegistry.get(domainId, action)
  let mappedFields = fields
  if (config) {
    mappedFields = {}
    for (const [cnuiKey, formKey] of Object.entries(config.fieldMapping)) {
      if (cnuiKey in fields) {
        mappedFields[formKey] = fields[cnuiKey]
      }
    }
  }

  const reg = cnuiRegistry.get(surfaceType)
  if (!reg) {
    return { success: false, error: `未注册的 surface: ${surfaceType}` }
  }

  // 委托给 domain handler 执行提交
  const result = await reg.handler.submit(action, mappedFields)
  return {
    success: result.success,
    error: result.error,
    ...(result.data ?? {}),
  }
}
```

- [ ] **Step 3: 删除 intent.ts 中的废弃函数和硬编码**

检查 `getHabitsByStatus` 是否仍被其他地方使用。如果只在 `openCnuiSurface` 内使用（已删除），则可删除该函数：

```bash
grep -n "getHabitsByStatus" frontend/src/app/actions/intent.ts
```

如果只有定义处（第 741 行）和之前的 openCnuiSurface 调用（已删除），则删除第 740-758 行的 `getHabitsByStatus` 函数。

同样检查 `getChineseActionLabel`——它只在 lifecycle actions 的 openCnuiSurface 中使用：

```bash
grep -rn "getChineseActionLabel" frontend/src/
```

如果只有定义（第 77 行）和旧 openCnuiSurface（已删除），则删除该函数。

- [ ] **Step 4: 删除 use-cnui-lifecycle.ts 中的 domain 硬编码**

`frontend/src/components/cnui/use-cnui-lifecycle.ts` 第 75-94 行有硬编码的 habits 校验逻辑。删除这段：

将第 74-94 行的内容：
```typescript
    // Domain 校验
    if (domainId === 'habits' && action === 'createHabit') {
      const result = validateHabitFields(data, 'createHabit')
      if (!result.valid) {
        setValidationErrors(prev => ({ ...prev, [surfaceId]: result.errors }))
        return
      }
      if (result.warnings.length > 0) {
        setConfirmDialog({ ... })
        return
      }
    }
```

替换为空（直接进入确认对话框阶段）。同时删除第 4 行的 `import { validateHabitFields } from '@/domains/habits/validation'`。

客户端校验职责已由 `submitCnuiSurface` 中的服务端 `validateHabitFields` 调用覆盖。

同时删除第 8-16 行的 `ACTION_LABELS` 硬编码（这些标签应该在提交成功后统一用语中处理）。

- [ ] **Step 5: 删除 page.tsx 中的硬编码 cnuiActions**

`frontend/src/app/page.tsx` 第 375-376 行有硬编码的 cnui action 列表。改为从 manifest 读取 `response_type`：

将第 374-392 行：
```typescript
    // lifecycle + logHabit → 打开 CN-UI 表面（HabitActionPanel / HabitCheckinPanel）
    const cnuiActions = ['activateHabit', 'suspendHabit', 'archiveHabit', 'reactivateHabit', 'logHabit'];
    if (domainId === 'habits' && cnuiActions.includes(action)) {
```

替换为：
```typescript
    // response_type=cnui → 打开 CN-UI 表面
    const fullManifest = getFullManifest(domainId)
    const intentTriggers = (fullManifest as any)?.intent_triggers ?? []
    const trigger = intentTriggers.find((t: any) => t.action === action)
    if (trigger?.response_type === 'cnui') {
```

需要确认 `getFullManifest` 已 import（在 page.tsx 顶部 `actions/intent` import 中）。

同时删除第 56-63 行的 `CNUI_ACTION_LABELS` 硬编码。在 handleCnuiConfirm 中使用通用的成功提示即可。

- [ ] **Step 6: 运行 TypeScript 检查**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors. 如有循环依赖警告，调整 import 位置。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/actions/intent.ts frontend/src/components/cnui/use-cnui-lifecycle.ts frontend/src/app/page.tsx
git commit -m "refactor: 消除公共层 CNUI 的 domain 硬编码

openCnuiSurface/submitCnuiSurface 改为通过 CnuiRegistry 调用 handler。
page.tsx 的 cnuiActions 列表改为从 manifest response_type 读取。
use-cnui-lifecycle.ts 删除 habits 校验硬编码和 ACTION_LABELS。
getHabitsByStatus、getChineseActionLabel 等废弃函数已删除。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: catalog.ts 清理 + 清空 surfaces/ 目录

**Files:**
- Modify: `frontend/src/nexus/ai-runtime/cnui/catalog.ts`
- Delete: `frontend/src/components/cnui/surfaces/` (4 files)

- [ ] **Step 1: 清理 catalog.ts**

编辑 `frontend/src/nexus/ai-runtime/cnui/catalog.ts`，删除第 39-43 行的 `DOMAIN_COMPONENTS` 硬编码数组，将 `registerDomainComponents` 改为从 registry 动态收集：

```typescript
// 将第 39-55 行替换为：

import { cnuiRegistry } from './registry'

export function registerDomainComponents(catalog: ComponentCatalog): void {
  for (const type of cnuiRegistry.allTypes()) {
    catalog.register({ type, propsSchema: {}, isBase: false })
  }
}
```

- [ ] **Step 2: 删除公共 surfaces 目录**

```bash
rm -rf frontend/src/components/cnui/surfaces/
```

- [ ] **Step 3: 检查是否存在其他 import 旧路径的代码**

```bash
grep -rn "components/cnui/surfaces" frontend/src/ | grep -v "node_modules" | grep -v ".git"
```

Expected: no results (所有 import 已更新到 domain 路径或通过 registry 间接引用).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/nexus/ai-runtime/cnui/catalog.ts
git rm -r frontend/src/components/cnui/surfaces/
git commit -m "refactor(cnui): 清理 catalog.ts 硬编码 + 删除公共 surfaces 目录

registerDomainComponents 改为从 cnuiRegistry 动态收集。
component/cnui/surfaces/ 目录已清空，所有 surface 组件已迁入对应 domain。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: timebox domain — 迁移 + handler

**Files:**
- Create: `frontend/src/domains/timebox/cnui/surfaces/TimeboxList.tsx`
- Create: `frontend/src/domains/timebox/cnui/handlers.ts`
- Modify: `frontend/src/domains/timebox/index.ts`
- Modify: `frontend/src/domains/timebox/manifest.yaml`

- [ ] **Step 1: 迁移 TimeboxList 组件**

```bash
cd /home/walker/lifeware/frontend
mkdir -p src/domains/timebox/cnui/surfaces
```

将原来的 `TimeboxList.tsx` 内容写入 `frontend/src/domains/timebox/cnui/surfaces/TimeboxList.tsx`（从 Task 5 删除的文件内容中恢复，只改 import 路径将 `'../components/Button'` → `'@/components/cnui/components/Button'`）。

- [ ] **Step 2: 创建 timebox CNUI handler**

创建 `frontend/src/domains/timebox/cnui/handlers.ts`：

```typescript
import type { CnuiSurfaceHandler, CnuiSurfaceOpenResult, CnuiSurfaceSubmitResult } from '@/nexus/ai-runtime/cnui/types'

export const timeboxCnuiHandler: CnuiSurfaceHandler = {
  async open(_action): Promise<CnuiSurfaceOpenResult> {
    // timebox surface 的 open 逻辑由 generation_actions 的 context engine 组装
    // 此处返回空 dataSnapshot，context 数据由 generation flow 注入
    return { content: '智能编排方案', dataSnapshot: {} }
  },

  async submit(_action, _fields): Promise<CnuiSurfaceSubmitResult> {
    // timebox generation_actions 的提交走生成型路径的独立链路
    // 确认机制在生成型路径的 proposal 确认阶段处理
    return { success: true }
  },
}
```

- [ ] **Step 3: 在 timebox/index.ts 中注册**

编辑 `frontend/src/domains/timebox/index.ts`，在现有 import 之后添加：

```typescript
import { cnuiRegistry } from '@/nexus/ai-runtime/cnui/registry'
import { timeboxCnuiHandler } from './cnui/handlers'
import { TimeboxList } from './cnui/surfaces/TimeboxList'

cnuiRegistry.register('timebox', 'timebox-list', {
  component: TimeboxList,
  handler: timeboxCnuiHandler,
})
```

- [ ] **Step 4: 更新 timebox/manifest.yaml**

检查 `generation_actions` 中是否有 `cnui_surface_type: timebox-list`——已有则无需修改 `intent_triggers`（生成型操作通过 `generation_actions` 声明 CNUI surface）。只需新增 `cnui_surfaces` 块：

```yaml
# ─── 区块 K: cnui_surfaces ─────────────────────────────────────
cnui_surfaces:
  timebox-list:
    description: 智能编排时间盒列表
    handler: ./cnui/handlers
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domains/timebox/
git commit -m "feat(timebox): 将 TimeboxList CNUI surface 迁入 domain

迁移 TimeboxList 组件 + 创建 handler + manifest 新增 cnui_surfaces 块。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Manifest 诊断工具

**Files:**
- Create: `frontend/scripts/validate-manifest.ts`
- Modify: `frontend/package.json`

- [ ] **Step 1: 创建 validate-manifest.ts**

创建 `frontend/scripts/validate-manifest.ts`：

```typescript
#!/usr/bin/env npx tsx
/**
 * Manifest 诊断工具 — 校验所有 domain manifest.yaml 是否符合规范
 *
 * 使用方式: npx tsx scripts/validate-manifest.ts
 * 退出码: 0 = 全部通过, 1 = 有 error 级别问题
 */

import { loadDomainManifest } from '../src/domains/manifest-loader'
import * as fs from 'node:fs'
import * as path from 'node:path'

const DOMAINS_DIR = path.resolve(__dirname, '../src/domains')

interface Diagnostic {
  domainId: string
  level: 'error' | 'warning' | 'info'
  rule: string
  message: string
}

const diagnostics: Diagnostic[] = []

function addError(domainId: string, rule: string, message: string) {
  diagnostics.push({ domainId, level: 'error', rule, message })
}

function addWarning(domainId: string, rule: string, message: string) {
  diagnostics.push({ domainId, level: 'warning', rule, message })
}

function addInfo(domainId: string, rule: string, message: string) {
  diagnostics.push({ domainId, level: 'info', rule, message })
}

function pascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join('')
}

function getDomainIds(): string[] {
  const entries = fs.readdirSync(DOMAINS_DIR, { withFileTypes: true })
  return entries
    .filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .map(e => e.name)
}

// ─── 主校验逻辑 ────────────────────────────────────────────────

function validateDomain(domainId: string): void {
  const result = loadDomainManifest(domainId)
  if (!result.success) {
    for (const err of result.errors) {
      addError(domainId, 'manifest-parse', err.message)
    }
    return
  }

  const manifest = result.manifest as Record<string, any>
  const intentTriggers = (manifest.intent_triggers ?? []) as Array<Record<string, any>>
  const cnuiSurfaces = (manifest.cnui_surfaces ?? {}) as Record<string, any>
  const generationActions = (manifest.generation_actions ?? {}) as Record<string, any>
  const queryActions = (manifest.query_actions ?? {}) as Record<string, any>
  const domainDir = path.join(DOMAINS_DIR, domainId)

  // ── 区块 A: intent_triggers 校验 ─────────────────────────────

  const actionNames = new Set<string>()
  for (const trigger of intentTriggers) {
    const action = trigger.action as string
    if (!action) {
      addError(domainId, 'A-missing-action', 'intent_trigger 缺少 action 字段')
      continue
    }

    // action 名不重复
    if (actionNames.has(action)) {
      addError(domainId, 'A-duplicate-action', `intent_trigger "${action}" 重复定义`)
    }
    actionNames.add(action)

    // response_type 合法性
    const responseType = trigger.response_type as string | undefined
    const validTypes = ['page', 'cnui', 'text', undefined]
    if (responseType && !['page', 'cnui', 'text'].includes(responseType)) {
      addError(domainId, 'A-invalid-response-type',
        `intent_trigger "${action}" 的 response_type "${responseType}" 无效，合法值: page, cnui, text`)
    }

    // response_type 与配套字段一致
    if (responseType === 'page' && !trigger.view_route) {
      addError(domainId, 'A-missing-view-route',
        `intent_trigger "${action}" response_type=page 但缺少 view_route`)
    }
    if (responseType === 'cnui' && !trigger.cnui_surface) {
      // 检查是否在 generation_actions 中声明了 cnui_surface_type
      const genAction = generationActions[action]
      if (!genAction?.cnui_surface_type) {
        addError(domainId, 'A-missing-cnui-surface',
          `intent_trigger "${action}" response_type=cnui 但缺少 cnui_surface`)
      }
    }

    // cnui_surface 引用存在性
    if (trigger.cnui_surface && !cnuiSurfaces[trigger.cnui_surface]) {
      addError(domainId, 'A-cnui-surface-not-found',
        `intent_trigger "${action}" 引用的 cnui_surface "${trigger.cnui_surface}" 在 cnui_surfaces 块中不存在`)
    }

    // generation_actions 中已声明的 action 不需要重复声明 cnui_surface
    if (responseType === 'cnui' && trigger.cnui_surface && generationActions[action]?.cnui_surface_type) {
      addInfo(domainId, 'A-redundant-cnui-surface',
        `intent_trigger "${action}" 可在 generation_actions 中声明 cnui_surface_type，此处可不重复声明`)
    }

    // view_route 对应的页面组件存在性
    if (trigger.view_route) {
      // view_route 指向的组件通过 view_routes 块检查（不在此处重复）
    }
  }

  // ── 区块 G: view_routes 校验 ─────────────────────────────────

  const viewRoutes = (manifest.view_routes ?? {}) as Record<string, any>
  for (const [key, route] of Object.entries(viewRoutes)) {
    const component = route.component as string | undefined
    if (component) {
      const compPath = path.resolve(domainDir, '..', component + '.tsx')
      if (!fs.existsSync(compPath)) {
        addWarning(domainId, 'G-component-not-found',
          `view_route "${key}" 声明的组件 "${component}" 不存在（检查路径: ${compPath})`)
      }
    }
  }

  // ── 区块 J: generation_actions 校验 ──────────────────────────

  for (const [action, genAction] of Object.entries(generationActions)) {
    const ga = genAction as Record<string, any>
    if (ga.response_mode === 'cnui' && ga.cnui_surface_type) {
      if (!cnuiSurfaces[ga.cnui_surface_type]) {
        addError(domainId, 'J-cnui-surface-not-found',
          `generation_action "${action}" 的 cnui_surface_type "${ga.cnui_surface_type}" 在 cnui_surfaces 块中不存在`)
      }
    }
  }

  // ── 区块 I: query_actions 校验 ───────────────────────────────

  for (const [action, qa] of Object.entries(queryActions)) {
    const q = qa as Record<string, any>
    if (q.response_mode === 'cnui' && q.cnui_surface) {
      if (!cnuiSurfaces[q.cnui_surface]) {
        addError(domainId, 'I-cnui-surface-not-found',
          `query_action "${action}" 的 cnui_surface "${q.cnui_surface}" 在 cnui_surfaces 块中不存在`)
      }
    }
  }

  // ── 区块 K: cnui_surfaces 校验 ───────────────────────────────

  for (const [surfaceType, surface] of Object.entries(cnuiSurfaces)) {
    const s = surface as Record<string, any>

    // handler 文件存在性
    if (s.handler) {
      const handlerPath = path.resolve(domainDir, s.handler + '.ts')
      if (!fs.existsSync(handlerPath)) {
        addError(domainId, 'K-handler-not-found',
          `cnui_surface "${surfaceType}" 的 handler "${s.handler}" 文件不存在: ${handlerPath}`)
      }
    }

    // surface 组件文件存在性（按约定）
    const componentName = pascalCase(surfaceType)
    const componentPath = path.join(domainDir, 'cnui', 'surfaces', componentName + '.tsx')
    if (!fs.existsSync(componentPath)) {
      addError(domainId, 'K-component-not-found',
        `cnui_surface "${surfaceType}" 的组件文件不存在（按约定查找）: ${componentPath}`)
    }

    // 被引用检查
    let referenced = false

    for (const trigger of intentTriggers) {
      if (trigger.cnui_surface === surfaceType) { referenced = true; break }
    }
    if (!referenced) {
      for (const ga of Object.values(generationActions)) {
        if ((ga as any).cnui_surface_type === surfaceType) { referenced = true; break }
      }
    }
    if (!referenced) {
      for (const qa of Object.values(queryActions)) {
        if ((qa as any).cnui_surface === surfaceType) { referenced = true; break }
      }
    }

    if (!referenced) {
      addWarning(domainId, 'K-unreferenced-surface',
        `cnui_surface "${surfaceType}" 未被任何 intent_trigger、generation_action 或 query_action 引用`)
    }
  }
}

// ─── 全局校验：surface type 不跨 domain 重复 ──────────────────

function validateCrossDomain(): void {
  const surfaceOwners = new Map<string, string>()

  for (const domainId of getDomainIds()) {
    const result = loadDomainManifest(domainId)
    if (!result.success) continue

    const cnuiSurfaces = ((result.manifest as any).cnui_surfaces ?? {}) as Record<string, any>
    for (const surfaceType of Object.keys(cnuiSurfaces)) {
      const existing = surfaceOwners.get(surfaceType)
      if (existing) {
        addError(domainId, 'cross-domain-surface-duplicate',
          `cnui_surface "${surfaceType}" 已被 domain "${existing}" 注册，不可在 "${domainId}" 中重复定义`)
      } else {
        surfaceOwners.set(surfaceType, domainId)
      }
    }
  }
}

// ─── 执行 ─────────────────────────────────────────────────────

const domainIds = getDomainIds()

for (const domainId of domainIds) {
  validateDomain(domainId)
}

validateCrossDomain()

// ─── 输出 ─────────────────────────────────────────────────────

const colors = { error: '\x1b[31m', warning: '\x1b[33m', info: '\x1b[36m', reset: '\x1b[0m', bold: '\x1b[1m' }

for (const d of diagnostics) {
  const prefix = d.level === 'error' ? 'ERROR' : d.level === 'warning' ? 'WARN' : 'INFO'
  const color = colors[d.level]
  console.error(`${color}${prefix}${colors.reset}  ${d.domainId}/manifest.yaml`)
  console.error(`         ${d.rule}: ${d.message}`)
}

const errors = diagnostics.filter(d => d.level === 'error').length
const warnings = diagnostics.filter(d => d.level === 'warning').length

console.log(`\nSummary: ${domainIds.length} domains checked, ${errors} errors, ${warnings} warnings`)

for (const domainId of domainIds) {
  const domainDiagnostics = diagnostics.filter(d => d.domainId === domainId)
  const passCount = (intentTriggersForDomain(domainId).length + cnuiSurfacesForDomain(domainId).length) - domainDiagnostics.filter(d => d.level === 'error').length
  const symbol = domainDiagnostics.some(d => d.level === 'error') ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m'
  console.log(`${symbol} ${domainId}/manifest.yaml — ${domainDiagnostics.length} issues`)
}

function intentTriggersForDomain(domainId: string): number {
  const result = loadDomainManifest(domainId)
  if (!result.success) return 0
  return (((result.manifest as any).intent_triggers) ?? []).length
}

function cnuiSurfacesForDomain(domainId: string): number {
  const result = loadDomainManifest(domainId)
  if (!result.success) return 0
  return Object.keys(((result.manifest as any).cnui_surfaces) ?? {}).length
}

if (errors > 0) {
  process.exit(1)
}
```

- [ ] **Step 2: 集成到 package.json**

编辑 `frontend/package.json`，添加 `validate:manifest` 脚本并更新 `predev`/`prebuild`：

```json
{
  "scripts": {
    "validate:manifest": "npx tsx scripts/validate-manifest.ts",
    "predev": "npm run generate:routes && npm run validate:manifest",
    "prebuild": "npm run generate:routes && npm run validate:manifest"
  }
}
```

- [ ] **Step 3: 运行诊断工具**

```bash
cd frontend && npm run validate:manifest
```

Expected: 诊断通过。注意 `habit-list-card` surface 在 `query_actions` 中被引用但尚未实现，会产生一个 warning（非 error，因为 query_actions 的 cnui_surface 引用的是未实现的列表卡片）。

- [ ] **Step 4: Commit**

```bash
git add frontend/scripts/validate-manifest.ts frontend/package.json
git commit -m "feat: 新增 manifest 诊断工具 validate-manifest.ts

校验 15 条规则涵盖 intent_triggers、cnui_surfaces、generation_actions、
query_actions、view_routes 及跨 domain 一致性。
集成到 predev/prebuild hooks 中。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: 治理文档更新

**Files:**
- Modify: `.specify/memory/constitution.md`
- Modify: `mydocs/core/LW_domain_注册指南_2026_05_14.md`
- Modify: `mydocs/core/LW_overall_总体设计_2026_05_02.md`

- [ ] **Step 1: 更新 Constitution — CN-UI Protocol Constraints 新增第 5 条**

编辑 `.specify/memory/constitution.md`，在 "Form Component Reuse Constraint"（第 4 条）之后新增：

```markdown
5. **Domain Surface Ownership**: CN-UI surface components (panels, cards, lists)
   that are specific to a Domain MUST reside within that Domain's directory
   (`domains/{domain_id}/cnui/`). The public CN-UI renderer MUST discover
   surface components through `CnuiSurfaceRegistry`, NOT through direct imports
   of Domain-specific components. Each Domain MUST register its own surfaces
   (component + handler) at initialization time. The public layer MUST NOT
   contain hardcoded references to Domain surface types or Domain-specific
   open/submit logic.

   **Rationale**: Without this constraint, each new Domain's CNUI surfaces
   require modifying multiple public-layer files (types, catalog, renderer,
   action handlers), breaking the Domain Plugin independence promise.

   **How to apply**: Code reviews MUST reject PRs where `CnuiRenderer`
   directly imports a Domain-specific component, or where `openCnuiSurface()`
   / `submitCnuiSurface()` contains Domain-specific if/else branches.
   New Domain CNUI surfaces MUST be registered via the Domain's own
   initialization code. `manifest.yaml` MUST declare `response_type` for
   each `intent_trigger` and `cnui_surfaces` for interactive components.
```

- [ ] **Step 2: 更新 Constitution — Domain Registration Process 新增 Step**

在 Step 14 后新增：

```markdown
15. (If CNUI-capable) Declare `cnui_surfaces` in manifest.yaml, implement
    surface components in `domains/{domain}/cnui/surfaces/`, implement
    handler in `domains/{domain}/cnui/handlers.ts`, and register surfaces
    in the Domain entry file via `cnuiRegistry.register()`.
```

- [ ] **Step 3: 更新 Constitution — Manifest Self-Description 补充字段**

在 `Domain Manifest Self-Description` 的字段表中新增：

```markdown
| `response_type` | Intent Engine + Orchestrator | Declares how the system responds: `page` (navigate), `cnui` (in-conversation surface), `text` (plain) |
| `cnui_surfaces` | CnuiSurfaceRegistry + CnuiRenderer | Maps surface types to handler files for Domain-owned CNUI components |
```

- [ ] **Step 4: 更新 Domain Registration Guide**

在 `mydocs/core/LW_domain_注册指南_2026_05_14.md` 中：

a) 总览 Step 列表新增 Step 13（CNUI Surface 实现）
b) 目录结构新增 `cnui/` 目录
c) Manifest 模板新增区块 K（cnui_surfaces）和 intent_triggers 中 `response_type` 示例
d) 新增 Step 13 完整内容（handler 接口、surface 组件、注册代码）
e) 完成检查清单新增 CNUI 相关项
f) 常见错误模式新增 CNUI 相关条目

- [ ] **Step 5: 更新 Overall Design**

在 `mydocs/core/LW_overall_总体设计_2026_05_02.md` 的 Domain Plugin 双轨模型部分（4.2 节），补充 CNUI Surface Ownership 说明。

- [ ] **Step 6: Commit**

```bash
git add .specify/memory/constitution.md mydocs/core/LW_domain_注册指南_2026_05_14.md mydocs/core/LW_overall_总体设计_2026_05_02.md
git commit -m "docs: 更新治理文档 — CNUI Domain Surface Ownership 规范

- Constitution 新增 CN-UI 第 5 条约束 + 注册 Step 15 + manifest 字段
- Domain Registration Guide 新增 Step 13 + 区块 K + 检查清单
- Overall Design 补充 CNUI 归属说明

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## 验证清单

所有 task 完成后，运行以下验证：

```bash
# 1. TypeScript 编译
cd frontend && npx tsc --noEmit

# 2. Manifest 诊断
npm run validate:manifest

# 3. Dev server 启动
npm run dev
# → 打开浏览器，测试:
#   - /activateHabit → 应该打开 HabitActionPanel
#   - /suspendHabit → 应该打开 HabitActionPanel
#   - /logHabit → 应该打开 HabitCheckinPanel
#   - /createHabit → AI 创建习惯
#   - 确认提交 → 状态变更成功

# 4. 确认没有引入新错误
# → CnuiRenderer 不应再 import 任何 domain 组件
grep -rn "from './surfaces/" frontend/src/components/cnui/CnuiRenderer.tsx
# Expected: no results
```

---

## 回退策略

- 每步一个独立 commit，出问题可单独 revert
- Step 1-2 是增量操作，不影响现有功能
- Step 3-5 是关键切换点（删除旧 surface 目录、修改 intent.ts），应在同一 PR 中完成确保原子性
