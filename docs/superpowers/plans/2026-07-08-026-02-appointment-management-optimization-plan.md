# [026.02] 约定管理优化 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 [026.01] 客户端 CNUI surface 注册缺失 + 重构 `/appointments` 页面（Day/Month 双视图 + 筛选 + Banner）。

**Architecture:**
- §1 bug fix：3 个 appointment CNUI surface 补 client 注册 + IRON RULE 守护测试。
- §2 UI 重构：抽 `AppointmentPageBanner` / `AppointmentViewToggle` / `AppointmentFilterBar` / `AppointmentMiniCalendar` / `AppointmentDayView` / `AppointmentMonthView` / `filterAppointments` 纯函数；`AppointmentWorkspace` 整合视图状态。
- 数据流：服务端拉全状态（-90d ~ +90d），客户端 `useMemo` 派生筛选；viewMode 切换日/月。

**Tech Stack:** Next.js 16.1.6, React 19.2.3, TypeScript 5, Drizzle ORM 0.45.1, shadcn/ui, Tailwind 4.

## Global Constraints

- 简体中文注释与文档；TS/JS 文件必须有 `/** @file ... @brief ... */` 文件头注释。
- CSS 颜色必须使用 CSS 变量令牌（`bg-canvas`、`text-ink` 等），禁止 Tailwind 默认颜色类。
- Repository Pattern（R-01~R-04）+ Multi-Tenancy（T-01~T-04）：业务表 user_id 必透传，写入口走 Nexus 流水线（mutation service / submitDynamicIntent）。
- CNUI 双注册（per [[project-cnui-surface-dual-registration]]）：server `surfaceHandlers` + client `register-client-surfaces` + manifest K-block + intent_trigger A 区块四路闭合。
- 命名：CNUI surface 文件 PascalCase；key = surface 名（`create-appointment` / `edit-appointment` / `delete-appointment`）。
- 测试：vitest 跑在 `frontend/` cwd；测试名中英文混排但**断言消息英文**；新增测试必须有真实价值（不复制已存在断言）。
- DB：迁移手写 SQL + psql + 登记 journal（`db:generate`/`db:migrate` 跑不通，per memory）。
- 视图状态名统一为 `viewMode`（避免与 [023.06] `dateMode` 混淆，本 spec 决策见 §7.2）。
- MiniCalendar timebox IRON RULE 守护测试（`mini-calendar.regression.test.tsx`）**绝不破**——appointment 走独立 `AppointmentMiniCalendar` 组件。
- [026.01] `AppointmentFormFields` 共享组件已含 `activityArchetypeId`；本次不重做 archetype 集成。

---

## File Structure

### 新增文件

```
frontend/src/
├── domains/timebox/
│   ├── components/
│   │   ├── appointment-page-banner.tsx           # 任务 3 — PageBanner 包装
│   │   ├── appointment-view-toggle.tsx           # 任务 4 — 日/月切换
│   │   ├── appointment-filter-bar.tsx            # 任务 5 — 筛选条
│   │   ├── appointment-mini-calendar.tsx         # 任务 6 — 独立 MiniCalendar（不污染 timebox）
│   │   ├── appointment-day-view.tsx              # 任务 7 — 两栏式日视图
│   │   └── appointment-month-view.tsx            # 任务 8 — 全月网格
│   └── lib/
│       └── appointment-filter.ts                 # 任务 2 — filterAppointments 纯函数
└── (existing)
    ├── app/appointments/page.tsx                 # 任务 10 — 改
    ├── components/layout/page-banner.tsx         # (existing, 不改)
    ├── domains/timebox/components/
    │   └── appointment-workspace.tsx             # 任务 9 — 大改：viewMode + 视图分发
    └── nexus/ai-runtime/cnui/
        ├── register-client-surfaces.ts           # 任务 1 — 改（补 3 个 surface）
        └── __tests__/
            └── register-client-surfaces.test.ts  # 任务 1 — 新（IRON RULE 守护）

frontend/src/domains/timebox/components/__tests__/
├── appointment-page-banner.test.tsx              # 任务 3
├── appointment-view-toggle.test.tsx              # 任务 4
├── appointment-filter-bar.test.tsx               # 任务 5
├── appointment-mini-calendar.test.tsx            # 任务 6
├── appointment-day-view.test.tsx                 # 任务 7
├── appointment-month-view.test.tsx               # 任务 8
└── appointment-workspace.test.tsx                # 任务 9

frontend/src/domains/timebox/lib/__tests__/
└── appointment-filter.test.ts                    # 任务 2
```

### 不动文件

- `frontend/src/domains/timebox/cnui/handlers.ts`（server surfaceHandlers 已含 3 个 appointment surface）
- `frontend/src/domains/timebox/cnui/surfaces/CreateAppointment.tsx` / `EditAppointment.tsx` / `DeleteAppointment.tsx`（[026.01] 已 ship）
- `frontend/src/domains/timebox/cnui/surfaces/AppointmentFormFields.tsx`（[026.01] 已 ship，含 archetype）
- `frontend/src/domains/timebox/manifest.yaml`（K-block 已声明 3 个 surface）
- `frontend/src/domains/timebox/components/mini-calendar.tsx`（timebox 专用，不复用）

---

## Task 1: §1 bug fix — 注册 3 个 appointment CNUI surface + 守护测试

**Files:**
- Modify: `frontend/src/nexus/ai-runtime/cnui/register-client-surfaces.ts`
- Create: `frontend/src/nexus/ai-runtime/cnui/__tests__/register-client-surfaces.test.ts`

**Interfaces:**
- Consumes: `cnuiRegistry.register(domainId, surfaceType, { component })`（`registry.ts:38-51`）
- Produces: client 注册表新增 3 个 entry：
  - `('timebox', 'create-appointment', CreateAppointment)`
  - `('timebox', 'edit-appointment', EditAppointment)`
  - `('timebox', 'delete-appointment', DeleteAppointment)`

### Step 1.1: 写失败测试（IRON RULE 守护）

文件：`frontend/src/nexus/ai-runtime/cnui/__tests__/register-client-surfaces.test.ts`

```tsx
/**
 * @file register-client-surfaces.test
 * @brief [026.02] §1 IRON RULE 守护 — appointment CNUI surface 必须在 client 注册表
 *
 * 防止 [026.01] 回归（server 注册了，client 没注册 → /createAppointment 报"未知的卡片类型"）。
 * 每次 [026.02] 之外的 release 前都必须保持通过。
 */

import { cnuiRegistry } from '../registry'
import '@/nexus/ai-runtime/cnui/register-client-surfaces'  // 触发副作用

describe('[026.02] §1 IRON RULE — appointment CNUI surface client 注册', () => {
  const REQUIRED = ['create-appointment', 'edit-appointment', 'delete-appointment']

  it.each(REQUIRED)('client 注册表必须包含 %s', (surfaceType) => {
    const reg = cnuiRegistry.get(surfaceType)
    expect(reg).toBeDefined()
    expect(reg?.domainId).toBe('timebox')
  })

  it('每个 appointment surface 必须挂一个 React component', () => {
    for (const t of REQUIRED) {
      const reg = cnuiRegistry.get(t)
      expect(reg?.component).toBeDefined()
      expect(typeof reg?.component).toBe('function')  // React.ComponentType
    }
  })
})
```

### Step 1.2: 跑测试确认 RED

Run: `cd frontend && npx vitest run src/nexus/ai-runtime/cnui/__tests__/register-client-surfaces.test.ts`

Expected: FAIL — `cnuiRegistry.get('create-appointment')` 返回 `undefined`。

### Step 1.3: 改 register-client-surfaces.ts

文件：`frontend/src/nexus/ai-runtime/cnui/register-client-surfaces.ts`

在 `// Tasks surfaces` 区块**之前**的 timebox 区块，加 3 行 import + 3 行 register：

```tsx
// [026.02] T1 — 约定 3 surface（[026.01] 漏注册 client，触发 IRON RULE）
import { CreateAppointment } from '@/domains/timebox/cnui/surfaces/CreateAppointment'
import { EditAppointment } from '@/domains/timebox/cnui/surfaces/EditAppointment'
import { DeleteAppointment } from '@/domains/timebox/cnui/surfaces/DeleteAppointment'
```

并在 timebox 区块（line 32 之后）追加：

```tsx
// [026.02] T1 — 修复 [026.01] 回归（server 已注册 surfaceHandlers，client 漏 3 个 surface）
//   per [[project-cnui-surface-dual-registration]]：server + client 双注册闭合。
cnuiRegistry.register('timebox', 'create-appointment', { component: CreateAppointment })
cnuiRegistry.register('timebox', 'edit-appointment',   { component: EditAppointment })
cnuiRegistry.register('timebox', 'delete-appointment', { component: DeleteAppointment })
```

### Step 1.4: 跑测试确认 GREEN

Run: `cd frontend && npx vitest run src/nexus/ai-runtime/cnui/__tests__/register-client-surfaces.test.ts`

