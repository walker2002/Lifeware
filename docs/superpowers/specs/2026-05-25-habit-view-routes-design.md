# 习惯管理页面（view_routes）设计规格

> 日期: 2026-05-25
> 状态: 草案
> 参考: `mydocs/dev/当前开发内容.md` [001], `mydocs/dev/009-AI功能及界面优化.md`

## 1. 概述

为 habits 域实现 `view_list`（/habits）和 `view_templates`（/habits/templates）两个页面路由，提供完整的习惯和模板 CRUD 管理能力。

### 核心目标

- 构建习惯列表页，支持查看、创建、编辑、状态管理（激活/暂停/归档/删除）
- 构建模板管理页，支持模板 CRUD + 关联习惯管理 + 应用模板
- 所有写操作通过 `PrebuiltIntent` → Nexus 链路，读操作直接走 Repository
- 页面级脏状态追踪，退出编辑时提供三选一确认（保存/放弃/继续编辑）
- 最大化复用已有组件，删除旧 `use-habits.ts` hook

### 范围边界

- 仅 Web 端（MVP 约束）
- 仅 habits 域，不涉及其他域的 view_routes
- 模板的写操作暂延用现有 server action（非 PrebuiltIntent 链路），标注 TODO

## 2. 文件变更清单

### 新建（4 个）

| 文件 | 说明 |
|---|---|
| `domains/habits/pages/HabitListPage.tsx` | 习惯列表页 — 状态筛选、打卡、行内操作、抽屉表单 |
| `domains/habits/pages/HabitTemplatePage.tsx` | 模板管理页 — 模板 CRUD + 关联习惯 + 脏状态外壳 |
| `app/habits/page.tsx` | Next.js thin shell 路由，import HabitListPage |
| `app/habits/templates/page.tsx` | Next.js thin shell 路由，import HabitTemplatePage |

### 修改（4 个）

| 文件 | 变更 |
|---|---|
| `domains/habits/manifest.yaml` | view_routes 新增 view_list、view_templates |
| `domains/habits/components/habit-form.tsx` | 新增 `onDirtyChange` prop（可选） |
| `domains/habits/components/habit-template-manager.tsx` | 新增 `onDirtyChange`、`onSubmitError` prop（可选） |
| `domains/habits/components/index.ts` | 新增 pages 导出（如需要） |

### 删除（1 个）

| 文件 | 原因 |
|---|---|
| `hooks/use-habits.ts` | 被 Page → Repository 直读 + PrebuiltIntent 写操作替代 |

## 3. 架构设计

### 3.1 数据流

```
读操作:  Page → Repository.findByUserId(userId, filters) → 渲染
写操作:  Page → PrebuiltIntent({ domainId, action, fields, userId, source }) 
              → server action → Intent Engine
              → Rule Engine (冲突检测)
              → State Machine (状态转换)
              → Repository 写入
              → 刷新列表
```

### 3.2 组件复用关系

```
app/habits/page.tsx
  └── HabitListPage
        ├── 脏状态指示器 (新增)
        ├── HabitList (复用，不变)
        │     └── HabitCard × N (复用，不变)
        ├── 抽屉: HabitForm (复用，新增 onDirtyChange)
        └── 确认弹窗 (新增)

app/habits/templates/page.tsx
  └── HabitTemplatePage
        ├── 脏状态指示器 (新增)
        ├── HabitTemplateManager (复用，新增 onDirtyChange + onSubmitError)
        │     ├── HabitTemplateCard / HabitTemplateView (复用)
        │     └── HabitTemplateForm (复用，新增 onDirtyChange)
        └── 确认弹窗 (新增)
```

### 3.3 页面状态模型

| 状态 | 含义 | UI 表现 |
|---|---|---|
| `idle` | 无未保存修改 | 页面顶部无指示器 |
| `dirty` | 表单有未提交修改 | 黄色条 + 修改项描述 + [全部提交] [放弃修改] |
| `submitting` | 正在提交 PrebuiltIntent | 蓝色条 + 进度信息 |

## 4. 页面设计

### 4.1 HabitListPage（/habits）

**布局**: 单页列表 + 侧边抽屉表单（Notion 风格）

**HabitListPage 自有状态**:

| 状态 | 类型 | 说明 |
|---|---|---|
| habits | Habit[] | 习惯列表数据 |
| isLoading | boolean | 加载中 |
| drawerMode | 'create' \| 'edit' \| null | 抽屉模式 |
| editingHabit | Habit \| null | 编辑中的习惯 |
| pageState | 'idle' \| 'dirty' \| 'submitting' | 脏状态 |
| dirtyLabel | string | 脏状态描述文本 |
| fieldErrors | Record<string, string> | 字段级错误 |
| showExitDialog | boolean | 退出确认弹窗 |
| pendingAction | () => void \| null | 确认后的操作 |

