# Quickstart: 习惯管理切片

**Date**: 2026-05-09 | **Feature**: 003-habit-slice

## Prerequisites

- Docker Compose 已启动 PostgreSQL
- 002-timebox-slice 已合并到 main
- 依赖已安装 (`npm install`)

## Setup

```bash
# 切换到前端目录
cd frontend

# 生成并运行 migration
npm run db:generate
npm run db:migrate

# 启动开发服务器
npm run dev
```

## Phase 1: 习惯库基础

### 验证数据库变更

```bash
# 启动 Drizzle Studio 检查表结构
npm run db:studio
```

确认 habits 表新增字段：trackable, earliestTime, latestEndTime, minDuration
确认字段重命名：scheduledTime→defaultTime, duration→defaultDuration

### 运行测试

```bash
# 运行 habits domain 测试
npx vitest run src/domains/habits/

# 运行习惯 repository 测试
npx vitest run src/lib/db/repositories/habit.repository.ts
```

### UI 验证

1. 打开浏览器访问应用
2. 导航到习惯库视图
3. 创建一个可追踪习惯：标题"晨跑"，默认时间 07:00，时长 30min
4. 确认自动推断：earliestTime=06:30, latestEndTime=08:00, minDuration=15
5. 创建一个纯占时习惯：标题"午餐"，默认时间 12:00，时长 45min，trackable=false
6. 确认习惯卡片显示正确分类标记

## Phase 2: 模板系统

### 验证模板功能

1. 导航到模板管理视图
2. 创建"工作日"模板，applicableDays=[1,2,3,4,5]
3. 添加"晨跑"（覆盖时间 06:30）、"午餐"、"复盘"
4. 确认纵向时间轴正确显示
5. 点击"用模板安排今天"
6. 确认时间轴出现 draft 时间盒
7. 调整冲突后确认生效

### 运行测试

```bash
# 运行模板相关测试
npx vitest run src/lib/db/repositories/habit-template.repository.ts
npx vitest run src/nexus/core/rule-engine/rules/habit-conflict.ts
```

## Phase 3: AI 与 Streak

### 验证 AI 意图解析

在 AI 助手中输入：
- "每天早上7点运动30分钟" → 应生成 createHabit 意图
- "午餐12点，1小时" → trackable 应自动推断为 false
- "创建一个工作日模板" → 应生成 createTemplate 意图

### 验证 Streak

1. 对一个 trackable 习惯连续打卡 7 天
2. 确认 streak 计数正确
3. 确认第 7 天触发 HabitStreakMilestone 事件

## [005] Bug 修复：迁移日志修复

### 背景

手工创建的 0003 迁移未注册到 Drizzle 日志，导致数据库列名与代码不一致。

### 修复步骤

```bash
cd frontend

# 1. 更新 0002 快照（已完成）
# 2. 删除手工迁移（已完成）
rm src/lib/db/migrations/0003_latest_start_time.sql 2>/dev/null

# 3. 重新生成迁移
npx drizzle-kit generate

# 4. 应用迁移
npm run db:migrate
```

### 验证

```bash
# 1. 确认日志包含 0003 条目
cat src/lib/db/migrations/meta/_journal.json | grep "0003"

# 2. 运行测试
npx vitest run

# 3. 启动 dev server 并访问习惯库页面
npm run dev
# → 习惯库页面正常加载，无 "Failed query" 错误
# → latestStartTime 字段正确显示
```

## [006] 打卡指标自动计算

### 验证指标更新

1. 确保有一个 trackable=true 的活跃习惯
2. 通过时间盒打卡（completed）该习惯
3. 刷新习惯库页面，确认卡片中显示更新后的 streak、longestStreak、completionRate7d
4. 对 trackable=false 的习惯执行同样操作，确认指标不变（保持 0）

### 运行测试

```bash
# 运行 Domain 插件测试
npx vitest run src/domains/habits/

# 运行 Repository 测试
npx vitest run src/lib/db/repositories/habit.repository.ts
```

## [007] 习惯库列表优化

### 验证分组与筛选

1. 创建 3+ 个可追踪习惯和 2+ 个仅占时习惯（不同状态：draft/active/suspended）
2. 打开习惯库，确认列表按「可追踪」「仅占时」分组显示
3. 确认各组内按默认开始时间排序
4. 切换状态筛选为「草稿」，确认只显示草稿习惯
5. 同时选择「可追踪」+「活跃」，确认组合筛选结果正确

### 验证卡片信息

1. 确认卡片显示：标题、描述、状态标签、可追踪/仅占时标签、默认时间、时长、频率、连续天数、最长连续、7天完成数
2. 确认归档习惯卡片灰色、无操作按钮
3. 确认草稿/暂停习惯有「删除」按钮
4. 确认有引用数据的习惯删除时弹出提示

### 验证滚动

1. 创建 10+ 个习惯使列表超出屏幕
2. 确认列表区域出现滚动条

## [008] 卡片布局与交互优化

### 验证网格布局

1. 创建 5+ 个习惯
2. 确认卡片以网格形式排列，一行显示多个卡片（非独占一行）
3. 调整浏览器窗口宽度：宽屏每行 3-4 个卡片，窄屏 1-2 个
4. 确认卡片宽度固定（约 280-320px），不拉伸到整行

### 验证删除确认

1. 点击一个草稿习惯的「删除」按钮
2. 确认弹出确认对话框，显示「确定要删除该习惯吗？此操作不可撤销」
3. 点击「取消」→ 对话框关闭，习惯不被删除
4. 再次点击「删除」→ 点击「确认」→ 习惯被删除

### 验证激活按钮

1. 创建一个新习惯（默认为草稿状态）
2. 确认卡片上显示「激活」按钮（以及「编辑」和「删除」）
3. 点击「激活」按钮
4. 确认习惯状态变为活跃，按钮更新为「暂停」

## [009] 模板编辑与删除

### 验证模板编辑

1. 创建一个「工作日」模板，添加 2-3 个习惯
2. 点击模板卡片的「编辑」按钮
3. 修改模板名称为「工作日 v2」
4. 修改某个习惯的开始时间
5. 保存后确认模板名称和习惯时间已更新

### 验证模板删除

1. 点击模板卡片的「删除」按钮
2. 确认弹出确认对话框「确定要删除该模板吗？此操作不可撤销」
3. 点击「取消」→ 模板不被删除
4. 再次点击「删除」→ 点击「确认」→ 模板被删除，列表更新

### 验证新建模板自动填充

1. 确保习惯库中有 3+ 个活跃习惯（不同状态的习惯不参与）
2. 点击「新建模板」
3. 确认模板中自动填充了所有活跃习惯，按默认开始时间排序
4. 确认每个习惯的开始时间等于其默认开始时间
5. 移除一个习惯 → 确认该习惯从模板中移除，但习惯库中不受影响
6. 修改一个习惯的开始时间 → 确认仅模板中的时间被覆盖

### 验证空习惯场景

1. 暂停或归档所有习惯（确保无活跃习惯）
2. 新建模板 → 确认习惯列表为空
3. 手动添加一个习惯 → 确认添加成功

## [010] 时区错位 Bug 修复

### 验证时间盒生成正确

1. 创建一个"晨跑"习惯，defaultTime=07:30，defaultDuration=30
2. 创建一个模板，添加"晨跑"习惯
3. 点击"用模板安排今天"
4. 确认生成的时间盒开始时间为 **07:30**（而非 15:30）
5. 确认时间盒结束时间为 **08:00**

### 验证幂等性检查

1. 再次点击"用模板安排今天"
2. 确认系统提示当天已应用过模板（不重复生成时间盒）
