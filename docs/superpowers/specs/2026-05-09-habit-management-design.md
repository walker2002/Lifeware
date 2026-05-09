# 习惯管理功能设计

> 日期: 2026-05-09
> 状态: 已确认
> 关联: 002-timebox-slice (已完成), 003-habit-slice (待建)

## 1. 概述

习惯管理是 Lifeware 的核心功能之一，支持用户定义个人每日习惯、管理习惯时间占用，并通过模板机制一键生成每日时间盒计划。功能与现有时间盒管理深度集成，遵循 Nexus 架构的四层模式。

### 核心设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 可追踪 vs 纯占时 | 统一模型 + `trackable` 字段 | 共享时间调度能力，同一时间盒可绑定多个习惯 |
| 定义方式 | 习惯库 + 引用式模板 | 兼顾灵活性和场景化 |
| 时间模型 | `defaultTime` + `earliestTime` + `latestEndTime` | 精确控制每个习惯的时间弹性 |
| 时长压缩 | `defaultDuration` + `minDuration` | 支持时间紧张时压缩，但有底线 |
| AI 交互 | 一步生成 + 确认 | 减少用户操作步骤 |
| 实施策略 | 三阶段递增 | 每个 Phase 独立可用 |

## 2. 数据模型

### 2.1 现有 habits 表变更

在现有 schema 基础上新增和重命名字段：

**重命名：**
- `scheduledTime` → `defaultTime`
- `duration` → `defaultDuration`

**新增字段：**

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `trackable` | boolean | `true` | 是否需要打卡/streak 追踪 |
| `earliestTime` | text | `defaultTime - 30min` | 最早可安排时间 (HH:MM) |
| `latestEndTime` | text | `defaultTime + defaultDuration + 30min` | 最晚必须结束时间 (HH:MM) |
| `minDuration` | integer | `defaultDuration * 0.5` | 最小时长（分钟），低于此值建议取消 |

**习惯分类示例：**

| 习惯 | trackable | defaultTime | earliestTime | latestEndTime | defaultDuration | minDuration |
|------|-----------|-------------|--------------|---------------|-----------------|-------------|
| 晨跑 | true | 07:00 | 06:00 | 09:00 | 30 | 15 |
| 午餐 | false | 12:00 | 11:30 | 13:00 | 45 | 20 |
| 阅读 | true | 08:00 | 06:00 | 23:00 | 30 | 10 |
| 睡眠 | false | 22:00 | 22:00 | 06:00+1 | 480 | 360 |
| 每日复盘 | true | 22:00 | 21:00 | 23:00 | 15 | 10 |

### 2.2 新增 habit_templates 表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid PK | 主键 |
| `userId` | uuid FK → users | 多租户 |
| `name` | text not null | 模板名称（如"工作日"） |
| `description` | text | 可选描述 |
| `icon` | text | 可选图标 emoji |
| `status` | text enum | `draft | active` |
| `applicableDays` | jsonb (number[]) | 适用星期几 (0=Sun..6=Sat) |
| `createdAt` | timestamp | 创建时间 |
| `updatedAt` | timestamp | 更新时间 |

索引：`idx_habit_templates_user_status`

### 2.3 新增 template_habits 关联表

| 字段 | 类型 | 说明 |
|------|------|------|
| `templateId` | uuid FK → habit_templates | 模板外键 |
| `habitId` | uuid FK → habits | 习惯外键（引用，非快照） |
| `sortOrder` | integer | 排序序号 |
| `timeOverride` | text | 可选时间覆盖 (HH:MM)，为空则使用习惯库的 defaultTime |
| `durationOverride` | integer | 可选时长覆盖（分钟），为空则使用习惯库的 defaultDuration |

联合主键：`(template_id, habit_id)`

**跨午夜约定**：当 `latestEndTime < earliestTime` 时，表示跨越午夜到次日。例如睡眠 earliestTime=22:00, latestEndTime=06:00 表示 22:00 到次日 06:00。所有时间比较逻辑需考虑此约定。

