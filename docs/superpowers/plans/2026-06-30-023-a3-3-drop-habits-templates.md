<!-- /autoplan restore point: /home/walker/.gstack/projects/walker2002-lifeware/main-autoplan-restore-20260630-190252.md -->
# [023] A3.3 — habitsTemplates 硬删 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已被 `/timebox-templates` 取代的 habitsTemplates 功能从代码、USOM 类型、DB schema、迁移、文档中全量硬删，达成零残留。

**Architecture:** 纯删除任务（无新功能）。按「消费者先行、生产者收尾」分两波代码删除，保证每波结束 `tsc`/`vitest` 绿；第三波写 DROP 迁移 + 跑 dev 库 + Tier 2 文档同步。SSOT = 父 spec `docs/superpowers/specs/2026-06-30-023-a3-archetype-integration-design.md` §6 A3.3（已 brainstorm 修订，commit e73c652）。

**Tech Stack:** Next.js 16 / React 19 / TS 5 / Drizzle ORM（手写迁移）/ PostgreSQL / vitest。

## Global Constraints

- **语言**：所有注释/文案/commit message 用简体中文；每个新建 TS/JS 文件须有 `/** @file … @brief … */` 头（本计划仅新建 SQL，不新建 TS）。
- **迁移手写**：`db:generate`/`db:migrate` 跑不通（snapshot 债）——一律手写 SQL + `psql` 执行 + 登记 `migrations/meta/_journal.json`（**注意**：journal 在 `meta/` 下，非 `migrations/_journal.json`）。dev 库 = `lifeware_dev@localhost:5432`。
- **质量门禁**：`tsc --noEmit` 与 `vitest run` 用 **base/head 失败集合对比**（对比 main 基线，零新增；删除模板测试导致失败数下降是预期）。**禁止硬编码预存失败数**。
- **零残留 grep**：`grep -rniE 'habit.?templates?|HabitTemplate|template_habits|TemplateHabit|habit_templates' src/ --exclude-dir=migrations`（须 `--exclude-dir=migrations`：`migrations/0002_habit_enhancements.sql` 是历史 CREATE、`0027_..._drop_...sql` 是新 DROP，二者合法引用表名，非残留。该模式**不**命中通用 `template_form`/`parseTemplateForm`/`template-parser`/`template_file`/`markdown_templates`，这些都是通用 intent-form 或 AI 生成模板机制，**保留**）。
- **Tier 2 文档同步强制**（constitution）：DB/USOM 变更必须先同步 `docs/` 再登记 `manifest.md`。
- **误删红线**：`template_form`（intent-engine 通用表单机制）、`parseTemplateForm`/`submitTemplateIntent`/`TemplateFormFields`（`app/actions/intent.ts` L31/L477/L1205）、`templates.markdown.createHabit` + `template_file: markdown_templates/create_habit.md`（manifest 区块 H 的 AI 生成模板）、`SOURCE_WEIGHT.planned`（合法 sourceType 值）——**一律保留**，它们与 `habit_templates` 表无关。

---

## File Structure（全量爆炸半径）

**Delete 文件（9）**
- `frontend/src/app/habits/templates/page.tsx`
- `frontend/src/domains/habits/pages/HabitTemplatePage.tsx`
- `frontend/src/domains/habits/components/habit-template-{manager,form,card,view}.tsx`（4）
- `frontend/src/domains/habits/repository/habit-template.ts`
- `frontend/src/domains/habits/providers/habit-templates-provider.ts`
- `frontend/src/hooks/use-templates.ts`

**Modify — 消费者（Task 1）**
- `frontend/src/app/actions/intent.ts` — 删 Template Server Actions 块（L1028-1166）
- `frontend/src/components/views/action-view.tsx` — 删 `view_templates` 路由
- `frontend/src/domains/timebox/handlers/scheduling-handler.ts` — 删 `habitTemplates` context 消费
- `frontend/src/domains/timebox/manifest.yaml` — 删 `createSmartSchedule.contexts` 的 `habitTemplates`/`templates_for_date` query（**C1**，与 scheduling-handler 同任务，保 manifest↔handler 一致）
- `frontend/src/domains/habits/repository/habit.ts` — `checkReferences` 删 `templateHabits` 计数
- `frontend/src/domains/habits/pages/HabitListPage.tsx` — 归档守卫删 `templateHabits`
- `frontend/src/domains/habits/rules-registry.ts` — 删 4 个 template action 校验（L76-104）
- `frontend/src/nexus/context-engine/register-providers.ts` — 删 template provider 注册（全清）
- `frontend/src/domains/habits/manifest.yaml` — 删 `view_templates` action + view_route + `habitTemplates` context query
- 5 个 barrel：`domains/habits/{index,components/index,providers/index,repository/index}.ts` + `lib/db/repositories/index.ts`
- `frontend/src/usom/interfaces/irepository.ts` — `HabitReferenceInfo.templateHabits`（仅此一字段）
- 测试：`habits/__tests__/habit-domain.test.ts` + `timebox/__tests__/scheduling-handler.test.ts` + `nexus/orchestrator/__tests__/orchestrator.test.ts`

