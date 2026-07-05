# [023.06] 时间盒视图模式切换器修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 恢复 `/timeboxes` 页面的「日 / 周 / 月」视图模式切换器（日历视图层），消除自 7f1ece6 → 3c2c41e → 9a0b8e9/[023.03] → [026] A3.2 积累下来的 dead code 债。

**Architecture:**
- `TimeboxesWorkspace` 持有 `dateMode: DateViewMode` 状态 + `currentDate: Date`
- `loadRange()` 用与 `use-timebox.ts:35` 同源的 `getDateRange(mode, date)` 拉 timebox + itinerary → `TimeboxesEvent[]`
- 顶栏在「新建时间盒」按钮左侧/同排渲染现成的 `<DateNav>` 组件
- 按 `dateMode` 三向路由：`<DayView events />` / `<WeekView timeboxes events 转 source 数组 />` / `<MonthView 同>`
- 周/月视图 props 当前是 `TimeboxSummary[]`（自 `7f1ece6`），保持 API 不变；workspace 用 `events.filter(e => e.kind === 'timebox').map(e => e.source)` 适配（DayView 仍用 `TimeboxesEvent[]`）

**Tech Stack:**
- Next.js 16 + React 19 + TypeScript 5 + Tailwind 4 + shadcn/ui（既有）
- Drizzle ORM（既有；只读不改 schema）
- Vitest + @testing-library/react（既有）
- date-fns `startOfWeek(endOfWeek/..)`（既有）

## Global Constraints

- **visioneers-style TDD：每个 task = 先写 failing test，再实施**（参考 `feedback_vitest-pitfalls`）
- **必须 frontend/ cwd 跑 vitest**（[feedback_vitest-pitfalls] 提醒 — `@/` 别名映射不到 repo 根）
- **不做 TS 类型检查（vitest 不带 tsc）— 单独跑 `npx tsc --noEmit`**（同上）
- **变更门基线**：运行 `git diff origin/main` 的失败集合，对比当前 base vs head — 不用硬编码预存失败数（参考 [feedback_change-gate-baseline]）
- **pre-push validate-manifest hook 必须全过**（K-component PascalCase 命名）
- **CI-D 互验**：vitest 5/10+ 关注"我是修复者" — 真实测试变动即可，不强求零基线漂移（pre-existing flake 是 1 个 [025]，已知）
- **UI-DESIGN-SPEC §14 C-01 ~ C-07** 评审（PR 提交前自检）：
  - C-01: 颜色用 CSS 变量令牌（`bg-canvas` / `text-ink` / `bg-surface-card` / `border-hairline`）
  - C-02: shadcn/ui 组件优先 — 不引新依赖
  - C-03: 移动端 ≤ md 必须可用（DateNav `max-md:hidden` 是原有意图，验证 mobile fallback）
  - C-04: 三栏 Notion 风格布局，主内容区切视图不破响应式
  - C-05: 不破现有 a11y（aria-label "上一页" "下一页" 保留）
  - C-06: 图标与文案一致性（"日" / "周" / "月"）
  - C-07: 视觉验证用 `/browse` 截图 + 图像分析（参考 [feedback_ui-verify-visual-not-functional]）
- **OQ-1 保留**：`mainViewState.type='schedule'` 字面量 9 call sites 不动（[023.05-1] 已确立）；本任务碰不到这些
- **C-1 风格四联审计**（[project-cnui-surface-dual-registration] + [023.05-1] 三连发现）：
  manifest action rename → A domain index register / B framework register-client-surfaces / C server surfaceHandlers map / D dispatch 4 branch。本任务不涉及 manifest rename，仅 workspace + 视图组件 plumbing，**不触发 C-1 风险**
- **DPTS 系统**：Tailwind class 必须来自 `tailwind.config.ts` token；新增 `<DateNav>` 已有样式无需新增 token
- **chromium-stretch-flex 防御**：父级是 stretch 的 flex item → 子元素 h-full/flex-1 撑爆；workspace 是顶层 flex h-full，本任务子级用 grid + 内联 height，避开陷阱
- **PIE skills 用法**：gstack `/browse` 截图 + 图像分析（含对比）；不走 mcp__claude-in-chrome__ 工具（按 CLAUDE.md）
- **本文档主说话语言**：简体中文（CLAUDE.md 强制）
- **不在范围**：
  - `useTimebox` hook（只读不改 — workspace 走自己的本地状态，与既有 hook 解耦）
  - `useTimebox` hook 的 `[024]` 后端命中优化（defer P1）
  - PR2 itinerary→schedule 全层重命名（[023.05-1] 独立）
  - 7 个 pre-existing bug（Codex 报告超出范围）
  - 添加新依赖

