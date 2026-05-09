# Quickstart: 时间盒执行记录

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

# 1. 安装依赖
npm install

# 2. 启动 PostgreSQL
cd .. && docker-compose up -d && cd frontend

# 3. 生成并应用数据库迁移（含新增 overtime/cancelled 状态、execution_record 字段）
npm run db:generate
npm run db:migrate

# 4. Seed MVP 用户（如已有则跳过）
npx tsx scripts/seed-mvp-user.ts

# 5. 启动开发服务器
npm run dev
```

## 使用流程

### 基本流程：创建 → 执行 → 记录

1. 打开 `http://localhost:3000`
2. 点击左上角菜单按钮展开 AI 面板，输入"我今天10:00开始做市场调研报告，花费2小时"
3. 系统创建 planned 状态的时间盒，主内容区全宽显示日视图
4. **手动开始**: 点击时间盒卡片的"开始"按钮
5. 卡片显示实时计时器 + 进度条
6. **结束**: 点击"结束"按钮，时间盒进入 ended 状态
7. **记录**（可选）: 点击"记录"按钮，选择简单/详细模式填写执行记录

### 自动触发

- 到达 start_time 时，系统自动将 planned → running
- 到达 end_time 时，系统自动将 running → overtime（橙色警告）
- 客户端每 60 秒检查一次自动触发条件

### 自然语言执行

- "开始做市场调研" → 匹配并开始对应时间盒
- "结束了" / "完成了" → 结束当前 running 的时间盒
- "取消下午的会议" → 取消匹配的计划中时间盒
- "记录一下" → 打开最近 ended 时间盒的记录对话框

### 取消

- planned 状态的时间盒卡片上有"取消"按钮
- 点击后弹出确认对话框，确认后时间盒变为 cancelled 状态

## 验证清单

### 创建（已有，回归验证）
1. 自然语言创建时间盒 → planned 状态
2. 表单创建时间盒 → planned 状态
3. 时间重叠触发警告

### 执行（新增）
4. 卡片"开始"按钮 → planned → running，显示计时器
5. 自动开始 → start_time 到达后自动 running
6. 卡片"结束"按钮 → running → ended
7. 自动超时 → end_time 到达后 running → overtime，橙色显示
8. 超时确认结束 → overtime → ended
9. 并发执行多个时间盒 → 均可 running
10. 自然语言"开始做XX" → 匹配并开始
11. 自然语言"结束了" → 结束当前 running

### 取消（新增）
12. 卡片"取消"按钮 → planned → cancelled
13. cancelled 状态显示删除线
14. 自然语言"取消XX" → 匹配并取消

### 记录（新增）
15. 简单模式：选完成度 → 确认 → ended → logged
16. 详细模式：展开后填写评分/产出/原因 → 确认 → logged
17. 记录可选：ended 状态可作为终态
18. 已记录时间盒显示完成度标记

### 可收起侧边栏（修订）
19. 页面加载后 AI 面板默认展开在左侧（约 320px），主内容区占据剩余宽度
20. 点击左上角菜单按钮收起面板 → 面板滑出，主内容区平滑拉伸至全宽
21. 再次点击菜单按钮展开面板 → 面板滑入，主内容区自动收缩让位
22. 面板展开/收起时主内容区宽度平滑过渡（~300ms），无布局跳动
23. 刷新页面后面板状态保持（localStorage 持久化）
24. 收起面板后，日/周/月视图充分利用全宽显示更多内容

### 卡片信息增强（新增）
25. 卡片显示两行：第一行为完成图标+时间+标题+状态+按钮，第二行为 note 预览
26. 已完成/部分完成/未完成对应实心◉/半实心◐/空心○图标
27. note 为空时不显示第二行；note 有换行时截断显示，hover tooltip 展示完整内容（含换行）
28. 评分>3 的卡片左侧边框显暖色（coral），评分<3 显冷色（slate）
29. 能量>3 的卡片左侧边框显亮色（amber），能量<3 显暗色（gray）
30. 时间轴色块、周/月视图事件块使用相同颜色编码规则

### 多任务批量识别（新增）
31. 输入"上午10:30-11:30 开会；11:30-12:30 做周总结"→ 识别2个任务并分别创建
32. 输入"上午开会 下午做调研 晚上写周报"（无语义分隔符）→ 通过语义识别3个任务
33. 批量创建中某任务校验失败（时间重叠）→ 仅该任务警告，其他正常创建
34. 某任务信息不完整 → 提示"第N个任务'XXX'信息不完整，请单独补充"
35. 全部解析失败 → 整体失败提示，不创建任何时间盒

### 全宽修正（新增）
36. 面板展开时，日视图三栏均匀填满主内容区宽度，无两侧大片空白
37. 面板收起时，日视图三栏延伸至全屏宽度，卡片信息不截断
38. 周视图日历表格填满主内容区宽度，不限制在 960px 以内
39. 月视图日历网格填满主内容区宽度，日期格子均匀分配空间
40. 面板展开/收起时，所有视图内容宽度平滑过渡，无布局跳动

## 关键文件

| 文件 | 用途 | 变更类型 |
|---|---|---|
| `lib/db/schema.ts` | 数据库 schema | 修改：status 枚举、新增字段 |
| `usom/types/objects.ts` | USOM 类型定义 | 修改：新增 ExecutionRecord |
| `usom/types/summaries.ts` | USOM 摘要类型 | 修改：新增状态字段 |
| `lib/db/repositories/timebox.repository.ts` | 时间盒仓库 | 修改：新增查询方法 |
| `nexus/core/state-machine/index.ts` | 状态机 | 修改：动态 fromState |
| `nexus/core/state-machine/transitions.ts` | 转移表 | 修改：新增转移 |
| `nexus/core/intent-engine/ai-parser.ts` | AI 解析器 | 修改：执行意图 |
| `nexus/core/rule-engine/rules/timebox.ts` | 规则引擎 | 修改：新增规则 |
| `nexus/orchestrator/index.ts` | 编排器 | 修改：支持执行动作 |
| `domains/timebox/index.ts` | Domain 插件 | 修改：新增事件响应 |
| `app/actions/intent.ts` | Server Actions | 修改：新增 transitionTimebox |
| `components/timebox-card.tsx` | 时间盒卡片 | 修改：状态按钮、计时器 |
| `components/execution-log-dialog.tsx` | 执行记录对话框 | 新增 |
| `hooks/use-auto-trigger.ts` | 自动触发 Hook | 新增 |
| `hooks/use-panel-state.ts` | 面板状态 Hook | 修改：默认值改为展开 |
| `components/layout/app-shell.tsx` | 全局布局壳 | 修改：回滚为可收起侧边栏 |
| `components/layout/top-nav.tsx` | 顶部导航栏 | 修改：toggle 行为 |
| `components/timebox-card.tsx` | 时间盒卡片 | 修改：两行布局+颜色编码 |
| `components/timebox/timebox-timeline.tsx` | 时间轴 | 修改：色块颜色编码 |
| `components/timebox/day-view.tsx` | 日视图 | 修改：列宽自适应 |
| `components/timebox/week-view.tsx` | 周视图 | 修改：格子宽度自适应 |
| `components/timebox/month-view.tsx` | 月视图 | 修改：格子宽度自适应 |
| `lib/color-coding.ts` | 颜色编码工具 | 新增：共享颜色映射函数 |
| `app/page.tsx` | 首页 | 修改：集成批量结果 + 卡片两行布局 |
