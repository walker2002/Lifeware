# [023] A3 Design — Tasks/Habits 接入 Activity Archetype + 删 energyProfile + habitsTemplates 硬删

> **父 design doc**：`~/.gstack/projects/walker2002-lifeware/walker-feat-023-timebox-domain-reorg-design-20260627-174227.md`（[023] 整体）
> **父 plan**：`docs/superpowers/plans/2026-06-28-023-timebox-domain-reorg.md`（A3 大纲 §A3，第 1096-1119 行）
> **前置**：A0（EnergyCurve/EnergyStateManager/timebox rules-registry）+ A1（USOM Activity Archetype + activity_archetypes 表 + Repository + 配置页）+ A2（Timebox 域重写 + archetype 外键 + ArchetypePicker 范式）均已 ff-merge main。
> **本 spec 范围**：仅 A3。A4（Timebox↔KR junction）不在本 spec。

---

## 1. Problem Statement

tasks 域仍使用旧的 `energyProfile` 5 值 enum（`light/deep/admin/creative/reactive`），仅以只读图标呈现（`task-edit-zone.tsx` ENERGY_ICONS）、无选择器、与 A1 落地的 Activity Archetype 体系完全割裂；habits 域则没有任何能量语义。同时，habitsTemplates 模板功能已被 A2 的 `/timebox-templates`（7 段生存时间 + pull 订阅）取代——用户 023 文档明确「取消原 habitsTemplates 的模板功能，habits 不应单独设置模板」「参照类似 habitsTemplates 的功能开发 timeboxTemplates 界面」。

A3 的使命：
1. 把 tasks/habits 接入 Activity Archetype（统一能量语义本体）。
2. 删除 tasks.energyProfile（D11 B→C 破坏性迁移）。
3. 硬删 habitsTemplates（页面 + 表 + 全部引用）。

---

## 2. 范围与边界

### 2.1 IN（拆 3 子阶段，各自独立 ship）

| 子阶段 | 内容 | UI | 破坏性 |
|--------|------|----|--------|
| **A3.1** | DB 迁移 + 字段 + 类型/接口/mapper 清理 | 无 | 是（删 energyProfile） |
| **A3.2** | tasks/habits CNUI 表单接入 Archetype 选择器 + 详情只读 + manifest | 有 | 否 |
| **A3.3** | habitsTemplates 硬删（组件 + repository + provider + 表） | 删除页 | 是（DROP 表） |

### 2.2 OUT（明确不在 A3）

- 不接 `applyEvent` 能量自动扣减（D9/OQ-6，对齐 A0/A2；archetypeId 存为对象自身字段，走正常 mutation）。
- 不修 lifecycle-configs `require` 债（N-5，记忆已记录 defer neat；archetype 是 ContentField 不走 lifecycle SM，加字段不受阻）。
- 不做时间盒/任务冲突校验（023 文档留后续迭代）。
- 不动 OKR/Task 边界、KR junction（A4 独立线 / [025] 独立线）。
- 不改 EnergyState/EnergyCurve/EnergyStateManager（A0 已定）。
- 不新增 archetype seed 数据（复用 A1 已 ship 的 seed；D4 接受 admin+light 合并到「日常事务」）。

---

## 3. 关键架构决策（已锁定）

- **D1 — 拆 3 子阶段独立 ship**：A3.1 → A3.2 → A3.3，每段独立 review + ship，blast radius 隔离，对齐 A2（A2.1~A2.9）模式。任一子阶段失败不阻塞其余。
- **D2 — habits 纯加字段，无删除**：调研确认 habits 域从未有 energyProfile 字段（schema/mapper/UI 均无）。父 plan §A3「habits 表删 energyProfile」的表述修正为「habits 仅加 `activityArchetypeId`」。
- **D3 — archetype = ContentField + optional + 不进 onValidate**：对齐 timebox C-5。manifest `field_metadata.activityArchetypeId` 声明 `mutation_mode: ContentField`，直走 `Repository.updateFields`（单条 UPDATE，不发业务事件），nullable，不进 rules-registry submit 校验。
- **D4 — light→日常事务 / reactive→响应式工作**：修正父 plan 的 light→响应式。完整映射表：

  | energyProfile | → archetype（l1=工作, l2Name） | 依据 |
  |---------------|-------------------------------|------|
  | `deep` | 深度专注 | mental=9，深度工作 |
  | `creative` | 方案设计 | creative=9 |
  | `admin` | 日常事务 | mental=4，行政琐事 |
  | `light` | 日常事务 | mental=4，轻度低能耗（seed 无独立「轻度工作」，合并到日常事务） |
  | `reactive` | 响应式工作 | 响应式 |

