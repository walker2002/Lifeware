# OKR 核心管理设计文档 (004a-okr-core)

**Created**: 2026-05-10
**Status**: Draft
**Slice**: 004a-okr-core
**Parent Feature**: OKR 管理（004）
**Next Slice**: 004b-okr-intelligence（AI 文件导入 + 质量评估）

## 1. 概述

004a-okr-core 实现 OKR 的核心 CRUD 和生命周期管理，为后续 AI 智能功能（004b）提供数据基础。包含：OKR 创建/编辑/删除、Objective 生命周期状态机、Key Result 进度管理（手动 + 关联任务/习惯自动推进）、变更事件记录。

## 2. 需求来源

来自 `mydocs/dev/004-OKR 管理的开发.md` 的 [000] 初步需求，经头脑风暴确认 MVP 范围：

- OKR 类型（愿景型/承诺型）：MVP 阶段用户手动选择
- OKR 周期：自定义，默认季度
- OKR 生命周期：draft → active → paused/completed/discarded → archived
- KR 进度：关联任务/习惯自动推进
- 文件导入和 AI 评估推迟到 004b

## 3. 数据模型

### 3.1 数据库变更

**objectives 表 — 新增字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `okr_type` | `text` enum `['visionary', 'committed']` | OKR 类型，默认 `'committed'` |
| `discarded_at` | `timestamp with tz` | 废弃时间，废弃时填充 |

**objectives 表 — 修改 status 枚举：**

当前：`['draft', 'active', 'paused', 'completed', 'archived']`
新增：`'discarded'`

最终：`['draft', 'active', 'paused', 'completed', 'discarded', 'archived']`

**key_results 表 — 修改 status 枚举：**

同 objectives，新增 `'discarded'`。
最终：`['draft', 'active', 'paused', 'completed', 'discarded', 'archived']`

**无新表**：事件记录复用现有 `system_events` 表。

### 3.2 USOM 类型变更

**Objective 接口新增：**

```typescript
interface Objective {
  // ...现有字段
  okrType: 'visionary' | 'committed'
  discardedAt?: Timestamp
}
```

**ObjectiveStatus 新增：**

```typescript
type ObjectiveStatus = 'draft' | 'active' | 'paused' | 'completed' | 'discarded' | 'archived'
```

**KeyResultStatus 同步新增 `'discarded'`。**

### 3.3 预留 004b 扩展点

以下字段在 004a 中不实现，但设计时确保不阻塞后续添加：

- `objectives.quality_score` (integer, 0-100) — OKR 质量评估分数
- `objectives.evaluation_detail` (jsonb) — 评估详情

004a 中不添加这些字段，004b 通过数据库迁移添加。

## 4. 状态机设计

### 4.1 Objective 生命周期

```
(null) → draft → active ⇄ paused
                  ↓         ↓
            completed   discarded
                  ↓         ↓
               archived ←──┘
draft → discarded
```

**转换表：**

| From | To | Action | Event |
|------|----|--------|-------|
| null | draft | create | ObjectiveCreated |
| draft | active | activate | ObjectiveActivated |
| draft | discarded | discard | ObjectiveDiscarded |
| active | paused | pause | ObjectivePaused |
| active | completed | complete | ObjectiveCompleted |
| active | discarded | discard | ObjectiveDiscarded |
| paused | active | resume | ObjectiveResumed |
| paused | discarded | discard | ObjectiveDiscarded |
| completed | archived | archive | ObjectiveArchived |
| discarded | archived | archive | ObjectiveArchived |

**激活前置条件（onValidate）：**
- 至少包含 1 个 Key Result
- periodStart 和 periodEnd 已设置且合理（end > start）
- title 非空

### 4.2 Key Result 生命周期

与 Objective 同步：
- Objective 激活时，所有 draft KR 变为 active
- Objective 暂停时，所有 active KR 变为 paused
- Objective 完成时，所有 active/paused KR 变为 completed
- Objective 废弃时，所有 KR 变为 discarded
- Objective 归档时，所有 KR 变为 archived

KR 的 currentValue 可独立更新。当 currentValue 达到 targetValue 时，KR 自动标记为 completed。KR 的 paused/discarded/archived 状态与 O 同步，不受独立操作影响。

### 4.3 新增 SystemEventType

```typescript
| 'ObjectiveCreated'
| 'ObjectiveActivated'
| 'ObjectivePaused'
| 'ObjectiveResumed'
| 'ObjectiveCompleted'
| 'ObjectiveDiscarded'
| 'ObjectiveArchived'
| 'KeyResultUpdated'
| 'KeyResultCompleted'
| 'KeyResultProgressUpdated'
```

## 5. 领域插件设计

### 5.1 OKR Domain Plugin (`domains/okrs/index.ts`)

遵循四钩子模式，参考 `domains/habits/index.ts`。

**Manifest：**
```typescript
{
  domainId: 'okrs',
  version: '1.0.0',
  requiredFields: ['title'],
  subscribedEvents: [
    'ObjectiveCreated', 'ObjectiveActivated', 'ObjectivePaused',
    'ObjectiveResumed', 'ObjectiveCompleted', 'ObjectiveDiscarded',
    'ObjectiveArchived', 'KeyResultUpdated', 'KeyResultCompleted',
    'KeyResultProgressUpdated',
    // 监听任务/习惯事件以自动推进 KR 进度
    'TaskCompleted', 'HabitLogged',
  ],
}
```

**onValidate：**
- createObjective：验证 title、period、okrType
- updateObjective：验证状态转换合法性
- createKeyResult：验证 targetValue > 0、unit 非空
- updateKeyResult：验证 currentValue 在 [0, targetValue] 范围内
- activateObjective：验证至少 1 个 KR、日期合理