Expected: PASS — 2 tests passed.

### Step 1.5: 跑 lint + tsc

Run:
```bash
cd frontend && npm run lint 2>&1 | tail -20
cd frontend && npx tsc --noEmit 2>&1 | tail -10
```

Expected: lint 0 error；tsc 0 error。

### Step 1.6: Commit

```bash
git add frontend/src/nexus/ai-runtime/cnui/register-client-surfaces.ts \
        frontend/src/nexus/ai-runtime/cnui/__tests__/register-client-surfaces.test.ts
git commit -m "fix(026.02): §1 补 3 个 appointment CNUI surface client 注册 + IRON RULE 守护

- [026.01] 仅注册 server surfaceHandlers, client register-client-surfaces 漏 3 个
  surface → /createAppointment /editAppointment /deleteAppointment 报「未知的卡片类型」
- per [[project-cnui-surface-dual-registration]]: server + client 双注册闭合
- 新增 register-client-surfaces.test.ts (2 it.each + 1 it) 防回归

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: filterAppointments 纯函数

**Files:**
- Create: `frontend/src/domains/timebox/lib/appointment-filter.ts`
- Create: `frontend/src/domains/timebox/lib/__tests__/appointment-filter.test.ts`

**Interfaces:**
- Consumes: `AppointmentSummary[]`（from `@/usom/types/summaries`）、`AppointmentStatus`（from `@/usom/types/primitives`）
- Produces: `filterAppointments(items, status, range) => AppointmentSummary[]`
  - `status: AppointmentStatus | 'all'` — `'all'` 不过滤
  - `range: { start: Date, end: Date }` — 闭区间（start/end 都包含）

### Step 2.1: 写失败测试

文件：`frontend/src/domains/timebox/lib/__tests__/appointment-filter.test.ts`

```ts
/**
 * @file appointment-filter.test
 * @brief [026.02] T2 — filterAppointments 纯函数 TDD
 */

import { filterAppointments } from '../appointment-filter'
import type { AppointmentSummary } from '@/usom/types/summaries'

const mk = (overrides: Partial<AppointmentSummary> = {}): AppointmentSummary => ({
  id: 'appt-' + Math.random(),
  title: '测试约定',
  startTime: '2026-07-08T10:00:00.000Z',
  durationMin: 60,
  status: 'scheduled',
  ...overrides,
})

const range = (startISO: string, endISO: string) => ({
  start: new Date(startISO),
  end: new Date(endISO),
})

describe('filterAppointments', () => {
  it('空数组返回空数组', () => {
    expect(filterAppointments([], 'all', range('2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z'))).toEqual([])
  })

  it("status='all' 不过滤状态，只过滤日期范围", () => {
    const items = [
      mk({ id: '1', startTime: '2026-07-10T10:00:00Z', status: 'scheduled' }),
      mk({ id: '2', startTime: '2026-07-15T10:00:00Z', status: 'completed' }),
      mk({ id: '3', startTime: '2026-07-20T10:00:00Z', status: 'cancelled' }),
    ]
    const r = filterAppointments(items, 'all', range('2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z'))
    expect(r.map(i => i.id)).toEqual(['1', '2', '3'])
  })

  it("status='scheduled' 只保留 scheduled", () => {
    const items = [
      mk({ id: '1', status: 'scheduled' }),
      mk({ id: '2', status: 'completed' }),
      mk({ id: '3', status: 'cancelled' }),
    ]
    const r = filterAppointments(items, 'scheduled', range('2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z'))
    expect(r.map(i => i.id)).toEqual(['1'])
  })

  it('日期范围闭区间（边界包含）', () => {
    const items = [
      mk({ id: '1', startTime: '2026-07-01T00:00:00Z' }),  // 起点
      mk({ id: '2', startTime: '2026-07-31T23:59:59Z' }),  // 终点
      mk({ id: '3', startTime: '2026-06-30T23:59:59Z' }),  // 之前
      mk({ id: '4', startTime: '2026-08-01T00:00:00Z' }),  // 之后
    ]
    const r = filterAppointments(items, 'all', range('2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z'))
    expect(r.map(i => i.id)).toEqual(['1', '2'])
  })

  it('status + range 同时过滤', () => {
    const items = [
      mk({ id: '1', startTime: '2026-07-10T10:00:00Z', status: 'scheduled' }),
      mk({ id: '2', startTime: '2026-07-15T10:00:00Z', status: 'completed' }),
      mk({ id: '3', startTime: '2026-06-30T10:00:00Z', status: 'scheduled' }),  // 范围外
      mk({ id: '4', startTime: '2026-07-20T10:00:00Z', status: 'cancelled' }),
    ]
    const r = filterAppointments(items, 'scheduled', range('2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z'))
    expect(r.map(i => i.id)).toEqual(['1'])
  })

  it('不修改原数组', () => {
    const items = [mk({ id: '1', status: 'completed' })]
    const snapshot = JSON.stringify(items)
    filterAppointments(items, 'scheduled', range('2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z'))
    expect(JSON.stringify(items)).toBe(snapshot)
  })
})
```

### Step 2.2: 跑测试确认 RED

Run: `cd frontend && npx vitest run src/domains/timebox/lib/__tests__/appointment-filter.test.ts`

Expected: FAIL — `Cannot find module '../appointment-filter'` 或 import 错误。

### Step 2.3: 实现纯函数

文件：`frontend/src/domains/timebox/lib/appointment-filter.ts`

```ts
/**
 * @file appointment-filter
 * @brief [026.02] T2 — AppointmentSummary 过滤纯函数
 *
 * 客户端筛选：status + 日期范围闭区间。
 * 派生组件 AppointmentWorkspace 的 useMemo 直接调用本函数。
 * 纯函数 — 不修改入参，不读外部状态。
 */

import type { AppointmentSummary } from '@/usom/types/summaries'
import type { AppointmentStatus } from '@/usom/types/primitives'

export type AppointmentFilterStatus = AppointmentStatus | 'all'

export interface AppointmentDateRange {
  start: Date
  end: Date
}

/** 按 status + 日期范围过滤约定列表（不修改原数组） */
export function filterAppointments(
  items: readonly AppointmentSummary[],
  status: AppointmentFilterStatus,
  range: AppointmentDateRange,
): AppointmentSummary[] {
  const startMs = range.start.getTime()
  const endMs = range.end.getTime()
  return items.filter(it => {
    if (status !== 'all' && it.status !== status) return false
    const t = new Date(it.startTime).getTime()
    if (t < startMs || t > endMs) return false
    return true
  })
}
```

### Step 2.4: 跑测试确认 GREEN

Run: `cd frontend && npx vitest run src/domains/timebox/lib/__tests__/appointment-filter.test.ts`

Expected: PASS — 6 tests passed.

### Step 2.5: tsc

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -10`

Expected: 0 error。

### Step 2.6: Commit

```bash
git add frontend/src/domains/timebox/lib/appointment-filter.ts \
        frontend/src/domains/timebox/lib/__tests__/appointment-filter.test.ts
git commit -m "feat(026.02): T2 filterAppointments 纯函数 + 6 TDD 测试

- status: AppointmentStatus | 'all' + 日期范围闭区间
- 不修改原数组, 纯函数, 客户端 useMemo 直接调用
- 6 边界: 空数组 / status 枚举 / 范围闭区间 / 双过滤 / 不可变

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: AppointmentPageBanner

**Files:**
- Create: `frontend/src/domains/timebox/components/appointment-page-banner.tsx`
- Create: `frontend/src/domains/timebox/components/__tests__/appointment-page-banner.test.tsx`

**Interfaces:**
- Consumes: `PageBanner` 组件（`@/components/layout/page-banner`）
- Produces: `<AppointmentPageBanner />` — `domainId="timebox"`（沿用 timebox 图片集，per dev doc §2）、`title="约定管理"`

### Step 3.1: 写失败测试

文件：`frontend/src/domains/timebox/components/__tests__/appointment-page-banner.test.tsx`

```tsx
/**
 * @file appointment-page-banner.test
 * @brief [026.02] T3 — AppointmentPageBanner 组件测试
 */

import { render, screen } from '@testing-library/react'
import { AppointmentPageBanner } from '../appointment-page-banner'

describe('AppointmentPageBanner', () => {
  it('渲染标题「约定管理」', () => {
    render(<AppointmentPageBanner />)
    expect(screen.getByText('约定管理')).toBeInTheDocument()
  })

  it('不渲染任何 banner image 容器时, 不崩', () => {
    const { container } = render(<AppointmentPageBanner />)
    expect(container).toBeInTheDocument()
  })
})
```

### Step 3.2: 跑测试确认 RED

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-page-banner.test.tsx`

Expected: FAIL — module 找不到。

### Step 3.3: 实现组件

文件：`frontend/src/domains/timebox/components/appointment-page-banner.tsx`

