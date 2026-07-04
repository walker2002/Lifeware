# [023.05-1] Timebox 域 schedule 清理（PR1 阶段 1）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 timebox 域里所有误用为 `schedule` 的标识符彻底清理为 `timebox`/`orchestration`，释放 `schedule` 命名空间给阶段 2（itinerary→schedule）。

**Architecture:** 纯重命名重构，零行为变更。范围 = manifest.yaml 6 块 + 2 个文件 git mv（AdjustSchedule→AdjustTimeboxes / scheduling-handler→orchestration-handler）+ viewSchedule 引用替换 + 5 处注释引用 + 中文「日程」→「时间盒」UI 双向清理 + ~15 测试文件同步。**不碰 itinerary 对象**（阶段 2 PR2）。**不碰 DB**（无迁移）。

**Tech Stack:** Next.js 16 + TypeScript 5 + YAML manifest + vitest + ESLint + validate-manifest pre-push hook

## Global Constraints

- **P1 命名空间释放**：阶段 1 必须彻底清空 timebox 域**所有**活 schedule 标识符（action/shortcut/surface/文件/class），阶段 2 才能干净接管 schedule。任何含 `Schedule` 子串的 timebox action 残留 → 阶段 2 后 `resolveObjectType` 错误路由到 schedule lifecycle → 运行时崩。
- **F1 resolveObjectType 验收**：阶段 1 验收必含 `grep -E "action:.*Schedule" src/domains/timebox/manifest.yaml` 返回 0 活 timebox-action 含 `Schedule` 子串（设计 doc 评审补充段 F1，lifecycle-configs.ts:120-145 PascalCase 分派）。
- **CNUI surface 双注册**（[project-cnui-surface-dual-registration]）：改名同步 server `surfaceHandlers`/manifest K-block + client `cnuiRegistry.register` + manifest `intent_triggers` cnui_surface key。
- **CNUI surface 文件 PascalCase**（[cnui-surface-file-pascalcase]）：`AdjustSchedule.tsx`→`AdjustTimeboxes.tsx` 必须 git mv（保留 git 历史），pre-push hook K-component 规则强制。
- **vitest 两个陷阱**（[feedback_vitest-pitfalls]）：必须 frontend cwd 跑（`@/` 映射）；vitest 不做 TS 类型检查，须 `tsc --noEmit` 双验证。
- **Change Gate 基线**（[feedback_change-gate-baseline]）：vitest/tsc 用 base=head 失败集合对比，聚焦被改文件，不硬编码预存失败数。
- **注释规范**：每个 TS/JS 文件保留 `/** @file ... @brief ... */` 中文头，改名同步更新。
- **commit convention**：`refactor(023.05):` 前缀；每 task 独立 commit；`git mv` 保留历史。
- **Tier 2 docs**：阶段 1 不改 USOM/DB，无需 docs 先行（阶段 2 才需）。
- **mainViewState.type='schedule' 保留**（OQ-1）：内部 view state 字面量，贯穿 app-shell/bottom-nav/use-intent-handler 4 文件，design doc 未要求改。阶段 1 不动（加注释说明它是 view state type 非 schedule 对象），阶段 2 后可考虑改 'timeboxes'。

## File Structure

**改名（git mv）：**
- `src/domains/timebox/cnui/surfaces/AdjustSchedule.tsx` → `AdjustTimeboxes.tsx`（surface 组件 + export + Props interface）
- `src/domains/timebox/handlers/scheduling-handler.ts` → `orchestration-handler.ts`（Handler class + @file）
- `src/domains/timebox/__tests__/scheduling-handler.test.ts` → `orchestration-handler.test.ts`

**修改（manifest）：**
- `src/domains/timebox/manifest.yaml` — 6 块改名（intent_triggers viewSchedule/createSmartSchedule/adjustRemainingSchedule + view_routes + generation_actions + cnui_surfaces adjust-schedule）+ 中文「日程」→「时间盒」

**修改（注册/import）：**
- `src/domains/timebox/handlers/index.ts` — import + handler map
- `src/domains/timebox/index.ts` — import AdjustTimeboxes + cnuiRegistry.register('timebox','adjust-timeboxes',...)
- `src/hooks/use-intent-handler.ts` — viewSchedule→viewTimeboxes action 名（保留 mainViewState.type='schedule'）

**修改（注释 only）：**
- `src/components/views/action-view.tsx` — viewSchedule 注释
- `src/components/layout/main-view-state.ts` — 注释（type='schedule' 保留）
- `src/app/page.tsx` — 注释
- `src/nexus/context-engine/energy-state-manager.ts:28` — scheduling-handler 注释
- `src/domains/timebox/providers/energy-curve-provider.ts:7` — scheduling-handler 注释
- `src/domains/timebox/rules-registry.ts:17` — scheduling-handler 注释
- `src/domains/timebox/cnui/handlers.ts:374,114,175` — scheduling-handler 注释 + 「日程」UI 文案
- `src/usom/types/primitives.ts:114` — scheduling-handler 注释

