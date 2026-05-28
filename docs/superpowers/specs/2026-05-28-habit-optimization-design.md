# 习惯管理优化迭代 — [010][011][012] 设计

**日期**: 2026-05-28
**状态**: 待审核
**需求来源**: `mydocs/dev/当前开发内容.md` [010][011][012]
**前置 spec**: `2026-05-27-habit-iteration-design.md`（CnuiFormAdapter、FormRegistry 已就绪）

## 概述

三个需求：统一校验回 onValidate、生命周期 action CN-UI 支持、打卡 action CN-UI 支持。所有写操作走完整 Nexus 链路。

## 通用交互模式：复选框批量操作

CN-UI 和页面端共享同一交互模式：

- 每条记录前有复选框
- 顶部"全选"复选框 + "已选 N / 总数"计数
- 底部单个执行按钮 "XXX所选 (N)"，N=0 时 disabled
- 点击全选 → 选中/取消全部项目
- **选中视觉反馈**：勾选后标题添加删除线（`text-decoration: line-through`），整行文字变灰（`color: #9ca3af`）；取消勾选恢复。CN-UI（HabitActionPanel、HabitCheckinPanel）和页面端 HabitCard 统一应用

---

## [010] 统一校验回 onValidate

### 问题

`HabitForm`（habit-form.tsx:146）有内联 `isValid` 判断，与 `validateHabitFields`（validation.ts）部分重复。CN-UI 和未来 Bridge Layer 可能绕过此校验。

### 方案：客户端预检 + 服务端把关

**原则**：`validateHabitFields` 纯函数在客户端和 onValidate 中复用。onValidate 是 Nexus 链路唯一权威校验点。

#### 1. HabitForm 替换内联校验

**文件**: `frontend/src/domains/habits/components/habit-form.tsx`

- 导入 `validateHabitFields`
- 删除内联 `isValid` 变量（第146行）
- `handleSubmit` 中调用 `validateHabitFields(fields, 'createHabit')` 做客户端预检
- 预检不通过 → 不提交，直接在表单内展示错误
- 新增 `clientErrors: string[]` state 用于展示校验错误

#### 2. CnuiFormAdapter 增加服务端错误展示

**文件**: `frontend/src/components/cnui/cnui-form-adapter.tsx`

- 新增 `serverErrors?: string[]` prop
- 有错误时在表单下方渲染红色错误列表

#### 3. HabitCreationCard 透传错误

**文件**: `frontend/src/components/cnui/surfaces/HabitCreationCard.tsx`

- 从 confirm 回调中获取 server action 返回的 onValidate errors
- 传给 CnuiFormAdapter

#### 4. Server Action 返回校验错误详情

**文件**: `frontend/src/app/actions/intent.ts`

- `submitHabitIntent` 等函数在 `orchestrator.executeIntent` 返回失败时，解析 `result.error` 中包含的 onValidate errors

#### 5. onValidate 保持不变

**文件**: `frontend/src/domains/habits/hooks.ts`

- onValidate 已正确实现，无需改动
- 确保所有 action（包括 addHabitToTemplate、removeHabitFromTemplate 等）校验完备

### 校验覆盖矩阵

| Action | 校验内容 | 位置 |
|---|---|---|
| createHabit | 标题必填、时间格式、时间窗口、时长范围、频率类型 | validateHabitFields |
| updateHabit | 同上（标题仅在 create 必填） | validateHabitFields |
| logHabit | habitId 必填 | hooks.ts onValidate |
| activate/suspend/archive/reactivate | habitId 必填（已有） | hooks.ts onValidate（新增） |
| createTemplate | name 必填、applicableDays 非空 | hooks.ts onValidate |
| addHabitToTemplate | templateId 必填、habitId 必填、timeOverride 格式 | hooks.ts onValidate |
| removeHabitFromTemplate | templateId 必填、habitId 必填 | hooks.ts onValidate |
| applyTemplate | templateId 必填、date 必填 | hooks.ts onValidate |

---

## [011] 生命周期 Action 处理

### 四种 Action

| Action | 源状态 | 目标状态 | 过滤条件 |
|---|---|---|---|
| activate | draft | active | status=draft |
| suspend | active | suspended | status=active |
| reactivate | suspended | active | status=suspended |
| archive | suspended | archived | status=suspended |
| delete | draft/suspended | (删除) | status=draft 或 suspended |