**覆盖机制**：模板引用习惯库的习惯（外键关联），可选择性覆盖 `time` 和 `duration`。未覆盖的属性从习惯库继承。习惯库属性修改自动反映到所有引用它的模板。

### 2.4 现有 habit_logs 表（不变）

保持现有设计不变。`trackable: false` 的习惯不产生 habit_log 记录。

### 2.5 现有 timebox_habits 关联表（不变）

保持现有 junction table，习惯生成的时间盒通过此表关联。

## 3. USOM 类型变更

### 3.1 Habit 接口扩展

```typescript
interface Habit {
  // 现有字段保持不变...
  id: USOM_ID
  status: HabitStatus
  title: string
  description?: string
  frequency: HabitFrequency
  startDate: DateOnly
  endDate?: DateOnly
  keyResultId?: USOM_ID
  streak: number
  longestStreak: number
  completionRate7d: number
  tags: Tag[]
  createdAt: Timestamp
  updatedAt: Timestamp
  suspendedAt?: Timestamp
  archivedAt?: Timestamp
  notes?: Notes

  // 重命名
  defaultTime: string          // 原 scheduledTime
  defaultDuration: DurationMinutes  // 原 duration

  // 新增
  trackable: boolean
  earliestTime: string         // HH:MM
  latestEndTime: string        // HH:MM
  minDuration: DurationMinutes
}
```

### 3.2 新增类型

```typescript
interface HabitTemplate {
  id: USOM_ID
  name: string
  description?: string
  icon?: string
  status: 'draft' | 'active'
  applicableDays: number[]
  habits: TemplateHabitItem[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

interface TemplateHabitItem {
  habitId: USOM_ID
  sortOrder: number
  timeOverride?: string          // HH:MM
  durationOverride?: DurationMinutes
}

// HabitSummary 扩展
interface HabitSummary {
  id: USOM_ID
  title: string
  status: HabitStatus
  defaultTime: string            // 原 scheduledTime
  trackable: boolean             // 新增
  streak: number
  todayLogged: boolean
}
```

## 4. Domain Plugin: habits

### 4.1 Manifest

```yaml
domainId: habits
version: "1.0.0"
requiredFields:
  - title
  - defaultTime
  - defaultDuration
  - trackable
subscribedEvents:
  - HabitCreated
  - HabitActivated
  - HabitSuspended
  - HabitArchived
  - HabitLogged
  - HabitSkipped
  - HabitStreakMilestone
```

### 4.2 onValidate

验证习惯相关意图的合法性：

**创建习惯**：
- `title` 非空
- `defaultTime` 有效 HH:MM 格式
- `defaultDuration > 0`
- `minDuration > 0` 且 `<= defaultDuration`
- 时间窗口合法：`earliestTime < defaultTime` 且 `defaultTime + defaultDuration <= latestEndTime`
- `frequencyType` 合法枚举值

**打卡 (log_habit)**：
- `habitId` 存在且 `status === 'active'`
- `trackable === true`（纯占时习惯不可打卡）
- 当日未重复打卡（利用唯一约束 `uniq_habit_logs_habit_date`）

**创建/修改模板**：
- 模板名称非空
- `applicableDays` 不为空数组
- 引用的 habitId 均存在且为 active 状态
- `timeOverride`（如有）在习惯的 earliestTime ~ latestEndTime 范围内
- `durationOverride`（如有）>= 习惯的 minDuration

### 4.3 onEvent

| 事件 | 权重 | Action Surface 建议 |
|------|------|---------------------|
| HabitCreated | 50 | 提示"新习惯已激活，已添加到习惯库" |
| HabitStreakMilestone (7/14/30) | 90 | 高优先级展示成就，激励继续 |
| HabitLogged | 40 | 更新完成率，静默处理 |
| HabitSkipped | 60 | 如 streak > 3 提升到 80，显示 streak 保护提醒 |
| HabitDueSoon (距 defaultTime < 30min) | 75 | 提醒即将到期的待打卡习惯 |

