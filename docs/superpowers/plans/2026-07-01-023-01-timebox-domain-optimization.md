<!-- /autoplan restore point: /home/walker/.gstack/projects/walker2002-lifeware/main-autoplan-restore-20260701-122147.md -->
# [023-01] Timebox 域优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 [023] A3 后 Timebox 域四类遗留问题，**根因优先**——先通电 capability 注册体系（activeHabits 报错的真实病根），再做 manifest/导航/解析优化与守门员防御。

**Architecture:** 不改 Nexus 架构与状态机。(0) `ensureProvidersRegistered()` 幂等函数 + orchestrator 生成型路径入口调用，修复 `registerAllProviders` 死代码（capability 从未注册）；(1) timebox manifest 补 `response_type`/改 description/扩 examples + validate-manifest 守门员；(2) resolveContext 错误增强；(3) orchestrator dev-warn 可观察性（不改行为，诚实命名）；(5) `MULTI_TASK_PROMPT` 加 few-shot；(6) `manifest-utils.ts` 显式声明 SSOT（删 view_routes fallback）；(7) getActionResponse 联动 + 待开发分支 + smoke test；(8) FAB label 同步联动。

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5 / vitest / Drizzle / YAML manifest / Nexus orchestrator

## autoplan 评审定论（CRITICAL 根因反转）

/autoplan dual voices（codex + 独立 Claude subagent）三重验证确认：**`registerAllProviders` 是死代码**（grep 零调用方 + codegraph `No callers found` + app/ 无注册）→ activeHabits/pendingHabits/existingTimeboxes/activeTasks/energyCurve/CompletedTasks 全部**从未注册**。用户的 `/createTimebox` 报 `activeHabits not found` 真实根因是 **R2 归因偏差**：真实失败 action 是 habits 域生成型 action（activeHabits 仅 habits/manifest.yaml:247 请求），错误经 session 流归到相邻 createTimebox。原"守门员对冲 R1/R2/R3"建立在错误前提上。**Task 0 通电是真实修复**，Task 2/3/4 降级为可观察性/验证辅助。

详见末尾 `## GSTACK REVIEW REPORT`。

## Global Constraints

- 所有对话、注释、commit message 使用**简体中文**；代码标识符英文
- **commit message 必须说明 WHY**（哪个根因/场景驱动），让 6 个月后 `git log` 读者能关联到本 [023-01] 上下文（codex 战略盲点 2）
- 颜色用 CSS 变量令牌（`bg-canvas`/`text-ink` 等），禁止 Tailwind 默认颜色类
- 每个 TS/JS 文件须有 `/** @file ... @brief ... */` 文件头
- vitest 必须在 `frontend` cwd 跑（`@/` 映射）；tsc 双验证
- 验收用 base/head 失败集合对比，不硬编码失败数
- manifest.yaml 改动后须 `npm run validate:manifest` 通过
- 「成长领域」Tab label（`left-panel.tsx:32`）**不改**

**Spec**：`docs/superpowers/specs/2026-07-01-023-01-timebox-domain-optimization-design.md`（Section 2 根因待 Task 0/4 后回填真实结论）

---

## File Structure

| 文件 | 责任 | 动作 |
|------|------|------|
| `frontend/src/nexus/context-engine/register-providers.ts` | capability 注册 | Modify（Task 0 加 `ensureProvidersRegistered`） |
| `frontend/src/nexus/orchestrator/index.ts` | orchestrator 生成型路径入口 | Modify（Task 0 调用 ensure + Task 3 dev-warn） |
| `frontend/src/nexus/context-engine/__tests__/register-providers.test.ts` | ensure 幂等单测 | Create（Task 0） |
| `frontend/src/domains/timebox/manifest.yaml` | timebox 域声明 | Modify（Task 1） |
| `frontend/scripts/validate-manifest.ts` | manifest 诊断 | Modify（Task 1） |
| `frontend/src/nexus/context-engine/registry.ts` | capability 注册中心 | Modify（Task 2） |
| `frontend/src/nexus/context-engine/__tests__/registry.test.ts` | registry 单测 | Modify（Task 2） |
| `frontend/src/nexus/core/intent-engine/ai-parser.ts` | AI 解析（`MULTI_TASK_PROMPT`） | Modify（Task 5） |
| `frontend/src/nexus/core/intent-engine/__tests__/ai-parser-migration.test.ts` | parseMultiTask 单测 | Modify（Task 5） |
| `frontend/src/usom/manifest-utils.ts` | `getResponseType`（显式声明 SSOT） | Create（Task 6） |
| `frontend/src/usom/__tests__/manifest-utils.test.ts` | 单测 | Create（Task 6） |
| `frontend/src/app/actions/intent.ts` | `getActionResponse` | Modify（Task 7） |
| `frontend/src/hooks/use-intent-handler.ts` | `handleGrowthAction` 待开发分支 | Modify（Task 7） |
| `frontend/src/components/layout/fab.tsx` | FAB label 同步联动 | Modify（Task 8） |