> 注意：archive 和 delete 已有 manifest `list_actions` 声明 `confirm_required: true`，执行前需确认弹窗。

### CN-UI 表面：HabitActionPanel

**文件**: `frontend/src/components/cnui/surfaces/HabitActionPanel.tsx`（新建）

```typescript
interface HabitActionPanelProps {
  action: 'activate' | 'suspend' | 'reactivate' | 'archive'
  // CN-UI 标准 props
  surfaceType: string
  dataModel: Record<string, unknown>
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void
}
```

**组件结构**：
1. 标题栏：action 对应文案（"激活草稿习惯"/"暂停活跃习惯"/"恢复暂停习惯"/"归档暂停习惯"）
2. 全选复选框 + 已选计数
3. 习惯列表（复用 Repository 获取符合条件的习惯）：
   - 复选框 + 标题 + 时间 + frequency 标签 + 连续天数
4. 底部执行按钮："XXX所选 (N)"
5. archive 操作：需额外确认提示

**数据获取**：Server Action 直接调用 Repository 获取符合条件的习惯（只读操作，Constitution 允许页面组件对 Repository 的直接读取）。

**执行**：逐条创建 `StructuredIntent` → `updateHabitStatus` server action → Nexus 链路。

### 页面端增强

**文件**: `frontend/src/domains/habits/components/habit-list.tsx`

- 每个状态分组标题栏增加"激活所选"/"暂停所选"/"恢复所选"/"归档所选"按钮
- 每条 HabitCard 左侧增加复选框
- 新增选中状态管理：`selectedIds: Set<string>`
- 批量执行：遍历 selectedIds，逐条调用 `updateHabitStatus`

**HabitCard 不变**：已有单卡按钮（激活/暂停/恢复/归档）保持不变。

---

## [012] 打卡 Action 处理

### 三种确认方式

| 方式 | 操作 | 数据内容 |
|---|---|---|
| 批量确认 | 勾选多条 → "打卡所选 (N)" | 仅记录完成（completionStatus=completed） |
| 逐条快速 | 点击单条"完成"按钮 | 仅记录完成 |
| 详情打卡 | 点击单条"详情" → 弹窗 → 填写可选字段 → 确认 | completionStatus + actualDuration/completionRating/energyLevel/note（全部可选） |

### CN-UI 表面：HabitCheckinPanel

**文件**: `frontend/src/components/cnui/surfaces/HabitCheckinPanel.tsx`（新建）

**组件结构**：
1. 标题：今日打卡
2. 全选复选框 + 已选计数
3. 可打卡习惯列表（active、trackable、未打卡）：
   - 复选框 + 标题 + 连续天数 + 默认时间
   - "完成"按钮（快速打卡）
   - "详情"按钮（打开详情弹窗）
4. 底部："打卡所选 (N)" 批量执行
5. 已打卡习惯列表（折叠，已完成标识）

**详情弹窗（内联展开或 Modal）**：

```
字段：
- 实际时长 actualDuration: number（分钟，默认=习惯默认时长）
- 完成评分 completionRating: 1-5（可选）
- 精力水平 energyLevel: 1-10（可选）
- 备注 note: string（可选）

操作：取消 | 确认打卡
```

**数据获取**：Server Action 直接调用 Repository 获取待打卡习惯（只读）。可复用已有 `PendingHabitsProvider` 逻辑。

**执行**：创建 `StructuredIntent(action='logHabit')` → Server Action → Nexus 链路。

### 页面端增强

**文件**: `frontend/src/domains/habits/components/habit-list.tsx`
**文件**: `frontend/src/domains/habits/components/habit-card.tsx`
**文件**: `frontend/src/domains/habits/pages/HabitListPage.tsx`

1. **修复断连**：HabitList 渲染 HabitCard 时传入 `onLog` 和 `todayLogged` 属性
2. **增强 HabitCard**：添加复选框（用于批量选择）
3. **增强 HabitList**：
   - 活跃分组增加"打卡所选"按钮
   - 复选框选择状态管理