**修改（测试同步，~15 文件）：**
- `src/domains/timebox/__tests__/scheduling-handler.test.ts`（git mv）+ `cnui-handlers.test.ts` + `cnui/__tests__/handlers.test.ts`
- `src/components/views/__tests__/action-view.test.tsx` + `src/usom/__tests__/manifest-utils.test.ts` + `src/app/actions/__tests__/intent.test.ts`
- `src/nexus/orchestrator/__tests__/orchestrator-query.test.ts` + `orchestrator-generative.test.ts`
- `src/nexus/ai-runtime/__tests__/phase5-integration.test.ts` + `phase5-types.test.ts` + `phase7-memory.test.ts` + `types.test.ts`
- `src/nexus/context-engine/__tests__/assembler.test.ts`
- `src/usom/types/__tests__/energy-curve.test.ts` + `domain-types.test.ts`

**不改（明确排除）：**
- `src/domains/timebox/components/week-view.tsx:93` / `month-view.tsx:194` / `src/domains/habits/components/statistics/HabitStatsMonthView.tsx:157` — `agenda: "日程"` 是 react-big-calendar 视图标签（日历术语，非 lifeware schedule 对象），不改。
- `src/usom/types/objects.ts:629` — itinerary 对象注释，阶段 2 范围。
- 所有 itinerary 文件 — 阶段 2 范围。

---

### Task 1: manifest.yaml 阶段 1 改名 + 中文「日程」清理

**Files:**
- Modify: `src/domains/timebox/manifest.yaml`

**Interfaces:**
- Produces: `viewTimeboxes` / `createSmartTimeboxes` / `adjustRemainingTimeboxes` action 名 + `adjust-timeboxes` cnui_surface key（供下游 task 2-5 引用）

- [ ] **Step 1: 改 intent_triggers viewSchedule 块（L64-72）**

`src/domains/timebox/manifest.yaml:64-72` 当前：
```yaml
  - action: viewSchedule
    shortcut: /schedule
    description: 时间盒管理
    response_type: page
    examples:
      - 查看今天的日程
      - 今天有什么安排
    keywords: [日程, schedule, 安排, 今天]
    view_route: /timeboxes
```
改为：
```yaml
  - action: viewTimeboxes
    shortcut: /timeboxes
    description: 时间盒管理
    response_type: page
    examples:
      - 查看今天的时间盒
      - 今天有什么安排
    keywords: [时间盒, timebox, 安排, 今天]
    view_route: /timeboxes
```

- [ ] **Step 2: 改 intent_triggers createSmartSchedule 块（L82-91）**

L82-91 当前：
```yaml
  - action: createSmartSchedule
    shortcut: /smartSchedule
    description: AI 智能编排日程
    response_type: cnui
    cnui_surface: timebox-list
    examples:
      - 帮我智能安排今天的日程
      - 智能编排
      - 自动安排今天
    keywords: [智能编排, smart, 自动安排, 智能日程]
```
改为：
```yaml
  - action: createSmartTimeboxes
    shortcut: /smartTimeboxes
    description: AI 智能编排时间盒
    response_type: cnui
    cnui_surface: timebox-list
    examples:
      - 帮我智能安排今天的时间盒
      - 智能编排
      - 自动安排今天
    keywords: [智能编排, smart, 自动安排, 智能时间盒]
```

- [ ] **Step 3: 改 intent_triggers adjustRemainingSchedule 块（L92-100）**

L92-100 当前：
```yaml
  - action: adjustRemainingSchedule
    shortcut: /adjustSchedule
    description: 根据剩余任务重新编排日程
    response_type: cnui
    cnui_surface: adjust-schedule
    examples:
      - 重新安排剩余时间
      - 调整今天下午的安排
    keywords: [调整, 重排, adjust]
```
改为：
```yaml
  - action: adjustRemainingTimeboxes
    shortcut: /adjustTimeboxes
    description: 根据剩余任务重新编排时间盒
    response_type: cnui
    cnui_surface: adjust-timeboxes
    examples:
      - 重新安排剩余时间
      - 调整今天下午的安排
    keywords: [调整, 重排, adjust]
```

- [ ] **Step 4: 改 view_routes viewSchedule key（L362-364）**

L362-364 当前：
```yaml
view_routes:
  viewSchedule:
    component: app/timeboxes/page
    url: /timeboxes
```
改为：
```yaml
view_routes:
  viewTimeboxes:
    component: app/timeboxes/page
    url: /timeboxes
```

