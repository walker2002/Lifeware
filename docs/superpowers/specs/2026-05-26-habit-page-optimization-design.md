# 习惯管理页面优化设计

**日期**: 2026-05-26
**状态**: 待审核
**需求来源**: `mydocs/dev/当前开发内容.md` [001]

## 概述

对习惯管理模块的四项页面优化：导航菜单文案更新、列表页状态分组替代类型分组、内嵌编辑面板替代抽屉式编辑、卡片角标颜色区分可追踪/仅占时。

## 变更范围

| 文件 | 改动类型 | 说明 |
|---|---|---|
| `domains/habits/manifest.yaml` | 修改 | 更新 view_list、view_templates 的 description |
| `components/layout/growth-menu.tsx` | 修改 | 同步更新硬编码标签文案 |
| `domains/habits/components/habit-list.tsx` | 重构 | 移除类型/状态筛选器，改为状态分组 + 可折叠面板 + 内嵌编辑面板 |
| `domains/habits/components/habit-card.tsx` | 修改 | 添加右上角角标，按 trackable 区分颜色 |
| `domains/habits/components/habit-form.tsx` | 修改 | 增加 mode/editData/onCancel props 支持编辑模式 |

## 设计详情

### 1. 导航菜单文案变更

GrowthMenu 中 habits 域的 action 显示文案：

| 原文案 | 新文案 |
|---|---|
| 查看习惯列表 | 习惯管理 |
| 查看习惯模板 | 习惯模板配置 |

同步修改 `manifest.yaml` 中对应 `intent_triggers` 的 description 字段和 `growth-menu.tsx` 中的硬编码标签。不做 GrowthMenu 从 manifest 动态读取的重构。

### 2. 列表页状态分组 + 可折叠面板

**移除**：类型筛选器（全部/可追踪/仅占时）和状态筛选下拉，以及按 trackable 分组的逻辑。

**新增**：按生命周期状态固定顺序分组，每个分组可折叠/展开。

```typescript
const STATUS_GROUPS = [
  { key: 'draft',     label: '草稿', defaultOpen: true  },
  { key: 'active',    label: '活跃', defaultOpen: true  },
  { key: 'suspended', label: '暂停', defaultOpen: false },
  { key: 'archived',  label: '归档', defaultOpen: false },
]
```

- 标题栏格式：`{label} ({count})` + ChevronDown/ChevronRight 图标
- 点击标题栏切换折叠状态（`Record<string, boolean>`）
- 空分组仍显示标题栏（count=0），内容区显示"暂无习惯"
- 组内卡片按 `defaultTime` 排序

### 3. 内嵌编辑面板

**状态**：`editingHabitId: string | null`

**布局**：
- 默认（无编辑）：卡片区域 100% 宽度
- 编辑中：左侧 `flex-1`（min-width 保护）+ 右侧固定 `w-[480px]` + 左侧边框分隔 + CSS transition 过渡

**编辑面板**：
- 顶部："编辑习惯"标题 + 关闭按钮
- 主体：复用 HabitForm，增加 `mode: 'create' | 'edit'`、`editData`、`onCancel` props
- 保存调用 `updateHabit()`，取消直接清除编辑状态

**HabitForm 改动**：
- `mode='create'`：行为不变
- `mode='edit'`：预填充字段、提交按钮"保存"、调用 `updateHabit`

### 4. 卡片角标颜色区分

HabitCard 右上角三角形角标（CSS triangle, ~32x32px）：

| 类型 | 角标颜色 |
|---|---|
| 可追踪（trackable=true） | 主色调（primary） |
| 仅占时（trackable=false） | 灰色（muted） |

- 颜色使用 Tailwind/shadcn 主题色系，不引入自定义色值
- 角标纯视觉提示，无交互
- 所有状态分组中统一生效

## Constitution 合规性

| 原则 | 合规说明 |
|---|---|
| VI Domain Plugin | 改动仅在 Domain 层（habits）和共享 UI 组件，不涉及 Nexus |
| V Repository | 编辑保存仍通过 `updateHabit()` server action → Repository |
| IV USOM | HabitStatus 类型不变（draft/active/suspended/archived） |
| VII Bridge Layer | 不引入 HTTP 依赖，Server Action 接口不变 |
| 页面数据访问规则 | 读取走 Repository，写入走 Server Action（PrebuiltIntent 路径） |

## 不做的事

- GrowthMenu 动态读取 manifest description 的重构
- HabitListPage 的整体页面架构变更（仍由 AppShell 渲染）
- HabitForm 的字段增减
- 状态分组排序的自定义（固定为 draft → active → suspended → archived）
