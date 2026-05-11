# OKR 管理增强设计文档（Bug修复 + 界面重设计）

**Created**: 2026-05-11
**Status**: Draft
**Parent**: OKR 管理（004）
**Input**: `mydocs/dev/当前开发内容.md` [001] + [002]

## 1. 概述

在已完成 004a-okr-core 基础上，修复 3 个 Bug，并重设计 OKR 显示界面为左右双栏联动布局，新增目标编号、重要程度等字段。

## 2. Bug 修复

### Bug #1: "全部"筛选只显示"进行中"

**根因**：`actions/okr.ts` 中 `getObjectives()` 在无 status 参数时调用 `repo.findActive()`，该方法只查 `status='active'`。

**修复**：在 `ObjectiveRepository` 新增 `findAll(userId)` 方法，返回所有非 archived 状态的 Objective。`getObjectives` 无筛选参数时调用它。

### Bug #2: 编辑草稿 OKR 时 KR 空白

**根因**：`okr-detail.tsx` 编辑模式渲染 `OKRForm` 时，`initial` 未传 `keyResults` 字段。

**修复**：从已有数据中提取 KR 信息，完整传入 `initial` prop（含 `keyResults`）。

### Bug #3: 编辑返回后列表空白

**根因**：`onBack()` → `hook.refresh()` 全量重载时 `isLoading=true` 的竞态。

**修复**：在双栏容器中统一管理状态，编辑保存后局部更新 state，不重新全量获取列表。

## 3. 新增字段

### 3.1 Schema 变更（objectives 表）

| 字段 | 类型 | 说明 |
|------|------|------|
| `objective_number` | text | NEW — 目标编号，如 26Q1-O1，用户级唯一 |
| `priority` | text | NEW — P0 / P1 / P2，默认 P1 |
| `period_type` | text | MODIFY — 枚举从 5 项改为 4 项：annual / semi_annual / quarterly / monthly |

### 3.2 重要程度

| 值 | 含义 |
|----|------|
| P0 | 必须完成，不可妥协 |
| P1 | 应该完成，尽量达成 |
| P2 | 可以完成，有余力则做 |

### 3.3 编号生成规则

| 层次 | 前缀 | 示例 | 默认周期 |
|------|------|------|----------|
| annual | 26Y | 26Y-O1, 26Y-O2 | 2026-01-01 ~ 2026-12-31 |
| semi_annual | 26H1 / 26H2 | 26H1-O1, 26H2-O1 | 2026-01-01 ~ 2026-06-30 / 07-01 ~ 12-31 |
| quarterly | 26Q1 ~ 26Q4 | 26Q1-O1, 26Q1-O2 | 2026-01-01 ~ 2026-03-31（按 Q 变化） |
| monthly | 26M01 ~ 26M12 | 26M05-O1 | 2026-05-01 ~ 2026-05-31 |

- KR 编号为展示级拼接（O1-K1, O1-K2），不单独存字段
- 编号中的序号（O1, O2）按同一前缀下已有 O 数量自增

### 3.4 USOM 类型变更

```typescript
// primitives.ts — PeriodType 新增
enum PeriodType {
  Daily = 'daily',
  Weekly = 'weekly',
  Monthly = 'monthly',
  Quarterly = 'quarterly',
  SemiAnnual = 'semi_annual',  // NEW
  Annual = 'annual',
}

// objects.ts — Objective 新增字段
interface Objective {
  // ...现有字段（含 okrType）
  objectiveNumber: string       // NEW — 自动生成的编号
  priority: 'P0' | 'P1' | 'P2' // NEW — 重要程度
}
```

## 4. 周期默认值

选择层次后自动填充起止日期，用户可手动微调：

- **年度**：当前年 01-01 ~ 12-31
- **半年度**：1-6月 或 7-12月（根据当前月份自动判断）
- **季度**：当前所在季度的起止月
- **月度**：当前月份的起止日