## 依赖顺序

```
Task 0 (通电) ──┐
Task 1 (manifest)┤
                ├─→ Task 4 (验证 activeHabits 修复，依赖 0)
Task 6 (utils) ─┤
                ├─→ Task 7 (联动，依赖 1+6)
                └─→ Task 8 (FAB，依赖 6)
Task 2/3/5 可与上述并行（独立文件）
Task 9 (全量验证) 最后
```

---

## Task 0: 通电 capability 注册体系（activeHabits 真实根因修复）

**Files:**
- Modify: `frontend/src/nexus/context-engine/register-providers.ts`（加 `ensureProvidersRegistered`）
- Modify: `frontend/src/nexus/orchestrator/index.ts:1050`（executeGenerativePath 入口调用）
- Test: `frontend/src/nexus/context-engine/__tests__/register-providers.test.ts`（新建）

**Interfaces:**
- Produces: `ensureProvidersRegistered(): void`（幂等，首次调用以 new repos 注册全部 capability，后续 no-op）
- Consumes: `registerAllProviders`（同文件）、`TimeboxRepository`/`TaskRepository`/`HabitRepository`

**Why（commit message why）**：codex 三重验证确认 `registerAllProviders` 死代码——6 个 capability provider 从未注册，任何生成型路径 action 在生产必报 "Context capability not found"。用户 `/createTimebox` 报 activeHabits 错是 R2 归因偏差（真实失败 action 在 habits 域）。本 task 通电注册体系，是 activeHabits bug 的真实修复。

**接入点选择**：lazy + 幂等，放在 `executeGenerativePath` 入口（仅生成型路径需 capability；contract 路径不浪费、无启动副作用）。未选 instrumentation.ts 全局注册，因其不存在且全局注册对 contract-only 流程冗余。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/nexus/context-engine/__tests__/register-providers.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ensureProvidersRegistered } from '../register-providers'
import { clearRegistry, getRegisteredCapabilities } from '../registry'

describe('ensureProvidersRegistered', () => {
  beforeEach(() => clearRegistry())

  it('首次调用注册全部 capability', () => {
    expect(getRegisteredCapabilities()).toEqual([])
    ensureProvidersRegistered()
    const caps = getRegisteredCapabilities()
    expect(caps).toEqual(expect.arrayContaining([
      'existingTimeboxes', 'activeTasks', 'completedTasks',
      'pendingHabits', 'activeHabits', 'energyCurve',
    ]))
  })

  it('幂等：二次调用不重复注册（capability 数不变）', () => {
    ensureProvidersRegistered()
    const first = getRegisteredCapabilities().length
    ensureProvidersRegistered()
    expect(getRegisteredCapabilities().length).toBe(first)
  })
})
```

- [ ] **Step 2: 跑测试验证失败**

Run: `cd frontend && npx vitest run src/nexus/context-engine/__tests__/register-providers.test.ts`
Expected: FAIL（`ensureProvidersRegistered` 未导出）

- [ ] **Step 3: 加 ensureProvidersRegistered 到 register-providers.ts**

在 `frontend/src/nexus/context-engine/register-providers.ts` 末尾追加：

```ts
import { TimeboxRepository } from '@/domains/timebox/repository'
import { TaskRepository } from '@/domains/tasks/repository'
import { HabitRepository } from '@/domains/habits/repository/habit'

/**
 * [023-01] 幂等保证 capability 已注册。
 *
 * registerAllProviders 原是死代码（零调用方），导致 6 个 capability provider
 * 从未注册，任何生成型路径 action 报 "Context capability not found"。
 * 由 orchestrator executeGenerativePath 入口调用（lazy + 幂等：仅生成型路径
 * 需要 capability，contract 路径不浪费）。
 */