```tsx
/**
 * @file appointment-page-banner
 * @brief [026.02] T3 — /appointments 顶部 Banner
 *
 * 沿用 Timebox Domain 的 banner 图片集（per dev doc §2: "使用 Timebox Domain的"）。
 * PageBanner 内部按 domainId 随机选图 + 折叠态持久化（STORAGE_KEY_PREFIX）。
 * 标题字体规范由 PageBanner 统一处理（UI-DESIGN-SPEC §14 C-04）。
 */

import { PageBanner } from '@/components/layout/page-banner'

export function AppointmentPageBanner() {
  return <PageBanner domainId="timebox" title="约定管理" />
}
```

### Step 3.4: 跑测试确认 GREEN

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-page-banner.test.tsx`

Expected: PASS — 2 tests passed.

### Step 3.5: Commit

```bash
git add frontend/src/domains/timebox/components/appointment-page-banner.tsx \
        frontend/src/domains/timebox/components/__tests__/appointment-page-banner.test.tsx
git commit -m "feat(026.02): T3 AppointmentPageBanner 包装 PageBanner

- domainId='timebox' 沿用 timebox banner 图片集
- title='约定管理', 字体规范由 PageBanner 统一处理

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: AppointmentViewToggle

**Files:**
- Create: `frontend/src/domains/timebox/components/appointment-view-toggle.tsx`
- Create: `frontend/src/domains/timebox/components/__tests__/appointment-view-toggle.test.tsx`

**Interfaces:**
- Consumes: `viewMode: 'day' | 'month'`, `onChange: (mode) => void`
- Produces: `<AppointmentViewToggle viewMode onChange />` — 2 个 icon button（日/月）

### Step 4.1: 写失败测试

文件：`frontend/src/domains/timebox/components/__tests__/appointment-view-toggle.test.tsx`

```tsx
/**
 * @file appointment-view-toggle.test
 * @brief [026.02] T4 — AppointmentViewToggle 组件测试
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppointmentViewToggle } from '../appointment-view-toggle'

describe('AppointmentViewToggle', () => {
  it('渲染日/月两个按钮', () => {
    render(<AppointmentViewToggle viewMode="day" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /日视图/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /月视图/ })).toBeInTheDocument()
  })

  it('当前 viewMode 按钮显示激活态', () => {
    render(<AppointmentViewToggle viewMode="month" onChange={() => {}} />)
    const monthBtn = screen.getByRole('button', { name: /月视图/ })
    expect(monthBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('点击月按钮触发 onChange("month")', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<AppointmentViewToggle viewMode="day" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /月视图/ }))
    expect(onChange).toHaveBeenCalledWith('month')
  })

  it('点击日按钮触发 onChange("day")', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<AppointmentViewToggle viewMode="month" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /日视图/ }))
    expect(onChange).toHaveBeenCalledWith('day')
  })
})
```

### Step 4.2: 跑测试确认 RED

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-view-toggle.test.tsx`

Expected: FAIL — module 找不到。

### Step 4.3: 实现组件

文件：`frontend/src/domains/timebox/components/appointment-view-toggle.tsx`

```tsx
/**
 * @file appointment-view-toggle
 * @brief [026.02] T4 — 日/月视图切换按钮组
 *
 * 2 个 icon button，参照 [023.06] view-mode-switcher 范式。
 * aria-pressed 表达当前激活态（a11y 必填）。
 */

'use client'

import { Calendar, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AppointmentViewMode = 'day' | 'month'

interface Props {
  viewMode: AppointmentViewMode
  onChange: (mode: AppointmentViewMode) => void
}

export function AppointmentViewToggle({ viewMode, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="视图模式"
      className="inline-flex rounded-md border border-hairline bg-canvas"
    >
      <button
        type="button"
        aria-pressed={viewMode === 'day'}
        aria-label="日视图"
        onClick={() => onChange('day')}
        className={cn(
          'flex items-center gap-1 px-3 py-1.5 text-xs text-ink',
          viewMode === 'day' && 'bg-primary text-primary-foreground',
          viewMode !== 'day' && 'hover:bg-hover-overlay',
        )}
      >
        <Calendar className="size-3.5" />
        日
      </button>
      <button
        type="button"
        aria-pressed={viewMode === 'month'}
        aria-label="月视图"
        onClick={() => onChange('month')}
        className={cn(
          'flex items-center gap-1 px-3 py-1.5 text-xs text-ink',
          viewMode === 'month' && 'bg-primary text-primary-foreground',
          viewMode !== 'month' && 'hover:bg-hover-overlay',
        )}
      >
        <CalendarDays className="size-3.5" />
        月
      </button>
    </div>
  )
}
```

### Step 4.4: 跑测试确认 GREEN

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-view-toggle.test.tsx`

Expected: PASS — 4 tests passed。

### Step 4.5: tsc

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -10`

Expected: 0 error。

### Step 4.6: Commit

```bash
git add frontend/src/domains/timebox/components/appointment-view-toggle.tsx \
        frontend/src/domains/timebox/components/__tests__/appointment-view-toggle.test.tsx
git commit -m "feat(026.02): T4 AppointmentViewToggle 日/月切换 + 4 测试

- 2 icon button (Calendar / CalendarDays), aria-pressed a11y
- 状态名 viewMode (与 [023.06] dateMode 区分, spec §7.2)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: AppointmentFilterBar

**Files:**
- Create: `frontend/src/domains/timebox/components/appointment-filter-bar.tsx`
- Create: `frontend/src/domains/timebox/components/__tests__/appointment-filter-bar.test.tsx`

**Interfaces:**
- Consumes: `status: AppointmentFilterStatus`（re-export from `appointment-filter.ts`）、`range: AppointmentDateRange`
- Produces: `<AppointmentFilterBar status range onStatusChange onRangeChange />`

### Step 5.1: 写失败测试

文件：`frontend/src/domains/timebox/components/__tests__/appointment-filter-bar.test.tsx`

```tsx
/**
 * @file appointment-filter-bar.test
 * @brief [026.02] T5 — AppointmentFilterBar 组件测试
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppointmentFilterBar } from '../appointment-filter-bar'

describe('AppointmentFilterBar', () => {
  const defaultRange = {
    start: new Date('2026-07-01T00:00:00Z'),
    end: new Date('2026-07-31T23:59:59Z'),
  }

  it('渲染状态筛选下拉', () => {
    render(
      <AppointmentFilterBar
        status="all"
        range={defaultRange}
        onStatusChange={() => {}}
        onRangeChange={() => {}}
      />,
    )
    expect(screen.getByRole('combobox', { name: /状态/ })).toBeInTheDocument()
  })

  it('显示当前 status 选中值', () => {
    render(
      <AppointmentFilterBar
        status="completed"
        range={defaultRange}
        onStatusChange={() => {}}
        onRangeChange={() => {}}
      />,
    )
    expect(screen.getByDisplayValue('已完成')).toBeInTheDocument()
  })

  it('切换 status 触发 onStatusChange', async () => {
    const user = userEvent.setup()
    const onStatusChange = vi.fn()
    render(
      <AppointmentFilterBar
        status="all"
        range={defaultRange}
        onStatusChange={onStatusChange}
        onRangeChange={() => {}}
      />,
    )
    await user.selectOptions(screen.getByRole('combobox', { name: /状态/ }), 'scheduled')
    expect(onStatusChange).toHaveBeenCalledWith('scheduled')
  })

  it('渲染日期范围快捷选项', () => {
    render(
      <AppointmentFilterBar
        status="all"
        range={defaultRange}
        onStatusChange={() => {}}
        onRangeChange={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /本周/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /本月/ })).toBeInTheDocument()
  })

  it('点击「本月」触发 onRangeChange 范围本月', async () => {
    const user = userEvent.setup()
    const onRangeChange = vi.fn()
    render(
      <AppointmentFilterBar
        status="all"
        range={defaultRange}
        onStatusChange={() => {}}
        onRangeChange={onRangeChange}
      />,
    )
    await user.click(screen.getByRole('button', { name: /本月/ }))
    expect(onRangeChange).toHaveBeenCalledTimes(1)
    const [r] = onRangeChange.mock.calls[0]
    expect(r.start).toBeInstanceOf(Date)
    expect(r.end).toBeInstanceOf(Date)
  })
})
```

### Step 5.2: 跑测试确认 RED

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-filter-bar.test.tsx`

Expected: FAIL — module 找不到。

### Step 5.3: 实现组件

文件：`frontend/src/domains/timebox/components/appointment-filter-bar.tsx`

```tsx
/**
 * @file appointment-filter-bar
 * @brief [026.02] T5 — /appointments 筛选条
 *
 * 状态筛选（all / scheduled / completed / cancelled）+ 日期范围快捷（本周 / 本月）。
 * 复用 shadcn Select（保持与 /timeboxes FilterBar 一致）。
 */

'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import type { AppointmentFilterStatus, AppointmentDateRange } from '@/domains/timebox/lib/appointment-filter'

const STATUS_OPTIONS: Array<{ value: AppointmentFilterStatus; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'scheduled', label: '计划' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
]

interface Props {
  status: AppointmentFilterStatus
  range: AppointmentDateRange
  onStatusChange: (s: AppointmentFilterStatus) => void
  onRangeChange: (r: AppointmentDateRange) => void
}

function rangeThisWeek(): AppointmentDateRange {
  const now = new Date()
  const dow = now.getDay() || 7  // 周日 getDay()=0, 转为 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - (dow - 1))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { start: monday, end: sunday }
}

function rangeThisMonth(): AppointmentDateRange {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

export function AppointmentFilterBar({ status, range, onStatusChange, onRangeChange }: Props) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-hairline">
      <label className="flex items-center gap-1 text-xs text-ink">
        状态
        <Select value={status} onValueChange={v => onStatusChange(v as AppointmentFilterStatus)}>
          <SelectTrigger aria-label="状态" className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <div className="flex items-center gap-1 text-xs text-ink">
        <span>日期</span>
        <Button size="sm" variant="secondary" aria-label="本周" onClick={() => onRangeChange(rangeThisWeek())}>
          本周
        </Button>
        <Button size="sm" variant="secondary" aria-label="本月" onClick={() => onRangeChange(rangeThisMonth())}>
          本月
        </Button>
        <span className="ml-2 text-body/70">
          {range.start.toLocaleDateString('zh-CN')} ~ {range.end.toLocaleDateString('zh-CN')}
        </span>
      </div>
    </div>
  )
}
```

### Step 5.4: 跑测试确认 GREEN

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-filter-bar.test.tsx`