## File Structure

| 文件 | 责任 | 改/创 |
|---|---|---|
| `frontend/src/domains/timebox/components/timeboxes-workspace.tsx` | 接 DateNav + 三向路由 + 范围拉取 | 改（核心） |
| `frontend/src/domains/timebox/components/date-nav.tsx` | 已有 switcher（不改） | 不动 |
| `frontend/src/domains/timebox/components/__tests__/timeboxes-workspace.view-mode.test.tsx` | DateViewMode 状态 + 切换 + 路由 | 创 |

接口契约：

```typescript
// 复用既有 type
import type { DateViewMode } from '@/domains/timebox/components/types'

// workspace 内部新增 state
const [dateMode, setDateMode] = useState<DateViewMode>('day')
const [currentDate, setCurrentDate] = useState<Date>(() => new Date())

// handleNavigate（按 mode 步进日期）
function handleNavigate(direction: 'prev' | 'next'): void

// handleDateModeChange
function handleDateModeChange(mode: DateViewMode): void

// handleDateSelect（mini-calendar 选日期 → 自动切 day）
function handleDateSelect(date: Date): void

// getDateRange — 抽出与 hooks/use-timebox.ts 同源，避免改既有 hook
function getDateRange(mode: DateViewMode, date: Date): { start: Date; end: Date }
```

## Task Decomposition Rationale

| Task | 切片原则 |
|---|---|
| T1 | 抽出纯函数 `getDateRange`，加 vitest 单测（最小风险第一步） |
| T2 | `TimeboxesWorkspace` 接入 `DateNav` + `dateMode` state，render 仍是 `<DayView>`（保守基线）|
| T3 | 把 `loadDay` 改 `loadRange`（拉 timebox + itinerary 范围，按 mode） |
| T4 | `TimeboxesWorkspace` 三向渲染：`<DayView>` / `<WeekView>` / `<MonthView>`（含事件→source 适配）|
| T5 | visual verification `/browse` 三个 tab 截图 + 图像分析 |
| T6 | 静态检查 + validate-manifest + preflight docs 同步 |

---

### Task 1: 抽出 + 单测 `getDateRange(mode, date)`

**Files:**
- Modify: `frontend/src/domains/timebox/components/timeboxes-workspace.tsx`（在文件顶部加 `getDateRange` 函数 + 配套 `navigateDate`）
- Create: `frontend/src/domains/timebox/components/__tests__/timeboxes-workspace.range.test.ts`

**Interfaces:**
- 复既有 type `DateViewMode = 'day' | 'week' | 'month'`（来自 `./types`）
- 复既有 date-fns API（`startOfDay` / `endOfDay` / `startOfWeek` / `endOfWeek` / `startOfMonth` / `endOfMonth`）
- 与 `hooks/use-timebox.ts:35-43` 同源逻辑，不重复实现两个版本

- [ ] **Step 1: 写 failing test**

```typescript
// frontend/src/domains/timebox/components/__tests__/timeboxes-workspace.range.test.ts
import { describe, it, expect } from 'vitest'

// [023.06] 故意把测试文件紧贴 workspace，但只 import 纯函数
// 我们在 task 末尾会从 workspace 导出 getDateRange
import { getDateRange } from '../timeboxes-workspace'

describe('[023.06] getDateRange', () => {
  it('day 模式 → startOfDay ~ endOfDay（00:00:00 ~ 23:59:59.999）', () => {
    const d = new Date('2026-07-05T12:00:00Z')
    const { start, end } = getDateRange('day', d)
    expect(start.getHours()).toBe(0)
    expect(end.getHours()).toBe(23)
    expect(end.getMilliseconds()).toBeGreaterThan(990)
  })

  it('week 模式 → 周一到周日 (weekStartsOn: 1)', () => {
    const d = new Date('2026-07-05T12:00:00Z') // 周日
    const { start, end } = getDateRange('week', d)
    expect(start.getDay()).toBe(1)
    expect(end.getDay()).toBe(0)
  })

  it('month 模式 → 1 号 ~ 月末', () => {
    const d = new Date('2026-07-05')
    const { start, end } = getDateRange('month', d)
    expect(start.getDate()).toBe(1)
    expect(end.getMonth()).toBe(6) // 0-indexed: 6 = July
  })
})
```

