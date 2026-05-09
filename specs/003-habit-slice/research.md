# Research: 习惯管理切片

**Date**: 2026-05-09 | **Feature**: 003-habit-slice

## R1: habits 表 schema 变更策略

**Decision**: 在现有 habits 表上 ALTER 添加新字段 + 重命名已有字段，通过 Drizzle migration 实现。

**Rationale**: 现有 habits 表已定义完整（19 个字段），只需新增 4 个字段（trackable、earliestTime、latestEndTime、minDuration）和重命名 2 个字段（scheduledTime→defaultTime、duration→defaultDuration）。ALTER 比重建表更安全，保留已有数据。

**Alternatives considered**:
- 创建新表迁移旧数据：风险高、不必要
- 仅新增字段不重命名：会造成命名不一致，增加认知负担

## R2: 引用式模板的数据模型

**Decision**: 使用 template_habits 关联表存储 habitId + 可选的 timeOverride/durationOverride。习惯属性修改自动反映到所有引用模板（因为是外键引用）。

**Rationale**: 与 timebox_tasks/timebox_habits 的 junction table 模式一致。覆盖字段用 nullable text/integer，NULL 表示继承习惯库默认值。

**Alternatives considered**:
- JSONB 存储 habits 数组：无法外键约束，删除习惯时无法级联处理
- 快照式复制：数据同步复杂，修改习惯需同步所有模板副本

## R3: 跨午夜时间比较

**Decision**: 当 `latestEndTime < defaultTime`（或 `latestEndTime < earliestTime`）时，视为跨日。比较逻辑使用"分钟偏移"转换：将 HH:MM 转为 0~1439 的分钟数，跨日时 latestEndTime 加 1440。

**Rationale**: 睡眠习惯（22:00-06:00）是最常见的跨日场景。分钟偏移方案简单、统一，无需引入日期对象。

**Alternatives considered**:
- 增加日期字段：过度设计，习惯时间是每日重复的
- 限制不允许跨日：不现实，睡眠是核心场景

## R4: 习惯模板 UI 的纵向时间轴实现

**Decision**: 复用 timebox-timeline 的纵向时间轴组件模式，按列渲染不同模板。每个习惯块使用绝对定位（基于分钟偏移计算 top 和 height）。

**Rationale**: 与时间盒视图视觉一致，用户在模板视图和每日时间轴间切换无认知断裂。复用现有 CSS 模式和布局计算逻辑。

**Alternatives considered**:
- 横向时间轴：与时间盒方向不一致
- 纯列表视图：无法直观看到时间分布

## R5: habits 域插件事件权重设计

**Decision**: 沿用 timebox 域的权重分层模式（90=高优先/80=中优先/70=常规/50=低优先），按习惯事件的重要性分配权重。streak 里程碑 90、即将到期 75、跳过提醒 60-80。

**Rationale**: 与 timebox 域插件一致，方便 Action Surface Engine 按统一优先级排序。

**Alternatives considered**:
- 全部使用相同权重：无法区分优先级
- 引入独立的习惯优先级体系：增加 Action Surface Engine 的复杂度

## R6: 习惯库 vs 模板的代码组织

**Decision**: 习惯和模板使用独立的 Repository（HabitRepository、HabitTemplateRepository），但在同一个 habits domain plugin 中处理验证逻辑。

**Rationale**: 数据访问层分离（Repository 各自独立），业务逻辑集中（域插件统一处理）。与 timebox 域的模式一致。

**Alternatives considered**:
- 为模板创建独立 domain：过度拆分，模板是习惯的编排方式而非独立概念