**Modify — 生产者/类型/schema（Task 2）**
- `frontend/src/usom/types/objects.ts` — 删 `HabitTemplate` / `TemplateHabitItem`
- `frontend/src/usom/interfaces/irepository.ts` — 删 `IHabitTemplateRepository` / `CreateTemplateInput` / `UpdateTemplateInput` / `TemplateHabitOverrides` + L14 import
- `frontend/src/lib/db/repositories/mappers.ts` — 删 `HabitTemplateRow` / `habitTemplateRowToUSOM` / `habitTemplateUSOMToRow` + L14 import
- `frontend/src/lib/db/schema.ts` — 删 `habitTemplates`(:356) + `templateHabits`(:374) 表定义 + `idx_habit_templates_user_status`

**Create — 迁移（Task 3）**
- `frontend/src/lib/db/migrations/0027_a3_m3_drop_habit_templates.sql`
- 登记 `frontend/src/lib/db/migrations/meta/_journal.json` idx=29
- 同步 `docs/database-design.md` + `docs/usom-design.md`（若有引用）+ `manifest.md`

---

## Task 1: 删除消费者层 + checkReferences 链

**Files:**
- Delete: 7 文件（见上 File Structure Delete，**除** `repository/habit-template.ts` 与 `providers/habit-templates-provider.ts` 留 Task 2）
- Modify: 上列「Modify — 消费者」全部
- Test: 3 个测试文件

**Interfaces:**
- Consumes: 父 spec §6 A3.3（SSOT）
- Produces: habit-template 的**所有消费者**移除；生产者文件（`habit-template.ts` repo / `habit-templates-provider.ts` / mappers 模板映射 / USOM `HabitTemplate` 类型 / `IHabitTemplateRepository` / schema 两表）仍**存在但无引用**。`tsc` 绿（未使用 export 不报错）、`vitest` 绿（模板测试已删）。grep 仍非零（生产者残留，Task 2 清）。

- [ ] **Step 1.1: 删除 7 个消费者文件**

```bash
cd frontend
rm src/app/habits/templates/page.tsx
rmdir src/app/habits/templates 2>/dev/null || true   # 目录空则删，非空保留
rm src/domains/habits/pages/HabitTemplatePage.tsx
rm src/domains/habits/components/habit-template-manager.tsx
rm src/domains/habits/components/habit-template-form.tsx
rm src/domains/habits/components/habit-template-card.tsx
rm src/domains/habits/components/habit-template-view.tsx
rm src/hooks/use-templates.ts
```

- [ ] **Step 1.2: 清 5 个 barrel 的 template re-export**

`src/domains/habits/components/index.ts` —— 删 4 行：
```ts
export { HabitTemplateCard } from "./habit-template-card"
export { HabitTemplateForm, type TemplateHabitEntry } from "./habit-template-form"
export { HabitTemplateManager } from "./habit-template-manager"
export { HabitTemplateView } from "./habit-template-view"
export { HabitTemplatePage } from "../pages/HabitTemplatePage"
```

`src/domains/habits/providers/index.ts` —— 删：
```ts
export { HabitTemplatesProvider } from './habit-templates-provider'
```

`src/domains/habits/repository/index.ts` —— 删：
```ts
export { HabitTemplateRepository } from './habit-template'
```

`src/domains/habits/index.ts:56` —— 把：
```ts
export { PendingHabitsProvider, HabitTemplatesProvider } from './providers'
```
改为：
```ts
export { PendingHabitsProvider } from './providers'
```

`src/lib/db/repositories/index.ts:6` —— 删：
```ts
export { HabitTemplateRepository } from '../../../domains/habits/repository/habit-template'
```

- [ ] **Step 1.3: `components/views/action-view.tsx` 删 view_templates 路由**

删 import（L4）+ 路由映射项（L13）：
```ts
import { HabitTemplatePage } from "@/domains/habits/pages/HabitTemplatePage"
```
```ts
    view_templates: HabitTemplatePage,
```

- [ ] **Step 1.4: `app/actions/intent.ts` 删 Template Server Actions 块**

删除 **L1028–L1166** 整块——从注释 `// ─── Template Server Actions ───`（L1028）到 `applyTemplate` 函数闭合 `}`（L1166）。包含：`getTemplateRepo` / `getTemplates` / `createTemplate` / `updateTemplate` / `deleteTemplate` / `addHabitToTemplate` / `removeHabitFromTemplate` / `applyTemplate` / `TemplateActionResult` / 块内 3 行 import（`HabitTemplateRepository` / `HabitTemplate` / `CreateTemplateInput,TemplateHabitOverrides`）。

**红线**：**保留** L31 `parseTemplateForm` import、L32 `TemplateFormFields`、L477 `submitTemplateIntent`、L488/L1205 `inputMode: "template_form"`——这些是通用 intent-form 机制，与 habit_templates 无关。L1168 `resolveShortcut` 起的代码原样保留。

