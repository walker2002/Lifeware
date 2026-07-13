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

- [ ] **Step 2: 创建 domain 入口组件（route）**

> **⚠️ REVIEW 修正（D9/7A）**：文件改名 `timebox-templates-page.tsx` → **`timebox-templates-route.tsx`**，导出 **`TimeboxTemplatesRoute`**（避开与现有 client wrapper `pages/TimeboxTemplatesPage.tsx` 同名）。

Create `frontend/src/domains/timebox/components/timebox-templates-route.tsx`:

```tsx
/**
 * @file timebox-templates-route
 * @brief 时间盒模板配置独立路由 domain 入口（async server component，[023-02] 行列表 + 模板级星期）
 *
 * 从 app/timebox-templates/page.tsx 抽出。与 client wrapper pages/TimeboxTemplatesPage.tsx
 * （ActionView 嵌入用）区分：本组件=独立 /timebox-templates URL 的 server 入口。
 * 容器用 min-h-full（[023-02] Task 10.2）：避免内部 PageBanner + 网格的 flex stretch
 * 链把 h-screen 的 100vh 撑死。订阅源由编辑器懒加载，避免 page 耦合多域 repo。
 */
import { loadTimeboxTemplates } from '@/domains/timebox/lib/server/load-templates'
import { TimeboxTemplateEditor } from '@/domains/timebox/components/timebox-template-editor'

export async function TimeboxTemplatesRoute() {
  const templates = await loadTimeboxTemplates()
  return (
    <div className="min-h-full flex flex-col">
      <TimeboxTemplateEditor initialTemplates={templates} />
    </div>
  )
}
```

- [ ] **Step 3: tsc 验证**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "load-templates|timebox-templates-route" || echo "0 hits"`
Expected: `0 hits`

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/domains/timebox/lib/server/load-templates.ts src/domains/timebox/components/timebox-templates-route.tsx
git commit -m "feat(timebox): [page-thin] T3 timebox-templates route 入口 + 预取 helper"
```

---

## Task 4: appointment domain 入口（helper + 入口组件）

**依赖 Task 1**（load-appointments 调 getAppointmentPageWindow）。

> **⚠️ REVIEW 修正（D4/F2 + D5/F3 + D9/7A）**：
> - 入口文件改名 `appointment-page.tsx` → **`appointment-route.tsx`**，导出 **`AppointmentRoute`**（D9/7A：避开与现有 client wrapper `pages/AppointmentPage.tsx` 同名）。
> - 入口**自己拥 h-screen 容器**（D4/F2：AppointmentWorkspace 不动，root 保持 `flex h-full`）。
> - **额外收口** client wrapper `pages/AppointmentPage.tsx` 改用 `getAppointmentPageWindow()`（D5/F3：修 stale 7/90 bug）。

**Files:**
- Create: `frontend/src/domains/timebox/lib/server/load-appointments.ts`
- Create: `frontend/src/domains/timebox/components/appointment-route.tsx`（注意：route 不是 page）
- Modify: `frontend/src/domains/timebox/pages/AppointmentPage.tsx`（client wrapper 改用纯函数窗口，D5/F3）

**Interfaces:**
- Consumes: `getAppointmentPageWindow()`（Task 1 产出）；`getAppointmentsByRange(start: string, end: string)` → `AppointmentSummary[]`（`app/actions/intent.ts:870`，内部用 MVP_USER_ID）；`AppointmentWorkspace({ initialItems })`（已在 domain，client 组件，`components/appointment-workspace.tsx:91`）
- Produces: `AppointmentRoute`（async server component，自带 h-screen 容器）

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

- [ ] **Step 2: 创建 domain 入口组件（route，自带 h-screen）**

Create `frontend/src/domains/timebox/components/appointment-route.tsx`:

```tsx
/**
 * @file appointment-route
 * @brief 约定管理独立路由 domain 入口（async server component）
 *
 * 从 app/appointments/page.tsx 抽出：server 预取 ±90 天约定 → 传 AppointmentWorkspace。
 * 与 client wrapper pages/AppointmentPage.tsx（ActionView 嵌入用）区分：
 *   - 本组件（route）= 独立 /appointments URL 的 server 入口，RSC 预取
 *   - pages/AppointmentPage.tsx = AppShell ActionView 内嵌，client 懒加载
 * h-screen 容器由本入口拥有（D4/F2：AppointmentWorkspace root 保持 h-full 不动）。
 * [TD-039] 跨 RSC boundary 传 AppointmentSummary（startTime 为 ISO string，非 Date ——
 *   usom/types/primitives.ts:18 Timestamp=string + mapper toISOString，已 verify）。
 */
import { loadAppointmentsForPage } from '@/domains/timebox/lib/server/load-appointments'
import { AppointmentWorkspace } from '@/domains/timebox/components/appointment-workspace'

export async function AppointmentRoute() {
  const items = await loadAppointmentsForPage()
  return (
    <div className="h-screen flex flex-col">
      <AppointmentWorkspace initialItems={items} />
    </div>
  )
}
```

- [ ] **Step 3: 收口 client wrapper 窗口（D5/F3 修 stale 7/90）**

Modify `frontend/src/domains/timebox/pages/AppointmentPage.tsx`（client wrapper，ActionView 嵌入用）。将其 useEffect 内手写窗口替换为纯函数：

旧（约 line 36-39，stale 7/90）：
```ts
const start = new Date()
start.setDate(start.getDate() - 7)
const end = new Date()
end.setDate(end.getDate() + 90)
```
新（用 Task 1 纯函数，client 可 import）：
```ts
import { getAppointmentPageWindow } from '@/domains/timebox/lib/appointment-window'
// ...在 useEffect 内：
const { start, end } = getAppointmentPageWindow()
```
（保留 `getAppointmentsByRange(start, end)` 调用不变；删旧注释「过去 7 天 + 未来 90 天」改「±90 天，与独立路由一致」。）

- [ ] **Step 4: 入口 render 测试（D7/5A）**

Create `frontend/src/domains/timebox/components/__tests__/appointment-route.test.tsx`:

```tsx
/**
 * @file appointment-route.test
 * @brief [page-thin] D7/5A：appointment server 入口 render 测试
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// mock load helper（避免触 DB）
vi.mock('@/domains/timebox/lib/server/load-appointments', () => ({
  loadAppointmentsForPage: vi.fn().mockResolvedValue([]),
}))

// 动态 import（async server component）
const { AppointmentRoute } = await import('../appointment-route')

describe('AppointmentRoute', () => {
  it('渲染 h-screen 容器 + AppointmentWorkspace', async () => {
    const { container } = render(await AppointmentRoute())
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('h-screen')
  })
})
```