**核心方法**:
- `loadHabits()` — habitRepo.findByUserId → setHabits
- `openCreateDrawer()` / `openEditDrawer(habit)` — 打开抽屉
- `handleFormChange()` — 标记 dirty
- `handleSubmit(fields)` — PrebuiltIntent → Nexus → 成功(清 dirty + 关抽屉 + refresh) / 失败(保留 dirty + 展示错误)
- `handleStatusChange(id, action)` — list_actions 快捷操作
- `handleDelete(id)` — 引用检查 → archive
- `handleCancel()` — dirty → 弹窗 / 否则 → 关闭
- 退出弹窗三选一: `handleExitSave()` / `handleExitDiscard()` / `handleExitContinue()`

**数据依赖**:
- HabitRepository (读)
- HabitLogRepository (今日打卡状态)
- server action: submitIntent (所有写操作)
- server action: checkHabitReferences (删除前检查)

### 4.2 HabitTemplatePage（/habits/templates）

**布局**: 同 Notion 风格，复用 HabitTemplateManager

**HabitTemplatePage 自有状态**（轻量）:

| 状态 | 类型 | 说明 |
|---|---|---|
| pageState | 'idle' \| 'dirty' \| 'submitting' | 脏状态 |
| dirtyLabel | string | 脏状态描述 |
| showExitDialog | boolean | 退出确认弹窗 |
| pendingAction | () => void \| null | 确认后的操作 |

**与 HabitTemplateManager 分工**: Page 负责脏状态指示器 + 退出确认；Manager 负责数据加载 + CRUD + 视图切换 + 表单渲染。

**HabitTemplateManager 改动**（最小化）:
1. 新增 `onDirtyChange?: (dirty: boolean) => void` prop
2. 新增 `onSubmitError?: (error) => void` prop
3. 模板写操作暂延用 server action（标注 TODO: 改为 PrebuiltIntent 链路）

### 4.3 脏状态与退出机制

**触发脏状态**: 表单任一字段修改 → pageState = 'dirty'

**触发退出确认**:
- 点击"取消"按钮
- 切换路由（侧边栏/浏览器后退/导航）
- 关闭抽屉（遮罩点击/Esc）

**确认弹窗三选项**:
| 选项 | 行为 |
|---|---|
| 保存并退出 | 提交修改 → 成功后清 dirty + 离开；失败 → 保留 dirty + 展示错误 |
| 放弃修改 | 丢弃修改 → 清 dirty → 离开 |
| 继续编辑 | 关闭弹窗 → 保留 dirty → 表单不变 |

### 4.4 错误处理

| 错误类型 | 展示方式 | 行为 |
|---|---|---|
| 字段验证失败 | 字段下方红色提示 | 保留表单数据，聚焦错误字段 |
| Rule Engine warning | 黄色 Banner + 说明 | [继续] / [取消] |
| Rule Engine confirm | 模态弹窗 + 冲突详情 | [确认] / [取消] |
| State Machine 拒绝 | Toast + 原因 | 不执行 |
| 网络/未知错误 | Toast | 可重试 |

**关键约束**: 任何失败不离开当前页面 — 抽屉保持打开，表单数据保留。错误信息必须具体（如"晨间冥想(08:00-08:30) 与已有习惯晚间阅读有 30 分钟重叠"）。

## 5. Manifest 变更

```yaml
# domains/habits/manifest.yaml — view_routes 区块
view_routes:
  # 已有
  createHabit:
    component: domains/habits/pages/HabitFormPage
    params:
      mode: create
  # 新增
  view_list:
    component: domains/habits/pages/HabitListPage
  view_templates:
    component: domains/habits/pages/HabitTemplatePage
```

`intent_triggers` 中 view_list（view_route: /habits）和 view_templates（view_route: /habits/templates）已存在，无需修改。

## 6. 实施检查清单

- [ ] 创建 `domains/habits/pages/HabitListPage.tsx`
- [ ] 创建 `domains/habits/pages/HabitTemplatePage.tsx`
- [ ] 创建 `app/habits/page.tsx`（thin shell）
- [ ] 创建 `app/habits/templates/page.tsx`（thin shell）
- [ ] 修改 manifest.yaml（view_routes +2）
- [ ] 修改 habit-form.tsx（onDirtyChange prop）
- [ ] 修改 habit-template-manager.tsx（onDirtyChange + onSubmitError prop）
- [ ] 删除 `hooks/use-habits.ts`
- [ ] 验证编译通过
- [ ] 验证脏状态流转（idle → dirty → submitting → idle）
- [ ] 验证退出确认弹窗（三选一）
- [ ] 验证写操作错误处理（字段级 + warning + confirm + 网络错误）
- [ ] 验证 PrebuiltIntent → Nexus 链路畅通
- [ ] 验证多租户隔离（userId 过滤）
