# Page Thin Wrapper 重构 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 6 个手写 `app/<route>/page.tsx` 做薄成 codegen 可生成的 thin wrapper，附加代码（repo 预取、业务纯函数、容器布局、searchParams）移到 domain 下。

**Architecture:** 每个路由新增一个自包含 domain 入口组件（async server component 自拉数据 / 自带容器）；codegen 工具扩展 `kebab→PascalCase` + `export_name` + `page_props`，生成薄 page.tsx。manifest.view_routes.component 语义统一指向 domain 组件。

**Tech Stack:** Next.js 16 App Router (async server components + searchParams), React 19, TypeScript 5, vitest 4, Drizzle ORM repo, codegen 脚本 (scripts/generate-routes.ts)。

**Spec:** `docs/superpowers/specs/2026-07-13-page-thin-wrapper-refactor-design.md`

---

## 🔍 深入读码后的关键发现（超出 spec，实现时必须知道）

写计划时深读源码发现 3 个 spec 未覆盖的事实，已折入下方任务：

1. **`'server-only'` 包未安装**（`package.json` 无此依赖，src/ 无任何使用）。spec §4.2 说 server helper 用 `'server-only'` 标记——**改为纯 `lib/server/` 目录约定**，不加标记、不装包。理由：入口组件本身是 async server component，边界已天然隔离；加包为单行守卫不值。helper 就是无标记的 async 函数。

2. **codegen 的 `extractComponentName` 假设「文件名==导出名」**。habits/okrs-pages/tasks 用 PascalCase 文件名所以现状能跑；但 timebox 域用 **kebab 文件名 + PascalCase 导出**（`timeboxes-workspace.tsx` 导出 `TimeboxesWorkspace`）。直接把 manifest 指向 kebab 文件会生成 `import { timeboxes-workspace }` 非法标识符。**Task 7 必须把 `extractComponentName` 改成 kebab→PascalCase**。已 PascalCase 的名字（无 `-`）不受影响。

3. **okrs 的 `OKRWorkspace` 是缩写**，kebab→PascalCase 算出 `OkrWorkspace` ≠ 实际导出 `OKRWorkspace`。manifest 新增**可选 `export_name` 字段**作为通用逃生口（codegen 优先用 `export_name`，否则回退 kebab→PascalCase）。这是 spec §3.2 之外新增的一个可选字段。

---

## Global Constraints

- 所有代码/注释/文档用**简体中文**（CLAUDE.md 语言规范）。
- 每个 TS/TSX 新文件必须有 `/** @file ... @brief ... */` 文件头（CLAUDE.md 注释规范）。
- 颜色用 CSS 变量令牌，禁 Tailwind 默认颜色类（UI-DESIGN-SPEC）。
- 仓库隔离 R-01：domain 不直调 repo——通过 `lib/server/load-*.ts` 调 repo（已遵循）。
- vitest 必须在 `frontend` cwd 跑（`@/` 映射）。
- tsc 双验证（vitest 不做类型检查）。
- 任何中间提交保持可运行（迁移顺序：domain 先 → manifest → codegen → 接管）。
- 合并纪律：可 commit/push，**严禁自行 merge**。

---

## File Structure

### 新建文件（domain）

| 文件 | 职责 |
|---|---|
| `domains/timebox/lib/appointment-window.ts` | 纯函数 ±90 天窗口 |
| `domains/timebox/lib/__tests__/appointment-window.test.ts` | 纯函数单测 |
| `domains/timebox/lib/server/load-activity-archetypes.ts` | server 预取 archetype |
| `domains/timebox/lib/server/load-templates.ts` | server 预取 template |
| `domains/timebox/lib/server/load-appointments.ts` | server 预取 appointment |
| `domains/timebox/config/activity-archetypes-page.tsx` | archetype 配置页入口 |
| `domains/timebox/config/archetype-table.tsx` | 从 `app/config/` 搬入（被 settings 共享） |
| `domains/timebox/components/timebox-templates-page.tsx` | 模板配置页入口 |
| `domains/timebox/components/appointment-page.tsx` | 约定页入口 |

### 修改文件

| 文件 | 改动 |
|---|---|
| `domains/okrs/components/okr-workspace.tsx` | standalone 分支 `h-full`→`h-screen` |
| `domains/timebox/components/timeboxes-workspace.tsx` | root `flex h-full`→`flex h-screen` |
| `domains/timebox/components/appointment-workspace.tsx` | root `flex h-full`→`flex h-screen` |
| `components/settings/settings-page.tsx` | archetype-table import 路径更新 |
| `domains/timebox/manifest.yaml` | 4 个 view_route.component 改指向 domain |
| `domains/okrs/manifest.yaml` | okrs view_route 改路径 + export_name + page_props |
| `domains/manifest-loader/schema.ts` | ViewRouteSchema 加 export_name + page_props |
| `scripts/generate-routes.ts` | extractComponentName kebab→PascalCase + export_name + page_props async 生成 + main() 守卫 + 导出供测试 |
| `scripts/__tests__/generate-routes.test.ts` | 新建 codegen 单测 |

### 删除/搬移

| 操作 | 文件 |
|---|---|
| git mv | `app/config/activity-archetypes/archetype-table.tsx` → `domains/timebox/config/archetype-table.tsx` |