删后跑 `cd frontend && npx tsc --noEmit | grep intent.ts`：若 `SystemEventRepository` / `createOrchestrator` 等顶层 import 因仅被 `applyTemplate` 使用而变 unused，按 tsc 报错移除该 import。

- [ ] **Step 1.5: `rules-registry.ts` 删 4 个 template action 校验**

删除 **L76–L104**（`if (action === 'createTemplate')` / `'addHabitToTemplate'` / `'removeHabitFromTemplate'` / `'applyTemplate'` 四个 if 块）。保留 L61-74（createHabit/updateHabit/logHabit/lifecycle）与 L106 `return`。

- [ ] **Step 1.6: `scheduling-handler.ts` 删 habitTemplates context 消费**

(a) 删 L25 import：
```ts
import type { HabitTemplate } from '@/usom/types/objects'
```

(b) `collectMaterials`（L145-153）—— 删 L146 一行 + 从 L152 return 对象删 `habitTemplates,`：
```ts
  private collectMaterials(contexts: Record<string, unknown>) {
    const habitTemplates = (contexts.habitTemplates ?? []) as HabitTemplate[]   // ← 删此行
    const pendingHabits = (contexts.pendingHabits ?? []) as HabitSummary[]
    ...
    return { habitTemplates, pendingHabits, activeTasks, existingTimeboxes, energyCurve }   // ← 删 habitTemplates,
  }
```

(c) `buildScheduleItems`——删整段「来源 1: habitTemplates 中的 planned habits」循环（L160-176）+ `templateHabitIds` Set（L179-181）+ pendingHabits 循环里的 `if (templateHabitIds.has(habit.id)) continue`（L184）。把「来源 2: pendingHabits（未被模板覆盖的）」注释改为「来源 1: pendingHabits」，后续来源注释顺延。结果 pendingHabits 成为第一来源（`sourceType: 'habit'`, priority `'P1'`, `durationMinutes: 30` 不变）。

**红线**：`SOURCE_WEIGHT` 里的 `planned: 0`（L81）**保留**（合法 sourceType 枚举值，其它生成器可能用）。

- [ ] **Step 1.7: `habit.ts` checkReferences 删 templateHabits 计数**

`src/domains/habits/repository/habit.ts:181-202` 改为（删 templateHabits 查询/计数/return 字段/hasReferences 项）：
```ts
  async checkReferences(id: USOM_ID, userId: USOM_ID): Promise<HabitReferenceInfo> {
    const [logs, timeboxes] = await Promise.all([
      db.select({ id: s.habitLogs.id }).from(s.habitLogs)
        .where(and(eq(s.habitLogs.habitId, id), eq(s.habitLogs.userId, userId)))
        .limit(1),
      db.select({ id: s.timeboxHabits.timeboxId }).from(s.timeboxHabits)
        .where(eq(s.timeboxHabits.habitId, id))
        .limit(1),
    ])
    const habitLogs = logs.length
    const timeboxHabits = timeboxes.length
    return {
      habitLogs,
      timeboxHabits,
      hasReferences: habitLogs > 0 || timeboxHabits > 0,
    }
  }
```

- [ ] **Step 1.8: `HabitListPage.tsx` 归档守卫删 templateHabits**

`src/domains/habits/pages/HabitListPage.tsx:188-192` 改为：
```ts
            const { habitLogs, timeboxHabits } = refResult.references
            const total = habitLogs + timeboxHabits
            if (total > 0) {
              setSubmitError(
                `该习惯有 ${habitLogs} 条打卡记录、${timeboxHabits} 个时间盒关联，将归档而非删除。`
              )
            }
```

- [ ] **Step 1.9: `irepository.ts` 删 HabitReferenceInfo.templateHabits 字段**

`src/usom/interfaces/irepository.ts:371` 删一行 `templateHabits: number`（保留 `habitLogs` / `timeboxHabits` / `hasReferences`）。

**注意**：本步**只删这一个字段**。`IHabitTemplateRepository` / `CreateTemplateInput` / `UpdateTemplateInput` / `TemplateHabitOverrides` / L14 的 `HabitTemplate,TemplateHabitItem` import 留 Task 2（它们仍被生产者引用）。

- [ ] **Step 1.10: `register-providers.ts` 全清 template 注册**

(a) L5 import 删 `HabitTemplatesProvider`：
```ts
import { PendingHabitsProvider, HabitTemplatesProvider, ActiveHabitsProvider } from '@/domains/habits/providers'
```
→
```ts
import { PendingHabitsProvider, ActiveHabitsProvider } from '@/domains/habits/providers'
```

(b) L6 import 删 `IHabitTemplateRepository`：
```ts
import type { ITimeboxRepository, ITaskRepository, IHabitRepository, IHabitTemplateRepository } from '@/usom/interfaces/irepository'
```
→
```ts
import type { ITimeboxRepository, ITaskRepository, IHabitRepository } from '@/usom/interfaces/irepository'
```

