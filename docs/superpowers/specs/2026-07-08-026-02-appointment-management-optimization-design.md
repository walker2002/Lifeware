# [026.02] 约定管理优化 — 设计文档

| 项目 | 值 |
|---|---|
| Spec | 2026-07-08-026-02-appointment-management-optimization |
| SSOT | 本文档 |
| Plan | `docs/superpowers/plans/2026-07-08-026-02-appointment-management-optimization-plan.md`（writing-plans 阶段产出） |
| Dev Doc | `mydocs/dev/026.02-约定相关优化.md` |
| 来源 | [026.01] SHIPPED 后 TD-022 + 用户复现 bug + 用户意图「`/createAppointment` `/editAppointment` 报'位置卡片类型'」 |
| Status | Draft — 待用户 review |

---

## 1. 背景与目标

[026.01] 已 SHIPPED（2026-07-07，9 commits + push gitee），3 项耦合事落地（createAppointment picker / editAppointment 双视图 / activityArchetypeId 6 路集成）。但用户复现发现：

1. **`/createAppointment` 与 `/editAppointment` 报「未知的卡片类型」**（dev doc §1）—— [026.01] 声称「3 surface 全注册」与实际代码不符，**server 注册了，client 没注册**（per [[project-cnui-surface-dual-registration]]）。
2. **`/appointments` page 没有视图模式切换**（dev doc §2）—— 当前仅列表视图，缺 [026] 原任务要求的日/月切换。
3. **TD-022 登记的 5 项 deferred 债**（memory）需在 [026.02] 范围对齐处理。

### 目标（成功标准）

- G1：`/createAppointment`、`/editAppointment`、`/deleteAppointment` 三个 CNUI surface 在客户端可正常渲染（fix [026.01] 回归）。
- G2：`/appointments` 支持 Day / Month 两档视图切换（参照 [023.06] `view-mode-switcher` 模式）。
- G3：Day 视图 = 左约定列表 + 右本月日历（带过期/未过期双色标记）。
- G4：Month 视图 = 全月日历网格（参照 [023.06] TimeboxWorkspace MonthView）。
- G5：筛选条 = status（all/scheduled/cancelled/completed）+ 日期范围。
- G6：顶部 Banner（沿用 timebox 图片集 + 「约定管理」标题，按 PageBanner 字体规范）。

### 非目标

- 不做 Week 视图（dev doc 明确日/月两档，用户已确认）。
- 不做 people/archetype 维度的多维筛选（dev doc 仅要求 status + 日期范围）。
- 不动 activityArchetypeId 集成（[026.01] 已落地，本次只补展示层）。
- 不重做 /appointments 的写入口（createAppointment/updateAppointment/deleteAppointment 已成熟）。
- 不动 server `surfaceHandlers`（已 OK）。

---

## 2. 架构

### 2.1 当前状态（[026.01] ship 后）

```
┌─ frontend/src/nexus/ai-runtime/cnui/register-client-surfaces.ts ─┐
│  cnuiRegistry.register('timebox', 'timebox-list', ...)           │  ✅
│  cnuiRegistry.register('timebox', 'create-timebox', ...)         │  ✅
│  cnuiRegistry.register('timebox', 'log-timebox', ...)            │  ✅
│  cnuiRegistry.register('timebox', 'adjust-timeboxes', ...)       │  ✅
│  cnuiRegistry.register('timebox', 'edit-timeboxes', ...)         │  ✅
│  cnuiRegistry.register('timebox', 'create-smart-timebox', ...)   │  ✅
│  // ❌ MISSING (regression of [026.01] claim):                   │
│  //    'create-appointment', 'edit-appointment',                │
│  //    'delete-appointment'                                      │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─ frontend/src/domains/timebox/cnui/handlers.ts:791-793 ──────────┐
│  surfaceHandlers = {                                             │
│    'create-appointment': timeboxCnuiHandler,    ✅               │
│    'edit-appointment':   timeboxCnuiHandler,    ✅               │
│    'delete-appointment': timeboxCnuiHandler,    ✅               │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 目标架构

```
┌─ frontend/src/app/appointments/page.tsx (server) ───────────────┐
│  1. PageBanner (domainId="timebox", title="约定管理")  ← 新增    │
│  2. getAppointmentsByRange(now-90d, now+90d) 拉全状态            │
│  3. <AppointmentWorkspace initialItems={...}/>                   │
└─────────────────────────────────────────────────────────────────┘
                ↓