- **D5 — 分两次迁移**：M1 加 `activityArchetypeId`（nullable FK）+ backfill；M2 验证命中率后删 `energyProfile` 列 + `idx_tasks_user_energy` 索引。删列前留观测窗口，可回滚。
- **D6 — lifecycle require 债 defer**：`resolveObjectType:120` / `getTransitionFromManifest:170` 仍 `require('@/...')`（[018] 横切债），但 archetype 是 ContentField 不走 lifecycle SM，加字段本身不受阻。A3 不扩 scope。
- **D7 — ArchetypePicker + EnergyCostAccordion 公共化**：A2 落地于 `domains/timebox/components/archetype-picker.tsx` + `energy-cost-accordion.tsx`。A3.2 将两者提到跨域共享位置 `src/components/archetype/`，timebox 改 import 指向共享，tasks/habits 复用。理由：避免 tasks/habits 跨域 import timebox（破坏域隔离），同时消除三域重复。
- **D8 — backfill 按 `(userId, l1_category='工作', l2_name)` 子查询**：archetype 是 per-user（`activity_archetypes.user_id` FK）且 seed 无 slug/id 常量（id 运行时 `defaultRandom()`），必须运行时按 userId + name 匹配查 id。
- **D9 — taskComplete/habitLogged 不扣减 EnergyState**：对齐 A0/A2 D9/OQ-6。完成事件存 `activityArchetypeId` 走正常 mutation，不触发 `applyEvent`（applyEvent 签名仍预留不接线）。
- **D10 — ArchetypePicker 公共化拆两层 + 接入决议（A3.2 brainstorm 锁定 2026-06-30）**：(1) 拆 `ArchetypePicker`（裸版，CUC-01/02 合规，+`readOnly`）+ `ArchetypePickerCard`（带盒，timebox Drawer 零回归），用组件而非 props variant 表达视觉分叉；(2) habits 接 `HabitForm` 一处——HabitForm 是创建+编辑共用表单（被 `HabitListPage` + `habit-list` + CNUI `HabitCreationCard` 三处复用），一次接入覆盖全场景；(3) Thread（主线）不接 archetype（组织容器无活动语义）；(4) habits 习惯级只读展示用 `habit-card` 小标签（轻量，方案 A），tasks 用 `TaskDetailDrawer` 的 readOnly 裸版。

---

## 4. 数据流

### 4.1 A3.1 迁移流（M1 → 观测 → M2）

```
M1 迁移（加列 + backfill，单文件）
  ├─ ALTER TABLE tasks  ADD COLUMN activity_archetype_id uuid REFERENCES activity_archetypes(id) ON DELETE SET NULL;
  ├─ ALTER TABLE habits ADD COLUMN activity_archetype_id uuid REFERENCES activity_archetypes(id) ON DELETE SET NULL;
  └─ UPDATE tasks t SET activity_archetype_id = (
       SELECT a.id FROM activity_archetypes a
       WHERE a.user_id = t.user_id AND a.l1_category='工作' AND a.l2_name =
         CASE t.energy_profile
           WHEN 'deep'     THEN '深度专注'
           WHEN 'creative' THEN '方案设计'
           WHEN 'admin'    THEN '日常事务'
           WHEN 'light'    THEN '日常事务'
           WHEN 'reactive' THEN '响应式工作' END
     ) WHERE t.energy_profile IS NOT NULL;
         ↓
观测窗口（基线验证）
  └─ SELECT count(*) FROM tasks WHERE energy_profile IS NOT NULL AND activity_archetype_id IS NULL;
     （命中率核对；预期仅当用户缺 seed 时为非零，archetype optional 可接受）
         ↓
M2 迁移（删 energyProfile，单文件）
  ├─ DROP INDEX IF EXISTS idx_tasks_user_energy;
  └─ ALTER TABLE tasks DROP COLUMN energy_profile;
```

### 4.2 写路径（A3.2，对齐 [025] 范式 + A2）