- [ ] **Step 5: 改 generation_actions 两个 key（L387, L405）**

L387 `  createSmartSchedule:` → `  createSmartTimeboxes:`；L388 `    description: 智能编排日程，根据任务/习惯/能量曲线自动生成时间盒方案` → `    description: 智能编排时间盒，根据任务/习惯/能量曲线自动生成时间盒方案`

L405 `  adjustRemainingSchedule:` → `  adjustRemainingTimeboxes:`；L406 `    description: 根据已完成项目调整剩余日程` → `    description: 根据已完成项目调整剩余时间盒`

- [ ] **Step 6: 改 cnui_surfaces adjust-schedule key（L436-438）**

L436-438 当前：
```yaml
  adjust-schedule:
    description: 调整日程（按时间序列左右翻页，diff 提交，running/ended 禁取消）
    handler: ./cnui/handlers
```
改为：
```yaml
  adjust-timeboxes:
    description: 调整时间盒（按时间序列左右翻页，diff 提交，running/ended 禁取消）
    handler: ./cnui/handlers
```

- [ ] **Step 7: 跑 validate:manifest 验证**

Run: `cd /home/walker/lifeware/frontend && npm run validate:manifest`
Expected: `0 errors`（manifest action/surface key 改名后 K-component 仍匹配——AdjustSchedule.tsx 还没改名，K-component 会报 adjust-timeboxes 找不到 AdjustTimeboxes.tsx，这是预期的——Task 2 git mv 后消除。**此时 validate:manifest 可能报 1 个 K-component ERROR**，记下来，Task 2 完成后重跑验证。）

- [ ] **Step 8: Commit**