┌─ frontend/src/domains/timebox/components/appointment-workspace.tsx (client) ─┐
│  State:                                                                       │
│    viewMode: 'day' | 'month'                  ← 新增                          │
│    filterStatus: AppointmentStatus | 'all'    ← 新增                          │
│    filterRange: { start: Date, end: Date }    ← 新增                          │
│    selectedDate: Date                         ← 新增 (日视图锚定)            │
│                                                                               │
│  Render:                                                                      │
│    ├─ <PageBanner> (top)                                                       │
│    ├─ <AppointmentViewToggle viewMode onChange/>                              │
│    ├─ <AppointmentFilterBar status range onChange/>                           │
│    ├─ viewMode === 'day'  → <AppointmentDayView .../>                         │
│    └─ viewMode === 'month'→ <AppointmentMonthView .../>                       │
│                                                                               │
│  Derived (useMemo):                                                           │
│    filteredItems = items.filter(by status + range)                            │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 3. 组件清单

| # | 路径 | 类型 | 说明 |
|---|---|---|---|
| 1 | `frontend/src/nexus/ai-runtime/cnui/register-client-surfaces.ts` | 改 | §1 bug fix：补 3 行 `cnuiRegistry.register`（含 [026.01] memory 模板注释） |
| 2 | `frontend/src/app/appointments/page.tsx` | 改 | 加载 PageBanner + 扩日期范围到全状态（去掉 scheduled-only filter） |
| 3 | `frontend/src/domains/timebox/components/appointment-page-banner.tsx` | 新 | 包装 `PageBanner` 组件，`domainId="timebox"`、`title="约定管理"` |
| 4 | `frontend/src/domains/timebox/components/appointment-view-toggle.tsx` | 新 | 日/月切换按钮组，参照 [023.06] `view-mode-switcher` 范式 |
| 5 | `frontend/src/domains/timebox/components/appointment-day-view.tsx` | 新 | 两栏：左列表 + 右本月日历 |
| 6 | `frontend/src/domains/timebox/components/appointment-month-view.tsx` | 新 | 全月日历网格 |
| 7 | `frontend/src/domains/timebox/components/appointment-mini-calendar.tsx` | 新 | 接受 `AppointmentSummary[]`，渲染过期/未过期双色标记（不污染 timebox MiniCalendar） |
| 8 | `frontend/src/domains/timebox/components/appointment-filter-bar.tsx` | 新 | status dropdown + 日期范围 picker |
| 9 | `frontend/src/domains/timebox/lib/appointment-filter.ts` | 新 | 纯函数 `filterAppointments(items, status, range)` |
| 10 | 各组件 `__tests__/*.test.tsx` | 新 | TDD 单元 + 组件测试 |

### 3.1 [026.01] 修复（任务 #1）

```ts
// frontend/src/nexus/ai-runtime/cnui/register-client-surfaces.ts
import { CreateAppointment } from '@/domains/timebox/cnui/surfaces/CreateAppointment'
import { EditAppointment } from '@/domains/timebox/cnui/surfaces/EditAppointment'
import { DeleteAppointment } from '@/domains/timebox/cnui/surfaces/DeleteAppointment'

// [026.02] §1 修复：[026.01] 仅注册了 server surfaceHandlers，client
//   register-client-surfaces 漏了 3 个 appointment surface，导致
//   /createAppointment /editAppointment /deleteAppointment 报「未知的卡片类型」。
//   per [[project-cnui-surface-dual-registration]]：server + client 双注册闭合。
cnuiRegistry.register('timebox', 'create-appointment', { component: CreateAppointment })
cnuiRegistry.register('timebox', 'edit-appointment',   { component: EditAppointment })
cnuiRegistry.register('timebox', 'delete-appointment', { component: DeleteAppointment })
```

### 3.2 关键组件接口

#### `AppointmentPageBanner`

```tsx
// 极简包装，沿用 timebox banner 图片集
export function AppointmentPageBanner() {
  return <PageBanner domainId="timebox" title="约定管理" />
}
```

#### `AppointmentViewToggle`

```tsx
interface Props {
  viewMode: 'day' | 'month'
  onChange: (mode: 'day' | 'month') => void
}
// 2 个 icon button，按钮组样式按 UI-DESIGN-SPEC §14 C-04
```

#### `AppointmentFilterBar`

```tsx
interface Props {
  status: AppointmentStatus | 'all'
  range: { start: Date; end: Date }
  onStatusChange: (s: AppointmentStatus | 'all') => void
  onRangeChange: (r: { start: Date; end: Date }) => void
}
// status dropdown: all / scheduled / cancelled / completed
// range picker: 本周 / 本月 / 自定义
```

#### `AppointmentMiniCalendar`