(c) 删 `TemplateArraySchema`（L41-46 整个 const）。

(d) `ProviderDeps`（L66-71）删 `habitTemplateRepo?: IHabitTemplateRepository`（L70）。

(e) 删 `if (deps.habitTemplateRepo) { ... }` 整个注册块（L123-131）。

- [ ] **Step 1.11: `manifest.yaml` 删 template 入口（保留 AI 生成模板）**

(a) 删 `view_templates` action 条目（L81-89，从 `- action: view_templates` 到 `view_route: /habits/templates`，共 9 行）。

(b) `view_routes`（L234-）删 `view_templates` 三行（L239-241）：
```yaml
  view_templates:
    component: domains/habits/pages/HabitTemplatePage
    url: /habits/templates
```

(c) `generation_actions.createHabit.contexts` 删 `habitTemplates` context query（L262-264）：
```yaml
      - id: habitTemplates
        query: habit_templates
        params: [userId]
```
**保留** `activeHabits`（L259-261）与 `response_mode`/`cnui_surface_type`/`session_enabled`。

(d) **保留** 区块 H `templates.markdown.createHabit`（L246-253，AI 生成模板，与 habit_templates 表无关）。

(e) **`domains/timebox/manifest.yaml`（C1，autoplan 发现）** —— `generation_actions.createSmartSchedule.contexts` 删 `habitTemplates`/`templates_for_date` query 三行（约 L257-259）。该 query 唯一 provider 是 `habit-templates-provider.ts`（T2 删），且 T1 已删 scheduling-handler 消费；不删则 `/smartSchedule` AI 流残留死 query 且破坏零残留。**保留** timebox 区块 H `templates.markdown.createTimebox`（与 habit_templates 无关）。

- [ ] **Step 1.12: 测试 — `habit-domain.test.ts`**

(a) L34 `habit_action_fields_valid` 的 fields 数组，删模板字段。把：
```ts
      { id: 'habit_action_fields_valid', phase: 'submit', fields: ['title', 'defaultTime', 'earliestTime', 'latestStartTime', 'defaultDuration', 'minDuration', 'frequencyType', 'habitId', 'name', 'applicableDays', 'templateId', 'date', 'timeOverride'], message: '习惯字段校验失败' },
```
改为：
```ts
      { id: 'habit_action_fields_valid', phase: 'submit', fields: ['title', 'defaultTime', 'earliestTime', 'latestStartTime', 'defaultDuration', 'minDuration', 'frequencyType', 'habitId'], message: '习惯字段校验失败' },
```

(b) 删整个 template onValidate describe 块——从注释 `// ─── Template onValidate 测试 ───`（L374）到其 `describe('Habits Domain Plugin — onValidate (template)')` 闭合 `})`（L490），含 10 个 it（createTemplate/addHabitToTemplate/removeHabitFromTemplate/applyTemplate 校验）。

- [ ] **Step 1.13: 测试 — `scheduling-handler.test.ts`**

(a) 删 4 处 contexts fixture 里的 `habitTemplates: [],`（L39、L64、L81、L98）。

(b) 重写 L111-146 排序测试（模板 source 'planned' 已不存在）：
```ts
  it('sorts by priority: habit before task', async () => {
    const request = makeRequest({
      existingTimeboxes: [],
      activeTasks: [
        { id: 't1', title: '任务', priority: 'P2', energyRequired: 'low', estimatedDuration: 30, threadId: null },
      ],
      pendingHabits: [
        { id: 'h1', title: '独立习惯', defaultTime: '08:00', defaultDuration: 20, frequencyType: 'daily' },
      ],
      energyCurve: { peakHours: [9, 10], lowHours: [14], source: 'test' }, // fixture 自定义值，非 SSOT DEFAULT_ENERGY_CURVE；handler 不校验曲线数学
    })

    const result = await handler.handle(request)

    const sourceTypes = result.proposalSet.proposals.map(p => p.sourceType)
    const habitIdx = sourceTypes.indexOf('habit')
    const taskIdx = sourceTypes.indexOf('task')

    // fixture 含 1 habit + 1 task，二者必出 proposals；habit(source 权重 1) 必排 task(权重 2) 前
    expect(habitIdx).toBeGreaterThanOrEqual(0)
    expect(taskIdx).toBeGreaterThanOrEqual(0)
    expect(habitIdx).toBeLessThan(taskIdx)
  })
```

> 注：`makeRequest(contexts, fields?)` 收的是泛型 `Record<string, unknown>`，删 `habitTemplates` key 无需改其签名。L55 timebox `status: 'planned'` 与 sourceType 无关，保留。

- [ ] **Step 1.14: 测试 — `orchestrator.test.ts`**

(a) L5 import 删 `HabitTemplate`：
```ts
import type { StructuredIntent, Habit, HabitTemplate } from '@/usom/types/objects'
```
→
```ts
import type { StructuredIntent, Habit } from '@/usom/types/objects'
```