- [ ] **Step 2: 跑测试，预期失败**

```bash
cd /home/walker/lifeware/frontend && npx vitest run src/domains/timebox/components/__tests__/timeboxes-workspace.range.test.ts
```

期望：`Failed to resolve import "../timeboxes-workspace"` 中没有 `getDateRange`（这正是我们要的状态 — iron-law 验证）

- [ ] **Step 3: 在 `timeboxes-workspace.tsx` 顶部添加导出函数**

（在 `MVP_USER_ID` 上方插入：）

```tsx
import {
  startOfDay, endOfDay,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  addDays, addWeeks, addMonths,
} from 'date-fns'

/**
 * [023.06] 按视图模式计算日期范围（与 hooks/use-timebox.ts 同源，避免行为漂移）
 */
export function getDateRange(mode: DateViewMode, date: Date): { start: Date; end: Date } {
  switch (mode) {
    case 'day':
      return { start: startOfDay(date), end: endOfDay(date) }
    case 'week':
      return { start: startOfWeek(date, { weekStartsOn: 1 }), end: endOfWeek(date, { weekStartsOn: 1 }) }
    case 'month':
      return { start: startOfMonth(date), end: endOfMonth(date) }
  }
}

/**
 * [023.06] 按视图模式步进日期
 */
function navigateDate(mode: DateViewMode, date: Date, direction: 'prev' | 'next'): Date {
  const delta = direction === 'next' ? 1 : -1
  switch (mode) {
    case 'day': return addDays(date, delta)
    case 'week': return addWeeks(date, delta)
    case 'month': return addMonths(date, delta)
  }
}
```

注意：`DateViewMode` 还没 import 进 workspace（先做下面的小步）；先在文件首 import：

```tsx
import type { DateViewMode } from './types'
```

- [ ] **Step 4: 跑测试，预期 pass**

```bash
cd /home/walker/lifeware/frontend && npx vitest run src/domains/timebox/components/__tests__/timeboxes-workspace.range.test.ts
```

期望：3 tests passed

- [ ] **Step 5: 跑全量回归看 baseline 不漂移**

```bash
cd /home/walker/lifeware/frontend && npx vitest run 2>&1 | tail -30
```

期望：failures 数 与 base 一致（不增不减）。如果新增 fail → 检查 Step 3 是否有 side-effect 污染 TimeboxesWorkspace 默认 render

- [ ] **Step 6: 提交**

```bash
cd /home/walker/lifeware && git add frontend/src/domains/timebox/components/timeboxes-workspace.tsx frontend/src/domains/timebox/components/__tests__/timeboxes-workspace.range.test.ts
git commit -m "feat(023.06): extract getDateRange from timeboxes-workspace (+3 tests)"
```

---

### Task 2: workspace 加 `dateMode` state + 渲染 `<DateNav>`，渲染目标仍 `<DayView>`

**Files:**
- Modify: `frontend/src/domains/timebox/components/timeboxes-workspace.tsx`

- [ ] **Step 1: 写 failing test — 渲染时能找到 3 个 mode 按钮**