```
用户在 CNUI 表单选 Archetype
  → ArchetypePicker.onChange(archetypeId)
  → surface handleConfirm 组装 fields { activityArchetypeId }
  → server action（判别联合透传 NeedConfirm）
  → Orchestrator → timebox/hooks onValidate（rules-registry，archetype 不进校验）
  → updateTask / updateHabit 走 service.execute() 多步路径
  → field-executor（field-executor/index.ts:130-170）写库后会无条件 ctx.eventBus.publish(fieldUpdatedEventType)
    → 发出 TaskFieldUpdated / HabitFieldUpdated 事件（archetype=ContentField 当前仍发事件，不按 mutation_mode 分支）
  → PG tasks/habits.activity_archetype_id
```

> **D9 修正（C3，/autoplan CRITICAL，2026-06-30）**：D9 旧表述「ContentField 不发业务事件」与代码实际行为不一致。`nexus/field-executor/index.ts:130-170` `execute()` 写库后第 167 行无条件 `ctx.eventBus.publish(event)`，无 `mutation_mode` 分支；`updateTask`/`updateHabit` 走 `service.execute(...)`（多步 field-executor 路径），不走 `service.update()`（唯一尊重 `mutation_mode` 的路径）。archetype 编辑**会**发 `TaskFieldUpdated` / `HabitFieldUpdated` 事件。今日无 subscriber 反应（`EnergyStateManager.applyEvent` 预留未接线、[025] cascade 只订阅状态转换），故无功能影响。
>
> **D9 当前状态**：ContentField 的事件 leak 是已知引擎债，引擎层按 `mutation_mode` 分支（C3-(A)）defer 到独立线（关联 [018] 横切债），不在 A3.2 scope。ArchetypePicker 事件无下游副作用（subscriber 应忽略 archetype 事件）。

### 4.3 删除流（A3.3）

```
DROP 顺序（先 junction 再主表，规避 RESTRICT）
  ├─ DROP TABLE IF EXISTS template_habits;   -- 先 junction（habit_id ON DELETE RESTRICT）
  └─ DROP TABLE IF EXISTS habit_templates;
SELECT count 守护：DROP 前确认两张表 row count（无 seed，预期 0 或仅用户自建）
```

---

## 5. UI 设计

> archetype 选择器 UI 范式 A2 已过 design-review 并 ship。A3.2 复用，不重新设计；仅记录接入点与公共化。

- **视觉令牌**：CSS 变量（`bg-canvas`/`text-ink`/`bg-surface-card`/`border-hairline` 等），禁 Tailwind 默认颜色类（UI-DESIGN-SPEC）。
- **ArchetypePicker（公共化后，拆两层 — D10）**：
  - `src/components/archetype/archetype-picker.tsx` **裸版**：去掉自带 `bg-surface-card p-5` 盒与 `<h3>` 静态标题（守 CUC-01/02），改为 `text-xs text-body` 行内 label + 「更换/选择」按钮；新增 `readOnly?: boolean`（详情复用：隐藏按钮，只展示选中态 + 只读 4 维）。props `{ value?: string; onChange?: (id, archetype?) => void; readOnly?: boolean }`，数据源 `getArchetypes()` 不变。
  - `src/components/archetype/archetype-picker-card.tsx` **带盒版**：`bg-surface-card p-5` 包裸版 + `<h3>活动原型</h3>`，给 timebox Drawer 用（零回归）。
- **接入点（A3.2）**：
  - tasks：`TaskCreationCard.tsx` + `TaskEditCard.tsx` 嵌裸版 `<ArchetypePicker/>`；`handleConfirm`/`handleSave` payload 加 `activityArchetypeId`。
  - habits：`habit-form.tsx` 嵌裸版 —— **一处接入**，HabitForm 创建+编辑共用（覆盖 `HabitListPage` 页面 + `habit-list` + CNUI `HabitCreationCard`）。
  - **不接**：`Thread*`（主线容器无活动语义）、`Task/HabitActionPanel`（状态操作）、`TaskTreeView`。
- **详情只读**：
  - tasks：`TaskDetailDrawer` 追加 `<ArchetypePicker readOnly/>`（l2Name + L1 标签 + 4 维只读）。
  - habits：`habit-card.tsx` 列表卡加 archetype 小标签（轻量，D10 方案 A）。
  - optional 语义：未选时「未选择（可选）」，不阻塞提交（D3）。