```bash
cd /home/walker/lifeware/frontend
git add src/domains/timebox/manifest.yaml
git commit -m "refactor(023.05): manifest schedule→timebox/orchestration + 日程→时间盒

[023.05] PR1 阶段 1 Task 1：manifest.yaml 6 块改名
- viewSchedule→viewTimeboxes (/schedule→/timeboxes)
- createSmartSchedule→createSmartTimeboxes (/smartSchedule→/smartTimeboxes)
- adjustRemainingSchedule→adjustRemainingTimeboxes (/adjustSchedule→/adjustTimeboxes)
- view_routes/generation_actions/cnui_surfaces key 同步
- D1 双向清理：中文「日程」→「时间盒」(keywords/examples/description)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: AdjustSchedule.tsx → AdjustTimeboxes.tsx + 双注册

**Files:**
- Rename: `src/domains/timebox/cnui/surfaces/AdjustSchedule.tsx` → `AdjustTimeboxes.tsx`
- Modify: `src/domains/timebox/index.ts:18,41-44`

**Interfaces:**
- Consumes: Task 1 的 `adjust-timeboxes` cnui_surface key
- Produces: `AdjustTimeboxes` export（供 index.ts import）

- [ ] **Step 1: git mv 文件**

```bash
cd /home/walker/lifeware/frontend
git mv src/domains/timebox/cnui/surfaces/AdjustSchedule.tsx src/domains/timebox/cnui/surfaces/AdjustTimeboxes.tsx
```

- [ ] **Step 2: 改 @file 头（L1-3）**

`AdjustTimeboxes.tsx:1-3` 当前：
```typescript
/**
 * @file adjust-schedule
 * @brief 调整日程 CNUI surface（[023] A2，[019.1] 手写范式）
```
改为：
```typescript
/**
 * @file adjust-timeboxes
 * @brief 调整时间盒 CNUI surface（[023] A2，[019.1] 手写范式）
```

L5-7 注释里的「时间盒」已存在（"AI 助手解析多条 timebox 草稿"），无需改。L11「取消此时间盒」已对。L58「调整日程 ({page+1}/{items.length})」→「调整时间盒 ({page+1}/{items.length})」。

- [ ] **Step 3: 改 Props interface 名（L29）**

L29 当前：`interface AdjustScheduleProps {` → `interface AdjustTimeboxesProps {`

- [ ] **Step 4: 改 export function 名（L39）**

L39 当前：`export function AdjustSchedule({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: AdjustScheduleProps) {` → `export function AdjustTimeboxes({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: AdjustTimeboxesProps) {`

- [ ] **Step 5: 改 L58 UI 文案**

L58 当前：`<span className="text-sm font-medium text-ink">调整日程 ({page + 1}/{items.length})</span>` → `<span className="text-sm font-medium text-ink">调整时间盒 ({page + 1}/{items.length})</span>`

- [ ] **Step 6: 改 domain index.ts import + register（双注册）**

`src/domains/timebox/index.ts:18` 当前：`import { AdjustSchedule } from './cnui/surfaces/AdjustSchedule'` → `import { AdjustTimeboxes } from './cnui/surfaces/AdjustTimeboxes'`

L41-44 当前：
```typescript
cnuiRegistry.register('timebox', 'adjust-schedule', {
  component: AdjustSchedule,
  handlerModulePath,
})
```
改为：
```typescript
cnuiRegistry.register('timebox', 'adjust-timeboxes', {
  component: AdjustTimeboxes,
  handlerModulePath,
})
```

- [ ] **Step 7: tsc + validate:manifest 验证**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | tail -5`
Expected: 无 AdjustSchedule 相关 error。

Run: `npm run validate:manifest`
Expected: `0 errors`（Task 1 遗留的 K-component ERROR 已消除——adjust-timeboxes 匹配 AdjustTimeboxes.tsx）。

- [ ] **Step 8: vitest 跑 timebox 域测试（base=head）**

Run: `cd /home/walker/lifeware/frontend && npx vitest run src/domains/timebox/cnui/__tests__/handlers.test.ts 2>&1 | tail -15`
Expected: handlers.test.ts 含 `open('adjustRemainingSchedule')` 等旧 action 名引用，**会失败**（manifest 已改 adjustRemainingTimeboxes）。这些测试在 Task 5 同步。**Task 2 暂记失败，Task 5 修复后回归。**

- [ ] **Step 9: Commit**

```bash
git add src/domains/timebox/cnui/surfaces/AdjustTimeboxes.tsx src/domains/timebox/index.ts
git commit -m "refactor(023.05): AdjustSchedule→AdjustTimeboxes + 双注册

[023.05] PR1 阶段 1 Task 2：CNUI surface 改名
- git mv AdjustSchedule.tsx→AdjustTimeboxes.tsx
- export/interface/@file/UI 文案 同步
- index.ts import + cnuiRegistry.register('timebox','adjust-timeboxes') 双注册

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: scheduling-handler.ts → orchestration-handler.ts + class + handlers/index + 5 注释 + UI 文案

**Files:**
- Rename: `src/domains/timebox/handlers/scheduling-handler.ts` → `orchestration-handler.ts`
- Modify: `src/domains/timebox/handlers/index.ts:1,5-6`
- Modify: 5 处注释引用 + `cnui/handlers.ts` UI 文案

**Interfaces:**
- Produces: `TimeboxOrchestrationHandler` class（供 handlers/index.ts + 测试 import）

- [ ] **Step 1: git mv 文件**

```bash
cd /home/walker/lifeware/frontend
git mv src/domains/timebox/handlers/scheduling-handler.ts src/domains/timebox/handlers/orchestration-handler.ts
```

- [ ] **Step 2: 改 @file 头（L1-3）**

`orchestration-handler.ts:1-3` 当前：
```typescript
/**
 * @file scheduling-handler
 * @brief 智能日程编排 Handler
```
改为：
```typescript
/**
 * @file orchestration-handler
 * @brief 智能时间盒编排 Handler
```

L31 注释「日程项」→「时间盒项」（grep 确认 L31 上下文是 handler 内部注释）。

- [ ] **Step 3: 改 class 名（L88）**

L88 当前：`export class SchedulingHandler implements DomainHandler {` → `export class TimeboxOrchestrationHandler implements DomainHandler {`

- [ ] **Step 4: 改 handlers/index.ts（L1, L5-6）**

`src/domains/timebox/handlers/index.ts:1` 当前：`import { SchedulingHandler } from './scheduling-handler'` → `import { TimeboxOrchestrationHandler } from './orchestration-handler'`

L5-6 当前：
```typescript
  createSmartSchedule: new SchedulingHandler(),
  adjustRemainingSchedule: new SchedulingHandler(),
```
改为：
```typescript
  createSmartTimeboxes: new TimeboxOrchestrationHandler(),
  adjustRemainingTimeboxes: new TimeboxOrchestrationHandler(),
```

- [ ] **Step 5: 改 5 处 scheduling-handler 注释引用**

`src/nexus/context-engine/energy-state-manager.ts:28` 当前：` * scheduling-handler fallback 用 [9,10,11]/[13,14]。统一为本常量。` → ` * orchestration-handler fallback 用 [9,10,11]/[13,14]。统一为本常量。`

`src/domains/timebox/providers/energy-curve-provider.ts:7` 当前：` * 消除与 scheduling-handler 的默认值不一致。` → ` * 消除与 orchestration-handler 的默认值不一致。`

`src/domains/timebox/rules-registry.ts:17` 当前：` * - \`frontend/src/nexus/core/rule-engine/\` — **提案评估层**（scheduling-handler 生成的` → ` * - \`frontend/src/nexus/core/rule-engine/\` — **提案评估层**（orchestration-handler 生成的`

`src/domains/timebox/cnui/handlers.ts:374` 当前：`      // 暂时返回成功，实际实现需要调用 scheduling-handler` → `      // 暂时返回成功，实际实现需要调用 orchestration-handler`

`src/usom/types/primitives.ts:114` 当前：` * （energy-profile-provider / register-providers / scheduling-handler /` → ` * （energy-profile-provider / register-providers / orchestration-handler /`

- [ ] **Step 6: 改 cnui/handlers.ts UI 文案「日程」→「时间盒」（L114, L175）**

`src/domains/timebox/cnui/handlers.ts:114` 当前：`        content: '智能编排日程 — 根据您的任务、习惯和能量曲线，AI 将自动生成今日时间盒方案',` → `        content: '智能编排时间盒 — 根据您的任务、习惯和能量曲线，AI 将自动生成今日时间盒方案',`

L175 当前：`        content: '调整剩余日程 — 根据已完成项目重新安排今日剩余时间',` → `        content: '调整剩余时间盒 — 根据已完成项目重新安排今日剩余时间',`

- [ ] **Step 7: tsc 验证**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | grep -iE "scheduling|SchedulingHandler|orchestration" | head -10`
Expected: 无 SchedulingHandler 相关 error（class 已改名 + import 已改）。若 orchestration-handler.ts 内有其他内部引用 SchedulingHandler 需一并改（grep `SchedulingHandler` in orchestration-handler.ts）。

- [ ] **Step 8: Commit**

```bash
git add src/domains/timebox/handlers/orchestration-handler.ts src/domains/timebox/handlers/index.ts src/nexus/context-engine/energy-state-manager.ts src/domains/timebox/providers/energy-curve-provider.ts src/domains/timebox/rules-registry.ts src/domains/timebox/cnui/handlers.ts src/usom/types/primitives.ts
git commit -m "refactor(023.05): scheduling-handler→orchestration-handler

[023.05] PR1 阶段 1 Task 3：Handler 改名（D2 决策）
- git mv scheduling-handler.ts→orchestration-handler.ts
- class SchedulingHandler→TimeboxOrchestrationHandler
- handlers/index.ts import + map (createSmartTimeboxes/adjustRemainingTimeboxes)
- 5 处注释引用同步 (energy-state-manager/energy-curve-provider/rules-registry/cnui-handlers/primitives)
- cnui/handlers.ts UI 文案 日程→时间盒

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: viewSchedule 引用替换 + 注释更新（保留 mainViewState.type='schedule'）

**Files:**
- Modify: `src/hooks/use-intent-handler.ts:283-291`
- Modify (注释): `src/components/views/action-view.tsx:16-23,68-69`
- Modify (注释): `src/components/layout/main-view-state.ts:3-11`
- Modify (注释): `src/app/page.tsx:9-12`

**Interfaces:**
- Consumes: Task 1 的 `viewTimeboxes` action 名

**OQ-1（显式标注）**：`mainViewState.type='schedule'` 字面量贯穿 `app-shell.tsx:64,137-138` + `bottom-nav.tsx:24,43` + `use-intent-handler.ts:289`，是 view state type 非 schedule 对象，**阶段 1 保留**（design doc 未要求改，改它需协调 4 文件）。阶段 2 后可考虑改 'timeboxes'。

- [ ] **Step 1: 改 use-intent-handler.ts action 名（L288）**

`src/hooks/use-intent-handler.ts:283-291` 当前（关键行）：
```typescript
      // [fix] viewSchedule 特殊入口：切到主显示区的 schedule 视图（TimeboxesWorkspace）
      ...
      if (domainId === 'timebox' && action === 'viewSchedule') {
```
L283 注释 `viewSchedule` → `viewTimeboxes`：`      // [fix] viewTimeboxes 特殊入口：切到主显示区的 schedule 视图（TimeboxesWorkspace）`

L288 当前：`      if (domainId === 'timebox' && action === 'viewSchedule') {` → `      if (domainId === 'timebox' && action === 'viewTimeboxes') {`

**L289 保留** `setMainViewState({ type: 'schedule', date: new Date(), viewMode: 'day' })`（OQ-1，type='schedule' 是 view state 字面量非 action 名）。

- [ ] **Step 2: 改 action-view.tsx 注释（L16-23, L68-69）**

L16-23 注释里 `timebox.viewSchedule` → `timebox.viewTimeboxes`（3 处：L16 "例外：timebox.viewTimeboxes 不走本表" / L21 "[023.03] T4：删 ScheduleView 导入 + viewSchedule/view_schedule 特殊分支" 保留历史 / L22 "scheduleProps 字段" 保留历史）。

只改 L16 的 `viewSchedule` → `viewTimeboxes`（活引用说明）。L21-22 是 [023.03] T4 历史注释，保留。

L68-69 当前：`  // [023.03] T4：删 viewSchedule/view_schedule 特殊分支` → 保留历史（[023.03] T4 注释，OQ-4 倾向保留历史注释）。

- [ ] **Step 3: 改 main-view-state.ts 注释（保留 type='schedule'）**

`src/components/layout/main-view-state.ts:3-11` 注释已说明 type 'schedule' 内部语义（[023.03] T4 注释遗留）。**阶段 1 不改 type 字面量**（OQ-1）。若注释里需补一句阶段 1 说明，加：
```typescript
 * - [023.05] 阶段 1：type 'schedule' 保留（view state 字面量，非 schedule 对象；schedule 对象阶段 2 引入）。
```
（可选，L8 后追加）

- [ ] **Step 4: 改 app/page.tsx 注释（L9-12）**

L9-12 注释里 `主显示区在 'schedule' 视图下` 保留（type='schedule' OQ-1）。无需改。

- [ ] **Step 5: tsc 验证**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | tail -5`
Expected: 无 viewSchedule 相关 error。

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-intent-handler.ts src/components/views/action-view.tsx src/components/layout/main-view-state.ts src/app/page.tsx
git commit -m "refactor(023.05): viewSchedule→viewTimeboxes 引用替换

[023.05] PR1 阶段 1 Task 4：action 名引用替换
- use-intent-handler.ts:288 action==='viewTimeboxes'（保留 mainViewState.type='schedule' OQ-1）
- action-view.tsx 注释 viewSchedule→viewTimeboxes
- main-view-state.ts / page.tsx 注释（type='schedule' 保留，view state 字面量）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 测试文件同步（~15 文件）

**Files:**
- Rename: `src/domains/timebox/__tests__/scheduling-handler.test.ts` → `orchestration-handler.test.ts`
- Modify: ~14 个测试文件（全局替换 viewSchedule/createSmartSchedule/adjustRemainingSchedule/adjust-schedule/AdjustSchedule/SchedulingHandler/scheduling-handler 引用）

**Interfaces:**
- Consumes: Task 1-4 的新命名（viewTimeboxes/createSmartTimeboxes/adjustRemainingTimeboxes/adjust-timeboxes/AdjustTimeboxes/TimeboxOrchestrationHandler/orchestration-handler）

- [ ] **Step 1: git mv scheduling-handler.test.ts**

```bash
cd /home/walker/lifeware/frontend
git mv src/domains/timebox/__tests__/scheduling-handler.test.ts src/domains/timebox/__tests__/orchestration-handler.test.ts
```

- [ ] **Step 2: 改 orchestration-handler.test.ts 内容**

`src/domains/timebox/__tests__/orchestration-handler.test.ts:2` 当前：`import { SchedulingHandler } from '../handlers/scheduling-handler'` → `import { TimeboxOrchestrationHandler } from '../handlers/orchestration-handler'`

L11 `    action: 'createSmartSchedule',` → `    action: 'createSmartTimeboxes',`

L26 `describe('SchedulingHandler', () => {` → `describe('TimeboxOrchestrationHandler', () => {`

L27 `  const handler = new SchedulingHandler()` → `  const handler = new TimeboxOrchestrationHandler()`

grep 确认全文其他 `SchedulingHandler` / `createSmartSchedule` / `scheduling-handler` 引用一并改：
```bash
grep -nE "SchedulingHandler|createSmartSchedule|adjustRemainingSchedule|scheduling-handler|adjust-schedule|AdjustSchedule|viewSchedule" src/domains/timebox/__tests__/orchestration-handler.test.ts
```
全部替换为新名。

- [ ] **Step 3: 改 cnui-handlers.test.ts（adjustRemainingSchedule→adjustRemainingTimeboxes）**

`src/domains/timebox/__tests__/cnui-handlers.test.ts:37,65,80,90,99` 全部 `adjustRemainingSchedule` → `adjustRemainingTimeboxes`（5 处）。

- [ ] **Step 4: 改 cnui/__tests__/handlers.test.ts（createSmartSchedule + adjustRemainingSchedule）**

`src/domains/timebox/cnui/__tests__/handlers.test.ts:96,98,120,129,138,140,152,293,295,301` 全部 `createSmartSchedule` → `createSmartTimeboxes`（多处）+ `adjustRemainingSchedule` → `adjustRemainingTimeboxes`（多处）。

- [ ] **Step 5: 全局替换剩余测试文件的 schedule 引用**

剩余 ~10 个测试文件（action-view.test.tsx / manifest-utils.test.ts / intent.test.ts / orchestrator-query.test.ts / orchestrator-generative.test.ts / phase5-integration.test.ts / phase5-types.test.ts / phase7-memory.test.ts / types.test.ts / assembler.test.ts / energy-curve.test.ts / domain-types.test.ts）。

用 sed 或逐文件 Edit 全局替换：
- `viewSchedule` → `viewTimeboxes`
- `createSmartSchedule` → `createSmartTimeboxes`
- `adjustRemainingSchedule` → `adjustRemainingTimeboxes`
- `'adjust-schedule'` → `'adjust-timeboxes'`（字符串字面量）
- `AdjustSchedule` → `AdjustTimeboxes`（import/类型）
- `SchedulingHandler` → `TimeboxOrchestrationHandler`
- `'scheduling-handler'` / `scheduling-handler` 路径 → `orchestration-handler`

**精确命令**（在 frontend cwd）：
```bash
cd /home/walker/lifeware/frontend
# 列出所有需改的测试文件
grep -rlE "viewSchedule|createSmartSchedule|adjustRemainingSchedule|'adjust-schedule'|AdjustSchedule|SchedulingHandler|scheduling-handler" src --include="*.test.ts" --include="*.test.tsx"
# 逐文件确认 + Edit（不可盲目 sed，区分字符串字面量 vs 注释 vs 标识符）
```

**注意**：`view_schedule`（snake_case，[023.03] T4 历史注释里）保留历史不改（OQ-4）。`ScheduleEvent` / `ScheduleView`（[023.03] T4 已删的 legacy）若在测试快照 `.snap` 里出现，保留历史不改。

- [ ] **Step 6: vitest base=head 全量回归**

Run: `cd /home/walker/lifeware/frontend && npx vitest run 2>&1 | tail -20`
Expected: 与 base（main HEAD `6c55f69`）对比，**零新增失败**。重点关注：
- `orchestration-handler.test.ts`（改名后须通过）
- `cnui-handlers.test.ts` / `handlers.test.ts`（action 名改后须通过）
- `action-view.test.tsx` / `manifest-utils.test.ts`（viewSchedule 改后须通过）

若 `phase5-integration.test.ts` 等含 `viewSchedule` 字符串字面量（snapshot/fixture），确认是活引用还是历史快照——活引用改，历史快照保留。

- [ ] **Step 7: tsc 全量验证**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | tail -10`
Expected: 与 base 对比零新增 error。

- [ ] **Step 8: Commit**

```bash
git add -A src/
git commit -m "test(023.05): 测试文件同步 schedule→timebox/orchestration 改名

[023.05] PR1 阶段 1 Task 5：~15 测试文件同步
- scheduling-handler.test.ts→orchestration-handler.test.ts (git mv)
- viewSchedule→viewTimeboxes / createSmartSchedule→createSmartTimeboxes
- adjustRemainingSchedule→adjustRemainingTimeboxes
- SchedulingHandler→TimeboxOrchestrationHandler
- 历史注释/快照 ([023.03] T4 view_schedule/ScheduleEvent) 保留

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: 全量验收（grep 守护 + tsc + vitest + validate:manifest + /timeboxes）

**Files:** 无（验收 only）

- [ ] **Step 1: F1 grep 守护——timebox manifest 无活 Schedule action**

Run: `cd /home/walker/lifeware/frontend && grep -E "action:.*Schedule" src/domains/timebox/manifest.yaml`
Expected: **空输出**（无活 timebox-action 含 `Schedule` 子串）。若返回任何行（如 `action: createItinerary`——阶段 2 范围，不含 Schedule），确认非 timebox 域 schedule 残留。

阶段 2 后这个 grep 会因 `action: createSchedule` 命中——但那是阶段 2 的 schedule 对象（正确）。阶段 1 验收：**0 行**。

- [ ] **Step 2: 阶段 1 schedule 标识符全局 grep（仅剩注释历史）**

Run: `cd /home/walker/lifeware/frontend && grep -rnE "schedule" src/domains/timebox --include="*.ts" --include="*.tsx" --include="*.yaml" | grep -v __tests__ | grep -v "\[023.03\]" | grep -vE "^\s*//|^\s*\*|@file|@brief"`
Expected: **空输出**或仅剩 `[023.03] T4` 历史注释（OQ-4 保留）。