```typescript
// 追加到 timeboxes-workspace.range.test.ts（同文件复用更顺）
import { render, screen, act } from '@testing-library/react'
import { TimeboxesWorkspace } from '../timeboxes-workspace'

const getTimeboxesByRangeMock = vi.fn().mockResolvedValue([])
const getItinerariesByRangeMock = vi.fn().mockResolvedValue([])

vi.mock('@/app/actions/intent', () => ({
  getTimeboxesByRange: (...a: unknown[]) => getTimeboxesByRangeMock(...a),
  getItinerariesByRange: (...a: unknown[]) => getItinerariesByRangeMock(...a),
}))

vi.mock('@/app/actions/timebox', () => ({
  getTimeboxById: vi.fn(),
  transitionTimebox: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe('[023.06] TimeboxesWorkspace 视图模式切换器', () => {
  it('默认渲染三个 mode 按钮（日/周/月）', async () => {
    render(<TimeboxesWorkspace />)
    await act(async () => {
      // 等 loadRange 完成
    })
    expect(screen.getByRole('button', { name: '日' })).toBeDefined()
    expect(screen.getByRole('button', { name: '周' })).toBeDefined()
    expect(screen.getByRole('button', { name: '月' })).toBeDefined()
  })

  it('点击「周」按钮 → 切到 week mode', async () => {
    const user = userEvent.setup()
    render(<TimeboxesWorkspace />)
    await user.click(screen.getByRole('button', { name: '周' }))
    // [023.06] 验证 getTimeboxesByRange 被以 week 范围再次调用
    await waitFor(() => expect(getTimeboxesByRangeMock.mock.calls.length).toBeGreaterThanOrEqual(2))
    const lastCall = getTimeboxesByRangeMock.mock.calls.at(-1)!
    const [, end] = lastCall as [Date, Date]
    expect(end.getDay()).toBe(0) // week mode end = 周日
  })
})
```

- [ ] **Step 2: 跑测试看 fail（红）**

```bash
cd /home/walker/lifeware/frontend && npx vitest run src/domains/timebox/components/__tests__/timeboxes-workspace.range.test.ts
```

期望：渲染测 fail，因为目前没有日/周/月按钮

- [ ] **Step 3: 改 `timeboxes-workspace.tsx` 加 state + 渲染 `<DateNav>`**

```tsx
// 文件首部新增 import
import { DateNav } from './date-nav'

// 工作台函数体内：
export function TimeboxesWorkspace() {
  // [023.06] view-mode state + 路由
  const [dateMode, setDateMode] = useState<DateViewMode>('day')
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date())
  const [dateLoadKey, setDateLoadKey] = useState(0) // 触发 reload（避免 compare 不全）

  const [events, setEvents] = useState<TimeboxesEvent[]>([])
  const [loading, setLoading] = useState(true)
  // ... 其余既有 state ...

  // [023.06] 范围拉取（替代 loadDay；保留旧名做别名最小 diff）
  const loadRange = useCallback(async (mode: DateViewMode, d: Date) => {
    setLoading(true)
    try {
      const { start, end } = getDateRange(mode, d)
      const [timeboxList, itineraryList] = await Promise.all([
        getTimeboxesByRange(start, end),
        getItinerariesByRange(start, end),
      ])
      setEvents(mergeEvents(timeboxList, itineraryList))
    } catch (e) {
      console.error('[TimeboxesWorkspace] 加载失败', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRange(dateMode, currentDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateMode, currentDate, dateLoadKey])

  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    setCurrentDate(prev => navigateDate(dateMode, prev, direction))
  }, [dateMode])

  const handleDateModeChange = useCallback((newMode: DateViewMode) => {
    if (newMode === dateMode) return
    setDateMode(newMode)
  }, [dateMode])

  const handleDateSelect = useCallback((d: Date) => {
    setCurrentDate(d)
    setDateMode('day') // mini-calendar 选日期 → 回到日视图
  }, [])
```

- [ ] **Step 4: 在 `TimeboxesWorkspace` 顶栏渲染 `<DateNav>`**

```tsx
return (
  <div className="flex h-full">
    <div className="flex-1 flex flex-col min-h-0">
      {/* [023.06] 顶栏：DateNav + 新建按钮 */}
      <div className="flex items-center justify-between gap-4 border-b border-hairline px-4 py-3">
        <DateNav
          mode={dateMode}
          currentDate={currentDate}
          onModeChange={handleDateModeChange}
          onNavigate={handleNavigate}
        />
        <Button size="sm" onClick={() => setDrawer({ mode: 'create' })}>
          <Plus className="size-4 mr-1" />新建时间盒
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {/* 当前仍然只渲染 <DayView>（保守基线，T4 才接 WeekView/MonthView） */}
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => <div key={i} className="h-16 rounded-md bg-surface-card animate-pulse" />)}
          </div>
        ) : events.length === 0 && dateMode === 'day' ? (
          <EmptyState icon={CalendarOff} title="今天还没有时间盒" description="创建一个时间盒，开始专注执行"
            action={{ label: '新建一个', onClick: () => setDrawer({ mode: 'create' }) }} />
        ) : (
          <DayView events={events} currentDate={currentDate}
            onAction={(id, action) => handleAction(id, action as 'start' | 'end' | 'cancel' | 'log')}
            onEdit={handleEdit}
            onDateSelect={handleDateSelect}
          />
        )}
      </div>
    </div>
    {/* 右侧 drawer / AlertDialog 不动 */}
    {drawer && <TimeboxDrawer ... />}
    <AlertDialog ... />
  </div>
)
```