- **M1 显式声明（A3.2 /autoplan 决议，2026-06-30）**：tasks 详情抽屉 archetype **只读、不可就地编辑**——修改走 CNUI `TaskEditCard` 或 `/tasks` 列表内联编辑。这是**有意产品决策**（非实现疏漏）：详情可见不可改对齐 spec §5「详情只读」语义；TaskDetailDrawer 不提供「更换」按钮，避免 readOnly 死胡同。其他字段（title/description/priority/energyRequired 等）仍可在 TaskDetailDrawer 内 `TaskEditZone` 编辑（与 archetype 行为不一致是有意的）。
- **a11y / 响应式**：遵循 UI-DESIGN-SPEC §11.10（CUC-01~CUC-12）+ §14；A3.2 阶段 /browse 验证。

---

## 6. 子阶段 task 边界（writing-plans 展开 basis）

### A3.1 — DB 迁移 + 字段 + 类型清理（无 UI）

**File Structure**:
- Create: `frontend/src/lib/db/migrations/00XX_a3_m1_add_activity_archetype_id.sql`（tasks + habits 加列 + backfill）
- Create: `frontend/src/lib/db/migrations/00XX_a3_m2_drop_energy_profile.sql`（DROP INDEX + DROP COLUMN）
- Modify: `frontend/src/lib/db/schema.ts`（tasks + habits 加 `activityArchetypeId` FK；tasks 删 `energyProfile` 列 + `idx_tasks_user_energy`）
- Modify: `frontend/src/lib/db/repositories/mappers.ts`（TaskRow/HabitRow + 双向映射加 activityArchetypeId；删 energyProfile :106/:141）
- Modify: `frontend/src/usom/types/primitives.ts:328`（删 `type EnergyProfile`）
- Modify: `frontend/src/usom/types/objects.ts`（Task/Habit interface 加 `activityArchetypeId?: USOM_ID`）
- Modify: `frontend/src/usom/interfaces/irepository.ts`（CreateTaskInput:131/TaskFilters:97 删 energyProfile；CreateHabitInput 加 activityArchetypeId）
- Modify: `frontend/src/domains/tasks/repository/task.ts:283,319`（删 energyProfile，加 activityArchetypeId）
- Modify: `frontend/src/domains/habits/repository/*`（加 activityArchetypeId 读写）
- Modify: `frontend/src/domains/tasks/components/task-edit-zone.tsx:39-45,277`（删 ENERGY_ICONS + 渲染；UI 接入留 A3.2，本阶段先删旧图标）
- 登记：`migrations/_journal.json`（两条）

**Task 边界（3）**：
1. M1 迁移 + schema/mapper/USOM/irepository 加 activityArchetypeId（tasks+habits）+ backfill SQL + journal
2. backfill 命中率验证 + tsc/vitest 基线 + commit M1
3. M2 迁移删 energyProfile（schema/mapper/type/UI ENERGY_ICONS/TaskFilters 全清）+ grep 零残留 + 基线

### A3.2 — CNUI 接入 + 详情只读

**File Structure**:
- Move+Split: `domains/timebox/components/archetype-picker.tsx` → `src/components/archetype/archetype-picker.tsx`（裸版，去盒去标题，+`readOnly`）+ 新建 `src/components/archetype/archetype-picker-card.tsx`（带盒，包裸版）
- Move: `domains/timebox/components/energy-cost-accordion.tsx` → `src/components/archetype/energy-cost-accordion.tsx`
- Modify: `domains/timebox/components/timebox-drawer.tsx`（及 timebox 其他引用方）改 import 指向 `@/components/archetype`，用 `ArchetypePickerCard`（零回归）
- Modify: `domains/tasks/cnui/surfaces/TaskCreationCard.tsx` + `TaskEditCard.tsx`（嵌裸版 `<ArchetypePicker/>`，payload 加 `activityArchetypeId`）
- Modify: `domains/habits/components/habit-form.tsx`（嵌裸版，一处覆盖创建+编辑）
- Modify: `domains/tasks/components/task-detail-drawer.tsx`（`<ArchetypePicker readOnly/>` 只读行）+ `domains/habits/components/habit-card.tsx`（archetype 小标签）
- Modify: `domains/tasks/manifest.yaml` + `domains/habits/manifest.yaml`（field_metadata.activityArchetypeId = ContentField）
- Modify: `docs/usom-design.md` + `docs/database-design.md`（Tier 2，archetype 接入 tasks/habits UI 层）+ `manifest.md`