- [ ] **Step 3: validate:manifest**

Run: `cd /home/walker/lifeware/frontend && npm run validate:manifest`
Expected: `0 errors`（K-component adjust-timeboxes→AdjustTimeboxes.tsx 匹配 + 双注册 + lifecycle key 不变）。

- [ ] **Step 4: tsc base=head**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit 2>&1 | wc -l`
Expected: 与 base（`git stash && npx tsc --noEmit 2>&1 | wc -l` 取 base 数）对比零新增。

- [ ] **Step 5: vitest base=head**

Run: `cd /home/walker/lifeware/frontend && npx vitest run 2>&1 | tail -5`
Expected: `Test Files X passed` 零新增失败（与 base 对比）。

- [ ] **Step 6: dev server /timeboxes 200 + GrowthMenu**

Run: `cd /home/walker/lifeware/frontend && npm run dev &`（后台启动），等 5 秒。
Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/timeboxes`
Expected: `200`。

`/browse` 验证 GrowthMenu 显示 `viewTimeboxes`（无 `viewSchedule` 残留）+ 底部导航 / shortcut 工作。若 `/browse` 不可用，手动浏览器验证。

- [ ] **Step 7: Stage 2 schedule 命名空间干净确认**

Run: `cd /home/walker/lifeware/frontend && grep -rnE "\bSchedule\b" src/domains/timebox --include="*.ts" --include="*.tsx" | grep -v __tests__`
Expected: 仅剩 `mainViewState.type='schedule'`（OQ-1，view state 字面量，非 schedule 对象）+ `[023.03] T4` 历史注释。**schedule 命名空间已释放给阶段 2。**