4. **HabitListPage**：新增 `handleLogHabit` 函数，调用 server action
5. **详情弹窗**：新建 `HabitCheckinDetail` 组件（可复用于 CN-UI 和页面端）

### HabitCheckinDetail 组件

**文件**: `frontend/src/domains/habits/components/habit-checkin-detail.tsx`（新建）

```typescript
interface HabitCheckinDetailProps {
  habit: { id: string; title: string; defaultDuration: number }
  onSubmit: (fields: HabitLogFields) => void
  onCancel: () => void
}

interface HabitLogFields {
  actualDuration?: number
  completionRating?: number   // 1-5
  energyLevel?: number         // 1-10
  note?: string
  completionStatus: 'completed'
}
```

所有字段可选，`completionStatus` 固定为 `'completed'`。

### 已打卡显示

- 活跃分组中已打卡的卡片显示"今日已打卡"标识（复用 HabitCard 已有的 todayLogged 标记逻辑）
- CN-UI 面板中已打卡项折叠到底部，降低视觉权重

---

## Server Action 补充

**文件**: `frontend/src/app/actions/intent.ts`

新增：

```typescript
// 批量打卡
export async function batchLogHabits(
  items: Array<{ habitId: string; fields?: Partial<HabitLogFields> }>
): Promise<BatchActionResult>

// 获取指定状态的习惯列表（用于生命周期面板）
export async function getHabitsByStatus(
  status: HabitStatus
): Promise<HabitActionResult>
```

---

## CN-UI 组件注册

**文件**: `frontend/src/components/cnui/surfaces/index.ts`

新增注册：
- `habit-action-panel` → HabitActionPanel
- `habit-checkin-panel` → HabitCheckinPanel

---

## 改动文件清单

| 文件 | 改动类型 | 需求 |
|---|---|---|
| `domains/habits/components/habit-form.tsx` | 修改 | [010] 替换内联 isValid → validateHabitFields |
| `components/cnui/cnui-form-adapter.tsx` | 修改 | [010] 新增 serverErrors 展示 |
| `components/cnui/surfaces/HabitCreationCard.tsx` | 修改 | [010] 错误透传 |
| `app/actions/intent.ts` | 新增函数 | [010] 错误解析 + [011][012] server actions |
| `components/cnui/surfaces/HabitActionPanel.tsx` | 新建 | [011] 生命周期操作 CN-UI 表面 |
| `components/cnui/surfaces/HabitCheckinPanel.tsx` | 新建 | [012] 打卡 CN-UI 表面 |
| `domains/habits/components/habit-checkin-detail.tsx` | 新建 | [012] 打卡详情弹窗组件 |
| `domains/habits/components/habit-list.tsx` | 修改 | [011][012] 复选框 + 批量按钮 + onLog 断连修复 |
| `domains/habits/components/habit-card.tsx` | 修改 | [011][012] 复选框 prop + onLog 连线 |
| `domains/habits/pages/HabitListPage.tsx` | 修改 | [011][012] 批量操作 + 打卡处理函数 |
| `domains/habits/hooks.ts` | 修改 | [010] onValidate 补充 lifecycle action 校验 |
| `components/cnui/surfaces/index.ts` | 修改 | [011][012] 注册新表面 |

## 不做的事

- onValidate 钩子本身的架构修改（已正确实现）
- HabitForm 字段增减
- Repository 接口修改
- 删除 HabitCard 现有单卡操作按钮
- Bridge Layer 实现

## Constitution 合规性

| 原则 | 合规说明 |
|---|---|
| I Intent-Driven | 所有操作走 Intent Engine → Rule Engine → State Machine 管道 |
| III Single-Writer | CN-UI onConfirm 触发 Server Action，不直接写库 |
| IV USOM Sovereignty | 无新 USOM 类型，仅使用已有 Habit/HabitLog |
| V Repository Isolation | CN-UI 通过 Server Action 间接访问数据 |
| VI Domain Plugin | 校验逻辑在 onValidate（Reactive Track）；新表面是 CN-UI 协议组件 |
| VI CN-UI Protocol | 新表面注册到 Component Catalog，使用声明式 Payload |
| VI Form Reuse | HabitCheckinDetail 是通用组件，CN-UI 和页面端复用 |
| VIII AI/Rule Boundary | onValidate 是确定性规则，无 AI 参与 |
