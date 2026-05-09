# Research: 时间盒执行记录

**Feature**: 002-timebox-slice
**Date**: 2026-05-07（更新 2）

## R-001: 状态机动态 fromState 方案

**Decision**: 重构 State Machine executor 为动态状态查找。

**Current state**: `state-machine/index.ts` L46 硬编码 `fromState = null`，只支持 create。

**Implementation approach**:
- `execute()` 方法接收 `StateProposal`，其中包含 `objectId`（timebox ID）
- 通过 `timeboxRepo.findById(objectId)` 获取当前状态
- `findTransition(currentStatus, action)` 查表得到合法转移
- create 动作保持 `fromState = null` 的特殊处理

**Impact files**:
- `frontend/src/nexus/core/state-machine/index.ts` — 核心修改
- `frontend/src/nexus/core/state-machine/transitions.ts` — 新增转移定义
- `frontend/src/nexus/orchestrator/index.ts` — 支持 objectId 传递

---

## R-002: 自动触发方案（客户端轮询）

**Decision**: 客户端 Hook `useAutoTrigger`，60 秒轮询 + Server Action。

**Implementation approach**:
- 自定义 Hook `useAutoTrigger(timeboxes)` 接收当前时间盒列表
- `useEffect` + `setInterval(60000)` 检查条件
- 条件 1: `status === 'planned' && startTime <= now` → 调用 `transitionTimebox(id, 'start')`
- 条件 2: `status === 'running' && endTime <= now` → 调用 `transitionTimebox(id, 'overtime')`
- 页面首次加载时立即检查一次（`useEffect` 初始化）
- 清理：组件卸载时 `clearInterval`

**为什么不选其他方案**:
- 后端 cron/worker: MVP 无基础设施，Next.js Server Actions 无定时任务能力
- Service Worker: 增加复杂度，需要离线状态管理
- Web Workers: 过度工程，60 秒轮询在主线程完全可接受

---

## R-003: Schema 变更策略

**Decision**: 修改 pgEnum 并生成新 migration。

**Changes**:
1. 移除 `paused` 状态（无代码引用，直接移除）
2. 新增 `overtime` 状态
3. 新增 `cancelled` 状态
4. 新增 `execution_record` JSONB 字段（nullable）
5. 新增 `overtime_at` timestamptz 字段（nullable）

**Migration approach**:
- 修改 `frontend/src/lib/db/schema.ts` 中的 `timeboxStatusEnum`
- 运行 `npm run db:generate` 生成 migration SQL
- 运行 `npm run db:migrate` 应用

**Risk**: 移除 `paused` 可能影响已有数据。但 MVP 单用户且当前只有 planned 状态数据，风险极低。

---

## R-004: 执行记录数据模型

**Decision**: JSONB 字段 `execution_record`，两种模式（simple/detailed）。

**Why JSONB**:
- 1:1 关系，不需要独立表
- 简单/详细模式字段不同，JSONB 天然支持可选字段
- 不需要按执行记录字段做 WHERE 查询（MVP 阶段）
- 未来如需查询，PostgreSQL JSONB 支持 `->>` 和 GIN 索引

---

## R-005: 自然语言执行意图解析

**Decision**: 扩展 AI parser 的 system prompt，增加执行意图模板。

**Approach**:
- 在 `ai-parser.ts` 的 system prompt 中增加执行意图的动作映射
- 新增 `action` 类型: `start_timebox`, `end_timebox`, `cancel_timebox`, `log_timebox`
- 新增 `target` 字段: `{title: string}` 或 `{current: true}` 匹配目标时间盒
- 后处理逻辑：根据 target 匹配到具体 timeboxId

**Fallback**: 自然语言匹配失败时，提示用户使用卡片按钮操作。

---

## R-006: 规则引擎扩展

**Decision**: 新增两条规则。

1. **DelayedStartRule**: start 动作时，如果 start_time 已过超过 30 分钟，返回 warning "开始时间已过 {N} 分钟"
2. **RunningCountInfoRule**: start 动作时，报告当前 running 状态的时间盒数量（仅展示信息，不限制并发）

