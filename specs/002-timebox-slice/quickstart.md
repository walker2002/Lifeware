# Quickstart: 时间盒管理优化

**Feature**: 002-timebox-slice
**Date**: 2026-05-06（更新）

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
2. 看到两栏布局：左侧 AI 面板，右侧时间盒列表
3. 左侧输入"我今天10:00开始做市场调研报告，花费2小时"
4. 系统解析 → 创建时间盒 → 右侧出现时间盒卡片，左侧出现 Dynamic Tile

## 验证清单

1. **布局框架**: 顶部导航栏 + TilesBanner + 左侧 AI 面板(320px) + 右侧主内容区
2. **TilesBanner**: Dynamic Tile 显示在 MainContent 上方横幅区域
3. **今日模式**: 左列时间盒列表（含开始时间、时长、状态、标题）+ 右列可视化时间轴
4. **日历模式**: 完整日历组件，支持月/周/日视图切换
5. **模式切换**: MainContent 顶部 ViewModeToggle 在两种模式间切换
6. **设计令牌**: 暖色奶油背景(#faf9f5)、珊瑚色按钮(#cc785c)、衬线标题字体
7. **AI 模式**: 自然语言正确解析为 StructuredIntent
8. **Template 模式**: 表单提交能创建时间盒
9. **规则校验**: 重叠时间触发警告
10. **状态展示**: 时间盒卡片显示标题、时间范围、状态
11. **Action Surface**: Dynamic Tile 显示创建成功提示
12. **追踪日志**: 底部面板可展开查看调用链，默认隐藏
13. **追踪开关**: TopNav 设置中可开启/关闭追踪日志
14. **响应式**: 移动端两栏折叠为单栏

## 关键文件

| 文件 | 用途 |
|---|---|
| `app/page.tsx` | 首页 |
| `app/layout.tsx` | Root layout（设计令牌） |
| `app/globals.css` | Tailwind + DESIGN.md 令牌 |
| `components/layout/*` | 布局框架组件 |
| `components/intent-input.tsx` | 自然语言输入 |
| `components/intent-form.tsx` | 表单模式 |
| `components/timebox-card.tsx` | 时间盒卡片 |
| `components/dynamic-tile.tsx` | 行动提示 |
| `nexus/core/*` | Nexus 核心组件 |
| `nexus/orchestrator/` | 编排器 |
| `domains/timebox/` | 时间盒 Domain |