```tsx
interface Props {
  currentDate: Date
  appointments: AppointmentSummary[]
  selectedDate?: Date
  onDateSelect?: (date: Date) => void
}
// 复用 MiniCalendar 的纯渲染骨架，但额外按 appointment.status + startTime 派生：
//   - 过期 = 已 startTime < now AND status === 'scheduled' → red dot
//   - 未过期 = startTime >= now AND status === 'scheduled' → blue dot
//   - 终态 cancelled/completed 不打点（避免误导）
//   - 选中日 = primary ring
// 不复用 `MiniCalendar`（timebox 专用 + IRON RULE 守护测试），独立组件。
```

#### `filterAppointments` 纯函数

```ts
type AppointmentStatus = 'scheduled' | 'cancelled' | 'completed'
type FilterStatus = AppointmentStatus | 'all'

export function filterAppointments(
  items: AppointmentSummary[],
  status: FilterStatus,
  range: { start: Date; end: Date },
): AppointmentSummary[] {
  return items.filter(it => {
    if (status !== 'all' && it.status !== status) return false
    const t = new Date(it.startTime).getTime()
    if (t < range.start.getTime() || t > range.end.getTime()) return false
    return true
  })
}
```

---

## 4. 数据流

### 4.1 服务端加载（[026.01] 已定，本次扩范围）

```ts
// app/appointments/page.tsx
const start = new Date() // 过去 90 天
start.setDate(start.getDate() - 90)
const end = new Date()   // 未来 90 天
end.setDate(end.getDate() + 90)
const items = await getAppointmentsByRange(start, end)  // 全状态
```

⚠️ **改动点**：[026.01] 当前 start = now-7d，本次扩到 now-90d 以支持 Month 视图（90 天回看足够覆盖大多数历史）；end 维持 now+90d。**`appointment-workspace.tsx` 的 `reload()` 必须同步改为 -90d**，否则 reload 会丢失 7~90 天范围的数据（与初始加载窗口不一致会引发用户困惑）。

### 4.2 客户端派生

```ts
const [viewMode, setViewMode] = useState<'day' | 'month'>('day')
const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')  // 默认 all（原 scheduled 不变 — 仅过滤 UI 显示）
const [filterRange, setFilterRange] = useState(() => ({ start: ..., end: ... }))  // 默认本月
const [selectedDate, setSelectedDate] = useState(() => new Date())  // 日视图锚定

const filtered = useMemo(
  () => filterAppointments(items, filterStatus, filterRange),
  [items, filterStatus, filterRange],
)
```

### 4.3 视图分发

```tsx
{viewMode === 'day' ? (
  <AppointmentDayView
    appointments={filtered.filter(bySelectedDate)}
    selectedDate={selectedDate}
    onSelectDate={setSelectedDate}
    appointmentsByDate={groupByDate(filtered)}  // 供 mini-calendar marker
  />
) : (
  <AppointmentMonthView
    currentDate={selectedDate}
    appointments={filtered}
    onSelectDate={d => { setSelectedDate(d); setViewMode('day') }}  // 跳日视图
  />
)}
```

---

## 5. 错误处理

| 场景 | 行为 |
|---|---|
| 数据加载失败 | 复用 `reload()` 的 `toast.error('约定列表刷新失败')` 模式 |
| 视图切换无数据 | `<EmptyState>`：「本月无约定，创建一个约定 →」 |
| 筛选无结果 | `<EmptyState>`：「当前筛选条件下无约定」+「清除筛选」按钮（重置 status='all' + range 默认） |
| MiniCalendar 边界日期 | 跨月时显示邻月日期（淡灰），点击跳邻月（selectedDate 切换） |
| Server action 失败（点新建/编辑/删除按钮） | 保留 [026.01] `toast.error` 兜底 |

---

## 6. 测试策略

### 6.1 TDD 强制（per CLAUDE.md §"开发流程插件协作" + superpowers:test-driven-development）

每个新组件 / 纯函数先红再绿：

| 测试文件 | 覆盖 |
|---|---|
| `__tests__/appointment-filter.test.ts` | `filterAppointments` 边界：空数组、跨月、status 枚举全覆盖、range 闭区间 |
| `__tests__/appointment-view-toggle.test.tsx` | 切换回调、初始值、aria-label |
| `__tests__/appointment-day-view.test.tsx` | 双栏布局、空状态、列表分组 |
| `__tests__/appointment-month-view.test.tsx` | 网格渲染、点击跳日视图、跨月邻日 |
| `__tests__/appointment-mini-calendar.test.tsx` | 过期/未过期双色、选中态、空月 |
| `__tests__/appointment-filter-bar.test.tsx` | status 切换、range 切换、清空按钮 |
| `__tests__/appointment-workspace.test.tsx` | viewMode 切换、筛选联动、reload 同步 |