(b) L584 mock 删 `templateHabits: 0`：
```ts
    checkReferences: vi.fn().mockResolvedValue({ habitLogs: 0, templateHabits: 0, timeboxHabits: 0, hasReferences: false }),
```
→
```ts
    checkReferences: vi.fn().mockResolvedValue({ habitLogs: 0, timeboxHabits: 0, hasReferences: false }),
```

(c) 删整块 `// ─── Apply Template 测试 ───`（L926）+ `createMockTemplateRepo` helper（L928-940）+ `describe.skip('createOrchestrator — applyTemplate')`（L943 到其闭合 `})`，约至 L1152+）。从 L926 注释连续删到该 describe 的最后闭合 `}`。

**红线**：**保留** 所有 `resolvedBy: 'template_form'`（L638/L793/L846/L913/L1399/L1471/L1512/L1581/L1636/L1665）——通用 intent-form 解析，与 habit_templates 无关。

- [ ] **Step 1.15: 质量门禁 — tsc + vitest（base/head 对比）**

```bash
cd frontend
npx tsc --noEmit 2>&1 | tee /tmp/a33-tsc-head.txt
npx vitest run 2>&1 | tee /tmp/a33-vitest-head.txt
```
预期：相对 main 基线**零新增** tsc 错误、**零新增** vitest 失败（模板测试被删 → 失败/通过数可能下降，属预期）。若有新增错误，按报错修（通常是漏删的 import / 残留引用）。

- [ ] **Step 1.16: 提交**

```bash
git add -A
git commit -m "refactor(habits): [023] A3.3 T1 删 habitsTemplates 消费者层

- 删 6 消费者文件(page/HabitTemplatePage/4组件/hook) + 5 barrel re-export
- intent.ts 删 Template Server Actions 块(保留通用 template_form 机制)
- rules-registry 删 4 template 校验; scheduling-handler 删 habitTemplates 消费
- checkReferences 链(habit.ts/irepository/HabitListPage/orchestrator mock)去 templateHabits
- register-providers 全清; manifest 删 view_templates + habitTemplates context(保留 AI 生成模板)
- 清 3 测试文件 template 用例

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: 删除生产者 + 类型 + schema（grep 零残留）

**Files:**
- Delete: `repository/habit-template.ts` + `providers/habit-templates-provider.ts`
- Modify: `usom/types/objects.ts` + `usom/interfaces/irepository.ts` + `lib/db/repositories/mappers.ts` + `lib/db/schema.ts`
- Modify: `scripts/validate-domain-structure.ts` + `scripts/__tests__/validate-domain-structure.test.ts`（**M1**，删 `HabitTemplateRepository` 例外 + 测试，否则 T2 删 repo 后测试 import 断裂）

**Interfaces:**
- Consumes: Task 1 产出（所有消费者已移除，生产者无引用）
- Produces: `src/` 下 habit-template **零残留**；`tsc`/`vitest` 绿；grep 零命中。

- [ ] **Step 2.1: 删 2 个生产者文件**

```bash
cd frontend
rm src/domains/habits/repository/habit-template.ts
rm src/domains/habits/providers/habit-templates-provider.ts
```

- [ ] **Step 2.1b: `scripts/validate-domain-structure` 删 HabitTemplateRepository 例外（M1，autoplan 发现）**

T2 删 `habit-template.ts` repo 后，`scripts/__tests__/validate-domain-structure.test.ts:217` 的 `import { HabitTemplateRepository } from '@/domains/habits/repository/habit-template'` 会断裂 → tsc/vitest 失败。同步清理：
- `scripts/validate-domain-structure.ts`：删 `CONFIG_REPOSITORY_EXCEPTIONS` 中的 `'HabitTemplateRepository'`（L65）+ 文件头/注释提及（L13、L200）。
- `scripts/__tests__/validate-domain-structure.test.ts`：删 `it('配置例外（HabitTemplate）→ false…')`（L132-133）+ `it('配置例外 repo（HabitTemplate）裸写 → 不报')`（L215-219）两个测试块。

- [ ] **Step 2.2: `usom/types/objects.ts` 删 HabitTemplate / TemplateHabitItem**

删 `// ─── 3.8a HabitTemplate ───`（L487）起的 `export interface HabitTemplate { ... }`（L500）与 `export interface TemplateHabitItem { ... }`（L519）两个接口（及其上方 section 注释）。保留其余 USOM 对象。

- [ ] **Step 2.3: `usom/interfaces/irepository.ts` 删模板仓储契约**

(a) L14 import 删 `HabitTemplate, TemplateHabitItem,`（确认无其它使用后）。

(b) 删 `// ─── HabitTemplate ───`（L548）起的整段：`IHabitTemplateRepository`（L553）+ `CreateTemplateInput`（L614）+ `UpdateTemplateInput`（L626）+ `TemplateHabitOverrides`（L631），到下一节注释前。