- [ ] **Step 8: 最终 commit（若 Task 6 有 fixup）+ push 准备**

若 Task 6 全绿无需 fixup，跳过。否则：
```bash
git add -A
git commit -m "fix(023.05): 阶段 1 验收 fixup"
```

阶段 1 PR1 准备 ship：`/review` → `/ship` 合 main。

---

## Self-Review

**1. Spec coverage**（design doc 阶段 1 清单 1.1-1.4 + 评审补充 F1）：
- ✅ 1.1 manifest 改名（6 块）→ Task 1
- ✅ 1.2 文件 + 标识符（AdjustSchedule→AdjustTimeboxes / scheduling-handler→orchestration-handler / handlers/index.ts / index.ts / viewSchedule 引用 / 5 注释）→ Task 2-4
- ✅ 1.3 中文「日程」→「时间盒」（manifest + cnui/handlers UI + AdjustSchedule UI）→ Task 1-3
- ✅ 1.4 验收（tsc + vitest + validate:manifest + /timeboxes + GrowthMenu + grep）→ Task 6
- ✅ F1 resolveObjectType 验收（grep action:.*Schedule）→ Task 6 Step 1
- ✅ D2 scheduling-handler→orchestration → Task 3
- ✅ D1 双向清理（中文）→ Task 1-3
- ✅ 测试同步 → Task 5（Explore 误判为阶段 2，已校正）