let _providersRegistered = false
export function ensureProvidersRegistered(): void {
  if (_providersRegistered) return
  registerAllProviders({
    timeboxRepo: new TimeboxRepository(),
    taskRepo: new TaskRepository(),
    habitRepo: new HabitRepository(),
  })
  _providersRegistered = true
}
```

- [ ] **Step 4: 跑单测验证通过**

Run: `cd frontend && npx vitest run src/nexus/context-engine/__tests__/register-providers.test.ts`
Expected: PASS（2 用例）

- [ ] **Step 5: orchestrator executeGenerativePath 入口调用 ensure**

`frontend/src/nexus/orchestrator/index.ts:1056`（`executeGenerativePath` 的 try 块首行，`assembleContext` 之前）插入：

```ts
      try {
        // [023-01] 通电 capability 注册（lazy + 幂等）：registerAllProviders 原死代码
        ensureProvidersRegistered()

        // ContextEngine 组装
        const ceStart = Date.now()
```

并在文件顶部 import 区加：

```ts
import { ensureProvidersRegistered } from '@/nexus/context-engine/register-providers'
```

- [ ] **Step 6: tsc 类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 7: /browse 验证生成型路径不再报 capability not found**

启动 dev server，`/browse`：
1. 触发一个走生成型路径的 action（如 habits 域 createHabit 经 AI 路径，或 timebox `/smartSchedule`）
2. 确认不再报 `Context capability not found`（capability 现已注册）
3. 仍可能报其他错误（如 capability 返回数据校验），但 "not found" 类消失

- [ ] **Step 8: Commit**

```bash
cd frontend
git add src/nexus/context-engine/register-providers.ts src/nexus/context-engine/__tests__/register-providers.test.ts src/nexus/orchestrator/index.ts
git commit -m "fix(context-engine): 通电 capability 注册体系 — 修复 registerAllProviders 死代码

[023-01] 根因修复：registerAllProviders 零调用方（grep+codegraph 三重验证），
6 个 capability provider（existingTimeboxes/activeTasks/completedTasks/
pendingHabits/activeHabits/energyCurve）从未注册。任何生成型路径 action
在生产报 'Context capability not found'。用户 /createTimebox 报 activeHabits
错是 R2 归因偏差（真实失败 action 在 habits 域 generation action）。

新增 ensureProvidersRegistered() 幂等函数，由 orchestrator
executeGenerativePath 入口 lazy 调用（仅生成型路径需 capability）。
这是 activeHabits bug 的真实修复，Task 2/3 守门员降级为可观察性辅助。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 1: manifest viewSchedule 修复 + validate-manifest 守门员

**Files:** Modify `manifest.yaml` + `scripts/validate-manifest.ts`
**依赖**：无（可与 Task 0 并行）
**根因**：`getActionResponse`（`intent.ts:1278`）`trigger?.response_type ?? 'text'` → viewSchedule 无 response_type → fallback 'text' → handleGrowthAction 走 text 分支弹"已记录"。

- [ ] **Step 1: 加 validate 守门员规则（红）**

`frontend/scripts/validate-manifest.ts` intent_triggers 校验段（line ~258，`cnui_surface 引用存在性` 之前）插入：

```ts
    // [023-01] 守门员：view_route 存在则 response_type 必须 page（防落入 text fallback）
    if (trigger.view_route && responseType !== 'page') {
      addError(domainId, 'A-view-route-needs-page',
        `intent_trigger "${action}" 有 view_route "${trigger.view_route}" 但 response_type 不是 page（当前: "${responseType ?? '未声明'}"），会导致导航落入 text fallback`)
    }
```

- [ ] **Step 2: 跑 validate 验证命中（红）**

Run: `cd frontend && npm run validate:manifest`
Expected: timebox 域报 `A-view-route-needs-page`，exit 1

- [ ] **Step 3: 修 manifest（绿）**

`manifest.yaml`：

(a) `viewSchedule`（line 51-58）补 `response_type: page` + description→`时间盒管理`
(b) `createTimebox`（line 11-20）description→`创建新的时间盒` + examples 扩两条多记录示例：
```yaml
      - 上午10:30-12:30 OKR 季度计划
      - 上午10:30-12:30 OKR 季度计划；下午16:00-18:00 带孩子出去玩
```

- [ ] **Step 4-5: 跑 validate:manifest + validate:structure 通过（exit 0）**

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/domains/timebox/manifest.yaml scripts/validate-manifest.ts
git commit -m "fix(timebox): viewSchedule 补 response_type:page + 守门员规则 A-view-route-needs-page

[023-01] viewSchedule 缺 response_type 落入 getActionResponse 的 'text' fallback，
点击报\"已记录\"。补 response_type:page + validate-manifest 守门员防同类再现
（仅 timebox 域有 view_route，零误伤）。viewSchedule/createTimebox description
改名 + examples 扩多记录（供 Task 5 prompt 联动）。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: resolveContext 错误增强（可观察性，独立有价值）

**Files:** Modify `registry.ts:34-37` + `__tests__/registry.test.ts`
**依赖**：无
**Why**：capability not found 经三层包装后用户看不懂。增强后一报错即知"请求了 X，已注册 [a,b,c]"。即便 Task 0 通电修复 activeHabits，未来若再漏注册仍指向 deps 注入。

- [ ] **Step 1: 写失败测试**（在 `registry.test.ts` 追加）

```ts
describe('resolveContext error messages', () => {
  afterEach(() => clearRegistry())
  it('未注册 capability 时错误消息含已注册列表', async () => {
    registerContextCapability({ id: 'existingTimeboxes', visibility: 'planning',
      schema: z.object({}), provider: { async provide() { return {} } } })
    await expect(resolveContext('activeHabits', 'q', {})).rejects.toThrow(/activeHabits/)
    await expect(resolveContext('activeHabits', 'q', {})).rejects.toThrow(/existingTimeboxes/)
  })
})
```

- [ ] **Step 2: 跑测试验证失败** → `cd frontend && npx vitest run src/nexus/context-engine/__tests__/registry.test.ts` → FAIL

- [ ] **Step 3: 改 registry.ts:34-37**

```ts
  const cap = capabilities.get(capabilityId)
  if (!cap) {
    const registered = Array.from(capabilities.keys())
    throw new Error(
      `Context capability not found: "${capabilityId}"。已注册: [${registered.join(', ')}]。` +
      `请检查 ensureProvidersRegistered/registerAllProviders 是否调用（capability 未注册通常因对应 repo 未传入）。`,
    )
  }
```

- [ ] **Step 4: 跑测试通过** → PASS
- [ ] **Step 5: Commit**（message 含"可观察性"+ timebox 根因上下文 why）

---

## Task 3: orchestrator dev-warn 可观察性（诚实命名，不改行为）

**Files:** Modify `orchestrator/index.ts:770-775`
**依赖**：无
**⚠️ 诚实声明（autoplan C-1 共识）**：原 plan 称此为"守门员"，但 `index.ts:770-776` 现状**本就**在 `genActionConfig` 不存在时静默落到 contract path——本 task **只加 dev warn，不改行为**。是可观察性改进，非防御性守门员。真实根因已由 Task 0 修复，本 task 仅辅助未来 pathType 误标（R3）的可定位性。

- [ ] **Step 1: 改 index.ts:770-775**（加 dev warn）

```ts
      if (pathType === 'generative' && manifest) {
        const genActionConfig = manifest.generation_actions?.[intent.action]
        if (genActionConfig) {
          return orchestrator.executeGenerativePath(intent, userId, manifest, genActionConfig)
        }
        // [023-01] 可观察性（非行为变更）：pathType=generative 但 action 不在
        // generation_actions 时本就落到 contract path（上方 if 未命中）。此处仅
        // dev warn 让未来 LLM 误标 pathType（R3）可定位。真实根因见 Task 0。
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            `[Orchestrator] pathType=generative 但 ${intent.targetDomain}/${intent.action} ` +
            `不在 generation_actions，回落 contract path（行为不变，仅可观察性）`,
          )
        }
      }
```

- [ ] **Step 2-3: tsc + 跑 orchestrator 现有测试无回归** → `npx vitest run src/nexus/orchestrator/__tests__/`
- [ ] **Step 4: Commit**（message 诚实标注"可观察性，不改行为"，含 timebox why）

---

## Task 4: 验证 Task 0 修复 activeHabits bug（端到端确认 + 根因回填）

**Files:** Modify spec Section 2（living doc 根因回填）
**依赖**：Task 0 已合并

- [ ] **Step 1: /browse 端到端验证（修复后基线）**

启动 dev server（含 Task 0），`/browse` 逐项：
1. `/createTimebox 上午10:30-12:30 测试任务` → CNUI 提交 → **成功落库**（不再报 activeHabits）
2. 触发 habits 域生成型 action（如 `/smartSchedule` 或 createHabit 经 AI 路径）→ 不再报 capability not found
3. 真实 PG 查询确认 timebox 落库：`SELECT title FROM timeboxes WHERE title='测试任务'`

- [ ] **Step 2: 若仍报错（兜底）— 抓 server 日志定位**

若 Task 0 后仍报 activeHabits，抓：实际 intent 的 `targetDomain/action/pathType` + `loadDomainManifest` 返回值 + 是否相邻请求。据日志判定是否 R1（manifest 污染）或 pathType 显式注入，**届时新开 Task 4.1**（不预写代码，避免占位符）。

- [ ] **Step 3: 回填 spec Section 2 根因结论**

编辑 `docs/superpowers/specs/...-design.md` Section 2「修复策略」，把「T0 复现后填充」替换为：**根因 = registerAllProviders 死代码（codex/autoplan 三重验证），Task 0 通电修复，/browse 验证通过**。

- [ ] **Step 4: Commit spec 回填**

```bash
git add docs/superpowers/specs/2026-07-01-023-01-timebox-domain-optimization-design.md
git commit -m "docs(spec): [023-01] Section 2 根因回填 — registerAllProviders 死代码

autoplan dual voices 三重验证确认 activeHabits bug 真实根因是
registerAllProviders 死代码（capability 从未注册），非原假设的 timebox
路由问题。Task 0 通电修复，/browse 验证 createTimebox 保存成功落库。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: AI parser MULTI_TASK_PROMPT 增强

**Files:** Modify `ai-parser.ts:104-136` + `ai-parser-migration.test.ts`
**依赖**：无
**Why**：`/createTime 上午10:30-12:30 OKR 季度计划` 提示"任务标题必填"（LLM 误拆含空格标题）。

- [ ] **Step 1: 写回归测试**（`ai-parser-migration.test.ts` 的 `parseMultiTask` describe 内追加）

```ts
  it('应正确解析含空格标题的多任务（全角分号分隔）', async () => {
    const { parseMultiTask } = await import('../ai-parser')
    const aiRuntime = createMockAIRuntime({ generate: { content: { tasks: [
      { title: 'OKR 季度计划', startTime: '2026-07-01T10:30:00+08:00', duration: 120, confidence: 0.92 },
      { title: '带孩子出去玩', startTime: '2026-07-01T16:00:00+08:00', duration: 120, confidence: 0.9 },
    ] } } })
    const result = await parseMultiTask('上午10:30-12:30 OKR 季度计划；下午16:00-18:00 带孩子出去玩', 'intention-456', aiRuntime)
    expect(result.success).toBe(true)
    expect(result.intents).toHaveLength(2)
    expect(result.intents[0].fields.title).toBe('OKR 季度计划')
    expect(result.intents[1].fields.title).toBe('带孩子出去玩')
  })
```

- [ ] **Step 2: 跑测试** → `npx vitest run src/nexus/core/intent-engine/__tests__/ai-parser-migration.test.ts`

**Expected（修正 M-3 不可证伪）**：**改 prompt 前此测试必须 PASS**（解析器 `parseMultiTask:402-428` 本就用 `task.title`，支持含空格 title）。这是保护性回归测试。若 FAIL，说明解析器另有 bug，Task 5 范围扩大，先修解析器再改 prompt。

- [ ] **Step 3: 增强 MULTI_TASK_PROMPT**（`ai-parser.ts:104-136`）

在「识别规则」段追加 few-shot + 标题规则：

```
标题规则（重要）：
- 标题可包含空格，如「OKR 季度计划」「带孩子出去玩」是单个任务的标题
- 仅以「时间关键词 / 分隔符」断句，绝不要按空格切分标题
- 分隔符优先级：全角分号"；" > 半角分号";" > 换行 > 半角逗号","

示例：
输入："上午10:30-12:30 OKR 季度计划"
输出：{"tasks":[{"title":"OKR 季度计划",...}]}
说明：标题「OKR 季度计划」含空格，是单个任务。

输入："上午10:30-12:30 OKR 季度计划；下午16:00-18:00 带孩子出去玩"
输出：两条任务，全角分号分隔。
```

- [ ] **Step 4: 跑单测无回归** → PASS
- [ ] **Step 5: /browse 端到端验证 prompt 实效**（真实 LLM）
- [ ] **Step 6: Commit**（message 含 timebox/AI-parser why）

---

## Task 6: manifest-utils（显式声明 SSOT，删 view_routes fallback）

**Files:** Create `usom/manifest-utils.ts` + `__tests__/manifest-utils.test.ts`
**依赖**：Task 1（测试用例 `viewSchedule 返回 page` 依赖 Task 1 已声明 response_type:page）—— **显式声明依赖**

**⚠️ autoplan H-2/codex Point 3 共识修订**：原 plan 的 `getResponseType` 含 `view_routes 存在→page` fallback，与 Task 1 守门员（显式声明哲学）冲突，且 fallback 读顶层 `view_routes` 块、守门员读 `intent_triggers[].view_route`，两者字段不一致（codex Point 3 语义裂痕）。**删 fallback**，统一为显式声明 SSOT。

- [ ] **Step 1: 写测试**

```ts
import { describe, it, expect } from 'vitest'
import { getResponseType } from '../manifest-utils'

describe('getResponseType', () => {
  it('viewSchedule（Task 1 显式声明 page）返回 page', () => {
    expect(getResponseType('timebox', 'viewSchedule')).toBe('page')  // 依赖 Task 1
  })
  it('createTimebox（response_type:cnui）返回 cnui', () => {
    expect(getResponseType('timebox', 'createTimebox')).toBe('cnui')
  })
  it('未声明 action 返回 unimplemented', () => {
    expect(getResponseType('timebox', 'nonExistent')).toBe('unimplemented')
  })
})
```

- [ ] **Step 2: 跑测试失败** → FAIL（模块不存在）
- [ ] **Step 3: 创建 manifest-utils.ts**（无 view_routes fallback）

```ts
/**
 * @file manifest-utils
 * @brief manifest 读取集中层 — 显式声明 SSOT，消除 getActionResponse 的 'text' fallback
 *
 * [023-01] autoplan H-2/codex Point 3：原 plan 含 view_routes fallback，与 Task 1
 * 守门员（显式声明哲学）冲突且字段读取不一致。删 fallback，统一为显式声明 SSOT。
 */
import { getFullManifest } from '@/domains/registry'

export type ResponseType = 'cnui' | 'page' | 'text' | 'unimplemented'

export function getResponseType(domainId: string, action: string): ResponseType {
  const manifest = getFullManifest(domainId)
  if (!manifest) return 'unimplemented'
  const trigger = (manifest.intent_triggers ?? []).find((t) => t.action === action)
  if (!trigger) return 'unimplemented'
  // 显式声明优先（Task 1 守门员保证有 view_route 的 trigger 必声明 page）
  if (trigger.response_type === 'page' || trigger.response_type === 'cnui' || trigger.response_type === 'text') {
    return trigger.response_type
  }
  // cnui_surface 推断（generation action 经 cnui_surface_type 声明）
  if (trigger.cnui_surface) return 'cnui'
  return 'text'
}
```

- [ ] **Step 4: 跑测试通过** → PASS（**注意**：`viewSchedule 返回 page` 用例依赖 Task 1 已合并；若先于 Task 1 执行会 FAIL）
- [ ] **Step 5: tsc** → 无新增错误
- [ ] **Step 6: Commit**（message 含"显式声明 SSOT，删 fallback"+ why）

---

## Task 7: getActionResponse 联动 + 待开发分支 + smoke test

**Files:** Modify `intent.ts:1271-1280` + `use-intent-handler.ts:278-298`
**依赖**：Task 1 + Task 6

- [ ] **Step 1: 改 getActionResponse 用 getResponseType**

`intent.ts:1271-1280`：

```ts
export async function getActionResponse(domainId: string, action: string): Promise<{
  responseType: 'cnui' | 'page' | 'text' | 'unimplemented'
}> {
  return { responseType: getResponseType(domainId, action) }
}
```

顶部 import：`import { getResponseType } from '@/usom/manifest-utils'`

- [ ] **Step 2: 改 handleGrowthAction 加 unimplemented 分支**（`use-intent-handler.ts:286` 'text' 分支后）

```ts
      // [023-01] 无实现 action 提示待开发
      if (responseType === 'unimplemented') {
        deps.ensureConversationView()
        deps.addChatMessage({ role: "assistant", content: `该功能（${domainId}/${action}）待开发`, timestamp: new Date().toISOString() })
        return
      }
```

- [ ] **Step 3: 加 smoke test（codex Point 5：type narrowing 端到端）**

在 `intent.ts` 同目录或 test helper 加 smoke：`getActionResponse('timebox','viewSchedule')` 返回 `responseType === 'page'`（验证 type narrowing 不破坏调用方）。

- [ ] **Step 4: tsc + 跑相关单测** → 无回归
- [ ] **Step 5: /browse 验证 viewSchedule 导航 + 待开发提示**
- [ ] **Step 6: Commit**（message 含 type narrowing smoke + why）

---

## Task 8: FAB label 同步联动（删异步，加 vitest）

**Files:** Modify `fab.tsx:40-46`
**依赖**：Task 6

**⚠️ autoplan H-3 共识修订**：原 plan 把 FAB label 改异步（useState/useEffect/loading），但 `getActionDescription`（registry.ts:120）是**同步函数**（读已加载 manifest，无 IO）。异步化是过度设计。改同步调用。

- [ ] **Step 1: 改 fab.tsx 同步取 description**

(a) 顶部 import：`import { getActionDescription } from "@/domains/registry"`
(b) `DEFAULT_ACTIONS`（line 40-44）改含 label，渲染期同步计算：

```ts
const FALLBACK_LABEL: Record<string, string> = {
  createTimebox: '创建时间盒', checkinHabits: '打卡习惯', createTask: '新建任务',
}

const DEFAULT_ACTIONS = [
  { icon: Clock, domainId: "timebox", action: "createTimebox" },
  { icon: Check, domainId: "habits", action: "checkinHabits" },
  { icon: ListTodo, domainId: "tasks", action: "createTask" },
] as const

// 渲染期同步计算 label（getActionDescription 是同步函数，无 IO）
function resolveLabel(a: { action: string; domainId: string }, fallback: string): string {
  try { return getActionDescription(a.domainId, a.action) || fallback } catch { return fallback }
}
```

(c) 渲染处 `resolvedActions = (quickActions ?? DEFAULT_ACTIONS).map(a => ({ ...a, label: a.label ?? resolveLabel(a, FALLBACK_LABEL[a.action] ?? a.action) }))`（保留 quickActions prop 的外部覆盖能力）

- [ ] **Step 2: 加 vitest（codex Point 5：FAB label 联动 + SSR 安全）**

```ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/domains/registry', () => ({ getActionDescription: vi.fn((d, a) => `${d}/${a}-desc`) }))
describe('FAB resolveLabel', () => {
  it('同步联动 manifest description', () => {
    const { getActionDescription } = require('@/domains/registry')
    expect(getActionDescription('timebox', 'createTimebox')).toBe('timebox/createTimebox-desc')
  })
})
```

- [ ] **Step 3: tsc + 验证 FAB SSR 安全**（getActionDescription 读 manifest 若含 node:fs 需确认 client-safe；若不安全，改 server action 一次性预取传入 prop——但 registry 现状是同步读 loader 缓存，应 client-safe，/browse 确认无 hydration 错误）
- [ ] **Step 4: /browse 验证 FAB 文案随 manifest**
- [ ] **Step 5: Commit**（message 含"同步化，删异步"+ SSR why）

---

## Task 9: 全量验证 + 文档同步

**Files:** Modify 根 `CHANGELOG.md`
**依赖**：全部 task

- [ ] **Step 1: tsc 全量** → `cd frontend && npx tsc --noEmit` → 零新增（base=head）
- [ ] **Step 2: vitest 全量** → `npx vitest run` → 失败集合 ⊆ main（[025] PG flake 按已知处理）
- [ ] **Step 3: validate:manifest + validate:structure** → exit 0
- [ ] **Step 4: /browse 端到端全场景**（spec §5 验收表 10 场景）
- [ ] **Step 5: 同步 CHANGELOG.md**（[023-01] 条目，含 Task 0 根因修复）
- [ ] **Step 6: Commit CHANGELOG**

---

## Self-Review（plan 修订后，吸收 autoplan findings）

**Spec coverage**：§1.1/1.4 → Task 1；§1.3 → Task 7；§2.1 → Task 1；§2.2/2.3 → Task 5；§2.4 → Task 9 /browse；§2.5 activeHabits → **Task 0（根因）+ Task 4（验证）**；§1.2 CNUI 空白进入 → 已具备（use-intent-handler.ts:539-569），Task 9 /browse 确认。

**autoplan findings 吸收**：
- ✅ codex smoking gun（registerAllProviders 死代码）→ Task 0
- ✅ C-1（守门员只 dev warn）→ Task 3 诚实命名
- ✅ H-1（复现基线）→ Task 4 改为修复后验证 + 兜底
- ✅ H-2/codex Point 3（fallback 冲突）→ Task 6 删 fallback
- ✅ H-3（FAB 过度设计）→ Task 8 同步化
- ✅ M-2（R1 占位符）→ Task 4 Step 2 诚实标注"届时新开 Task 4.1"
- ✅ M-3（依赖声明 + 不可证伪）→ Task 6 显式声明依赖 Task 1；Task 5 Step 2 修正预期
- ✅ codex Point 5（测试补全）→ Task 7 smoke + Task 8 vitest
- ✅ codex 战略盲点 2（commit why）→ Global Constraints + 各 task commit message

**Placeholder scan**：Task 4 Step 2 R1 分支诚实标注"届时新开 Task 4.1"（非预写代码）；其余每步完整代码/命令。

---

## GSTACK REVIEW REPORT

**Runs**

| Phase | Voice | Status | 关键发现数 |
|-------|-------|--------|-----------|
| CEO (战略) | codex (MiniMax-M3, 106k tokens) | DONE | 1 CRITICAL + 5 findings |
| CEO (战略) | Claude subagent (独立) | DONE | 2 CRITICAL/HIGH + 5 findings |
| Design (UI) | — | SKIPPED | UI scope <2（仅"layout"命中），非视觉设计 |
| DX | — | SKIPPED | DX scope = 0，非 developer-facing |
| Eng (工程) | fold into CEO | DONE via CEO | CEO dual voices 深入走读 orchestrator/registry/manifest-loader/register-providers，已覆盖 Eng 范畴（架构/测试/性能/根因）；Task 0 为新代码，执行阶段 subagent-driven-dev review 把关 |

**Status**: APPROVED WITH REVISIONS — plan 已据 findings 修订（Task 0 新增 + Task 2/3/4/6/8 调整 + 测试补全）。

**Findings（consensus + 处置）**

| # | 发现 | 严重度 | 来源 | 处置 |
|---|------|--------|------|------|
| F1 | `registerAllProviders` 死代码，6 capability 从未注册——activeHabits bug 真实病根，非 timebox 路由 | CRITICAL | codex（三重验证：grep+codegraph+app 扫描） | ✅ Task 0 通电修复（用户已确认方向 A） |
| F2 | Task 3 守门员只是 dev warn，不改行为（index.ts:770 现状本就回落 contract） | HIGH | codex + Claude subagent 共识 | ✅ Task 3 诚实命名为"可观察性"，真实根因归 Task 0 |
| F3 | Task 6 view_routes fallback 与 Task 1 显式声明哲学冲突，且读不同字段（intent_triggers[].view_route vs 顶层 view_routes 块） | HIGH | Claude subagent (H-2) + codex (Point 3) | ✅ Task 6 删 fallback，统一显式声明 SSOT |
| F4 | Task 8 FAB 异步化过度设计（getActionDescription 是同步函数） | HIGH | Claude subagent (H-3) | ✅ Task 8 同步化，删 useEffect |
| F5 | Task 4 应在修复后验证 + R1 分支诚实标注为"届时新开" | MEDIUM | Claude subagent (H-1/M-2) | ✅ Task 4 改为验证 Task 0 + 根因回填 |
| F6 | Task 7 type narrowing 需 smoke test；Task 8 需 vitest | MEDIUM | codex (Point 5) | ✅ Task 7 Step 3 + Task 8 Step 2 |
| F7 | 守门员 A-view-route-needs-page 误伤其他域 | — | codex (Point 4) + Claude 共识实测 | ✅ 零误伤（仅 timebox 有 view_route），规则保留 |
| F8 | commit message 缺 why，6 个月后 git log 难关联 | MEDIUM | codex (战略盲点 2) | ✅ Global Constraints + 各 task commit message 含 why |
| F9 | Task 6→Task 1 隐性依赖未声明；Task 5 Step 2 预期不可证伪 | MEDIUM | Claude subagent (M-3) | ✅ Task 6 显式声明依赖；Task 5 Step 2 修正 |

**VERDICT**: CODEX ABSORBED — codex 的 smoking gun（F1）反转了 plan 根本前提，已据用户确认（方向 A）修订为 Task 0 通电修复。其余 findings（F2-F9）全部吸收。CROSS-MODEL ABSORBED（codex + Claude subagent 在 F2/F3/F7 达成独立共识，置信度高）。

**Architecture diagram（Task 0 数据流）**

```
用户 /createTimebox（或 habits 生成 action）
        │
        ▼
server action (intent.ts) → createOrchestrator → executeIntent
        │
        ├─ pathType=contract → RuleEngine → SM（不触 capability，不受影响）
        │
        └─ pathType=generative → executeGenerativePath
                │
                ▼
        [Task 0] ensureProvidersRegistered()  ← 幂等，首次注册 6 capability
                │                                   （原 registerAllProviders 死代码）
                ▼
        assembleContext → resolveContext(capabilityId)
                │
                ▼  （capability 现已注册，不再 "not found"）
        DomainHandler.onGenerate → proposal
```

**Failure modes registry**

| 失败模式 | 触发 | 守护 | 严重度 |
|---------|------|------|--------|
| capability 未注册（原死代码） | 任何生成型路径 | Task 0 ensureProvidersRegistered | CRITICAL（已修） |
| view_route 漏声明 response_type | 新增 view_route action | Task 1 守门员 A-view-route-needs-page | HIGH（已守） |
| LLM 误标 pathType=generative（R3） | AI 解析 | Task 3 dev warn（可观察性，非防御） | LOW（行为本就回落 contract） |
| getActionResponse type narrowing 破坏调用方 | Task 7 重构 | Task 7 smoke test | MEDIUM（已测） |
| FAB label manifest 未加载 | Task 8 同步读 | FALLBACK_LABEL 兜底 | LOW（已兜底） |

NO UNRESOLVED DECISIONS