**onEvent：**
- TaskCompleted / HabitLogged：检查关联的 keyResultId，若有则重新计算 currentValue 和 progressRate，发出 KeyResultProgressUpdated 事件
- KeyResultProgressUpdated：检查所属 O 的所有 KR 是否全部完成，若是则建议标记 Objective 为 completed
- ObjectiveActivated：发出"OKR 已激活"指标
- ObjectiveDiscarded：发出"OKR 已废弃"指标

**onActionSurfaceRequest：**
- KR 即将到期（dueDate 距今 < 7 天）且进度 < 70%：生成警告 cue
- O 的周期即将结束（periodEnd 距今 < 14 天）且未完成：生成提醒 guide
- KR 进度长时间无更新（> 7 天）：生成催更 tile

## 6. API 设计

### 6.1 Objectives API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/objectives` | 列表（支持 ?status=&period= 筛选） |
| POST | `/api/objectives` | 创建 |
| GET | `/api/objectives/[id]` | 详情（含所有 KR） |
| PATCH | `/api/objectives/[id]` | 更新 |
| POST | `/api/objectives/[id]/activate` | 激活 |
| POST | `/api/objectives/[id]/pause` | 暂停 |
| POST | `/api/objectives/[id]/complete` | 完成 |
| POST | `/api/objectives/[id]/discard` | 废弃 |
| POST | `/api/objectives/[id]/archive` | 归档 |

### 6.2 Key Results API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/objectives/[id]/key-results` | 创建 KR |
| PATCH | `/api/key-results/[id]` | 更新 KR |
| POST | `/api/key-results/[id]/progress` | 手动更新进度 |
| DELETE | `/api/key-results/[id]` | 删除 KR（仅 draft 状态） |

### 6.3 预留 004b 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/objectives/import` | 文件导入（004b） |
| POST | `/api/objectives/[id]/evaluate` | 质量评估（004b） |

## 7. UI 设计

### 7.1 OKR 列表页

- 按周期筛选（默认当前季度）
- 按状态分组显示：进行中 → 草稿 → 已暂停 → 已完成 → 已废弃 → 已归档
- 每个 O 卡片显示：标题、类型标签（愿景/承诺）、进度环（所有 KR 平均进度）、KR 数量、周期范围
- 支持折叠/展开查看子 O

### 7.2 OKR 创建/编辑

- 表单字段：标题、描述、类型（愿景/承诺）、周期类型、开始/结束日期、父级 O（可选）
- 激活前提示：显示基本校验结果（KR 数量、日期合理性）
- 004b 中在此处加入质量评估分数

### 7.3 OKR 详情页

- 顶部：O 基本信息 + 状态操作按钮（激活/暂停/完成/废弃/归档）
- 中部：KR 列表，每个 KR 显示进度条、当前值/目标值、关联任务/习惯数量
- 底部：变更历史（从 system_events 读取）
- KR 支持：手动更新进度、关联/取消关联任务和习惯

## 8. KR 自动进度推进

### 8.1 推进逻辑

当 Task 完成（status → completed）或 Habit 打卡（habit_log 创建）时：

1. 检查该 Task/Habit 是否关联了 keyResultId
2. 若有，计算该 KR 下所有关联 Task 的完成比例
3. 更新 KR 的 currentValue：`sum(已完成任务的权重)` 或按比例计算
4. 更新 KR 的 progressRate：`currentValue / targetValue * 100`
5. 发出 KeyResultProgressUpdated 事件

### 8.2 进度计算策略

**任务关联**：每个关联 Task 贡献 `targetValue / 关联任务总数` 的值。任务完成时推进。

**习惯关联**：每次习惯打卡（habit_log 创建）使 currentValue +1。例如 KR 是"每周运动 5 次"，targetValue=5，每次打卡推进 1。当 currentValue 达到 targetValue 时 KR 自动完成。

用户也可以手动设置每个关联项的具体贡献值，MVP 先用等分策略。

## 9. 与现有系统的集成

### 9.1 与 Nexus 的集成

- OKR 领域插件注册到 Nexus Orchestrator
- Objective 状态转换通过 State Machine 处理
- Action Surface Engine 可基于 OKR 状态生成行动建议

### 9.2 与任务/习惯的关联

- `tasks.keyResultId` FK 已存在于 schema
- `habits.keyResultId` FK 已存在于 schema
- OKR 详情页展示关联的任务和习惯
- 任务/习惯详情页展示所属 OKR

### 9.3 冲突仲裁

遵循 `mydocs/methodology/` 中定义的优先级：
- 截止紧迫 > 精力匹配 > 时间盒锁定 > OKR 关联 > 习惯保护
- OKR 关联作为任务调度的参考因素之一

## 10. 004b-okr-intelligence 概要

004a 完成后展开详细设计，概要范围：

1. **文件导入**：支持 Markdown/TXT/Excel，AI 解析提取 O+KR 元素
2. **OKR 质量评估**：基于规则引擎的打分（KR 可量化性、O 时间约束、KR 数量合理性等）
3. **改进建议**：根据评估结果给出具体改进方向

依赖 004a 提供的扩展点：预留 API 端点、数据库字段扩展。

## 11. 假设与约束

- MVP 只做 Web 端
- OKR 类型由用户手动选择，不做 AI 自动判定
- KR 进度自动推进采用等分策略（每个关联项等权重）
- 废弃状态的数据不物理删除，归档后从默认视图中隐藏
- 所有数据操作遵循 Multi-Tenancy（T-01 ~ T-04），通过 userId 隔离
- 遵循 Repository Pattern（R-01 ~ R-04）