## 5. UI 架构：双栏布局

### 5.1 组件结构（方案 A：单容器双栏）

```
OKRWorkspace                  ← 单容器，管理 selectedId / mode 状态
├── OKRDirectory (左栏 ~320px)
│   ├── StatusTabs            ← 全部/草稿/已暂停/已完成/已废弃
│   ├── +新建OKR 按钮
│   └── PeriodGroup × N       ← 按周期层次分组（季度/年度等）
│       └── ObjectiveEntry × N
│           ├── 编号 + 标题 + 状态标签 + 重要程度
│           └── 操作按钮：激活/编辑/删除/归档/...
│
└── OKRPanel (右栏 flex-1)
    ├── [mode=empty]   空状态引导
    ├── [mode=detail]  详情视图（标题 + 元数据 + KR 卡片列表）
    ├── [mode=edit]    OKRForm（编辑模式，预填数据+已有KR）
    └── [mode=create]  OKRForm（新增模式）
```

### 5.2 文件变更

**新增：**
- `components/okr/okr-workspace.tsx` — 双栏容器
- `components/okr/okr-directory.tsx` — 左栏目录
- `components/okr/okr-panel.tsx` — 右栏面板
- `components/ui/confirm-dialog.tsx` — 通用确认弹窗

**修改：**
- `components/okr/okr-form.tsx` — 新增 priority、period 自动填充
- `components/okr/objective-card.tsx` — 新增编号/重要程度显示、操作按钮
- `usom/types/primitives.ts` — PeriodType 新增 semi_annual
- `usom/types/objects.ts` — Objective 新增 objectiveNumber/priority
- `usom/interfaces/irepository.ts` — 新增 findAll 方法签名
- `lib/db/schema.ts` — 新增字段 + period_type 枚举变更
- `lib/db/repositories/objective.repository.ts` — 新增 findAll、编号生成
- `lib/db/repositories/mappers.ts` — 新增字段映射
- `app/actions/okr.ts` — 修复 Bug#1、新增编号生成逻辑
- `hooks/use-okrs.ts` — 适配新架构
- `app/page.tsx` — 引入 OKRWorkspace
- `docs/usom-design.md` — Tier 2 同步
- `docs/database-design.md` — Tier 2 同步

**可废弃（被 OKRWorkspace 替代）：**
- `components/okr/okr-list.tsx`
- `components/okr/okr-detail.tsx`

**新增迁移：**
- `lib/db/migrations/0004_okr_enhance.sql`

## 6. 交互设计

### 6.1 操作位置

| 操作 | 位置 | 行为 |
|------|------|------|
| 激活 | 左栏条目 / 右栏详情 | 校验 → status=active → 刷新 |
| 编辑 | 左栏条目 | 右栏切换到 edit mode，表单预填 |
| 删除 | 左栏条目 | AlertDialog 二次确认 → 逻辑删除（status=discarded） |
| 归档 | 左栏条目 | completed/discarded 状态下可见 → status=archived |
| 暂停/恢复/完成/废弃 | 左栏条目下拉菜单 | 对应状态转换 |

### 6.2 删除确认

使用 shadcn/ui AlertDialog：
- 标题："确认删除"
- 内容："确定要删除目标 '[编号] [标题]' 吗？该操作不可撤销，目标将被标记为已废弃。"
- 按钮：取消 / 确认删除（destructive）

## 7. 约束与兼容性

- MVP 仅 Web 端
- 编辑表单风格对标 `habit-form.tsx`（shadcn/ui + 垂直单栏 + max-w-2xl）
- 保留 `okrType`（愿景型/承诺型）字段
- 遵循 Repository Pattern（R-01~R-04）和 Multi-Tenancy（T-01~T-04）
- Tier 2 文档（usom-design.md、database-design.md）同步更新
- 现有 OKR 状态机和领域插件保持不变，仅新增字段和 UI 层变更