---

## R-007: AI 面板可收起模式（修订）

**Decision**: 从浮动覆盖模式改为可收起侧边栏模式。面板展开时主内容区自动收缩为其让位，收起时主内容区占满全宽。默认展开。

**Previous decision (overridden)**: 浮动覆盖（面板 absolute 定位覆盖在主内容区上方，主内容区始终全宽）。

**Why change**:
- 用户反馈：浮动覆盖不够直观，收起后入口不明显
- 可收起侧边栏是更常见的 UI 模式（VS Code、Notion 均采用）
- 默认展开确保新用户不会迷失 AI 入口

**Implementation approach**:
- 桌面端：Flexbox 布局，AI 面板使用 `w-[320px]` + `transition-all duration-300`
- 收起时面板 `w-0 overflow-hidden border-r-0`，主内容区 `flex-1` 自动填充
- 使用 Tailwind `transition-all` 实现面板宽度和主内容区同步过渡动画
- `usePanelState` Hook 默认值从 `false`（收起）改为 `true`（展开）
- 移动端保持 Sheet 抽屉不变
- TopNav 菜单按钮改为 toggle 行为（展开/收起）

**Why not other approaches**:
- CSS Grid `grid-template-columns` 动画：`1fr` 和 `0px 1fr` 之间的过渡不稳定
- 保持浮动覆盖 + 添加常驻展开按钮：两套 UI 模式增加维护成本
- 使用 Resizable Panel：过度工程，MVP 不需要用户拖拽调整面板宽度

**Impact files**:
- `frontend/src/components/layout/app-shell.tsx` — 回滚浮动覆盖，改为 flex 侧边栏
- `frontend/src/hooks/use-panel-state.ts` — 默认值 true
- `frontend/src/components/layout/top-nav.tsx` — toggle 行为

---

## R-008: 卡片两行布局 + 颜色编码方案

**Decision**: 卡片重构为两行 flex 布局 + 基于 rating/energyLevel 的左侧边框颜色编码。

**Layout design**:
```
┌──────────────────────────────────────────────┐
│ ● 10:00-12:00  市场调研报告  [进行中] [结束] │  ← 第一行
│ 📝 已完成市场分析部分，还需...                │  ← 第二行 (note 截断)
└──────────────────────────────────────────────┘
```

**First row** (`flex items-center gap-2`):
- 完成状态图标 (CompletionIcon): `completed` → ✓实心, `partial` → ◐半实心, `missed` → ○空心, 无记录 → 不显示
- 时间范围: `HH:mm - HH:mm` 格式
- 标题: `truncate` 截断
- 状态徽章: 复用现有 StatusBadge
- 操作按钮: 复用现有按钮组

**Second row** (条件渲染, `flex items-center gap-1`):
- Note 图标 (小)
- Note 内容: `truncate` 单行截断, 换行→空格
- Radix Tooltip 包裹, hover 显示 `whitespace-pre-wrap` 完整内容
- note 为空时不渲染第二行

**Color coding** (左侧 `border-l-2` 或 `border-l-4`):

| 条件 | 颜色 | 含义 |
|------|------|------|
| rating > 3 | warm (coral-400) | 超出预期 |
| rating < 3 | cool (slate-400) | 未达预期 |
| energyLevel > 3 | bright (amber-400) | 高能量 |
| energyLevel < 3 | dim (gray-400) | 低能量 |
| rating=3 且 energy=3 | transparent | 默认中性 |
| 无 executionRecord | transparent | 未记录 |

**颜色编码一致性** (FR-029):
- `getCardColor()` 抽取为共享工具函数（`lib/color-coding.ts`）
- TimeboxCard、TimeboxTimeline、WeekView、MonthView 统一调用
- 执行记录对话框同步展示相同颜色指示

**Why not other approaches**:
- 背景色而非边框：背景色容易与状态色（running 绿色）冲突，边框更克制
- 图标颜色编码：图标面积小，辨识度不如边框
- 独立颜色映射表（而非函数）：函数方案更灵活，支持未来扩展

