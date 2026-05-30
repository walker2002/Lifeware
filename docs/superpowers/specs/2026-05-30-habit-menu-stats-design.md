# [013] 成长领域菜单优化 + [014] 习惯统计页面

> 日期：2026-05-30
> 状态：已确认，待实施

---

## [013] 成长领域菜单图标

### 目标

为"成长领域"导航菜单中的每个操作添加类型标识图标，区分 CNUI / Page / Text 三种响应类型。

### 改动范围

3 个文件：

1. **`components/layout/growth-menu.tsx`**
   - `DomainAction` 接口增加 `response_type?: 'cnui' | 'page' | 'text'`
   - 每个 action 按钮描述文字前添加 Lucide 图标：
     - CNUI → `MessageSquare`（对话气泡）
     - Page → `LayoutGrid`（页面布局）
     - Text → `FileText`（文档）
   - 图标颜色 `text-body/40`，尺寸 `size-3.5`，与域名折叠按钮对齐

2. **`domains/registry.ts`**
   - `getAllDomainActions()` 返回类型增加 `response_type` 字段
   - 数据已存在于 manifest 的 `intentTriggers` 中，只需更新类型声明

3. **`app/page.tsx`**
   - `VIEW_PAGE_COMPONENTS` 增加 `view_statistics` 映射（为 [014] 准备）

---

## [014] 习惯统计页面

### 目标

新增一个可视化统计页面，以日/周/月三种视图展示习惯打卡情况。

### 与现有功能的关系

- 原有 `habit_statistics`（query_action, response_mode=text）保持不变，AI 对话中仍可问统计问题
- 新增 `view_statistics` 作为独立的 view_route，从菜单直接进入可视化页面

### Manifest 注册

**intent_triggers** 新增：
```yaml
- action: view_statistics
  shortcut: /habitStatsView
  description: 习惯统计
  response_type: page
  keywords: [统计, 打卡统计, 习惯数据]
  view_route: /habits/statistics
```

**view_routes** 新增：
```yaml
view_statistics:
  component: domains/habits/pages/HabitStatisticsPage
  url: /habits/statistics
```

### 页面组件

**位置**：`domains/habits/pages/HabitStatisticsPage.tsx`

**布局**：
- 左侧主内容区（~70%）：Tab 切换 + 视图内容
- 右侧边栏（~30%）：本月 MiniCalendar

**Tab**：日 / 周 / 月，默认日视图

**视图组件**（`domains/habits/components/statistics/`）：

#### HabitStatsDayView

- 表格：习惯名 | 状态(连续N天/中断) | 近5天打卡图标
- 点击行内展开详情：当前连续天数、本周完成率、查看历史链接
- 右侧边栏：MiniCalendar

#### HabitStatsWeekView

- 打卡矩阵：行=习惯，列=周一~周日
- 每格用图标区分：✅ 完成（emerald）、🔶 部分完成（amber）、❌ 未完成（red）、— 未来（gray）
- 尾列显示完成率百分比
- 顶部周导航（前一周/后一周）
- 点击行内展开详情
- 图例说明

#### HabitStatsMonthView

- 月历网格，每格显示日期 + 该日完成打卡的习惯数量（如"4项"）
- 顶部月导航（前一月/后一月）
- 当日高亮

### 数据查询层

**Repository 方法**（`domains/habits/repository/habit-log.ts`）：

1. `getHabitLogsByDateRange(userId, startDate, endDate)` — 日期范围内所有打卡记录
2. `getHabitLogStats(userId, habitId, days)` — 单个习惯近 N 天统计，复用 `streak-calculator.ts`

**Server Actions**（`app/actions/habit-stats.ts`）：

1. `getHabitStatsForDay(date)` — 日视图数据
2. `getHabitStatsForWeek(weekStart)` — 周视图打卡矩阵数据
3. `getHabitStatsForMonth(year, month)` — 月视图每日打卡计数

所有查询走 Repository 接口，包含 user_id 过滤（T-02），返回 USOM 对象。不需要新建数据库表。

### 清理

开发完成后删除预览页面 `app/habits/statistics/preview/page.tsx`。

---

## 实施顺序

1. [013] 菜单图标优化（改动小，快速验证）
2. [014] 习惯统计页面
   - Manifest 注册 + 路由生成
   - Repository 查询方法
   - Server Actions
   - 页面组件（日 → 周 → 月）
   - 清理预览页面