Expected: PASS — 5 tests passed。

### Step 5.5: tsc

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -10`

Expected: 0 error。

### Step 5.6: Commit

```bash
git add frontend/src/domains/timebox/components/appointment-filter-bar.tsx \
        frontend/src/domains/timebox/components/__tests__/appointment-filter-bar.test.tsx
git commit -m "feat(026.02): T5 AppointmentFilterBar 状态+日期范围筛选条 + 5 测试

- status dropdown (all/scheduled/completed/cancelled) 复用 shadcn Select
- 日期快捷: 本周 / 本月 (派生纯函数)
- 显示当前 range 文字 (zh-CN locale)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: AppointmentMiniCalendar（独立组件，不污染 timebox MiniCalendar）

**Files:**
- Create: `frontend/src/domains/timebox/components/appointment-mini-calendar.tsx`
- Create: `frontend/src/domains/timebox/components/__tests__/appointment-mini-calendar.test.tsx`

**Interfaces:**
- Consumes: `currentDate: Date`、`appointments: AppointmentSummary[]`、`selectedDate?: Date`、`onDateSelect?: (date: Date) => void`
- Produces: `<AppointmentMiniCalendar ... />` — 渲染本月日历网格 + 过期/未过期双色标记
  - 过期 = `startTime < now AND status === 'scheduled'` → 红点（`text-error`）
  - 未过期 = `startTime >= now AND status === 'scheduled'` → 蓝点（`text-primary`）
  - 终态（cancelled/completed）不打点
  - 选中态：`aria-selected="true"` + primary ring

### Step 6.1: 写失败测试

文件：`frontend/src/domains/timebox/components/__tests__/appointment-mini-calendar.test.tsx`

```tsx
/**
 * @file appointment-mini-calendar.test
 * @brief [026.02] T6 — AppointmentMiniCalendar 独立组件测试
 *
 * IRON RULE：与 timebox MiniCalendar 完全独立（[026] T15 已锁定 timebox MiniCalendar
 *   为 timebox-only）。本组件接受 AppointmentSummary[]，按 status + startTime
 *   派生过期/未过期双色标记。
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppointmentMiniCalendar } from '../appointment-mini-calendar'
import type { AppointmentSummary } from '@/usom/types/summaries'

const mkAppt = (overrides: Partial<AppointmentSummary> = {}): AppointmentSummary => ({
  id: 'a-' + Math.random(),
  title: 'x',
  startTime: '2026-07-10T10:00:00.000Z',
  durationMin: 60,
  status: 'scheduled',
  ...overrides,
})

describe('AppointmentMiniCalendar', () => {
  const currentDate = new Date('2026-07-15T12:00:00Z')

  it('渲染本月日历网格（含标题行 + 6 周）', () => {
    const { container } = render(
      <AppointmentMiniCalendar currentDate={currentDate} appointments={[]} />,
    )
    // 7 个 weekday header (一~日)
    expect(screen.getAllByText(/^[一二三四五六日]$/u).length).toBeGreaterThanOrEqual(7)
    // 6 行 × 7 列 = 42 天格
    const days = container.querySelectorAll('[data-day-cell]')
    expect(days.length).toBe(42)
  })

  it('过期约定（startTime < now, status=scheduled）日期格显示红点', () => {
    const appt = mkAppt({ startTime: '2026-07-10T10:00:00Z', status: 'scheduled' })
    const { container } = render(
      <AppointmentMiniCalendar currentDate={currentDate} appointments={[appt]} />,
    )
    // 找到 10 号的日期格，检查有红点
    const day10 = container.querySelector('[data-day-cell="2026-07-10"]')
    expect(day10?.querySelector('[data-marker="expired"]')).toBeInTheDocument()
  })

  it('未过期约定（startTime >= now, status=scheduled）日期格显示蓝点', () => {
    const appt = mkAppt({ startTime: '2026-07-20T10:00:00Z', status: 'scheduled' })
    const { container } = render(
      <AppointmentMiniCalendar currentDate={currentDate} appointments={[appt]} />,
    )
    const day20 = container.querySelector('[data-day-cell="2026-07-20"]')
    expect(day20?.querySelector('[data-marker="future"]')).toBeInTheDocument()
  })

  it('终态约定（cancelled/completed）日期格不打点', () => {
    const appt1 = mkAppt({ id: '1', startTime: '2026-07-12T10:00:00Z', status: 'cancelled' })
    const appt2 = mkAppt({ id: '2', startTime: '2026-07-13T10:00:00Z', status: 'completed' })
    const { container } = render(
      <AppointmentMiniCalendar currentDate={currentDate} appointments={[appt1, appt2]} />,
    )
    expect(container.querySelector('[data-day-cell="2026-07-12"]')?.querySelector('[data-marker]')).toBeNull()
    expect(container.querySelector('[data-day-cell="2026-07-13"]')?.querySelector('[data-marker]')).toBeNull()
  })

  it('selectedDate 渲染选中态', () => {
    render(
      <AppointmentMiniCalendar
        currentDate={currentDate}
        appointments={[]}
        selectedDate={new Date('2026-07-15T00:00:00Z')}
      />,
    )
    const cells = screen.getAllByRole('gridcell')
    const selected = cells.find(c => c.getAttribute('aria-selected') === 'true')
    expect(selected).toBeDefined()
    expect(selected?.textContent).toContain('15')
  })

  it('点击日期触发 onDateSelect', async () => {
    const user = userEvent.setup()
    const onDateSelect = vi.fn()
    render(
      <AppointmentMiniCalendar
        currentDate={currentDate}
        appointments={[]}
        onDateSelect={onDateSelect}
      />,
    )
    // 找 15 号的格子（点击触发）
    const cells = screen.getAllByRole('gridcell')
    const day15 = cells.find(c => c.textContent?.trim() === '15')
    expect(day15).toBeDefined()
    await user.click(day15!)
    expect(onDateSelect).toHaveBeenCalledTimes(1)
    const [d] = onDateSelect.mock.calls[0]
    expect(d).toBeInstanceOf(Date)
    expect((d as Date).getDate()).toBe(15)
  })
})
```

### Step 6.2: 跑测试确认 RED

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-mini-calendar.test.tsx`

Expected: FAIL — module 找不到。

### Step 6.3: 实现组件

文件：`frontend/src/domains/timebox/components/appointment-mini-calendar.tsx`

```tsx
/**
 * @file appointment-mini-calendar
 * @brief [026.02] T6 — 约定专属 MiniCalendar（与 timebox MiniCalendar 完全独立）
 *
 * 派生规则：
 *   - 过期 = startTime < now AND status === 'scheduled' → text-error 红点
 *   - 未过期 = startTime >= now AND status === 'scheduled' → text-primary 蓝点
 *   - 终态（cancelled/completed）不打点（避免误导）
 *
 * 不复用 timebox MiniCalendar（[026] T15 IRON RULE 锁定 timebox-only）。
 * a11y：role="grid" + role="gridcell" + aria-selected。
 */

'use client'

import { cn } from '@/lib/utils'
import type { AppointmentSummary } from '@/usom/types/summaries'

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface Props {
  currentDate: Date
  appointments: AppointmentSummary[]
  selectedDate?: Date
  onDateSelect?: (date: Date) => void
}