### codegen 接管后（Task 8）6 个 page.tsx 退化

| 路由 | 接管后内容 |
|---|---|
| `app/tasks/page.tsx` | `<TaskTreePage />` |
| `app/okrs/page.tsx` | async + searchParams → `<OKRWorkspace standalone initialDetailId={sp.detail} />` |
| `app/timeboxes/page.tsx` | `<TimeboxesWorkspace />` |
| `app/timebox-templates/page.tsx` | `<TimeboxTemplatesPage />` |
| `app/config/activity-archetypes/page.tsx` | `<ActivityArchetypesPage />` |
| `app/appointments/page.tsx` | `<AppointmentPage />` |

---

## Task 1: appointment-window 纯函数 + 单测

**Files:**
- Create: `frontend/src/domains/timebox/lib/appointment-window.ts`
- Test: `frontend/src/domains/timebox/lib/__tests__/appointment-window.test.ts`

**Interfaces:**
- Produces: `getAppointmentPageWindow(now?: Date): { start: string; end: string }`（ISO UTC string，±90 天）

- [ ] **Step 1: 写失败测试**

Create `frontend/src/domains/timebox/lib/__tests__/appointment-window.test.ts`:

```ts
/**
 * @file appointment-window.test
 * @brief ±90 天查询窗口纯函数测试
 */
import { describe, it, expect } from 'vitest'
import {
  getAppointmentPageWindow,
  APPOINTMENT_PAGE_WINDOW_DAYS,
} from '../appointment-window'

describe('getAppointmentPageWindow', () => {
  it('返回 ±90 天窗口，start/end 与基准差恰好 90 天', () => {
    const now = new Date('2026-07-13T12:00:00.000Z')
    const { start, end } = getAppointmentPageWindow(now)
    const dayMs = 24 * 60 * 60 * 1000
    const nowMs = now.getTime()
    expect(new Date(start).getTime()).toBe(nowMs - APPOINTMENT_PAGE_WINDOW_DAYS * dayMs)
    expect(new Date(end).getTime()).toBe(nowMs + APPOINTMENT_PAGE_WINDOW_DAYS * dayMs)
  })

  it('返回值为合法 ISO 字符串（可被 new Date 解析）', () => {
    const { start, end } = getAppointmentPageWindow(new Date('2026-01-01T00:00:00.000Z'))
    expect(new Date(start).getTime()).not.toBeNaN()
    expect(new Date(end).getTime()).not.toBeNaN()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/domains/timebox/lib/__tests__/appointment-window.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写最小实现**

Create `frontend/src/domains/timebox/lib/appointment-window.ts`:

```ts
/**
 * @file appointment-window
 * @brief 约定页面查询窗口纯函数（±90 天）
 *
 * 从 app/appointments/page.tsx 抽出。page 退化为 thin wrapper 后由
 * domains/timebox/lib/server/load-appointments.ts 调用。
 * 纯函数：不 IO，可跨 client/server 使用，测试可注入 now。
 */

/** 约定页面默认查询窗口半宽（天）：过去 N 天 + 未来 N 天 */
export const APPOINTMENT_PAGE_WINDOW_DAYS = 90

/**
 * 计算约定页面查询窗口（±90 天），返回 ISO string。
 *
 * 与 AppointmentWorkspace reload 窗口一致（[026.02] T10：7→90 扩窗），
 * 避免 page 首载与 workspace reload 窗口不一致导致数据闪失。
 *
 * @param now - 基准时间，默认 new Date()；测试应注入固定值
 * @returns { start, end } ISO 8601 UTC 字符串
 */