- [ ] **Step 2.4: `lib/db/repositories/mappers.ts` 删模板映射**

删 L14 import 的 `HabitTemplate, TemplateHabitItem,` + `// --- HabitTemplate ---`（L336）起的 `HabitTemplateRow`（L337）/ `habitTemplateRowToUSOM`（L345）/ `habitTemplateUSOMToRow`（L359）整段。

- [ ] **Step 2.5: `lib/db/schema.ts` 删两表定义**

删 `// ─── 4.5a habit_templates ───`（L355）起的 `export const habitTemplates = pgTable(...)`（含 `idx_habit_templates_user_status` index，至 L371）+ `// ─── 4.5b template_habits ───`（L373）起的 `export const templateHabits = pgTable(...)`（至其闭合）。保留其余表。

- [ ] **Step 2.6: 质量门禁 — tsc + vitest + grep 零残留**

```bash
cd frontend
npx tsc --noEmit 2>&1 | tee /tmp/a33-tsc-t2.txt
npx vitest run 2>&1 | tee /tmp/a33-vitest-t2.txt
grep -rniE 'habit.?templates?|HabitTemplate|template_habits|TemplateHabit|habit_templates' src/ --exclude-dir=migrations || echo "ZERO RESIDUE ✓"
```
预期：tsc/vitest 相对 main 零新增；grep 输出 `ZERO RESIDUE ✓`（无任何命中）。若 grep 仍有命中，按报错定位残留并删。

- [ ] **Step 2.7: 提交**

```bash
git add -A
git commit -m "refactor(habits): [023] A3.3 T2 删 habitsTemplates 生产者+类型+schema(零残留)

- 删 habit-template.ts repo + habit-templates-provider.ts
- usom objects 删 HabitTemplate/TemplateHabitItem; irepository 删 IHabitTemplateRepository+Create/Update/TemplateHabitOverrides
- mappers 删模板映射; schema 删 habit_templates+template_habits 表定义
- grep 零残留确认

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: DROP 迁移 + journal + dev DB + Tier 2 文档

**Files:**
- Create: `frontend/src/lib/db/migrations/0027_a3_m3_drop_habit_templates.sql`
- Modify: `frontend/src/lib/db/migrations/meta/_journal.json`（idx=29）
- Modify: `docs/database-design.md` + `docs/usom-design.md`（若有引用）+ `manifest.md`

**Interfaces:**
- Consumes: Task 2 产出（schema 已无两表，src 零残留）
- Produces: dev 库两表已 DROP；journal 登记；Tier 2 文档与代码一致；manifest.md 登记版本历史。

- [ ] **Step 3.1: 写 DROP 迁移 SQL**

新建 `frontend/src/lib/db/migrations/0027_a3_m3_drop_habit_templates.sql`：
```sql
-- [023] A3.3: 硬删 habit_templates（已被 /timebox-templates 取代）
-- 顺序：先 junction（template_habits）再主表（habit_templates）
--   原因：template_habits.template_id FK → habit_templates(id)，
--   先 DROP 主表会被依赖约束阻断（§4.3 / R4）。
-- 守护：DROP 前先 SELECT count 暴露存量（dev 预期 0；prod 走 prod.sh --migrate 时人工确认）。

SELECT 'template_habits count before DROP:' AS info, COUNT(*) AS cnt FROM template_habits;
SELECT 'habit_templates count before DROP:' AS info, COUNT(*) AS cnt FROM habit_templates;

DROP TABLE IF EXISTS template_habits;
DROP TABLE IF EXISTS habit_templates;
```

- [ ] **Step 3.2: 登记 journal idx=29（H2：先确认 idx=28 仍为最后一条）**

```bash
cd frontend && tail -8 src/lib/db/migrations/meta/_journal.json
```
确认最后一条是 `idx: 28 / tag 0022_rename_latest_end_time_to_latest_start_time`（commit f43b950 登入）。若是，在其闭合 `}` 后追加逗号 + 新条目（新条目成为最后一项，其后无逗号，保 JSON 合法）：
```json
    {
      "idx": 29,
      "version": "7",
      "when": 1783200000000,
      "tag": "0027_a3_m3_drop_habit_templates",
      "breakpoints": false
    }
```
tag `0027` > `0026`（上一条 SQL 文件）单调递增。

- [ ] **Step 3.3: 对 dev 库执行迁移**

```bash
cd frontend
# DATABASE_URL 指向 lifeware_dev@localhost:5432（.env.local）
psql "$DATABASE_URL" -f src/lib/db/migrations/0027_a3_m3_drop_habit_templates.sql
psql "$DATABASE_URL" -c "\dt template_habits"   # 预期：Did not find any relation
psql "$DATABASE_URL" -c "\dt habit_templates"   # 预期：Did not find any relation
```
预期：两条 SELECT count 输出（dev 应为 0）；两表 `\dt` 确认已不存在。

- [ ] **Step 3.4: 同步 `docs/database-design.md`**

(a) 删 `### 4.6a habit_templates（习惯模板表）`（L700 起）与 `### 4.5b template_habits` 两节 DDL + 索引说明。