export function AppointmentMiniCalendar({
  currentDate,
  appointments,
  selectedDate,
  onDateSelect,
}: Props) {
  const now = new Date()
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // 当月第一天
  const firstDay = new Date(year, month, 1)
  // 周一为周首：getDay()=0(周日) → 6
  const firstDow = (firstDay.getDay() + 6) % 7

  // 生成 42 天网格（6 周 × 7 列）
  const cells: Array<{ date: Date; inMonth: boolean }> = []
  for (let i = 0; i < 42; i++) {
    const dayOffset = i - firstDow
    const d = new Date(year, month, 1 + dayOffset)
    cells.push({ date: d, inMonth: d.getMonth() === month })
  }

  // 按 Y-M-D 索引标记
  const markers = new Map<string, 'expired' | 'future'>()
  for (const a of appointments) {
    if (a.status !== 'scheduled') continue  // 终态不打点
    const t = new Date(a.startTime)
    const key = ymd(t)
    const isExpired = t.getTime() < now.getTime()
    markers.set(key, isExpired ? 'expired' : 'future')
  }

  const selectedKey = selectedDate ? ymd(selectedDate) : null

  return (
    <div className="w-full">
      <div className="mb-1 text-sm font-medium text-ink">
        {year} 年 {month + 1} 月
      </div>
      <div role="grid" aria-label={`${year} 年 ${month + 1} 月日历`} className="grid grid-cols-7 gap-0.5 text-xs">
        {WEEKDAY_LABELS.map(label => (
          <div key={label} role="columnheader" className="py-1 text-center text-body/70">
            {label}
          </div>
        ))}
        {cells.map(({ date, inMonth }, idx) => {
          const key = ymd(date)
          const marker = markers.get(key)
          const isSelected = key === selectedKey
          return (
            <button
              key={idx}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              data-day-cell={key}
              onClick={() => onDateSelect?.(date)}
              className={cn(
                'relative flex flex-col items-center justify-center rounded-md py-1.5 transition-colors',
                inMonth ? 'text-ink' : 'text-body/40',
                isSelected && 'ring-2 ring-primary',
                !isSelected && 'hover:bg-hover-overlay',
              )}
            >
              <span>{date.getDate()}</span>
              {marker && (
                <span
                  data-marker={marker}
                  className={cn(
                    'absolute bottom-0.5 size-1 rounded-full',
                    marker === 'expired' ? 'bg-error' : 'bg-primary',
                  )}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

### Step 6.4: 跑测试确认 GREEN

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-mini-calendar.test.tsx`

Expected: PASS — 6 tests passed。

### Step 6.5: 验证 IRON RULE 不破

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/mini-calendar.regression.test.tsx`

Expected: PASS（timebox IRON RULE 守护测试不破）。

### Step 6.6: tsc

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -10`

Expected: 0 error。

### Step 6.7: Commit

```bash
git add frontend/src/domains/timebox/components/appointment-mini-calendar.tsx \
        frontend/src/domains/timebox/components/__tests__/appointment-mini-calendar.test.tsx
git commit -m "feat(026.02): T6 AppointmentMiniCalendar 独立组件 + 6 测试

- 派生规则: 过期 (startTime<now, scheduled) 红点 + 未过期 蓝点, 终态不打点
- a11y: role=grid/gridcell + aria-selected
- 独立组件不污染 timebox MiniCalendar (IRON RULE 守护测试不破)
- 42 天网格 (6 周 × 7 列), 邻月日淡灰

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: AppointmentDayView（两栏式日视图）

**Files:**
- Create: `frontend/src/domains/timebox/components/appointment-day-view.tsx`
- Create: `frontend/src/domains/timebox/components/__tests__/appointment-day-view.test.tsx`

**Interfaces:**
- Consumes: `appointments: AppointmentSummary[]`、`selectedDate: Date`、`appointmentsByDate: Map<string, AppointmentSummary[]>`、`onSelectDate: (date: Date) => void`
- Produces: `<AppointmentDayView ... />` — 左列表 + 右 MiniCalendar

### Step 7.1: 写失败测试

文件：`frontend/src/domains/timebox/components/__tests__/appointment-day-view.test.tsx`

```tsx
/**
 * @file appointment-day-view.test
 * @brief [026.02] T7 — AppointmentDayView 两栏式日视图组件测试
 */

import { render, screen } from '@testing-library/react'
import { AppointmentDayView } from '../appointment-day-view'
import type { AppointmentSummary } from '@/usom/types/summaries'

const mk = (overrides: Partial<AppointmentSummary> = {}): AppointmentSummary => ({
  id: 'a-' + Math.random(),
  title: '约定 ' + Math.random(),
  startTime: '2026-07-15T10:00:00Z',
  durationMin: 60,
  status: 'scheduled',
  ...overrides,
})

describe('AppointmentDayView', () => {
  const selectedDate = new Date('2026-07-15T00:00:00Z')
  const today = [
    mk({ id: '1', title: '晨会', startTime: '2026-07-15T09:00:00Z' }),
    mk({ id: '2', title: '复盘', startTime: '2026-07-15T14:00:00Z' }),
  ]
  const tomorrow = mk({ id: '3', title: '明日约定', startTime: '2026-07-16T10:00:00Z' })
  const byDate = new Map<string, AppointmentSummary[]>([
    ['2026-07-15', today],
    ['2026-07-16', [tomorrow]],
  ])

  it('渲染两栏布局', () => {
    const { container } = render(
      <AppointmentDayView
        appointments={today}
        selectedDate={selectedDate}
        appointmentsByDate={byDate}
        onSelectDate={() => {}}
      />,
    )
    // 列表区 + 日历区
    expect(container.querySelector('[data-day-list]')).toBeInTheDocument()
    expect(container.querySelector('[data-day-calendar]')).toBeInTheDocument()
  })

  it('左侧列表只显示选中日的约定', () => {
    render(
      <AppointmentDayView
        appointments={today}
        selectedDate={selectedDate}
        appointmentsByDate={byDate}
        onSelectDate={() => {}}
      />,
    )
    expect(screen.getByText('晨会')).toBeInTheDocument()
    expect(screen.getByText('复盘')).toBeInTheDocument()
    expect(screen.queryByText('明日约定')).not.toBeInTheDocument()
  })

  it('空列表显示 EmptyState', () => {
    render(
      <AppointmentDayView
        appointments={[]}
        selectedDate={selectedDate}
        appointmentsByDate={new Map()}
        onSelectDate={() => {}}
      />,
    )
    expect(screen.getByText(/该日无约定/)).toBeInTheDocument()
  })

  it('右侧日历使用 appointmentsByDate 渲染标记', () => {
    const { container } = render(
      <AppointmentDayView
        appointments={today}
        selectedDate={selectedDate}
        appointmentsByDate={byDate}
        onSelectDate={() => {}}
      />,
    )
    // 15 号（today, 未过期）有未来点；16 号（tomorrow）有未来点
    expect(container.querySelector('[data-day-cell="2026-07-15"] [data-marker="future"]')).toBeInTheDocument()
    expect(container.querySelector('[data-day-cell="2026-07-16"] [data-marker="future"]')).toBeInTheDocument()
  })
})
```

### Step 7.2: 跑测试确认 RED

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-day-view.test.tsx`

Expected: FAIL。

### Step 7.3: 实现组件

文件：`frontend/src/domains/timebox/components/appointment-day-view.tsx`

```tsx
/**
 * @file appointment-day-view
 * @brief [026.02] T7 — /appointments 日视图（左列表 + 右本月日历）
 *
 * 两栏布局：
 *   - 左：选中日的约定列表（按 startTime 升序）
 *   - 右：AppointmentMiniCalendar（带过期/未过期双色标记 + 跨月邻日）
 * 选中日期由父 AppointmentWorkspace 的 selectedDate state 控制。
 */

'use client'

import { AppointmentMiniCalendar } from './appointment-mini-calendar'
import { EmptyState } from '@/components/empty-state'
import { CalendarOff } from 'lucide-react'
import type { AppointmentSummary } from '@/usom/types/summaries'

interface Props {
  appointments: AppointmentSummary[]
  selectedDate: Date
  appointmentsByDate: Map<string, AppointmentSummary[]>
  onSelectDate: (date: Date) => void
}

function ymdKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function AppointmentDayView({
  appointments,
  selectedDate,
  appointmentsByDate,
  onSelectDate,
}: Props) {
  // 把 byDate 平铺为右侧日历需要的形式（标记只看 status+startTime）
  const calendarItems: AppointmentSummary[] = []
  for (const list of appointmentsByDate.values()) calendarItems.push(...list)

  // 按 startTime 升序
  const sorted = [...appointments].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  )

  return (
    <div className="flex h-full">
      {/* 左：列表 */}
      <div data-day-list className="flex-1 overflow-y-auto p-4">
        {sorted.length === 0 ? (
          <EmptyState
            icon={CalendarOff}
            title="该日无约定"
            description="在右侧日历选其他日期，或新建约定"
          />
        ) : (
          <div className="space-y-2">
            {sorted.map(it => (
              <div
                key={it.id}
                className="rounded-md border border-hairline bg-canvas p-3"
              >
                <div className="text-sm font-medium text-ink">{it.title}</div>
                <div className="text-xs text-body/70">
                  {new Date(it.startTime).toLocaleString('zh-CN')} · {it.durationMin} 分钟
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 右：日历 */}
      <div data-day-calendar className="w-72 shrink-0 border-l border-hairline p-3">
        <AppointmentMiniCalendar
          currentDate={selectedDate}
          appointments={calendarItems}
          selectedDate={selectedDate}
          onDateSelect={onSelectDate}
        />
      </div>
    </div>
  )
}
```

### Step 7.4: 跑测试确认 GREEN

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-day-view.test.tsx`

Expected: PASS — 4 tests passed。

### Step 7.5: tsc

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -10`

Expected: 0 error。

### Step 7.6: Commit

```bash
git add frontend/src/domains/timebox/components/appointment-day-view.tsx \
        frontend/src/domains/timebox/components/__tests__/appointment-day-view.test.tsx
git commit -m "feat(026.02): T7 AppointmentDayView 两栏式日视图 + 4 测试

- 左: 选中日约定列表 (按 startTime 升序, EmptyState 兜底)
- 右: AppointmentMiniCalendar 标记来自 appointmentsByDate 全集
- 数据契约: appointments (当日) + appointmentsByDate (整月标记)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: AppointmentMonthView（全月日历网格）

**Files:**
- Create: `frontend/src/domains/timebox/components/appointment-month-view.tsx`
- Create: `frontend/src/domains/timebox/components/__tests__/appointment-month-view.test.tsx`

**Interfaces:**
- Consumes: `currentDate: Date`、`appointments: AppointmentSummary[]`、`onSelectDate: (date: Date) => void`
- Produces: `<AppointmentMonthView ... />` — 全月日历网格，每格显示日期数字 + 该日约定数 + 状态色（scheduled/expired 区分）

### Step 8.1: 写失败测试

文件：`frontend/src/domains/timebox/components/__tests__/appointment-month-view.test.tsx`

```tsx
/**
 * @file appointment-month-view.test
 * @brief [026.02] T8 — AppointmentMonthView 全月网格组件测试
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppointmentMonthView } from '../appointment-month-view'
import type { AppointmentSummary } from '@/usom/types/summaries'

const mk = (overrides: Partial<AppointmentSummary> = {}): AppointmentSummary => ({
  id: 'a-' + Math.random(),
  title: 'x',
  startTime: '2026-07-10T10:00:00Z',
  durationMin: 60,
  status: 'scheduled',
  ...overrides,
})

describe('AppointmentMonthView', () => {
  const currentDate = new Date('2026-07-15T12:00:00Z')
  const items = [
    mk({ id: '1', startTime: '2026-07-10T09:00:00Z' }),  // 已过期
    mk({ id: '2', startTime: '2026-07-20T10:00:00Z' }),  // 未过期
  ]

  it('渲染 7 列 × 6 行 = 42 天格', () => {
    const { container } = render(
      <AppointmentMonthView
        currentDate={currentDate}
        appointments={items}
        onSelectDate={() => {}}
      />,
    )
    const cells = container.querySelectorAll('[role="gridcell"]')
    expect(cells.length).toBe(42)
  })

  it('有约定的日期显示计数', () => {
    const { container } = render(
      <AppointmentMonthView
        currentDate={currentDate}
        appointments={items}
        onSelectDate={() => {}}
      />,
    )
    expect(container.querySelector('[data-day-cell="2026-07-10"] [data-count]')?.textContent).toBe('1')
    expect(container.querySelector('[data-day-cell="2026-07-20"] [data-count]')?.textContent).toBe('1')
  })

  it('点击日期触发 onSelectDate 并跳日视图（父组件负责切换 viewMode）', async () => {
    const user = userEvent.setup()
    const onSelectDate = vi.fn()
    render(
      <AppointmentMonthView
        currentDate={currentDate}
        appointments={items}
        onSelectDate={onSelectDate}
      />,
    )
    const cells = screen.getAllByRole('gridcell')
    const day20 = cells.find(c => c.getAttribute('data-day-cell') === '2026-07-20')
    await user.click(day20!)
    expect(onSelectDate).toHaveBeenCalledTimes(1)
    const [d] = onSelectDate.mock.calls[0]
    expect((d as Date).getDate()).toBe(20)
  })

  it('当月以外日期显示淡灰', () => {
    const { container } = render(
      <AppointmentMonthView
        currentDate={currentDate}
        appointments={[]}
        onSelectDate={() => {}}
      />,
    )
    // 7月第一天是星期三，所以第 1 行前 2 格是邻月（6月最后两天）
    const cells = container.querySelectorAll('[role="gridcell"]')
    const firstCell = cells[0]
    expect(firstCell.className).toMatch(/text-body\/40|opacity/i)  // 邻月样式
  })
})
```

### Step 8.2: 跑测试确认 RED

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-month-view.test.tsx`

Expected: FAIL。

### Step 8.3: 实现组件

文件：`frontend/src/domains/timebox/components/appointment-month-view.tsx`

```tsx
/**
 * @file appointment-month-view
 * @brief [026.02] T8 — /appointments 月视图（全月日历网格）
 *
 * 7 列 × 6 行 = 42 天格；每格显示日期数字 + 当日约定计数 + 状态色（红=过期/蓝=未过期/灰=无）。
 * 点击日期触发 onSelectDate，父组件负责切换 viewMode='day'（跳日视图）。
 * 邻月日期淡灰 + 不打点。
 */

'use client'

import { cn } from '@/lib/utils'
import type { AppointmentSummary } from '@/usom/types/summaries'

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function ymdKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface Props {
  currentDate: Date
  appointments: AppointmentSummary[]
  onSelectDate: (date: Date) => void
}

export function AppointmentMonthView({ currentDate, appointments, onSelectDate }: Props) {
  const now = new Date()
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDay = new Date(year, month, 1)
  const firstDow = (firstDay.getDay() + 6) % 7

  const cells: Array<{ date: Date; inMonth: boolean }> = []
  for (let i = 0; i < 42; i++) {
    const dayOffset = i - firstDow
    const d = new Date(year, month, 1 + dayOffset)
    cells.push({ date: d, inMonth: d.getMonth() === month })
  }

  // 按 Y-M-D 聚合
  const dayMap = new Map<string, { count: number; hasExpired: boolean; hasFuture: boolean }>()
  for (const a of appointments) {
    if (a.status !== 'scheduled') continue
    const t = new Date(a.startTime)
    const key = ymdKey(t)
    const cur = dayMap.get(key) ?? { count: 0, hasExpired: false, hasFuture: false }
    cur.count += 1
    if (t.getTime() < now.getTime()) cur.hasExpired = true
    else cur.hasFuture = true
    dayMap.set(key, cur)
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-2 text-sm font-medium text-ink">
        {year} 年 {month + 1} 月
      </div>
      <div role="grid" aria-label={`${year} 年 ${month + 1} 月日历`} className="grid grid-cols-7 gap-1 text-xs">
        {WEEKDAY_LABELS.map(label => (
          <div key={label} role="columnheader" className="py-1 text-center text-body/70">
            {label}
          </div>
        ))}
        {cells.map(({ date, inMonth }, idx) => {
          const key = ymdKey(date)
          const info = dayMap.get(key)
          const color = info
            ? info.hasExpired
              ? 'bg-error/10 text-error'
              : 'bg-primary/10 text-primary'
            : ''
          return (
            <button
              key={idx}
              type="button"
              role="gridcell"
              data-day-cell={key}
              onClick={() => onSelectDate(date)}
              className={cn(
                'min-h-[60px] flex flex-col items-center justify-start rounded-md border border-hairline p-1 text-left transition-colors',
                inMonth ? 'bg-canvas text-ink' : 'bg-canvas/50 text-body/40',
                color,
                'hover:bg-hover-overlay',
              )}
            >
              <span className="text-sm font-medium">{date.getDate()}</span>
              {info && (
                <span data-count className="text-xs">
                  {info.count} 条
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

### Step 8.4: 跑测试确认 GREEN

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-month-view.test.tsx`

Expected: PASS — 4 tests passed。

### Step 8.5: tsc

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -10`

Expected: 0 error。

### Step 8.6: Commit

```bash
git add frontend/src/domains/timebox/components/appointment-month-view.tsx \
        frontend/src/domains/timebox/components/__tests__/appointment-month-view.test.tsx
git commit -m "feat(026.02): T8 AppointmentMonthView 全月网格 + 4 测试

- 7×6=42 天格, 每格显示日期 + 当日 scheduled 约定计数
- 颜色: 过期 bg-error/10 + 未过期 bg-primary/10, 终态不计入
- 点击触发 onSelectDate, 父组件负责切回日视图

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: AppointmentWorkspace 整合（视图状态 + 视图分发 + reload 扩窗）

**Files:**
- Modify: `frontend/src/domains/timebox/components/appointment-workspace.tsx`
- Create: `frontend/src/domains/timebox/components/__tests__/appointment-workspace.test.tsx`

**Interfaces:**
- Consumes: T1-T8 的所有组件 + filterAppointments
- Produces: 在现有 AppointmentWorkspace 内新增 viewMode / filterStatus / filterRange / selectedDate state；reload 窗口 -90d ~ +90d；视图分发（DayView | MonthView）

### Step 9.1: 写失败测试

文件：`frontend/src/domains/timebox/components/__tests__/appointment-workspace.test.tsx`

```tsx
/**
 * @file appointment-workspace.test
 * @brief [026.02] T9 — AppointmentWorkspace 整合测试（视图状态 + 视图分发）
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppointmentWorkspace } from '../appointment-workspace'
import type { AppointmentSummary } from '@/usom/types/summaries'

// mock server actions
vi.mock('@/app/actions/intent', () => ({
  getAppointmentsByRange: vi.fn(async () => []),
}))
vi.mock('@/app/actions/timebox', () => ({
  createAppointment: vi.fn(async () => ({ status: 'ok', appointment: null })),
  updateAppointment: vi.fn(async () => ({ status: 'ok' })),
  deleteAppointment: vi.fn(async () => ({ status: 'ok' })),
  completeAppointment: vi.fn(async () => ({ status: 'ok' })),
  revertAppointment: vi.fn(async () => ({ status: 'ok' })),
}))

const mk = (overrides: Partial<AppointmentSummary> = {}): AppointmentSummary => ({
  id: 'a-' + Math.random(),
  title: '测试',
  startTime: '2026-07-15T10:00:00Z',
  durationMin: 60,
  status: 'scheduled',
  ...overrides,
})

describe('AppointmentWorkspace [026.02] 整合', () => {
  it('渲染 PageBanner + ViewToggle + FilterBar', () => {
    render(<AppointmentWorkspace initialItems={[]} />)
    expect(screen.getByText('约定管理')).toBeInTheDocument()  // banner
    expect(screen.getByRole('group', { name: /视图模式/ })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /状态/ })).toBeInTheDocument()
  })

  it('默认 viewMode=day, 渲染 DayView', () => {
    const { container } = render(<AppointmentWorkspace initialItems={[mk()]} />)
    expect(container.querySelector('[data-day-list]')).toBeInTheDocument()
    expect(container.querySelector('[data-day-calendar]')).toBeInTheDocument()
  })

  it('点击月按钮切到 MonthView', async () => {
    const user = userEvent.setup()
    const { container } = render(<AppointmentWorkspace initialItems={[mk()]} />)
    await user.click(screen.getByRole('button', { name: /月视图/ }))
    // 切到月视图后, 不再有 day-list/day-calendar, 改用 grid
    expect(container.querySelector('[data-day-list]')).toBeNull()
    expect(container.querySelectorAll('[role="gridcell"]').length).toBe(42)
  })

  it('MonthView 点日期切回 DayView 并设 selectedDate', async () => {
    const user = userEvent.setup()
    const items = [mk({ id: '1', startTime: '2026-07-15T10:00:00Z' })]
    const { container } = render(<AppointmentWorkspace initialItems={items} />)
    await user.click(screen.getByRole('button', { name: /月视图/ }))
    // 在 MonthView 点击 15 号
    const day15 = container.querySelector('[data-day-cell="2026-07-15"]') as HTMLElement
    await user.click(day15)
    // 切回日视图
    expect(container.querySelector('[data-day-list]')).toBeInTheDocument()
  })

  it('status 筛选联动 DayView 列表', async () => {
    const user = userEvent.setup()
    const items = [
      mk({ id: '1', title: '计划约定', status: 'scheduled' }),
      mk({ id: '2', title: '已完成约定', status: 'completed' }),
    ]
    render(<AppointmentWorkspace initialItems={items} />)
    await user.selectOptions(screen.getByRole('combobox', { name: /状态/ }), 'completed')
    expect(screen.queryByText('计划约定')).not.toBeInTheDocument()
    expect(screen.getByText('已完成约定')).toBeInTheDocument()
  })
})
```

### Step 9.2: 跑测试确认 RED

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-workspace.test.tsx`

Expected: FAIL — banner / view-mode toggle / filter 还没接进来。

### Step 9.3: 改造 appointment-workspace.tsx

文件：`frontend/src/domains/timebox/components/appointment-workspace.tsx`

在 `import { AppointmentFormFields... }` 之后追加：

```tsx
import { AppointmentPageBanner } from './appointment-page-banner'
import { AppointmentViewToggle, type AppointmentViewMode } from './appointment-view-toggle'
import { AppointmentFilterBar } from './appointment-filter-bar'
import { AppointmentDayView } from './appointment-day-view'
import { AppointmentMonthView } from './appointment-month-view'
import { filterAppointments, type AppointmentFilterStatus } from '@/domains/timebox/lib/appointment-filter'
```

在 `AppointmentWorkspace` 函数体内（state 区域）追加：

```tsx
const [viewMode, setViewMode] = useState<AppointmentViewMode>('day')
const [filterStatus, setFilterStatus] = useState<AppointmentFilterStatus>('all')
const [filterRange, setFilterRange] = useState<{ start: Date; end: Date }>(() => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start, end }
})
const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
```

把 `reload()` 内部 start 改成 -90d：

```tsx
const reload = useCallback(() => {
  startReload(async () => {
    const start = new Date()
    start.setDate(start.getDate() - 90)  // [026.02] T9: 7→90 扩窗
    const end = new Date()
    end.setDate(end.getDate() + 90)
    try {
      const list = await getAppointmentsByRange(start, end)
      setItems(list)
    } catch (e) {
      console.error('[AppointmentWorkspace] reload failed', e)
      toast.error('约定列表刷新失败')
    }
  })
}, [])
```

把 `sorted` 派生改为基于 `filtered`：

```tsx
const filtered = useMemo(
  () => filterAppointments(items, filterStatus, filterRange),
  [items, filterStatus, filterRange],
)
const byDate = useMemo(() => {
  const m = new Map<string, AppointmentSummary[]>()
  for (const it of filtered) {
    const t = new Date(it.startTime)
    const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    const arr = m.get(key) ?? []
    arr.push(it)
    m.set(key, arr)
  }
  return m
}, [filtered])
const selectedKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
const dayAppointments = byDate.get(selectedKey) ?? []
```

把 `<div className="flex h-full">` 内的 `<div className="flex-1 flex flex-col min-h-0">` 部分改写为：

```tsx
<div className="flex-1 flex flex-col min-h-0">
  <AppointmentPageBanner />
  <div className="flex items-center justify-between px-4 py-2 border-b border-hairline gap-2">
    <AppointmentViewToggle viewMode={viewMode} onChange={setViewMode} />
    <div className="flex gap-2">
      {selected.size > 0 && (
        <Button size="sm" variant="destructive" onClick={handleDelete}>
          <Trash2 className="size-4 mr-1" />
          删除选中（{selected.size}）
        </Button>
      )}
      <Button
        size="sm"
        onClick={() => setCreateOpen(true)}
        aria-label="新建约定"
      >
        <Plus className="size-4 mr-1" />
        新建约定
      </Button>
    </div>
  </div>
  <AppointmentFilterBar
    status={filterStatus}
    range={filterRange}
    onStatusChange={setFilterStatus}
    onRangeChange={setFilterRange}
  />
  <div className="flex-1 min-h-0">
    {viewMode === 'day' ? (
      <AppointmentDayView
        appointments={dayAppointments}
        selectedDate={selectedDate}
        appointmentsByDate={byDate}
        onSelectDate={setSelectedDate}
      />
    ) : (
      <AppointmentMonthView
        currentDate={selectedDate}
        appointments={filtered}
        onSelectDate={d => {
          setSelectedDate(d)
          setViewMode('day')
        }}
      />
    )}
  </div>
</div>
```

**移除**原 `<div className="flex items-center justify-between px-4 py-3 border-b border-hairline">` 块（含 `<h1>我的约定</h1>` 行）和原 `<div className="flex-1 overflow-y-auto p-4">` 块（含 `sorted.map` 渲染）。

### Step 9.4: 跑测试确认 GREEN

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-workspace.test.tsx`

Expected: PASS — 5 tests passed。

### Step 9.5: 跑全量 vitest 验证无回归

Run:
```bash
cd frontend && npx vitest run --reporter=dot 2>&1 | tail -30
```

Expected: 旧测试 0 新增 fail；新测试全过。

### Step 9.6: tsc + lint

Run:
```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -10
cd frontend && npm run lint 2>&1 | tail -20
```

Expected: 0 error。

### Step 9.7: Commit

```bash
git add frontend/src/domains/timebox/components/appointment-workspace.tsx \
        frontend/src/domains/timebox/components/__tests__/appointment-workspace.test.tsx
git commit -m "feat(026.02): T9 AppointmentWorkspace 整合 viewMode + 视图分发 + reload 扩窗

- 新增 viewMode/filterStatus/filterRange/selectedDate state
- 视图分发: day → AppointmentDayView, month → AppointmentMonthView
- MonthView 点日期 → setSelectedDate + setViewMode('day')
- reload 窗口 7d→90d (与 page.tsx 初始加载一致, 避免丢数据)
- 删除原 inline 列表渲染块, 用 DayView 替代 (EmptyState 由 DayView 内置)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: /appointments/page.tsx 扩窗到 -90d

**Files:**
- Modify: `frontend/src/app/appointments/page.tsx`

**Interfaces:**
- Consumes: `getAppointmentsByRange`（server action）
- Produces: 加载窗口 -90d ~ +90d（与 workspace reload 一致）

### Step 10.1: 改 page.tsx

文件：`frontend/src/app/appointments/page.tsx`

修改：

```tsx
// 查询窗口：过去 7 天 + 未来 90 天（A3.1 范式，brief §Step 1 明确）
const start = new Date()
start.setDate(start.getDate() - 7)
const end = new Date()
end.setDate(end.getDate() + 90)
```

为：

```tsx
// 查询窗口：过去 90 天 + 未来 90 天（[026.02] T10：7→90 扩窗以支持 Month 视图 90 天回看，
//   与 AppointmentWorkspace reload 窗口一致，避免 reload 后数据丢失）
const start = new Date()
start.setDate(start.getDate() - 90)
const end = new Date()
end.setDate(end.getDate() + 90)
```

### Step 10.2: tsc + vitest

Run:
```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -10
cd frontend && npx vitest run src/domains/timebox/components/__tests__/appointment-workspace.test.tsx 2>&1 | tail -10
```

Expected: 0 tsc error；workspace 测试仍全过。

### Step 10.3: Commit

```bash
git add frontend/src/app/appointments/page.tsx
git commit -m "fix(026.02): T10 /appointments 加载窗口 7d→90d, 与 workspace reload 一致

[026.02] 月视图需 90 天回看, 与 AppointmentWorkspace reload 同步。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 11: 浏览器 E2E + docs 同步 + CHANGELOG

**Files:**
- Create: `CHANGELOG.md` 追加 `[026.02]` 段
- Modify: `docs/database-design.md`（若 schema 有改，本任务不改；如无改仅 footer bump）
- Modify: `docs/usom-design.md`（若类型有改，本任务不改；如无改仅 footer bump）
- Modify: `docs/UI-DESIGN-SPEC.md`（无 UI 规范新增，仅交叉引用 PageBanner）

### Step 11.1: /browse E2E 验证

Run: `gstack /browse` 或类似命令启动浏览器：

任务清单：
1. 启动 dev server：`cd frontend && npm run dev`
2. 打开 `/appointments`
3. 验证：
   - 顶部 Banner 显示「约定管理」+ timebox 图片集
   - 默认 viewMode = day，左列表 + 右本月日历
   - 日历格有过期/未过期双色点
   - 切换 status = 已完成 → 列表只剩已完成
   - 切换 viewMode = 月 → 显示全月网格
   - 在月视图点击某天 → 自动切回日视图并锚定该日
   - 触发 `/createAppointment`（AI 助手对话） → CNUI 卡片正常渲染（§1 修复验证）
   - 同上 `/editAppointment`、`/deleteAppointment`

### Step 11.2: lifeware-neat 双向互验

Run: `/lifeware-neat`

交叉验证：
- DB schema ↔ USOM 对象 ↔ manifest 一致
- 代码注释与中文 doc 同步
- docs footer 版本号 bump（如果 spec 引用了具体文件）

### Step 11.3: CHANGELOG 追加

文件：`CHANGELOG.md` 追加（参考 [026.01] 段格式）：

```markdown
## [026.02] — 2026-07-08 — 约定管理优化

### 决策
- D1：客户端 CNUI surface 注册修复（[026.01] 回归 — server 注册了，client 漏 3 个 surface）
- D2：/appointments 重构为 Day/Month 双视图 + 筛选条 + PageBanner
- D3：AppointmentMiniCalendar 独立组件（不污染 timebox MiniCalendar IRON RULE）
- D4：状态名统一 `viewMode`（与 [023.06] `dateMode` 区分，spec §7.2）

### 改动
- §1 修复：`nexus/ai-runtime/cnui/register-client-surfaces.ts` 补 3 行 register + 守护测试
- §2 重构：新增 6 组件（PageBanner/ViewToggle/FilterBar/MiniCalendar/DayView/MonthView）+ filterAppointments 纯函数
- /appointments 加载窗口 7d→90d

### 验证
- vitest base=head 0 新增 fail（守护测试 + IRON RULE 双不破）
- tsc 0 / lint 0 / validate:manifest 0
- /browse 4 场景全过（日/月切换 + 筛选 + §1 修复）

### Design authority
- spec: `docs/superpowers/specs/2026-07-08-026-02-appointment-management-optimization-design.md`
- plan: `docs/superpowers/plans/2026-07-08-026-02-appointment-management-optimization-plan.md`（本文件）

### 已知债
- TD-022 5 项 deferred（archetype clearing 语义 / UUID 验证 / perf N+1 / originalPrompt banner）→ 拆 [026.02.1] follow-up
```

### Step 11.4: docs/database-design + usom-design footer bump（若需要）

如果 spec 实施未触及 schema 或 USOM 对象，跳过；否则 bump footer 到 2026_07_08。本任务预计不动。

### Step 11.5: 全量验证

Run:
```bash
cd frontend && npm run lint 2>&1 | tail -10
cd frontend && npx tsc --noEmit 2>&1 | tail -10
cd frontend && npx vitest run --reporter=dot 2>&1 | tail -10
cd frontend && npm run validate:manifest 2>&1 | tail -10
cd frontend && npm run validate:domain-structure 2>&1 | tail -10
```

Expected: 0 error 全过。

### Step 11.6: Commit + push

```bash
git add CHANGELOG.md docs/
git commit -m "docs(026.02): CHANGELOG 段 + docs 同步

- spec §1+§2 落地后 changelog 完整记录决策/改动/验证/authority
- lifeware-neat 双向互验通过
- tsc/vitest/validate:manifest 全 0

Co-Authored-By: Claude <noreply@anthropic.com>"
git push origin main
```

---

## Self-Review Checklist（执行前 controller 自查）

| # | 检查项 | 结果 |
|---|---|---|
| 1 | spec §1 G1：3 surface 客户端注册 → T1 覆盖 | ✅ |
| 2 | spec §1 IRON RULE 守护 → T1 测试覆盖 | ✅ |
| 3 | spec §2 G2 Day/Month 切换 → T4 + T9 覆盖 | ✅ |
| 4 | spec §2 G3 Day 视图双栏 → T7 覆盖 | ✅ |
| 5 | spec §2 G4 Month 视图全月网格 → T8 覆盖 | ✅ |
| 6 | spec §2 G5 筛选条 → T5 + T9 覆盖 | ✅ |
| 7 | spec §2 G6 PageBanner → T3 + T9 覆盖 | ✅ |
| 8 | spec §3 AppointmentMiniCalendar 独立 → T6 覆盖 | ✅ |
| 9 | spec §4.1 reload 窗口扩窗 → T9 + T10 覆盖 | ✅ |
| 10 | spec §6 测试策略：7 单元 + 2 回归 + 4 E2E | ✅（T1 守护 + T6 IRON RULE 不破 = 2 回归；T2/T3/T4/T5/T6/T7/T8 = 7 单元；E2E = T11） |
| 11 | spec §7.2 viewMode 命名 → T4 + T9 统一 | ✅ |
| 12 | spec §7.3 range 扩窗 → T9 + T10 实施 | ✅ |
| 13 | 没有 placeholder（TBD/TODO/等） | ✅（grep 0 hit） |
| 14 | 类型一致：AppointmentFilterStatus / AppointmentDateRange 在 T2 定义、T5/T9 引用 | ✅ |
| 15 | 文件路径精确（无 `~` 或相对路径） | ✅ |
| 16 | 测试命令 + Expected 输出完整 | ✅ |
| 17 | 每个 task 都有 commit 步骤 | ✅ |

---

## 执行选项

Plan 已写并 commit 到 `docs/superpowers/plans/2026-07-08-026-02-appointment-management-optimization-plan.md`。

**两个执行选项：**

1. **Subagent-Driven (推荐)** — 每任务派发 fresh subagent + 任务级 review + 全分支 review。**CLAUDE.md 第 2 类任务「普通任务（多文件、边界清晰的新功能/重构）」推荐流程**。

2. **Inline Execution** — 当前会话批量执行 + checkpoint review。

**选哪个？**（按 CLAUDE.md + memory [[project-023-05-1-timebox-cleanup]] 推荐 Subagent-Driven）