**Task 边界（3）**：
1. ArchetypePicker 拆两层公共化（D10）+ EnergyCostAccordion 迁移 + timebox 改 import（ArchetypePickerCard）+ timebox 回归（测试 + /browse）
2. tasks/habits 表单接入（TaskCreationCard/TaskEditCard/habit-form 嵌裸版）+ 两域 manifest field_metadata
3. 详情只读展示（TaskDetailDrawer readOnly + habit-card 小标签）+ /browse 视觉验证（§11.10 CUC-01~12 / §14）

### A3.3 — habitsTemplates 硬删

> **Scope 修正（2026-06-30 brainstorm）**：A3.1/A3.2 ship 后复核发现本节原 File Structure 删除清单不全（漏 intent.ts / use-templates / USOM 类型 / mappers / barrels / register-providers / action-view / scheduling-handler）。按 §8.4 #4「引用全删」+ 项目零残留纪律，下列为定稿全量爆炸半径。scheduling-handler 跨域死分支经决议**纳入 A3.3 一并清掉**（不 defer，见 R6）。

**File Structure**：

*Delete 文件（9）*
- Delete: `app/habits/templates/page.tsx`
- Delete: `domains/habits/pages/HabitTemplatePage.tsx`
- Delete: `domains/habits/components/habit-template-{manager,form,card,view}.tsx`（4 文件）
- Delete: `domains/habits/repository/habit-template.ts`
- Delete: `domains/habits/providers/habit-templates-provider.ts`
- Delete: `hooks/use-templates.ts`（spec 原漏）

*Delete 引用（spec 原漏；叶子先行，保持 tsc 绿）*
- Modify: `app/actions/intent.ts` — template CRUD action handlers（getTemplateRepo/addHabit/removeHabit/createTemplate/applyTemplate 等约 53 处）
- Modify: `components/views/action-view.tsx` — `view_templates` 路由 + import
- Modify: `domains/timebox/handlers/scheduling-handler.ts` — `habitTemplates` context 消费分支（import / 派生 planned habits / 去重）**【跨域，A3.3 内清】**
- Modify: `domains/habits/pages/HabitListPage.tsx:188-192` — references.templateHabits 计数 + 文案
- Modify: `nexus/context-engine/register-providers.ts` — TemplateArraySchema / habitTemplateRepo dep / habitTemplates capability 注册
- Modify: `lib/db/repositories/mappers.ts` — HabitTemplateRow / habitTemplateRowToUSOM / habitTemplateUSOMToRow
- Modify: `lib/db/repositories/index.ts` + 4 个 habits barrel（index/components/providers/repository）的 template re-export
- Modify: `usom/types/objects.ts` — HabitTemplate / TemplateHabitItem
- Modify: `usom/interfaces/irepository.ts` — IHabitTemplateRepository / CreateTemplateInput / UpdateTemplateInput / TemplateHabitOverrides / references.templateHabits
- Modify: `domains/habits/manifest.yaml` — view_templates action / view_routes.view_templates / generation_actions.createHabit.contexts.habitTemplates
- Modify: 测试 mock — `habits/__tests__/habit-domain.test.ts` + `nexus/orchestrator/__tests__/orchestrator.test.ts` + `timebox/__tests__/scheduling-handler.test.ts`

*schema + 迁移*
- Modify: `lib/db/schema.ts`（删 habitTemplates :356 + templateHabits :374 表定义 + idx_habit_templates_user_status）
- Create: `migrations/0027_a3_m3_drop_habit_templates.sql`（先 DROP template_habits 再 habit_templates，§4.3/R4；DROP 前 SELECT count 守护）
- 登记: `migrations/meta/_journal.json` idx=29（**非** `migrations/_journal.json`——Drizzle 手写迁移 journal 在 `meta/` 下）
- Modify: `docs/database-design.md`（DROP 两表条目）+ `manifest.md`

**Task 边界（2）**：
1. 代码全删（叶子先行：consumers → components → provider/repo → barrels/register-providers/mappers → USOM 类型/接口 → manifest → schema 删表定义）+ 测试 mock 清 → `tsc --noEmit` 零新增 + `vitest` base/head 零新增 + `grep -rniE 'habit.?templates?|HabitTemplate|template_habits|TemplateHabit' src/` 零残留
2. DROP 迁移（0027 SQL SELECT count 守护 + 先 junction 再主表）+ journal idx=29 + dev DB 跑通 + docs 同步 + manifest 登记

---

## 7. 文档同步（Tier 2 强制， constitution）