### 4.4 onActionSurfaceRequest

根据当前 USOMSnapshot 返回操作建议：

- **待打卡习惯**：返回 `log_habit` ActionCandidate，权重 70
- **streak 接近里程碑**（如连续 6 天，距 7 天里程碑 1 天）：返回激励型 ActionCandidate，权重 85
- **连续跳过 > userCalibration.habitRiskDays**：返回警告型 ActionCandidate，权重 80
- **非 trackable 习惯**：不生成 ActionCandidate（无打卡逻辑）

### 4.5 onOutboundRequest

MVP 阶段不实现。

## 5. AI 意图引擎集成

### 5.1 习惯解析 Prompt 扩展

在 `ai-parser.ts` 中增加 `habit` 类型的意图解析模板。

**解析示例：**

| 用户输入 | 解析结果 |
|----------|----------|
| "每天早上7点运动30分钟" | `{type: "createHabit", title: "运动", defaultTime: "07:00", defaultDuration: 30, trackable: true, frequencyType: "daily"}` |
| "午餐12点，1小时" | `{type: "createHabit", title: "午餐", defaultTime: "12:00", defaultDuration: 60, trackable: false, frequencyType: "daily"}` |
| "工作日晚上10点复盘15分钟" | `{type: "createHabit", title: "复盘", defaultTime: "22:00", defaultDuration: 15, trackable: true, frequencyType: "weekly", daysOfWeek: [1,2,3,4,5]}` |

### 5.2 AI 自动推断默认值

用户未明确指定时，AI 按以下规则推断：

| 字段 | 推断规则 |
|------|----------|
| `trackable` | 默认 `true`；用餐/睡眠/休息类关键词 → `false` |
| `earliestTime` | `defaultTime - 30min` |
| `latestEndTime` | `defaultTime + defaultDuration + 30min` |
| `minDuration` | `floor(defaultDuration * 0.5 / 5) * 5`（5 的倍数，最小 5 分钟） |

### 5.3 模板相关意图

| 用户输入 | 解析结果 |
|----------|----------|
| "创建一个工作日模板" | `{type: "createTemplate", name: "工作日", applicableDays: [1,2,3,4,5]}` |
| "把运动加到工作日模板，时间改成6点半" | `{type: "addHabitToTemplate", templateName: "工作日", habitTitle: "运动", timeOverride: "06:30"}` |
| "用工作日模板安排今天的计划" | `{type: "applyTemplate", templateName: "工作日", date: "today"}` |

## 6. UI 设计

### 6.1 习惯库视图

嵌入现有三栏布局的右侧主内容区，包含：

- **顶部操作栏**：习惯计数、模板管理入口、新建习惯按钮
- **筛选标签**：全部 / 可追踪 / 仅占时 / 已暂停
- **习惯卡片**：每个习惯一张卡片，显示：
  - 图标 + 标题 + 分类标记（可追踪/仅占时）
  - 时间范围 + 频率
  - streak 计数（仅 trackable 习惯）
  - 时间窗口可视化条（earliest → default → latest）
  - 默认时长 / 最小时长 / 完成率

### 6.2 模板管理视图

采用**纵向时间轴 + 横向模板列**布局，与时间盒 timeline 方向一致：

- **左侧**：时间刻度（纵向）
- **列**：每个模板一列（工作日 | 休息日 | ...）
- **习惯块**：按实际时间纵向排列，显示标题、时长、streak
- **覆盖标记**：模板中覆盖了习惯库属性的项目用橙色 `↑ 覆盖` 标注
- **自由时间**：未被习惯占用的时段显示为"自由时间"
- **底部操作**：新建模板、用模板安排今天

### 6.3 颜色编码

