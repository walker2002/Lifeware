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