- `docs/usom-design.md`：Activity Archetype 接入 tasks/habits（§IX 数据层先行：类型 + 字段 + mapper）。
- `docs/database-design.md`：tasks/habits 加 `activity_archetype_id` 列；删 `tasks.energy_profile` + `idx_tasks_user_energy`；DROP `habit_templates` + `template_habits`。
- `manifest.md`：版本历史登记（docs/ 变更同步）。

---

## 8. 验收标准

1. `tasks.activity_archetype_id` + `habits.activity_archetype_id` 外键就位（ON DELETE SET NULL）；5 种 energyProfile 全部按 D4 映射正确 backfill（命中率统计 SQL 输出）。
2. `energyProfile` 列/索引/`type EnergyProfile`/mapper/TaskFilters/CreateTaskInput/ENERGY_ICONS 全清，`grep -r energyProfile frontend/src` 零残留。
3. tasks/habits CNUI 表单可选 Archetype（ContentField），详情面板只读展示；走 Nexus 正常 mutation（不发业务事件）。
4. habitsTemplates 页面/表/引用全删；DROP 前 `SELECT count` 守护通过；DROP 顺序先 junction 再主表。
5. ArchetypePicker + EnergyCostAccordion 三域复用（timebox/tasks/habits），timebox CNUI 测试 + /browse 零回归。
6. `cd frontend && npx vitest run` 全 PASS（base/head 失败集合对比，零新增）；`npx tsc --noEmit` 零新增错误；§IX 七层 checklist 过；A3.2 阶段 UI-DESIGN-SPEC §14 + §11.10（CUC-01~CUC-12）/browse 通过。
7. EnergyState 未被扣减（D9，符合预期）。

---

## 9. 风险与依赖

- **R1 backfill 漏映射**：用户缺 activity_archetypes seed 时，backfill 子查询返回 NULL → `activity_archetype_id` 为 NULL。可接受（archetype optional）。M1 后用命中率 SQL 核对。
- **R2 生产 seed 未跑**：backfill 依赖 `activity_archetypes` 已 `seedDefaults`。生产 M1 前必须确认（`prod.sh --migrate` 已跑通，A1 seed 应已落）。
- **R3 ArchetypePicker 公共化**：timebox import 路径变更（`@/domains/timebox/components/archetype-picker` → `@/components/archetype/archetype-picker`），需回归 timebox 全部 CNUI 测试 + /schedule、/timebox-templates /browse。
- **R4 template_habits ON DELETE RESTRICT**：junction 的 `habit_id` 是 RESTRICT。DROP 须先 junction 再主表（§4.3）。若生产有存量 template_habits 行，DROP 前确认（SELECT count 守护）。
- **R5 父 plan 表述偏差**：父 plan §A3 称「habits 删 energyProfile」，实际 habits 从未有此字段（D2 修正）。writing-plans 以本 spec 为准。
- **R6 scheduling-handler 跨域回归（A3.3 brainstorm 决议，2026-06-30）**：scheduling-handler 原 consume `habitTemplates` context 派生 planned habits；清掉该分支触及 timebox 调度逻辑，须回归 `scheduling-handler.test.ts`，必要时 /browse `/schedule`。死分支清理**纳入 A3.3**（不 defer），以满足 §8.4 #4 零残留。
- **依赖**：A1（archetype 基础设施）+ A2（timebox 范式 + ArchetypePicker）已 ship main；[025] mutation 范式已 merge。

---

## 10. Self-Review（spec 自检）

1. **Placeholder 扫描**：无 TBD/TODO/"类似 Task N"；迁移 SQL、映射表、文件清单均具体。✓
2. **内部一致性**：D4 映射表 = §4.1 backfill CASE = §8.1 验收，三者一致；D2（habits 无 energyProfile）与 §6 A3.1 File Structure（habits 仅加列）一致；D7 公共化与 §5/§6 A3.2 一致。✓
3. **范围检查**：拆 3 子阶段，每子阶段单一 spec→plan→implement 周期可承载（A3.1 3 task / A3.2 3 task / A3.3 2 task）。本 spec 覆盖 A3 全部，writing-plans 可按子阶段拆 3 个 plan 或 1 个分节 plan。✓
4. **歧义检查**：D4 明确 admin+light 合并到「日常事务」（接受信息合并，非歧义）；D5 明确 M1/M2 顺序；§4.3 明确 DROP 顺序。✓
5. **范式对齐**：D3/D9 对齐 A2 C-5/OQ-6；写路径（§4.2）对齐 [025] mutation 范式 + A2。✓