- [ ] **Step 5: tsc 验证**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "load-appointments|appointment-route|AppointmentPage" || echo "0 hits"`
Expected: `0 hits`

- [ ] **Step 6: Commit**

```bash
cd frontend
git add src/domains/timebox/lib/server/load-appointments.ts src/domains/timebox/components/appointment-route.tsx src/domains/timebox/pages/AppointmentPage.tsx src/domains/timebox/components/__tests__/appointment-route.test.tsx
git commit -m "feat(timebox): [page-thin] T4 appointment route 入口（拥 h-screen）+ 收口 client wrapper stale 窗口"
```

---

## Task 5: workspace 容器自包含（standalone prop 模式）

> **⚠️ REVIEW 修正（D3/F1 + D4/F2）**：原版盲改 3 个 workspace root 为 h-screen 会破 AppShell。
> - **TimeboxesWorkspace 双用**（独立页 + `app/page.tsx:103` AppShell 嵌入）→ 必须加 `standalone` prop（仿 OKRWorkspace），不能无条件 h-screen。
> - **AppointmentWorkspace 不动**（D4/F2：两调用方都已包 h-screen，入口拥容器即可）。

**Files:**
- Modify: `frontend/src/domains/okrs/components/okr-workspace.tsx`（line 221 standalone 分支 h-full→h-screen）
- Modify: `frontend/src/domains/timebox/components/timeboxes-workspace.tsx`（加 standalone prop + root 分支）
- Test: `frontend/src/domains/timebox/components/__tests__/timeboxes-workspace.standalone.test.tsx`（**CRITICAL 回归测试**）
- ~~AppointmentWorkspace 不改~~（D4/F2）

**背景**：OKRWorkspace 已有 `standalone` prop（standalone→全高布局，embedded→absolute inset-0）。TimeboxesWorkspace 同款双用但缺该 prop。本次给它加上，与 OKRWorkspace 范式对齐。

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

- [ ] **Step 2: TimeboxesWorkspace 加 standalone prop（D3/F1 关键）**

`timeboxes-workspace.tsx`。**两处改动**：

(a) 函数签名加 prop（约 line 95，原 `export function TimeboxesWorkspace()`）：
```tsx
interface TimeboxesWorkspaceProps {
  /** 独立页面模式：root 用 h-screen 自撑高度；默认 false（AppShell 嵌入用 h-full） */
  standalone?: boolean
}