(b) 删表总览（§二）中 `habit_templates` / `template_habits` 两行（约 L1504 + L137 树形图的 `├── habit_templates` / `└── template_habits` 行）。

(c) 在变更日志追加一条：
```md
- 2026_06_30：DROP `habit_templates` + `template_habits`（A3.3，已被 timebox-templates 取代）
```

- [ ] **Step 3.5: 检查并同步全部 docs/（M4，autoplan 发现 — 范围比 usom-design 更广）**

```bash
grep -rniE 'habit_templates|template_habits|HabitTemplate|TemplateHabit|habitTemplates|/habits/templates|/habit-templates' docs/ --exclude-dir=superpowers
```
命中文件须同步（与代码一致）：
- `docs/usom-design.md`：删 §3.8a HabitTemplate/TemplateHabitItem 接口（约 L696-721）+ L1804 引用 + L26 changelog 加 DROP 备注。
- `docs/route-generation-spec.md`：L44/82/83/100/103/139/148 以 `HabitTemplatePage` / `/habits/templates` 作 kebab 示例 —— 删或换非模板示例。
- `docs/UI-REDESIGN.md:170`：删 `HabitTemplatePage` 引用。
- `docs/domain-development-guide.md`：若有 `habit_templates` 上下文示例（约 L1448-1449），删/换。
- **不动**：`docs/superpowers/plans/*`（历史 plan，记录不可改）。

- [ ] **Step 3.6: 登记 `manifest.md`**

在 `manifest.md` 版本历史登记本次 `docs/database-design.md`（+ `usom-design.md` 若改）变更行（参照现有条目格式）。

- [ ] **Step 3.7: 提交**

```bash
git add -A
git commit -m "chore(db): [023] A3.3 T3 DROP habit_templates+template_habits 迁移 + Tier 2 文档同步

- 0027_a3_m3_drop_habit_templates.sql(先 junction 再主表, SELECT count 守护)
- journal idx=29; dev 库两表已 DROP 验证
- database-design 删两表 DDL+总览+加 DROP 变更日志; usom-design 同步(若有)
- manifest 登记

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 验收（spec §8.4 #4 + 扩展）

- [ ] `src/` grep 零残留（Task 2 Step 2.6）
- [ ] `tsc --noEmit` / `vitest run` 相对 main 零新增
- [ ] scheduling-handler 测试回归绿（Task 1 Step 1.13 重写后）
- [ ] dev 库 `habit_templates` / `template_habits` 已 DROP（Task 3 Step 3.3）
- [ ] DROP 顺序先 junction 再主表；SELECT count 守护输出
- [ ] Tier 2 文档（database-design / usom-design）+ manifest.md 同步
- [ ] 通用 `template_form` 机制、AI 生成模板（`templates.markdown.createHabit`）未被误删（红线核对）

---

## GSTACK REVIEW REPORT (/autoplan, 2026-06-30)

> 双声音：Codex **unavailable**（exit 127，wrapper 未载入）→ `[subagent-only]` + 主审独立对仓库实读核验。所有 CRITICAL/HIGH 已逐行核验，并剔除子代理 2 处偏差。

### 审查范围（scope 检测）
- **UI scope**：关键词命中（component×10 / form×6 / page×3）但**语义为删除**（删组件/页面，非新增 UI）→ Design 维度 **N/A**（已检视：无新 UI 层级 / 交互状态 / 空态 loading error 可设计）。
- **DX scope**：关键词命中（import×23 / action×15 / migration×9）但**语义为删除**（删 action / 加 DROP 迁移，非新增开发者面）→ DX 维度 **N/A**（已检视：无新 API/CLI/错误信息面）。
- **CEO**：前提「templates 已被 timebox-templates 取代」上游已定（父 spec + brainstorm + memory [023]）；范围 sanity 通过；无战略替代被错杀。
- **Eng**：全深度，主审逐符号核验 + 子代理独立审查。

### ENG 双声音共识表（subagent + 主审核验）
| 维度 | 子代理 | 主审核验 | 共识 |
|---|---|---|---|
| 爆炸半径完整？ | 否（C1 timebox manifest） | 否（C1 + M1 + grep 范围 + M4 docs） | DISAGREE → 已补全 |
| T1/T2 tsc 边界成立？ | 是（逐符号追踪） | 是（独立复核） | CONFIRMED |
| 迁移安全？ | 顺序对、依据错（H1） | 同意 H1 | CONFIRMED（顺序）+ 修正依据 |
| scheduling-handler 重构？ | 逻辑成立 | 成立 | CONFIRMED |
| 红线 keep-list 正确？ | 全部无关、保留对 | 全部核对一致 | CONFIRMED |
| 测试覆盖？ | 重写偏弱（M3） | 同意 M3 | 已加强 |

### 子代理偏差（主审剔除 / 纠正）
- 子代理称路径 `src/scripts/validate-domain-structure.ts` → 实际 `frontend/scripts/`（在 src 外）。**M1 本身真实**（T2 删 repo 后 test import 断裂），但「grep 会 fail」机制误判（scripts 不在 src grep 范围）。主审重定位为 test import 断裂。
- 子代理 M4 docs 残留 → 主审首次正则 grep 漏报（`.?` 交替 bug），literal 复核确认 **M4 真实**（route-generation-spec / UI-REDESIGN / usom-design / domain-development-guide）。

### 决策审计（auto-decided，6 principles）
| # | 发现 | 级别 | 决策 | 原则 | 落实 |
|---|---|---|---|---|---|
| 1 | C1 timebox/manifest.yaml `habitTemplates` query 漏删 | CRITICAL | 补 T1 Step 1.11(e) | P2 boil lakes | ✓ plan |
| 2 | M1 scripts/validate-domain-structure 例外+test 漏清 | HIGH | 补 T2 Step 2.1b | P2 | ✓ plan |
| 3 | grep 误命中 migrations/0002 + 0027 | HIGH | Step 2.6 + 约束加 `--exclude-dir=migrations` | P5 explicit | ✓ plan |
| 4 | M4 docs 同步过窄（仅 usom-design） | MEDIUM | Step 3.5 扩 route-generation-spec/UI-REDESIGN/domain-development-guide | P1 完整 | ✓ plan |
| 5 | H1 DROP 依据错（habit_id RESTRICT） | HIGH | spec §4.3 + R4 纠正为 template_id FK | P5 | ✓ spec |
| 6 | H2 journal 拼接风险 | MEDIUM | Step 3.2 加「确认 idx=28 末位 + JSON 合法性」 | P5 | ✓ plan |
| 7 | M3 sort 测试 if-guard 偏弱 | LOW | Step 1.13 改直接断言 | P1 | ✓ plan |

### 架构图（删除依赖序）
```
T1 删消费者（生产者仍存在但无引用 → tsc 绿）
  UI/page/hooks ─┐
  5 barrels ─────┤
  intent.ts 块(1028-1166) ┤
  rules-registry(4 校验) ┤
  scheduling-handler + timebox/manifest.yaml(C1) ─┤  ← manifest↔handler 必须同任务
  checkReferences 链(habit.ts / irepository 字段 / HabitListPage / orchestrator mock)
  register-providers(全清) + habits/manifest + action-view + 3 测试