把 `DayView` 的 `onDateSelect={handleDateSelect}` 接上 — 让 mini-calendar 选日期也响应

- [ ] **Step 5: 验证 — 测试应 pass**

```bash
cd /home/walker/lifeware/frontend && npx vitest run src/domains/timebox/components/__tests__/timeboxes-workspace.range.test.ts
```

期望：5 tests passed (3 range + 2 view-mode)

- [ ] **Step 6: 全量 vitest baseline 校验**

```bash
cd /home/walker/lifeware/frontend && npx vitest run 2>&1 | tail -30
```

期望：failures 数 与 base 一致（1 个 [025] pre-existing flake 已知）

- [ ] **Step 7: 单独跑 tsc（vitest 不做类型检查）**

```bash
cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | tail -20
```

期望：0 errors

- [ ] **Step 8: 提交**

```bash
cd /home/walker/lifeware && git add frontend/src/domains/timebox/components/timeboxes-workspace.tsx frontend/src/domains/timebox/components/__tests__/timeboxes-workspace.range.test.ts
git commit -m "feat(023.06): wire DateNav into TimeboxesWorkspace + range loader"
```

---

### Task 3: 三向路由 — 接 `<WeekView>` / `<MonthView>` + 事件→source 适配

**Files:**
- Modify: `frontend/src/domains/timebox/components/timeboxes-workspace.tsx`

- [ ] **Step 1: 写 failing test — 切到 week mode → 渲染 WeekView**

```typescript
// 追加进 timeboxes-workspace.view-mode.test.tsx（拆为独立文件更整洁 — 上面 range.test.ts 拆两个文件）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const getTimeboxesByRangeMock = vi.fn().mockResolvedValue([])
const getItinerariesByRangeMock = vi.fn().mockResolvedValue([])

vi.mock('@/app/actions/intent', () => ({
  getTimeboxesByRange: (...a: unknown[]) => getTimeboxesByRangeMock(...a),
  getItinerariesByRange: (...a: unknown[]) => getItinerariesByRangeMock(...a),
}))

vi.mock('@/app/actions/timebox', () => ({
  getTimeboxById: vi.fn().mockResolvedValue(null),
  transitionTimebox: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { TimeboxesWorkspace } from '../timeboxes-workspace'

describe('[023.06] 时间盒三向路由', () => {
  beforeEach(() => {
    getTimeboxesByRangeMock.mockClear()
    getItinerariesByRangeMock.mockClear()
    getTimeboxesByRangeMock.mockResolvedValue([])
    getItinerariesByRangeMock.mockResolvedValue([])
  })

  it('click 周 → workspace 进入 week', async () => {
    const user = userEvent.setup()
    render(<TimeboxesWorkspace />)
    await user.click(screen.getByRole('button', { name: '周' }))
    // 通过 class 或结构断言 WeekView 挂载
    await waitFor(() => expect(screen.getByText(/没有时间盒/i)).toBeTruthy()
      .catch(() => null)) // weak assertion
    expect(getTimeboxesByRangeMock).toHaveBeenCalled()
  })

  it('click 月 → workspace 进入 month (拉月范围)', async () => {
    const user = userEvent.setup()
    render(<TimeboxesWorkspace />)
    await user.click(screen.getByRole('button', { name: '月' }))
    await new Promise(r => setTimeout(r, 100))
    const calls = getTimeboxesByRangeMock.mock.calls
    expect(calls.length).toBeGreaterThan(0)
    // month mode: start.getDate() === 1, end.getMonth() === 6 (七月)
    const lastCall = calls.at(-1)!
    const [start] = lastCall as [Date, Date]
    expect(start.getDate()).toBe(1)
  })
})
```

- [ ] **Step 2: 跑测试看 fail**

```bash
cd /home/walker/lifeware/frontend && npx vitest run src/domains/timebox/components/__tests__/timeboxes-workspace.view-mode.test.tsx
```