| 类型 | 颜色 | 用途 |
|------|------|------|
| 睡眠/复盘 | 紫色 (#8b5cf6) | 系统性习惯 |
| 运动 | 绿色 (#34d399) | 身体活力 |
| 用餐 | 橙色 (#f59e0b) | 日常占位 |
| 阅读/学习 | 蓝色 (#3b82f6) | 个人成长 |

## 7. 每日计划生成流程

```
选择模板 → 生成时间盒草稿 → 冲突检测 → 用户调整 → 确认生效
```

### 7.1 选择模板

用户通过 UI 点击"用模板安排今天"或通过 AI 说"用工作日模板安排今天"。

### 7.2 生成草稿

系统遍历模板中的每个 TemplateHabit：
1. 取习惯的 `defaultTime`（如有 timeOverride 则用覆盖值）
2. 取习惯的 `defaultDuration`（如有 durationOverride 则用覆盖值）
3. 在当日时间轴上创建 `status: draft` 的时间盒
4. 通过 `timebox_habits` 关联时间盒与习惯

### 7.3 冲突检测

规则引擎检查：
- 习惯之间时间重叠（同模板内不应冲突，但与已有时间盒可能冲突）
- 习惯时段与已有任务/OKR 安排冲突
- 触发冲突仲裁矩阵（C-03 ~ C-07）

### 7.4 用户调整

显示草稿 + 冲突提示，用户可以：
- 拖拽调整习惯时间盒的时间（在 earliestTime ~ latestEndTime 范围内）
- 压缩习惯时长（不低于 minDuration）
- 跳过某个习惯（标记为 skipped，不创建时间盒）

### 7.5 确认生效

用户确认后：
- 所有时间盒从 `draft` → `planned` 状态
- 习惯本身状态不变（template 只是引用）
- 可在同一日多次调整（重新应用模板或手动修改）

## 8. 与现有系统的集成点

| 集成点 | 说明 |
|--------|------|
| timebox_habits | 习惯通过现有 junction table 关联时间盒 |
| 规则引擎 | 新增习惯时间冲突检测规则，复用 timebox-overlap 框架 |
| 冲突仲裁 | 已有 C-03 ~ C-07 规则，在规则引擎中实现 |
| Action Surface | habits domain 返回 `log_habit` 等操作建议 |
| DerivedSignals | 已有 `habitStreaks` 和 `habitCompletionRates` 字段 |
| UserCalibration | 已有 `habitRiskDays` 和 `habitPreferredTimeSlots` 参数 |
| DB 视图 | 已有 `v_today_pending_habits` 视图定义 |

## 9. 分阶段实施计划

### Phase 1: 习惯库基础

**范围**：习惯 CRUD + 时间模型扩展 + 基础 UI

- habits 表 schema 变更（新增字段、重命名字段）
- USOM Habit 类型扩展
- Habit Repository 实现（CRUD + mapper）
- habits Domain Plugin 骨架（onValidate）
- 习惯库 UI 视图（列表、新建、编辑、删除）
- Drizzle migration 生成

**交付标准**：用户可以在 UI 中创建、编辑、删除习惯，查看习惯库列表。

### Phase 2: 模板系统

**范围**：模板 CRUD + 每日计划生成 + 时间盒集成

- habit_templates + template_habits 表创建
- USOM Template 类型定义
- Template Repository 实现
- 模板管理 UI（纵向时间轴布局）
- 每日计划生成逻辑（模板 → 时间盒草稿）
- 冲突检测集成（规则引擎）
- AI 意图解析扩展（模板相关意图）

**交付标准**：用户可以创建模板、通过模板一键生成每日时间盒计划、调整冲突后确认生效。

### Phase 3: 高级功能

**范围**：AI 完整支持 + streak 追踪 + Action Surface

- habits Domain Plugin 完整实现（onEvent, onActionSurfaceRequest）
- AI 意图解析完整支持（习惯创建自然语言解析 + 自动推断）
- streak 追踪逻辑（HabitCreated → HabitLogged 连续计数）
- Action Surface 集成（待打卡提醒、streak 里程碑、跳过警告）
- 打卡 UI（今日打卡视图、打卡确认）

**交付标准**：用户可以通过 AI 自然语言管理习惯，系统自动追踪 streak 并提供智能提醒。