---

## R-009: 多任务批量识别方案

**Decision**: 扩展 AI parser system prompt，单次调用识别多个任务并返回数组，逐个独立通过 Nexus 管道。

**Prompt extension**:
```
如果用户输入包含多个时间盒任务（通过分号、逗号、句号、换行或语义上属于不同时间段），
请将其拆分为独立的任务列表。识别要点：
- 时间关键词（上午/下午/晚上/明天）通常标志新任务的开始
- 每个任务独立提取标题、开始时间、持续时长
- 无法提取完整信息的任务标记为 incomplete
输出格式:
{
  "tasks": [
    { "title": "...", "startTime": "...", "duration": ..., "confidence": 0.9 },
    { "title": "...", "startTime": null, "duration": null, "confidence": 0.3, "incomplete": true }
  ]
}
```

**Processing pipeline**:
1. AI 解析 → `StructuredIntent[]`
2. 对每个 intent 独立调用 `orchestrator.execute(intent)`
3. 收集结果：成功 → 返回 timeboxId，失败 → 返回 error + index
4. 某个子任务失败不阻断其他子任务（FR-032）

**Server Action** (`submitBatchIntent`):
```typescript
async function submitBatchIntent(rawInput: string): Promise<BatchIntentResult> {
  const intents = await parseMultiTask(rawInput);
  const results: BatchItemResult[] = [];
  for (const [i, intent] of intents.entries()) {
    try {
      const result = await orchestrator.execute(intent);
      results.push({ index: i, title: intent.fields.title, timeboxId: result.timeboxId, success: true });
    } catch (e) {
      results.push({ index: i, title: intent.fields.title || `任务${i+1}`, error: e.message, success: false });
    }
  }
  return { results };
}
```

**Fallback**: 全部解析失败（0 个有效 intent）→ 返回整体失败提示，不创建任何时间盒。

**Why not other approaches**:
- 多次 LLM 调用（先分段再逐个解析）：增加延迟和成本，单次调用可批量处理
- 前端分段（正则拆分）：正则无法处理语义分段（"上午开会下午调研"），违背 AI/Rule 边界
- 并行处理所有子任务：Nexus 管道内部可能共享状态，串行处理更安全

---

## R-010: MainContent 全宽修正

**Decision**: 移除 `MainContent` 中 `max-w-[960px] mx-auto` 的宽度约束，改为 `w-full`，让内容撑满 flex 容器。

**Current issue**: `frontend/src/components/layout/main-content.tsx` L19 使用 `mx-auto max-w-[960px]` 把内容限制为 960px 居中。AppShell 的 Flexbox `flex-1` 布局本身正确，但 MainContent 内部硬限制覆盖了全宽效果。

**Root cause chain**:
```
AppShell → flex-1 (正确分配可用宽度)
  └─ MainContent → max-w-[960px] mx-auto (硬限制 960px)
      └─ DayView 三栏 → 30%/40%/30% × 960px = 288/384/288px (拥挤)
```

**Fix**:
1. `MainContent`: `mx-auto max-w-[960px]` → `w-full`
2. `DayView`: 添加 `w-full` 确保 grid 容器填满
3. `WeekView`/`MonthView`: 添加 `w-full` 确保日历填满
4. `page.tsx` 主内容包装器: 添加 `w-full`

**Why not other approaches**:
- 改为 `max-w-[1440px]`：仍有限制，不符合 FR-020 "主内容区自动填充剩余宽度"
- 改为 `max-w-[1800px]`：在 2K/4K 屏上仍有浪费，FR-024 要求"充分利用可用空间"
- 保持 960px + 调整三栏比例：治标不治本，宽度浪费仍存在

**Impact files**:
- `frontend/src/components/layout/main-content.tsx` — 核心修改
- `frontend/src/components/timebox/day-view.tsx` — 添加 w-full
- `frontend/src/components/timebox/week-view.tsx` — 添加 w-full
- `frontend/src/components/timebox/month-view.tsx` — 添加 w-full
- `frontend/src/app/page.tsx` — 添加 w-full