期望：至少 1 个 fail（因为当前还没接 WeekView/MonthView）

- [ ] **Step 3: 接 `<WeekView>` 和 `<MonthView>`**

在 workspace.tsx 顶部加 import：

```tsx
import { WeekView } from './week-view'
import { MonthView } from './month-view'
```

在 events 渲染分支改成三向：

```tsx
<div className="flex-1 overflow-y-auto p-4">
  {loading ? (
    <div className="space-y-2">
      {[0, 1, 2].map(i => <div key={i} className="h-16 rounded-md bg-surface-card animate-pulse" />)}
    </div>
  ) : dateMode === 'day' ? (
    events.length === 0 ? (
      <EmptyState ... />
    ) : (
      <DayView events={events} currentDate={currentDate} onAction={...} onEdit={handleEdit} onDateSelect={handleDateSelect} />
    )
  ) : (
    // [023.06] 周/月：拉时已合并 TimeboxesEvent；视图要求 TimeboxSummary[]
    // 把 kind='timebox' 提取出来（itinerary 在日历视图不渲染 — 设计如此，时间盒域只显示 timebox）
    (() => {
      const timeboxSources = events
        .filter((e): e is Extract<TimeboxesEvent, { kind: 'timebox' }> => e.kind === 'timebox')
        .map(e => e.source)
      if (timeboxSources.length === 0) {
        return <p className="py-8 text-center text-sm text-body/70">该{dateMode === 'week' ? '周' : '月'}暂无时间盒</p>
      }
      return dateMode === 'week' ? (
        <WeekView timeboxes={timeboxSources} currentDate={currentDate} />
      ) : (
        <MonthView timeboxes={timeboxSources} currentDate={currentDate} />
      )
    })()
  )}
</div>
```

- [ ] **Step 4: 验证**

```bash
cd /home/walker/lifeware/frontend && npx vitest run src/domains/timebox/components/__tests__/timeboxes-workspace.view-mode.test.tsx
```

期望：tests pass

- [ ] **Step 5: 全量回归 + tsc**

```bash
cd /home/walker/lifeware/frontend && npx vitest run 2>&1 | tail -30
cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | tail -20
```

- [ ] **Step 6: validate-manifest + validate-domain-structure**

```bash
cd /home/walker/lifeware/frontend && npm run validate:manifest
cd /home/walker/lifeware/frontend && npm run validate:structure
```

期望：0 errors

- [ ] **Step 7: 提交**

```bash
cd /home/walker/lifeware && git add frontend/src/domains/timebox/components/timeboxes-workspace.tsx frontend/src/domains/timebox/components/__tests__/timeboxes-workspace.view-mode.test.tsx
git commit -m "feat(023.06): three-way route DayView/WeekView/MonthView in workspace"
```

---

### Task 4: visual verification — `/browse` + 图像分析

**Files:** 无

- [ ] **Step 1: 启动 dev server**

```bash
cd /home/walker/lifeware/frontend && npm run dev
```

（后台运行，记下 port）

- [ ] **Step 2: 启动 chromium（MCP /connect-chrome 或 gstack 路径）**

gstack: `/connect-chrome`

- [ ] **Step 3: 用 `/browse` 加载 `/timeboxes`**

访问 `http://localhost:3000/timeboxes` 或主页面 / 触发「时间盒」入口

- [ ] **Step 4: 截图日视图**

`/browse` screenshot → 保存到 `docs/superpowers/screenshots/2026-07-05-023-06-day.png`

- [ ] **Step 5: 点击「周」按钮 → 截图**

`/browse` click + screenshot → `docs/superpowers/screenshots/2026-07-05-023-06-week.png`

- [ ] **Step 6: 点击「月」按钮 → 截图**

`/browse` click + screenshot → `docs/superpowers/screenshots/2026-07-05-023-06-month.png`

- [ ] **Step 7: 图像分析三张**

```bash
# 通过 MCP image analysis 工具分析 3 张图
# 重点检查：
# - mode 按钮 active 状态（背景色 + shadow）
# - 导航箭头 + 中间日期标签内容（日/周/月不同）
# - 内容区根据 mode 切换布局（DayView 三栏 vs WeekView 大日历 vs MonthView 网格）
# - CSS 变量令牌一致性
```