export function TimeboxesWorkspace({ standalone = false }: TimeboxesWorkspaceProps = {}) {
```

(b) root div 按分支（line 583，原 `<div className="flex h-full">`）：
```tsx
<div className={`flex ${standalone ? "h-screen" : "h-full"}`}>
```

**为何**：`app/page.tsx:103` AppShell 嵌入 `<TimeboxesWorkspace />` 不传 standalone→默认 false→h-full（填充 AppShell main 区，不破）；独立 `/timeboxes` 页经 page_props 传 `standalone: true`（Task 6）→h-screen。

- [ ] **Step 3: CRITICAL 回归测试 — standalone prop 分支**

Create `frontend/src/domains/timebox/components/__tests__/timeboxes-workspace.standalone.test.tsx`:

```tsx
/**
 * @file timeboxes-workspace.standalone.test
 * @brief [page-thin] D3/F1 回归：standalone prop 决定 root 高度 class
 *
 * 防回归：standalone prop 错配会破 AppShell 嵌入（app/page.tsx:103）或独立页高度。
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { renderWithTz } from '@/tests/test-utils'
import { TimeboxesWorkspace } from '../timeboxes-workspace'

describe('TimeboxesWorkspace standalone prop', () => {
  it('standalone=true → root 含 h-screen', () => {
    const { container } = renderWithTz(<TimeboxesWorkspace standalone />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('h-screen')
    expect(root.className).not.toContain('h-full')
  })

  it('默认（embedded）→ root 含 h-full 不含 h-screen', () => {
    const { container } = renderWithTz(<TimeboxesWorkspace />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('h-full')
    expect(root.className).not.toContain('h-screen')
  })
})
```

（若 `renderWithTz` 不存在于该路径，仿 `timeboxes-workspace.view-mode.test.tsx` 的 import 范式。先 grep 确认 helper 位置。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/timeboxes-workspace.standalone.test.tsx`
Expected: PASS（2 tests）。

- [ ] **Step 5: dev server smoke（AppShell 嵌入不破 + 独立页正常）**

Run: `cd frontend && npm run dev`（后台），等编译完成。
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/timeboxes` → `200`（独立页，此时 page.tsx 仍手写包 h-screen，workspace 默认 h-full，双重但等价）
- **关键**：访问主页 `http://localhost:3000/` → 切到 schedule 视图（AppShell 嵌入 TimeboxesWorkspace）→ 确认布局未破（workspace h-full 填充 main 区，非 100vh 溢出）。用 /browse 截图核对。
停 dev server。

- [ ] **Step 6: Commit**

```bash
cd frontend
git add src/domains/okrs/components/okr-workspace.tsx src/domains/timebox/components/timeboxes-workspace.tsx src/domains/timebox/components/__tests__/timeboxes-workspace.standalone.test.tsx
git commit -m "refactor: [page-thin] T5 workspace 容器 standalone prop 模式（OKRWorkspace + TimeboxesWorkspace）+ 回归测试"
```

---

## Task 6: manifest 校准（5 处 view_route + ViewRouteSchema 扩展）

**Files:**
- Modify: `frontend/src/domains/timebox/manifest.yaml`（4 个 view_route.component）
- Modify: `frontend/src/domains/okrs/manifest.yaml`（okrs view_route 改路径 + export_name + page_props）
- Modify: `frontend/src/domains/manifest-loader/schema.ts`（ViewRouteSchema 加 export_name + page_props）

**背景**：当前 4 处 component 错误指向 `app/<route>/page`（循环 import）。改为指向 Task 2-4 新建的 domain 入口 + 已有 workspace。okrs 加 export_name（OKRWorkspace 缩写）+ page_props（standalone + initialDetailId 透传）。

- [ ] **Step 1: timebox manifest 4 处 component 改指向 domain + viewTimeboxes page_props**

> **⚠️ REVIEW 修正（D3/F1 + D9/7A）**：
> - `viewTimeboxes` 加 `page_props: standalone: true`（D3/F1：独立页传 standalone，AppShell 嵌入不传）。
> - `configTimeboxTemplates` → `timebox-templates-route`、`viewAppointments` → `appointment-route`（D9/7A：重命名后的入口）。

`frontend/src/domains/timebox/manifest.yaml` 的 `view_routes` 块整体替换为：

```yaml
view_routes:
  viewTimeboxes:
    component: domains/timebox/components/timeboxes-workspace
    url: /timeboxes
    # page_props：独立 /timeboxes 页传 standalone:true（AppShell 嵌入 app/page.tsx:103 不传→默认 false→h-full）
    page_props:
      standalone: true
  configTimeboxTemplates:
    component: domains/timebox/components/timebox-templates-route
    url: /timebox-templates
  config_activity_archetypes:
    component: domains/timebox/config/activity-archetypes-page
    url: /config/activity-archetypes
  # [026] A1.5 + [023.05] PR2 阶段 2: 约定管理页
  viewAppointments:
    component: domains/timebox/components/appointment-route
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

- [ ] **Step 4: manifest 不变量测试（D8/6A）+ 校验**

Create `frontend/src/domains/__tests__/manifest-view-routes.test.ts`:

```ts
/**
 * @file manifest-view-routes.test
 * @brief [page-thin] D8/6A：view_route.component 不变量（禁 app/ 前缀，防回归循环 import）
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import * as yaml from 'js-yaml'

const DOMAINS = join(__dirname, '..')

describe('view_route.component 不变量', () => {
  for (const d of readdirSync(DOMAINS, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('__'))) {
    const mp = join(DOMAINS, d.name, 'manifest.yaml')
    let manifest: any
    try { manifest = yaml.load(readFileSync(mp, 'utf-8')) } catch { continue }
    if (!manifest.view_routes) continue

    for (const [action, r] of Object.entries(manifest.view_routes as Record<string, any>)) {
      it(`${d.name}.${action}.component 不得指向 app/（循环 import）`, () => {
        expect(r.component).not.toMatch(/^app\//)
      })
      it(`${d.name}.${action}.component 指向 domain`, () => {
        expect(r.component).toMatch(/^domains\//)
      })
    }
  }
})
```

Run: `cd frontend && npx vitest run src/domains/__tests__/manifest-view-routes.test.ts`
Expected: PASS（所有 view_route 都指向 domains/，无 app/ 前缀）。

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
      // D6/F4：searchParams 类型对齐 Next.js 实际（值可为 string | string[] | undefined）
      const body = `export default async function ${componentName}Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
- `app/timeboxes/page.tsx` → 含 `import { TimeboxesWorkspace }` + 同步 `function TimeboxesWorkspacePage()` + `standalone={true}`（**D3/F1：page_props 仅字面值→同步模板**，无 searchParams 不需 async）
- `app/timebox-templates/page.tsx` → `<TimeboxTemplatesRoute />`（D9/7A 重命名）
- `app/config/activity-archetypes/page.tsx` → `<ActivityArchetypesPage />`
- `app/appointments/page.tsx` → `<AppointmentRoute />`（D9/7A 重命名）
- 6 个都含 `// Auto-generated from domains/` 头

> **⚠️ 关键验证**：`app/timeboxes/page.tsx` 生成后**必须**含 `standalone={true}`（否则独立页高度塌陷）。若缺失，检查 Task 6 manifest `viewTimeboxes.page_props.standalone` 是否正确声明。

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

---

## NOT in scope

- ❌ 重构 workspace 组件**内部**布局逻辑（只动外层容器 div / 加 standalone prop）
- ❌ 统一 view_route 命名风格（kebab vs snake 混用是历史债）
- ❌ 大改 manifest-loader Zod schema 结构（仅加 export_name + page_props 两可选字段）
- ❌ 处理 `_rulefixture` / `__tests__` / `manifest-loader` 孤儿目录（与本次无关）
- ❌ archetype 独立成域（spec OQ-1，后续架构决策）
- ❌ client wrapper（OkrWorkspacePage / AppointmentPage / TimeboxTemplatesPage）整体退役 —— 仅 F3 收口 appointment 窗口；其余维持（ActionView 嵌入仍用）
- ❌ MVP_USER_ID 统一到共享常量（matches 现有 convention，非回归）

## What already exists

| 既有能力 | plan 复用情况 |
|---|---|
| `scripts/generate-routes.ts` codegen 工具 | ✅ 扩展（kebab→PascalCase + export_name + page_props），非另起 |
| `OKRWorkspace` standalone prop 模式 | ✅ TimeboxesWorkspace 仿该范式（D3/F1） |
| `getAppointmentsByRange` server action | ✅ load-appointments 调它，非新建查询 |
| `TimeboxTemplateRepository.findByUser` / `ActivityArchetypeRepository.findByUser` | ✅ load helpers 直调，非新建 repo |
| `ViewRouteSchema`（Zod） | ✅ 加两可选字段，非重构 |
| client wrapper（pages/*Page.tsx，ActionView 用） | ✅ 维持（仅 appointment 窗口收口） |

## Failure modes

| codepath | 失败方式 | 测试 | 错误处理 | 用户可见 |
|---|---|---|---|---|
| TimeboxesWorkspace standalone prop | 错配→AppShell 嵌入 100vh 溢出 / 独立页塌陷 | ✅ CRITICAL 回归测试（Task 5 Step 3） | 无（class 错就是布局错） | 布局破坏（/browse 抓） |
| appointment server entry RSC 预取 | DB 宕机→async 抛 | smoke（Task 9 Step 4 HTTP） | 无 try/catch（Next error boundary） | 500 / error.tsx |
| codegen page_props 生成 | JSON.stringify 边界（null/obj） | ✅ Task 7 ×4 case | 无 | 编译期 tsc 抓 |
| client AppointmentPage 窗口 | stale 7/90（pre-existing） | D5/F3 收口后由 appointment-window.test 覆盖 | — | 数据窗口不一致（已修） |

**Critical gaps: 0**（所有失败模式均有测试或编译期捕获）。

## Worktree parallelization

| Task | 模块 | 依赖 |
|---|---|---|
| T1 appointment-window | timebox/lib | — |
| T2 archetype 入口 | timebox/config + settings-page | — |
| T3 templates route | timebox/components/lib | — |
| T4 appointment route | timebox/components/lib + pages/AppointmentPage | T1 |
| T5 workspace standalone | okrs/components + timebox/components | — |
| T6 manifest | timebox/manifest + okrs/manifest + loader/schema | T2,T3,T4（component 路径指向它们） |
| T7 codegen | scripts/ | — |
| T8 --force 接管 | app/*/page.tsx | T6,T7 |
| T9 验证 | 全量 | T8 |

**Lane A**: T1 → T4（appointment 链，timebox/lib + components）
**Lane B**: T2（archetype，timebox/config + settings-page，独立）
**Lane C**: T3（templates，timebox/components，独立）
**Lane D**: T5（workspace standalone，okrs + timebox/components）
**Lane E**: T7（codegen，scripts/，独立）

T1/T2/T3/T5/T7 可 5 路并行（不同模块目录，零冲突）。T4 等 T1。T6 等 T2/T3/T4。T8 等 T6/T7。**冲突旗**：Lane A 与 Lane C 都动 `timebox/components/`（T4 appointment-route vs T3 templates-route，不同文件，无 merge 冲突但同目录需协调提交顺序）。

## Implementation Tasks

Synthesized from this review's findings.

- [ ] **T1 (P1, human:~15min / CC:~3min)** — timebox/lib — appointment-window ±90 纯函数 + 单测
  - Surfaced by: Test Review（canonical source for F3 收口）
- [ ] **T2 (P1, CC:~8min)** — timebox/config + settings-page — archetype-table 搬入 domain + load helper + 入口 + render 测试
  - Surfaced by: Architecture（domain 自包含）+ Test（D7/5A 入口测试）
- [ ] **T3 (P1, CC:~6min)** — timebox/components — timebox-templates **route** 入口（D9/7A 重命名）+ load helper + render 测试
  - Surfaced by: Architecture + Cross-model #2（命名冲突）
- [ ] **T4 (P1, CC:~10min)** — timebox/components + pages — appointment **route** 入口（拥 h-screen，D4/F2）+ 收口 client wrapper stale 窗口（D5/F3）+ render 测试
  - Surfaced by: Architecture F2/F3 + Cross-model #2
- [ ] **T5 (P1, CC:~10min)** — okrs/timebox components — **TimeboxesWorkspace 加 standalone prop**（D3/F1，非盲改 h-screen）+ OKRWorkspace standalone 分支 + CRITICAL 回归测试
  - Surfaced by: Architecture F1（P1 landmine）+ Test IRON RULE
- [ ] **T6 (P2, CC:~6min)** — manifests + loader/schema — view_route 指向 domain + viewTimeboxes page_props + manifest 不变量测试（D8/6A）
  - Surfaced by: Architecture + Test
- [ ] **T7 (P2, CC:~12min)** — scripts/generate-routes — kebab→PascalCase + export_name + page_props + searchParams 类型拓宽（D6/F4）+ 单测
  - Surfaced by: Code Quality F4 + codegen 扩展
- [ ] **T8 (P1, CC:~5min)** — app/*/page.tsx — --force 接管 6 页（验证 /timeboxes 含 standalone）
  - Surfaced by: 核心 goal
- [ ] **T9 (P1, CC:~10min)** — 全量验证 — vitest/tsc/manifest/dev smoke/browse
  - Surfaced by: spec §7

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES_OPEN→FOLDED | 8 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**OUTSIDE VOICE:** Codex CLI timed out mid-investigation (280s); fell back to Claude subagent. Subagent confirmed all 6 review findings (no tension) + surfaced naming collision (#2) and a plan-text-vs-decision gap (F1 not folded into Task 5 body — now fixed). 4 claims verified NOT-issues (RSC startTime is ISO string / --force idempotency / require.main guard / page_props JSX).

**CROSS-MODEL:** No tension — subagent agreed with F1/F2/F3 and sharpened them. One addition (naming collision → D9/7A rename) adopted.

**VERDICT:** ENG REVIEW FOLDED — 8 findings all resolved via 9 AskUserQuestion decisions (D2-D9) and folded into Tasks 3-8. Ready to implement.

NO UNRESOLVED DECISIONS