T2 删生产者+类型+schema（消费者已去 → grep 零残留）
  habit-template.ts repo + habit-templates-provider.ts(删文件)
   → USOM objects(HabitTemplate/TemplateHabitItem)
   → irepository(IHabitTemplateRepository + Create/Update/TemplateHabitOverrides)
   → mappers + schema(两表) + repositories/index
   → scripts/validate-domain-structure 例外+test(M1)  ← test import 依赖 repo，须同任务

T3 DROP 迁移
  0027 SQL(template_habits 先 → habit_templates 后) + journal idx=29 + docs(全) + manifest.md
```

### 测试图（codepath → 覆盖）
| codepath / 分支 | 覆盖 | 说明 |
|---|---|---|
| scheduling 排序（habit<task，无 planned） | Step 1.13 重写 | planned 源已删，断言 habit<task |
| habit 归档守卫（无模板关联） | HabitListPage 现有测试 | templateHabits 字段移除 + 文案改 |
| orchestrator applyTemplate | Step 1.14 删 describe.skip 块 | 死代码随类型删 |
| domain validate template actions | Step 1.12 删 describe 块 | 规则随 rules-registry 删 |
| tsc 编译（T1/T2 各绿） | Step 1.15 / 2.6 base=head | 零新增 |
| 零残留 | Step 2.6 grep `--exclude-dir=migrations` | 排除历史 CREATE + 新 DROP |

### Failure Modes Registry
| 模式 | 级别 | 缓解 |
|---|---|---|
| timebox manifest 残留死 query → /smartSchedule 运行时错 | CRITICAL | C1 已补 T1 |
| validate-domain test import 断裂 → vitest 红 | HIGH | M1 已补 T2 |
| DROP 主表先于 junction → FK 阻断 | HIGH | SQL 顺序固定 + H1 依据纠正 |
| grep 误报 migrations → 阻塞 gate | MEDIUM | `--exclude-dir=migrations` |
| prod 存量 template 行 | LOW | SELECT count 守护 + prod 人工确认 |

### 结论
**APPROVED with fixes applied.** 7 项发现（1 CRITICAL / 3 HIGH / 3 LOW-MED）已全部折入 plan（C1/M1/M3/M4/H2）+ spec（H1）。核心结构（爆炸半径、T1/T2 tsc 边界、红线 keep-list、迁移顺序、scheduling 重构）经子代理 + 主审双路径核验稳健。Codex 不可用，共识为 subagent + 主审双核验。