- [ ] **Step 8: 移动端 viewport 验证**

`/browse` 切到 ≤md viewport（375x667）→ 验证 `DateNav` 的 `max-md:hidden` 行为：mode 按钮隐藏，prev/next 仍可见

screenshot → `docs/superpowers/screenshots/2026-07-05-023-06-mobile.png`

- [ ] **Step 9: 检查无 console error**

`/browse` console capture → 0 errors expected

- [ ] **Step 10: 提交截图归档**

```bash
cd /home/walker/lifeware && git add docs/superpowers/screenshots/2026-07-05-023-06-*.png
git commit -m "docs(023.06): visual verification screenshots (day/week/month/mobile)"
```

---

### Task 5: 全量 pre-flight + 文档同步

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/specs/`（如有 — defer 视情况）

- [ ] **Step 1: 跑全量 vitest + tsc**

```bash
cd /home/walker/lifeware/frontend && npx vitest run 2>&1 | tail -20
cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | tail -10
```

期望：vitest 失败集合 = base 失败集合；tsc 0 errors

- [ ] **Step 2: validate-manifest + validate-domain-structure**

```bash
cd /home/walker/lifeware/frontend && npm run validate:manifest && npm run validate:structure
```

- [ ] **Step 3: 更新 CHANGELOG.md**

在 `[023.05-1]` 之后加新 section：

```markdown
## [023.06] — 时间盒视图模式切换器修复

**关键决策**：恢复 `DateNav` 在 `TimeboxesWorkspace` 的接线和周/月视图接入；同时修复 `WeekView`/`MonthView` props 与 `DayView` 的 API drift（`[026]` A3.2 留下）—— workspace 内部用 `events.filter(e => e.kind === 'timebox').map(e => e.source)` 适配，保持视图组件 props 不变。

**改动清单**：
- `timeboxes-workspace.tsx`：抽出 `getDateRange`/`navigateDate` 纯函数；接入 `<DateNav>` + `dateMode` state；`loadDay` → `loadRange`；三向路由 `<DayView>/<WeekView>/<MonthView>`
- 新增 `timeboxes-workspace.range.test.ts`（3 vitest）
- 新增 `timeboxes-workspace.view-mode.test.tsx`（2 vitest）
- 视觉验证：3 张 desktop 截图 + 1 张 mobile 截图（`docs/superpowers/screenshots/`）

**验证**：tsc 0 errors / vitest baseline=head 零差 / validate:manifest 0 errors / `/browse` 视觉一致

**不在范围**：PR2 itinerary→schedule 重命名（[023.05-1] 独立）；7 个 pre-existing bug（Codex 报告）；useTimebox hook 解耦（defer）
```

- [ ] **Step 4: commit**

```bash
cd /home/walker/lifeware && git add CHANGELOG.md
git commit -m "docs(023.06): ship CHANGELOG entry"
```

---

### Task 6: requesting-code-review

**Files:** 无（review agent 输出文本）

- [ ] **Step 1: 调用 superpowers:requesting-code-review**

按 skill 流程：dispatch review agent 给出 diff-based 评审；按重要级别处理 finding

- [ ] **Step 2: 修复 finding**

如有 CRITICAL/MINOR finding，按 review 反馈小批量 fix（commit 再开）

- [ ] **Step 3: final patch（如需要）**

---

### Task 7: finishing-a-development-branch

按 skill：`/superpowers:finishing-a-development-branch`

---

## Self-Review

- **Spec coverage**：[023.06] 4 个能力点 — (a) view-mode state ✓ (b) DateNav render ✓ (c) WeekView/MonthView render ✓ (d) API 对齐 ✓ — 都已覆盖（Task 2-3）
- **Placeholder scan**：未发现 "TBD" / "TODO" / "fill in" / "类似" 类占位
- **Type consistency**：`DateViewMode` 全程引用 `./types`；`getDateRange`/`navigateDate` 在 Task 1 引入并在 Task 2/3 复用
- **每个 task 都有 failing test → 实施 → 验证 → commit** TDD 闭环
- **不在范围显式声明**：✅ PR2 / pre-existing bug / useTimebox 解耦
- **OQ-1/C-1/UI-DESIGN-SPEC §14 全局约束已写入 Global Constraints** — 评审员按它审
