# Quickstart: 时间盒管理优化

**Feature**: 002-timebox-slice
**Date**: 2026-05-07（更新）

## Prerequisites

- Node.js 18+
- PostgreSQL running via Docker Compose
- `DATABASE_URL` set in `frontend/.env.local`
- 至少一个 LLM API Key（推荐 DashScope: `DASHSCOPE_API_KEY`）

## Setup

```bash
cd frontend

# 1. 安装依赖（含 shadcn/ui 初始化）
npm install

# 2. 启动 PostgreSQL
cd .. && docker-compose up -d && cd frontend

# 3. 生成并应用数据库迁移
npm run db:generate
npm run db:migrate

# 4. Seed MVP 用户
npx tsx scripts/seed-mvp-user.ts

# 5. 启动开发服务器
npm run dev
```

## 使用流程

1. 打开 `http://localhost:3000`
2. 看到两栏布局：左侧 AI 面板，右侧三栏时间盒视图（日视图默认）
3. 左侧输入"我今天10:00开始做市场调研报告，花费2小时"
4. 系统解析 → 创建时间盒 → 右侧日视图显示时间盒列表 + 时间轴 + 小日历

## 验证清单

1. **布局框架**: 顶部导航栏 + TilesBanner + 左侧 AI 面板(320px) + 右侧主内容区
2. **TilesBanner**: Dynamic Tile 显示在 MainContent 上方横幅区域
3. **日视图（默认）**: 三栏布局 — 左列时间盒列表 + 中间时间轴 + 右侧月历小日历
4. **DateNav**: 顶部日期导航，显示当前日期，前进/后退按钮切换日期
5. **模式切换**: 日/周/月三个切换按钮，默认"日"模式
6. **周视图**: 全宽周日历时间表格，时间盒显示在对应时段
7. **月视图**: 全宽月日历网格，时间盒以事件块显示
8. **翻页导航**: 日模式±1天，周模式±1周，月模式±1月
9. **MiniCalendar**: 点击日期跳转到该日的日视图
10. **设计令牌**: 暖色奶油背景(#faf9f5)、珊瑚色按钮(#cc785c)、衬线标题字体
11. **AI 模式**: 自然语言正确解析为 StructuredIntent
12. **Template 模式**: 表单提交能创建时间盒
13. **规则校验**: 重叠时间触发警告
14. **状态展示**: 时间盒卡片显示标题、时间范围、状态
15. **Action Surface**: Dynamic Tile 显示创建成功提示
16. **追踪日志**: 底部面板可展开查看调用链，默认隐藏
17. **追踪开关**: TopNav 设置中可开启/关闭追踪日志
18. **响应式**: 移动端三栏折叠为单栏，DateNav 隐藏"周"按钮

## 关键文件

| 文件 | 用途 |
|---|---|
| `app/page.tsx` | 首页（DateNav + DayView/WeekView/MonthView） |
| `app/layout.tsx` | Root layout（设计令牌） |
| `app/globals.css` | Tailwind + DESIGN.md 令牌 |
| `app/actions/intent.ts` | Server Actions（含日期范围查询） |
| `components/layout/*` | 布局框架组件 |
| `components/intent-input.tsx` | 自然语言输入 |
| `components/intent-form.tsx` | 表单模式 |
| `components/timebox/date-nav.tsx` | 日期导航栏 |
| `components/timebox/day-view.tsx` | 日视图三栏 |
| `components/timebox/week-view.tsx` | 周视图 |
| `components/timebox/month-view.tsx` | 月视图 |
| `components/timebox/mini-calendar.tsx` | 月历小日历 |
| `components/timebox/timebox-timeline.tsx` | 可视化时间轴 |
| `components/timebox-card.tsx` | 时间盒卡片 |
| `components/dynamic-tile.tsx` | 行动提示 |
| `nexus/core/*` | Nexus 核心组件 |
| `nexus/orchestrator/` | 编排器 |
| `domains/timebox/` | 时间盒 Domain |