export function getAppointmentPageWindow(now: Date = new Date()): {
  start: string
  end: string
} {
  const start = new Date(now)
  start.setDate(start.getDate() - APPOINTMENT_PAGE_WINDOW_DAYS)
  const end = new Date(now)
  end.setDate(end.getDate() + APPOINTMENT_PAGE_WINDOW_DAYS)
  return { start: start.toISOString(), end: end.toISOString() }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/domains/timebox/lib/__tests__/appointment-window.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/domains/timebox/lib/appointment-window.ts src/domains/timebox/lib/__tests__/appointment-window.test.ts
git commit -m "feat(timebox): [page-thin] T1 appointment-window ±90 天纯函数 + 单测"
```

---

## Task 2: activity-archetypes domain 入口（搬 archetype-table + helper + 入口组件）

**Files:**
- git mv: `frontend/src/app/config/activity-archetypes/archetype-table.tsx` → `frontend/src/domains/timebox/config/archetype-table.tsx`
- Modify: `frontend/src/components/settings/settings-page.tsx`（archetype-table import 路径）
- Create: `frontend/src/domains/timebox/lib/server/load-activity-archetypes.ts`
- Create: `frontend/src/domains/timebox/config/activity-archetypes-page.tsx`

**Interfaces:**
- Consumes: `ActivityArchetypeRepository.findByUser(userId)` → `ActivityArchetype[]`（已存在，`activity-archetype.repository.ts:51`）；`ArchetypeTable({ initialData })`（搬移后导出名不变）
- Produces: `ActivityArchetypesPage`（async server component，manifest Task 6 指向它）

**背景**：`ArchetypeTable` 当前在 `app/config/`，被 `app/config/.../page.tsx` 和 `components/settings/settings-page.tsx` 共享引用。搬到 domain 后两个 consumer 都从 domain import（app→domain 是正确依赖方向）。

- [ ] **Step 1: git mv archetype-table 到 domain**

```bash
cd frontend
git mv src/app/config/activity-archetypes/archetype-table.tsx src/domains/timebox/config/archetype-table.tsx
```

- [ ] **Step 2: 更新 settings-page.tsx 的 import 路径**

Find the line in `frontend/src/components/settings/settings-page.tsx` importing archetype-table (relative or `@/app/config/...`). Replace with:

```ts
import { ArchetypeTable } from '@/domains/timebox/config/archetype-table'
```

（先 grep 确认原 import 写法，再精确替换。grep: `grep -n "archetype-table" src/components/settings/settings-page.tsx`）

- [ ] **Step 3: 创建 server helper**

Create `frontend/src/domains/timebox/lib/server/load-activity-archetypes.ts`:

```ts
/**
 * @file load-activity-archetypes
 * @brief 服务端预取 Activity Archetype（lib/server 目录约定：仅 server 调用）
 *
 * 从 app/config/activity-archetypes/page.tsx 抽出。page 退化为 thin wrapper 后
 * 由 domains/timebox/config/activity-archetypes-page.tsx 调用。
 * 不加 'server-only' 标记——入口组件本身是 async server component，边界已隔离。
 */
import { ActivityArchetypeRepository } from '@/lib/db/repositories/activity-archetype.repository'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

/** MVP 固定用户 ID（与 app/actions 现状一致，待多租户落地替换） */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/**
 * 预取当前用户全部 archetype（按 l1Category/l2Name 排序，repo 内置）
 * @returns ActivityArchetype 列表
 */
export async function loadActivityArchetypes(): Promise<ActivityArchetype[]> {
  const repo = new ActivityArchetypeRepository()
  return repo.findByUser(MVP_USER_ID)
}
```

- [ ] **Step 4: 创建 domain 入口组件**

Create `frontend/src/domains/timebox/config/activity-archetypes-page.tsx`:

```tsx
/**
 * @file activity-archetypes-page
 * @brief Activity Archetype 配置页 domain 入口（async server component）
 *
 * 从 app/config/activity-archetypes/page.tsx 抽出：server 预取 + 渲染 ArchetypeTable。
 * page 退化为 thin wrapper 后由 codegen 生成 <ActivityArchetypesPage />。
 * D4：类型归 USOM，运行时数据归 DB。不走 SM（OQ-7）。
 */
import { loadActivityArchetypes } from '@/domains/timebox/lib/server/load-activity-archetypes'
import { ArchetypeTable } from './archetype-table'

export async function ActivityArchetypesPage() {
  const archetypes = await loadActivityArchetypes()
  return (
    <div className="space-y-4">
      <ArchetypeTable initialData={archetypes} />
    </div>
  )
}
```

- [ ] **Step 5: tsc 验证 import 接线无误**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "archetype-table|activity-archetypes-page|settings-page" || echo "0 hits"`
Expected: `0 hits`（无新增错误。baseline tsc 错误总数不增）

- [ ] **Step 6: Commit**

```bash
cd frontend
git add -A src/domains/timebox/config/ src/domains/timebox/lib/server/load-activity-archetypes.ts src/components/settings/settings-page.tsx
# 确认 archetype-table 的 rename 被 git 识别（非删+增）
git status
git commit -m "refactor(timebox): [page-thin] T2 archetype-table 搬入 domain + 预取 helper + 入口组件"
```

---

## Task 3: timebox-templates domain 入口（helper + 入口组件）

**Files:**
- Create: `frontend/src/domains/timebox/lib/server/load-templates.ts`
- Create: `frontend/src/domains/timebox/components/timebox-templates-page.tsx`

**Interfaces:**
- Consumes: `TimeboxTemplateRepository.findByUser(userId)` → `TimeboxTemplate[]`（已存在，`timebox-template.ts:64`）；`TimeboxTemplateEditor({ initialTemplates })`（已在 domain，`components/timebox-template-editor.tsx`）
- Produces: `TimeboxTemplatesPage`（async server component）

- [ ] **Step 1: 创建 server helper**

Create `frontend/src/domains/timebox/lib/server/load-templates.ts`:

```ts
/**
 * @file load-templates
 * @brief 服务端预取 TimeboxTemplate（lib/server 目录约定：仅 server 调用）
 *
 * 从 app/timebox-templates/page.tsx 抽出。
 */
import { TimeboxTemplateRepository } from '@/lib/db/repositories/timebox-template'
import type { TimeboxTemplate } from '@/lib/db/repositories/timebox-template'

/** MVP 固定用户 ID（与 app/actions 现状一致） */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/**
 * 预取当前用户全部模板（按 updatedAt 排序，repo 内置）
 * @returns TimeboxTemplate 列表
 */
export async function loadTimeboxTemplates(): Promise<TimeboxTemplate[]> {
  const repo = new TimeboxTemplateRepository()
  return repo.findByUser(MVP_USER_ID)
}
```

- [ ] **Step 2: 创建 domain 入口组件**

Create `frontend/src/domains/timebox/components/timebox-templates-page.tsx`:

```tsx
/**
 * @file timebox-templates-page
 * @brief 时间盒模板配置页 domain 入口（async server component，[023-02] 行列表 + 模板级星期）
 *
 * 从 app/timebox-templates/page.tsx 抽出。容器用 min-h-full（[023-02] Task 10.2）：
 * 避免内部 PageBanner + 网格的 flex stretch 链把 h-screen 的 100vh 撑死。
 * 订阅源由编辑器懒加载，避免 page 耦合多域 repo。
 */
import { loadTimeboxTemplates } from '@/domains/timebox/lib/server/load-templates'
import { TimeboxTemplateEditor } from '@/domains/timebox/components/timebox-template-editor'

export async function TimeboxTemplatesPage() {
  const templates = await loadTimeboxTemplates()
  return (
    <div className="min-h-full flex flex-col">
      <TimeboxTemplateEditor initialTemplates={templates} />
    </div>
  )
}
```

- [ ] **Step 3: tsc 验证**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "load-templates|timebox-templates-page" || echo "0 hits"`
Expected: `0 hits`

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/domains/timebox/lib/server/load-templates.ts src/domains/timebox/components/timebox-templates-page.tsx
git commit -m "feat(timebox): [page-thin] T3 timebox-templates domain 入口 + 预取 helper"
```

---

## Task 4: appointment domain 入口（helper + 入口组件）

**依赖 Task 1**（load-appointments 调 getAppointmentPageWindow）。

**Files:**
- Create: `frontend/src/domains/timebox/lib/server/load-appointments.ts`
- Create: `frontend/src/domains/timebox/components/appointment-page.tsx`

**Interfaces:**
- Consumes: `getAppointmentPageWindow()`（Task 1 产出）；`getAppointmentsByRange(start: string, end: string)` → `AppointmentSummary[]`（`app/actions/intent.ts:870`，内部用 MVP_USER_ID）；`AppointmentWorkspace({ initialItems })`（已在 domain，client 组件，`components/appointment-workspace.tsx:91`）
- Produces: `AppointmentPage`（async server component）

- [ ] **Step 1: 创建 server helper**

Create `frontend/src/domains/timebox/lib/server/load-appointments.ts`:

```ts
/**
 * @file load-appointments
 * @brief 服务端预取约定列表（lib/server 目录约定：仅 server 调用）
 *
 * 查询窗口来自 appointment-window 纯函数（±90 天，与 AppointmentWorkspace reload 一致）。
 * 从 app/appointments/page.tsx 抽出。
 */
import { getAppointmentsByRange } from '@/app/actions/intent'
import { getAppointmentPageWindow } from '@/domains/timebox/lib/appointment-window'
import type { AppointmentSummary } from '@/usom/types/summaries'

/**
 * 预取约定页面 ±90 天窗口数据
 * @returns AppointmentSummary 列表（startTime 为 ISO string，跨 RSC boundary 安全）
 */
export async function loadAppointmentsForPage(): Promise<AppointmentSummary[]> {
  const { start, end } = getAppointmentPageWindow()
  return getAppointmentsByRange(start, end)
}
```

- [ ] **Step 2: 创建 domain 入口组件**

Create `frontend/src/domains/timebox/components/appointment-page.tsx`:

```tsx
/**
 * @file appointment-page
 * @brief 约定管理页 domain 入口（async server component）
 *
 * 从 app/appointments/page.tsx 抽出：server 预取 ±90 天约定 → 传 AppointmentWorkspace。
 * h-screen 容器已搬入 AppointmentWorkspace root（Task 5）。
 * [TD-039] 跨 RSC boundary 传 AppointmentSummary（startTime 为 ISO string，非 Date）。
 * [023.12] T5：3 态收敛后无 reconcile 写库——显示状态 badge 由客户端读时派生。
 */
import { loadAppointmentsForPage } from '@/domains/timebox/lib/server/load-appointments'
import { AppointmentWorkspace } from '@/domains/timebox/components/appointment-workspace'

export async function AppointmentPage() {
  const items = await loadAppointmentsForPage()
  return <AppointmentWorkspace initialItems={items} />
}
```

- [ ] **Step 3: tsc 验证**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "load-appointments|appointment-page" || echo "0 hits"`
Expected: `0 hits`

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/domains/timebox/lib/server/load-appointments.ts src/domains/timebox/components/appointment-page.tsx
git commit -m "feat(timebox): [page-thin] T4 appointment domain 入口 + 预取 helper"
```

---

## Task 5: 3 个 workspace 容器搬入（h-screen 自包含）

**Files:**
- Modify: `frontend/src/domains/okrs/components/okr-workspace.tsx`（line 221 standalone 分支）
- Modify: `frontend/src/domains/timebox/components/timeboxes-workspace.tsx`（line 583 root div）
- Modify: `frontend/src/domains/timebox/components/appointment-workspace.tsx`（line 241 root div）

**背景**：当前 page.tsx 用 `<div className="h-screen flex flex-col">` 给 workspace 的 `h-full` 提供高度天花板。搬入后 workspace 自带 `h-screen`，page 退化成裸渲染。**双重 h-screen 期（Task 5 后、Task 8 前）视觉无变化**——`h-screen`=100vh 是视口相对，嵌套两层 100vh 等价一层。

- [ ] **Step 1: OKRWorkspace standalone 分支 h-full → h-screen**

`okr-workspace.tsx` line 221。**只改 standalone 分支**，embedded 分支（AppShell 用）保持 `absolute inset-0`：

旧：
```tsx
<div className={`${standalone ? "h-full flex flex-col" : "absolute inset-0 flex flex-col"}`}>
```
新：
```tsx
<div className={`${standalone ? "h-screen flex flex-col" : "absolute inset-0 flex flex-col"}`}>
```

- [ ] **Step 2: TimeboxesWorkspace root h-full → h-screen**

`timeboxes-workspace.tsx` line 583。旧：
```tsx
<div className="flex h-full">
```
新：
```tsx
<div className="flex h-screen">
```

- [ ] **Step 3: AppointmentWorkspace root h-full → h-screen**

`appointment-workspace.tsx` line 241。旧：
```tsx
<div className="flex h-full">
```
新：
```tsx
<div className="flex h-screen">
```

- [ ] **Step 4: dev server smoke（双重 h-screen 期确认无视觉破坏）**

Run: `cd frontend && npm run dev`（后台），等编译完成。
Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/timeboxes` → 期望 `200`。
同理 /appointments、/okrs 各 200。
停 dev server。

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/domains/okrs/components/okr-workspace.tsx src/domains/timebox/components/timeboxes-workspace.tsx src/domains/timebox/components/appointment-workspace.tsx
git commit -m "refactor: [page-thin] T5 三个 workspace 容器自包含（h-screen 搬入组件）"
```

---

## Task 6: manifest 校准（5 处 view_route + ViewRouteSchema 扩展）

**Files:**
- Modify: `frontend/src/domains/timebox/manifest.yaml`（4 个 view_route.component）
- Modify: `frontend/src/domains/okrs/manifest.yaml`（okrs view_route 改路径 + export_name + page_props）
- Modify: `frontend/src/domains/manifest-loader/schema.ts`（ViewRouteSchema 加 export_name + page_props）

**背景**：当前 4 处 component 错误指向 `app/<route>/page`（循环 import）。改为指向 Task 2-4 新建的 domain 入口 + 已有 workspace。okrs 加 export_name（OKRWorkspace 缩写）+ page_props（standalone + initialDetailId 透传）。

- [ ] **Step 1: timebox manifest 4 处 component 改指向 domain**

`frontend/src/domains/timebox/manifest.yaml` 的 `view_routes` 块整体替换为：

```yaml
view_routes:
  viewTimeboxes:
    component: domains/timebox/components/timeboxes-workspace
    url: /timeboxes
  configTimeboxTemplates:
    component: domains/timebox/components/timebox-templates-page
    url: /timebox-templates
  config_activity_archetypes:
    component: domains/timebox/config/activity-archetypes-page
    url: /config/activity-archetypes
  # [026] A1.5 + [023.05] PR2 阶段 2: 约定管理页
  viewAppointments:
    component: domains/timebox/components/appointment-page
    url: /appointments
```

（删除上方旧的「仅列真页面跳转」注释中关于 `app/<route>/page` 的描述，改成「component 统一指向 domain 入口组件」）

- [ ] **Step 2: okrs manifest okrs view_route 改路径 + export_name + page_props**

`frontend/src/domains/okrs/manifest.yaml` 区块 G（上一轮清理后剩 okrs 一条）。替换：

```yaml
view_routes:
  okrs:
    component: domains/okrs/components/okr-workspace
    # export_name：kebab→PascalCase 算出 OkrWorkspace，实际导出是缩写 OKRWorkspace
    export_name: OKRWorkspace
    url: /okrs
    # page_props：codegen 生成 async server page，透传 standalone + searchParams.detail
    page_props:
      standalone: true
      initialDetailId: { from: searchParams, key: detail }
```

（保留下方关于 required_fields 与 view_route 边界的注释块）

- [ ] **Step 3: ViewRouteSchema 加 export_name + page_props**

`frontend/src/domains/manifest-loader/schema.ts` line 116-121。旧：
```ts
const ViewRouteSchema = z.object({
  /** 组件路径 */
  component: z.string(),
  /** 路由参数 */
  params: z.record(z.string(), z.unknown()).optional(),
})
```
新：
```ts
const ViewRouteSchema = z.object({
  /** 组件路径（统一指向 domain 入口组件，禁止 app/<route>/page） */
  component: z.string(),
  /** 路由参数 */
  params: z.record(z.string(), z.unknown()).optional(),
  /** 导出名覆盖（当 kebab→PascalCase 与实际导出不符时，如缩写 OKRWorkspace） */
  export_name: z.string().optional(),
  /** page.tsx 透传 props（codegen 用；支持字面值或 { from: searchParams, key }） */
  page_props: z.record(z.string(), z.unknown()).optional(),
})
```

- [ ] **Step 4: manifest 校验通过**

Run: `cd frontend && npm run generate:routes 2>&1 | head -15`
Expected:
- timebox/okrs 的 view route 显示 `✓ ... (component exists)`（component 文件都存在）
- 仍显示 6 条 `⚠️ Skipping ... not auto-generated`（page.tsx 还没接管，Task 8 才接管）—— 这是预期的，本任务不改 page.tsx

Run: `cd frontend && npx tsx scripts/validate-manifest.ts 2>&1 | tail -5`（确认 loader 不因 page_props 报 schema 错）

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/domains/timebox/manifest.yaml src/domains/okrs/manifest.yaml src/domains/manifest-loader/schema.ts
git commit -m "chore(manifest): [page-thin] T6 view_route 统一指向 domain + export_name/page_props schema"
```

---

## Task 7: codegen 工具扩展（kebab→PascalCase + export_name + page_props）+ 单测

**Files:**
- Modify: `frontend/scripts/generate-routes.ts`
- Test: `frontend/scripts/__tests__/generate-routes.test.ts`

**Interfaces:**
- Produces: 导出 `generateRouteFileContent(route)` + `extractComponentName(path)` 供测试；`RouteEntry` 加 `exportName?` + `pageProps?`；`ViewRouteConfig` 加同名字段；`collectRoutes` 解析这俩字段；`generateRouteFileContent` 支持 async + searchParams 生成；`main()` 加 `require.main === module` 守卫。

- [ ] **Step 1: 写失败测试**

Create `frontend/scripts/__tests__/generate-routes.test.ts`:

```ts
/**
 * @file generate-routes.test
 * @brief codegen 工具单测（kebab→PascalCase / export_name / page_props async 生成）
 */
import { describe, it, expect } from 'vitest'
import { generateRouteFileContent, extractComponentName } from '../generate-routes'
import type { RouteEntry } from '../generate-routes'

describe('extractComponentName', () => {
  it('kebab-case 转 PascalCase', () => {
    expect(extractComponentName('domains/timebox/components/timeboxes-workspace')).toBe('TimeboxesWorkspace')
    expect(extractComponentName('domains/timebox/components/appointment-page')).toBe('AppointmentPage')
  })
  it('已 PascalCase 名字（无连字符）不受影响', () => {
    expect(extractComponentName('domains/habits/pages/HabitListPage')).toBe('HabitListPage')
  })
})

describe('generateRouteFileContent', () => {
  const base = (over: Partial<RouteEntry>): RouteEntry => ({
    domainId: 'timebox',
    action: 'view',
    component: 'domains/timebox/components/c',
    url: '/u',
    ...over,
  })

  it('默认同步模板（无 page_props）：kebab 文件名正确解析组件名', () => {
    const out = generateRouteFileContent(
      base({ component: 'domains/timebox/components/timeboxes-workspace' }),
    )
    expect(out).toContain('import { TimeboxesWorkspace } from "@/domains/timebox/components/timeboxes-workspace"')
    expect(out).toMatch(/export default function TimeboxesWorkspacePage\(\)/)
    expect(out).toContain('<TimeboxesWorkspace />')
  })

  it('export_name 覆盖组件绑定名（OKRWorkspace 缩写）', () => {
    const out = generateRouteFileContent(
      base({
        component: 'domains/okrs/components/okr-workspace',
        exportName: 'OKRWorkspace',
      }),
    )
    expect(out).toContain('import { OKRWorkspace }')
    expect(out).toMatch(/export default function OKRWorkspacePage\(\)/)
    expect(out).toContain('<OKRWorkspace />')
  })

  it('page_props 含 searchParams → 生成 async + searchParams 解包', () => {
    const out = generateRouteFileContent(
      base({
        component: 'domains/okrs/components/okr-workspace',
        exportName: 'OKRWorkspace',
        pageProps: {
          standalone: true,
          initialDetailId: { from: 'searchParams', key: 'detail' },
        },
      }),
    )
    expect(out).toMatch(/export default async function OKRWorkspacePage\(/)
    expect(out).toContain('const sp = await searchParams')
    expect(out).toContain('standalone={true}')
    expect(out).toContain('initialDetailId={sp.detail}')
  })

  it('page_props 仅字面值（无 searchParams）→ 同步模板 + 字面 prop', () => {
    const out = generateRouteFileContent(
      base({
        component: 'domains/x/components/foo',
        pageProps: { mode: 'create' },
      }),
    )
    expect(out).toMatch(/export default function FooPage\(\)/)
    expect(out).toContain('mode={"create"}')
    expect(out).not.toContain('searchParams')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run scripts/__tests__/generate-routes.test.ts`
Expected: FAIL（函数未导出 / 类型缺字段）

- [ ] **Step 3: 扩展 generate-routes.ts**

对 `frontend/scripts/generate-routes.ts` 做以下改动：

**(a) ViewRouteConfig 加字段**（约 line 29-36）：

```ts
interface ViewRouteConfig {
  /** 组件路径 */
  component: string
  /** URL 路径 */
  url?: string
  /** 额外参数 */
  params?: Record<string, unknown>
  /** 导出名覆盖（kebab→PascalCase 与实际导出不符时，如 OKRWorkspace） */
  export_name?: string
  /** page.tsx 透传 props（字面值或 { from: searchParams, key }） */
  page_props?: Record<string, unknown>
}
```

**(b) RouteEntry 加字段**（约 line 51-62）：

```ts
interface RouteEntry {
  domainId: string
  action: string
  component: string
  url: string
  params?: Record<string, unknown>
  /** 导出名覆盖 */
  exportName?: string
  /** page.tsx 透传 props */
  pageProps?: Record<string, unknown>
}
```

**(c) collectRoutes 解析新字段**（约 line 177-183 的 push 处）：

```ts
routes.push({
  domainId: domain.name,
  action,
  component: route.component,
  url: route.url,
  params: route.params,
  exportName: route.export_name,
  pageProps: route.page_props,
})
```

**(d) extractComponentName 改 kebab→PascalCase + 导出**（约 line 350-354）：

```ts
/**
 * 从组件路径中提取组件名称（kebab-case → PascalCase）。
 * timebox 域用 kebab 文件名 + PascalCase 导出；已 PascalCase 的名字（无 '-'）不受影响。
 * 缩写（如 OKRWorkspace）需 manifest 显式声明 export_name 覆盖。
 */
export function extractComponentName(componentPath: string): string {
  const parts = componentPath.split('/')
  const fileName = parts[parts.length - 1].replace(/\.tsx?$/, '')
  return fileName
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
}
```

**(e) generateRouteFileContent 支持 export_name + page_props + 导出**（约 line 308-324 整体替换）：

```ts
/**
 * 生成单个路由文件的内容。
 * - 无 page_props → 同步模板
 * - page_props 仅字面值 → 同步模板 + 字面 props
 * - page_props 含 { from: searchParams } → async server component + searchParams 解包
 */
export function generateRouteFileContent(route: RouteEntry): string {
  const componentName = route.exportName ?? extractComponentName(route.component)
  const header = AUTO_GENERATED_HEADER.replace('{domain}', route.domainId).replace(
    '{timestamp}',
    new Date().toISOString(),
  )
  const imports = `import { ${componentName} } from "@/${route.component}"\n`

  const pageProps = route.pageProps
  const hasPageProps = pageProps && Object.keys(pageProps).length > 0

  // page_props 分支
  if (hasPageProps) {
    const entries = Object.entries(pageProps!)
    const needsSearchParams = entries.some(
      ([, v]) =>
        typeof v === 'object' &&
        v !== null &&
        (v as { from?: string }).from === 'searchParams',
    )

    const propsBlock = entries
      .map(([k, v]) => {
        if (
          typeof v === 'object' &&
          v !== null &&
          (v as { from?: string }).from === 'searchParams'
        ) {
          return `      ${k}={sp.${(v as { key: string }).key}}`
        }
        return `      ${k}={${JSON.stringify(v)}}`
      })
      .join('\n')

    if (needsSearchParams) {
      const body = `export default async function ${componentName}Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  return (
    <${componentName}
${propsBlock}
    />
  )
}
`
      return header + imports + body
    }

    const body = `export default function ${componentName}Page() {
  return (
    <${componentName}
${propsBlock}
    />
  )
}
`
    return header + imports + body
  }

  // 默认同步模板（保留原 params 逻辑）
  const paramsProp = route.params ? JSON.stringify(route.params, null, 2) : '{}'
  const body = route.params
    ? `export default function ${componentName}Page() {
  return <${componentName} params={${paramsProp}} />
}
`
    : `export default function ${componentName}Page() {
  return <${componentName} />
}
`
  return header + imports + body
}
```

**(f) main() 加守卫**（文件末尾「运行」段，原本直接 `main()` 调用）：

```ts
// 仅直接运行时执行（测试 import 时不触发 main）
if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
```

（找到文件末尾的裸 `main()` 调用替换之）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run scripts/__tests__/generate-routes.test.ts`
Expected: PASS（7 tests：extractComponentName ×2 + generateRouteFileContent ×4 + ...）

- [ ] **Step 5: 跑 generate:routes 确认工具仍工作**

Run: `cd frontend && npm run generate:routes 2>&1 | tail -8`
Expected: 工具正常执行（page.tsx 仍 skipped，Task 8 才接管），不报错。

- [ ] **Step 6: Commit**

```bash
cd frontend
git add scripts/generate-routes.ts scripts/__tests__/generate-routes.test.ts
git commit -m "feat(codegen): [page-thin] T7 generate-routes 支持 kebab→PascalCase + export_name + page_props"
```

---

## Task 8: --force 接管 6 个 page.tsx

**Files:**
- Modify（codegen 覆盖）: `frontend/src/app/tasks/page.tsx`
- Modify: `frontend/src/app/okrs/page.tsx`
- Modify: `frontend/src/app/timeboxes/page.tsx`
- Modify: `frontend/src/app/timebox-templates/page.tsx`
- Modify: `frontend/src/app/config/activity-archetypes/page.tsx`
- Modify: `frontend/src/app/appointments/page.tsx`

**背景**：此时 domain 入口已就绪（Task 2-4）、manifest 已校正（Task 6）、codegen 已扩展（Task 7）。`--force` 覆盖 6 个手写文件为 thin wrapper。

- [ ] **Step 1: --force 重新生成**

Run: `cd frontend && npm run generate:routes -- --force 2>&1 | tail -20`
Expected:
- 6 条 `✓ /xxx → ...`（不再是 `⚠️ Skipping`）
- `✅ Generated 8 route(s)`（含 habits 2 条 unchanged 重写）

- [ ] **Step 2: 审查 6 个生成的 page.tsx 确实是 thin wrapper**

Run: `cd frontend && for f in tasks okrs timeboxes timebox-templates config/activity-archetypes appointments; do echo "=== app/$f/page.tsx ==="; cat src/app/$f/page.tsx; done`

逐个确认：
- `app/tasks/page.tsx` → 含 `import { TaskTreePage }` + `<TaskTreePage />`
- `app/okrs/page.tsx` → 含 `import { OKRWorkspace }` + `async function` + `await searchParams` + `standalone={true}` + `initialDetailId={sp.detail}`
- `app/timeboxes/page.tsx` → `<TimeboxesWorkspace />`
- `app/timebox-templates/page.tsx` → `<TimeboxTemplatesPage />`
- `app/config/activity-archetypes/page.tsx` → `<ActivityArchetypesPage />`
- `app/appointments/page.tsx` → `<AppointmentPage />`
- 6 个都含 `// Auto-generated from domains/` 头

- [ ] **Step 3: tsc 验证生成的代码无类型错误**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "app/(tasks|okrs|timeboxes|timebox-templates|config/activity-archetypes|appointments)/page" || echo "0 hits"`
Expected: `0 hits`

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/app/tasks/page.tsx src/app/okrs/page.tsx src/app/timeboxes/page.tsx src/app/timebox-templates/page.tsx src/app/config/activity-archetypes/page.tsx src/app/appointments/page.tsx
git commit -m "refactor: [page-thin] T8 codegen 接管 6 个 page.tsx 退化为 thin wrapper"
```

---

## Task 9: 验证全闸 + 文档同步

**Files:**
- Verify: 全部新增/修改文件
- Modify: `CHANGELOG.md`、`docs/` 相关（若 manifest-rules / usom-design 涉及 view_route.component 语义）

**验证矩阵**（来自 spec §7）：

- [ ] **Step 1: vitest 全量（codegen + appointment-window + 现有测试无回归）**

Run: `cd frontend && npx vitest run 2>&1 | tail -15`
Expected:
- `scripts/__tests__/generate-routes.test.ts` PASS
- `domains/timebox/lib/__tests__/appointment-window.test.ts` PASS
- 现有 `okrs-compliance.test.ts` PASS（component 字段不再含 `app/` 前缀，反向断言仍过）
- 总失败数 ≤ baseline（用 base/head 对比，聚焦改动的文件）

- [ ] **Step 2: tsc 全量 0 新增错误**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tee /tmp/tsc-head.txt | grep -c "error TS" `
对比 baseline（重构前 `git stash` 或另开 worktree 跑同命令），确认**净增 = 0**（baseline 全是 pre-existing）。

- [ ] **Step 3: manifest 校验 0 警告**

Run: `cd frontend && npm run generate:routes 2>&1 | grep -E "⚠️|❌" || echo "0 warnings"`
Expected: `0 warnings`（6 条 `not auto-generated` 全消失；只剩 `⏭ unchanged` 和 `✓`）

- [ ] **Step 4: dev server smoke 6 路由 HTTP 200 + 0 RSC error**

Run: `cd frontend && npm run dev`（后台），等编译完成。
Run:
```bash
for r in tasks okrs timeboxes timebox-templates config/activity-archetypes appointments; do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/$r)
  echo "/$r → $code"
done
```
Expected: 6 个全 `200`。
检查 dev server 日志无 RSC 编译错误（`grep -iE "error|rsc" <dev log>`）。
停 dev server。

- [ ] **Step 5: /browse 视觉回归 3 个有 overflow 的页面（头号风险）**

用 `/browse` 截图对比重构前后：
- `/okrs`：左面板目录 overflow-y-auto 滚动条仍工作（[024.1] B5 不回归）
- `/timeboxes`：DayView 滚动正常
- `/appointments`：列表滚动正常

确认容器搬入后 flex 滚动链未破（[[project_chromium-stretch-flex-percent-height-bug]] 风险）。**若发现滚动失效**：回退 Task 5 对应文件的 h-screen，保留 page 容器，记录 TD。

- [ ] **Step 6: CHANGELOG + 文档同步**

更新 `CHANGELOG.md`（段尾登记 `[page-thin]`），更新 `docs/` 中涉及 view_route.component 语义的文档（若 `docs/manifest-rules.md` 或 usom-design 提到 component 字段指向 app/page，改为指向 domain）。

- [ ] **Step 7: 最终 commit**

```bash
cd frontend
git add CHANGELOG.md docs/
git commit -m "docs: [page-thin] T9 CHANGELOG + 文档同步（view_route.component 语义统一 domain）"
```

- [ ] **Step 8: 提 PR（不自行 merge）**

push 分支 → gitee 提 PR → 用户网页手动 merge。

---

## 风险与回退

| 风险 | 缓解 |
|---|---|
| 容器搬入破 flex 滚动链 | Task 5 Step 4 + Task 9 Step 5 双重 /browse 验证；发现即回退 Task 5 |
| codegen 模板生成非法 TS | Task 7 单测覆盖 4 种分支 + Task 8 Step 3 tsc 验证 |
| settings-page archetype import 漏改 | Task 2 Step 5 tsc grep 捕获 |
| 双重 h-screen 期视觉异常 | `h-screen`=100vh 视口相对，嵌套等价，理论上无变化；Task 5 Step 4 兜底 |
| okrs searchParams 透传错 | Task 7 page_props 单测 + Task 9 Step 5 /browse 看 `?detail=` deep link |