### 6.2 回归守护

| 测试 | 守护点 |
|---|---|
| `__tests__/mini-calendar.regression.test.tsx`（已有） | timebox MiniCalendar IRON RULE：不被 appointment 逻辑污染 |
| `__tests__/register-client-surfaces.test.ts`（新建） | 3 个 appointment surface 必须在 client 注册表（防 [026.01] 回归） |

### 6.3 E2E（/browse）

- 用户旅程 1：AI 助手触发 `/createAppointment` → CNUI 卡片正常渲染（验证 §1 修复）
- 用户旅程 2：`/editAppointment` 同上
- 用户旅程 3：/appointments 日视图 → 切月视图 → 选日期 → 回到日视图
- 用户旅程 4：status 筛选「已完成」+ range 自定义 → 列表正确

### 6.4 静态校验

- `npm run lint`：0 error
- `npx tsc --noEmit`：0 error
- `validate:manifest`：0 error（不新增 manifest 改动，但保回归）
- `validate:domain-structure`：✓

---

## 7. 风险与权衡

### 7.1 §1 [026.01] memory 漂移

memory 写「3 surface 全注册」但实际只注册了 server。SDD plan 必须显式验证 client 层（用 grep 或新测试）。**推荐**：plan T1 末尾加 `grep "create-appointment" nexus/ai-runtime/cnui/register-client-surfaces.ts` 必须返回 1+ 行。

### 7.2 dateMode vs viewMode 命名

[023.06] TimeboxWorkspace 用 `dateMode` 状态名。本次 appointment 用 `viewMode`。两者语义一致（区分 day/week/month），但为避免跨 workspace 术语混乱，**统一使用 `viewMode`**（已在 §4.2 标记）。

### 7.3 range 窗口扩到 -90d

扩窗口会增加初始 query 量（90+90=180 天 vs 7+90=97 天），但 appointments 表单条记录小（KB 级），估算 100 条以内完全可承受。若实测性能差，plan 阶段加 `index` 优化。

### 7.4 TD-022 5 项 deferred

memory 提到 TD-022 登记 5 项 deferred（archetype clearing 语义 / UUID 验证 / perf N+1 / originalPrompt banner 等）。本次不纳入主范围；plan 末尾可加 review pass，决定是否拆 follow-up。

---

## 8. 实施切片（writing-plans 阶段细化）

预估 task 清单（具体 task 拆分与依赖由 writing-plans skill 完成）：

| Task | 范围 | 估时 | 依赖 |
|---|---|---|---|
| T1 | §1 bug fix：注册 3 个 appointment surface + 守护测试 | 0.5d | 无 |
| T2 | filterAppointments 纯函数 + 测试 | 0.5d | 无 |
| T3 | AppointmentPageBanner + AppointmentViewToggle + AppointmentFilterBar | 1d | 无 |
| T4 | AppointmentMiniCalendar（独立组件）+ IRON RULE 扩展 | 1d | 无 |
| T5 | AppointmentDayView（双栏）+ 联动测试 | 1d | T2 T3 T4 |
| T6 | AppointmentMonthView（全月网格）+ 联动测试 | 1d | T2 T4 |
| T7 | AppointmentWorkspace 整合（viewMode 状态 + 视图分发 + reload 同步） | 1d | T1 T5 T6 |
| T8 | /browse E2E + lifeware-neat + docs/CHANGELOG 同步 | 0.5d | T7 |

合计 ~6.5d（参考 [023.13] 同规模 UI 重构实际 5d 落地）。

---

## 9. 验收门禁

- ✅ G1-G6 全部满足
- ✅ tsc 0 / vitest 0 新增 fail / validate:manifest 0 / validate:domain-structure ✓
- ✅ MiniCalendar IRON RULE 守护测试不破
- ✅ register-client-surfaces 守护测试不破
- ✅ /browse 4 个 E2E 场景全过
- ✅ CHANGELOG [026.02] 段 + docs/database-design（若 schema 改）+ docs/usom-design（若类型改） footer bump
- ✅ lifeware-neat 1 轮（cross-check）

---

## 10. SSOT 与后续

- **本 spec** → writing-plans → 实现 → ship
- **plan**：`docs/superpowers/plans/2026-07-08-026-02-appointment-management-optimization-plan.md`
- **memory 更新**：实施完成后 [026.02] memory entry 替换/追加本轮成果
- **TD-022 5 项 deferred**：本 spec 不解决，在 plan 阶段判断是否拆 [026.02.1] follow-up