**2. Placeholder scan**：
- 无 TBD/TODO。每个 step 含精确文件:行号 + old→new diff。
- Task 5 Step 5 的"全局替换"给出精确 sed 目标 + 区分字符串/注释/标识符的注意——可执行。

**3. Type consistency**：
- `viewTimeboxes` / `createSmartTimeboxes` / `adjustRemainingTimeboxes` / `adjust-timeboxes` / `AdjustTimeboxes` / `TimeboxOrchestrationHandler` / `orchestration-handler` — 全 plan 一致（跟 design doc SSOT）。
- mainViewState.type='schedule' 一致保留（OQ-1）。

**4. 命名决策（plan 阶段 note）**：
- `createSmartSchedule`→`createSmartTimeboxes`（design doc SSOT，保留 Smart 语义）。替代命名 `orchestrateTimeboxes`（Explore 建议，与 TimeboxOrchestrationHandler 一致）——若 execution 阶段偏好后者，全局替换即可，plan 不阻塞。
- `adjustRemainingSchedule`→`adjustRemainingTimeboxes`（design doc SSOT）。

**5. OQ（plan 阶段显式标注）**：
- **OQ-1**：mainViewState.type='schedule' 保留（view state 字面量，贯穿 app-shell/bottom-nav/use-intent-handler，阶段 1 不改，阶段 2 后可考虑 'timeboxes'）。
- **OQ-2**：createSmartTimeboxes vs orchestrateTimeboxes 命名（design doc vs Explore 替代）。
- **OQ-3**：`[023.03] T4` 历史注释（view_schedule/ScheduleEvent/ScheduleView in .snap）保留（OQ-4 design doc 倾向保留）。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-04-023-05-1-timebox-schedule-cleanup.md`. Two execution options:

**1. Subagent-Driven (recommended)** - 每 task 派 fresh subagent，task 间 review，快速迭代
**2. Inline Execution** - 本 session 内 executing-plans 批量执行 + checkpoints
