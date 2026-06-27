<!--
@file OKR 工作台改进设计
@brief 周期管理重构（左侧目录周期-目标二级树）+ KR 信心字段 + 样式统一 + habits 卡片交互
-->

# OKR 工作台改进设计

- **日期**：2026-06-27
- **分支**：`feat/024-okr-improvements`（基于 `main@622c5f9`）
- **状态**：待用户 review
- **关联**：承接 [022] OKR Domain 重组（Cycle 已为一等公民）

---

## 1. 背景与问题

[022] 把 Cycle 提升为独立表 + 状态机的一等公民，但 OKR 工作台 UI 未跟进，暴露出四类问题：

1. **周期管理入口位置错误**：创建/编辑周期的唯一入口嵌在 `OKRForm`（目标创建/编辑表单）第 7 个字段，夹在"定义目标"和"填 KR"之间，打断"定义一个目标"的心智流。无周期时（`cyclesEmpty`）内联新建周期表单**强制默认展开**，把目标表单撑得很长——用户在"建目标"中途被迫去做"周期管理"这件另一层级的事。
2. **左侧目录的周期不是真实实体**：`OKRDirectory` 用 `getPeriodGroupKey(obj.period.start)` 派生出 `26Q2` 这样的分组头，**不是真实的 Cycle 记录**，无法删除、无法在周期下直接添加目标。
3. **KR 缺"信心"字段**：约翰·杜尔 OKR 体系里 KR 的 confidence（达成信心度）是标准概念，当前 `key_results` 表 / `KeyResult` 类型 / mapper 都没有此字段，无法记录与回顾信心变化。
4. **样式与交互粗糙**：KR 卡片、habits 卡片边框偏深；habits 卡片无 hover 反馈、编辑需点小按钮；左侧目录内容多时撑开整页、无独立滚动。

## 2. 目标 / 非目标

### 目标

- **G1 周期管理重构**：左侧目录改为「周期 → 目标」二级树，周期成为可操作节点；"新建周期"移至右侧抽屉；`OKRForm` 移除周期字段，"添加目标"从周期上下文带预设 `cycleId` 进入表单。
- **G2 KR 信心字段**：新增 `confidence`（0~100 整数百分比，默认 50），显示 + 编辑。
- **G3 样式统一**：左侧目录独立滚动 + 细滚动条；KR / habits 卡片浅色边框。
- **G4 habits 交互**：卡片单击进入编辑（移除显式"编辑"按钮）；hover 颜色变深；卡片底色更浅。

### 非目标（YAGNI）

- 周期的独立管理页（周期列表 / 编辑 / 归档视图）—— 本轮不做，本轮周期仅有"创建"与"删除（仅空周期）"。
- 周期排序 / 拖拽、周期详情页。
- KR 信心历史趋势记录（只存当前值，不记快照）。
- 不改 `Card` 组件本体（避免全局影响），所有边框/底色调整走局部 className 覆盖。

## 3. 设计

### 3.1 周期管理重构（G1）

#### 3.1.1 左侧目录 `OKRDirectory` 重构

- **数据源**：`objectives[]` → `cycles[] + objectives[]`，按 `cycleId` 把目标挂到对应周期下；**废弃 `getPeriodGroupKey` 派生分组**。
- **顶部 CTA**：`+新建` → **`+OKR周期`**（不再有顶层"新建目标"，新建目标只能从周期上下文进入）。
- **周期节点**：显示周期名（如 `2026 Q3`）+ 周期内目标数；hover 出 `⋯` 菜单 → `[添加目标]` `[删除周期]`。
- **目标节点**：单击 → 右侧详情；hover 出 `⋯` 菜单，**按状态动态生成**：
  - `draft` → `[废弃]`
  - `active` → `[暂停][完成][废弃]`
  - `paused` → `[恢复][废弃]`
  - `completed` / `discarded` → `[归档]`
  - （激活仍保留在右侧详情面板的主按钮，菜单是快捷操作补充）
- **空周期（无目标）也显示**（刚创建还没加目标的周期）。
- **新增 props**：`onCreateCycleClick`、`onAddObjectiveToCycle(cycleId)`、`onDeleteCycle(cycleId)`、`onChangeObjectiveStatus(id, action)`；移除不再需要的 `onCreate`（新建目标）。
- **状态筛选**：`[全部][草稿][进行中]...` 仍作用于**目标层**（周期节点始终显示，仅过滤其下目标）。

#### 3.1.2 `OKRWorkspace` 编排

- 新增 state：`cycleDrawerOpen`、`selectedCycleId`。
- 新增 **`CycleCreateDrawer`**（shadcn `Sheet side="right"`）—— 把新建周期表单从 `OKRForm` 内联迁出，独立成右侧抽屉组件。字段沿用原内联表单：周期类型 / 名称 / 起止日期。
- `+OKR周期` → 开抽屉 → 提交 `hook.createCycle` → 刷新 cycles → 自动展开新建的周期节点。
- 「添加目标」→ `setSelectedCycleId(cycleId)` + `mode=create` → `OKRPanel` create 模式渲染 `OKRForm(presetCycleId)`。
- 「删除周期」→ 确认框 → `hook.deleteCycle`（**有目标的周期前端先禁用菜单项**，后端兜底校验）。

#### 3.1.3 `OKRForm` 精简

- **移除**：周期选择器、`+新建周期` 按钮、内联新建周期表单、`cycles / onCreateCycle / isLoadingCycles` 四态逻辑（约 70 行）。
- **新增**：可选 `presetCycleId` prop，有值则不渲染任何周期字段。
- **保留**：标题 / 描述 / 类型 / 重要程度 / 快速模板 / KR（含新增的信心输入）/ 手动·AI 导入。

#### 3.1.4 `OKRPanel` 小改

- create 模式透传 `presetCycleId` 给 `OKRForm`。

### 3.2 KR 信心字段（G2）

#### 3.2.1 Schema migration `0021`

- `ALTER TABLE key_results ADD COLUMN confidence integer NOT NULL DEFAULT 50;`
- `CHECK (confidence BETWEEN 0 AND 100)`。
- **手写 SQL + psql + 登记 journal**（项目约定：`drizzle-kit migrate` 因 snapshot 债跑不通，迁移一律手写；DB = `lifeware_dev@localhost:5432`）。

#### 3.2.2 USOM + repo

- `KeyResult` 接口（`usom/types/objects.ts`）加 `confidence: number`。
- `KeyResultRepository` mapper 双向映射 `confidence` ↔ `confidence` 列。
- `seed-dev.ts` 的 KR 数据补 `confidence`。

#### 3.2.3 UI

- **`KRProgress`**：进度条下方新增"信心 X%"行 —— 一个迷你色条 + 百分比数字；点击 inline 编辑（复用现有 `isEditing` 模式，0~100 数字输入，Enter 确认），走新增的 `onConfidenceUpdate(krId, value)` 回调。
- **`OKRForm` KR 行**：每个 KR 增加可选信心输入（留空 = 50），与标题/目标值/单位同行。
- **manifest field_metadata**：`confidence: { type: number, mutation_mode: FactField }`。

### 3.3 样式统一（G3）

- **左侧目录独立滚动**：`OKRWorkspace` 左侧容器补 `min-h-0`（flex 子项缺它则 `overflow-y-auto` 不生效，内容多时撑开整页）；加自定义细滚动条样式（`scrollbar-thin` + 浅色 `webkit-scrollbar`，令牌色）。
- **KR 浅色边框**：`OKRPanel` 中 KR 的 `<Card>` 局部 className 加 `border-hairline`（**不改 `Card` 本体**）。

### 3.4 habits 卡片交互（G4）

- **`HabitCard` 局部样式**：`border-hairline` + 底色降浅（`bg-card` → `bg-canvas` 或 `bg-muted/20`）+ `hover:bg-muted/50 transition-colors` + `cursor-pointer`。
- **单击进入编辑**：整卡 `onClick={onEdit}`；**移除显式"编辑"按钮**（编辑入口完全由整卡单击承担）。
- **按钮隔离**：卡片内其他按钮（打卡 / 暂停 / 恢复 / 删除 / 归档等）加 `onClick` `stopPropagation`，点按钮不触发整卡编辑。
- **批量选择冲突处理**：`selectable` 模式下，整卡 `onClick` 改为 `onSelectToggle`（选中而非编辑），避免与"单击编辑"冲突；复选框行为不变。

## 4. 数据流

- **周期渲染**：`useOKRs.cycles` → `OKRDirectory` 周期节点；`useOKRs.objectives` 按 `cycleId` 挂载。
- **新建周期**：`CycleCreateDrawer` → `hook.createCycle` → server action `createCycle`（已有）→ 刷新 cycles。
- **删除周期**：新增 `hook.deleteCycle` → 新增 server action `deleteCycle`（校验周期下 objectives 为空 → 硬删；否则返回结构化错误）。
- **添加目标**：周期 `⋯` → `OKRForm(presetCycleId)` → `handleSaveCreate` 带 `cycleId` → `hook.create`。
- **目标状态变更**：目标 `⋯` → 复用现有 `hook.changeStatus` / `hook.activate`。
- **信心更新**：`KRProgress` inline 编辑 → 新增 `hook.updateKRConfidence` → server action（走 mutation-service / orchestrator，与其他 KR 字段写入口一致）。

## 5. 错误处理

- **删除有目标的周期**：`OKRDirectory` 周期 `⋯` 菜单"删除周期"在目标数 > 0 时禁用 + tooltip「请先处理周期内目标」；后端 `deleteCycle` 再校验兜底，返回错误。
- **周期列表为空**：目录空状态文案改为「点击 [+OKR周期] 创建第一个周期」（替代原"暂无 OKR"）。
- **信心越界**：DB `CHECK (0~100)` 约束 + 前端输入 `min=0 max=100` 双重限制。
- **目标菜单非法状态**：菜单项按状态渲染，非法项不出现（前端约束）；后端 transitions 兜底。
- **habits 单击 vs 批量选择**：`selectable` 优先，单击=选中，不触发编辑。

## 6. 数据库迁移

- `frontend/src/lib/db/migrations/0021_add_key_results_confidence.sql`（手写 SQL）。
- 登记 `_journal.json` + 补 drizzle `__drizzle_migrations` hash（沿用 [022] 的手动登记约定）。
- 在 `lifeware_dev` 跑 `psql` 验证。

## 7. 文档同步（Tier2 强制）

变更前先更新 `docs/`，再改代码：

- `docs/database-design.md`：`key_results` 表补 `confidence` 字段说明。
- `frontend/src/domains/okrs/manifest.yaml` `field_metadata`：加 `confidence`。
- `docs/` 下若存在 KR 字段表 / usom-design KR 字段清单，同步。

## 8. 测试

- **OKRDirectory**：周期-目标分组渲染、空周期显示、hover `⋯` 菜单出现、目标菜单项状态映射正确。
- **CycleCreateDrawer**：新建周期提交成功 / 失败提示。
- **删除周期**：空周期可删 / 有目标拒绝（前端禁用 + 后端校验各一）。
- **OKRForm**：`presetCycleId` 模式不渲染周期字段、提交带正确 cycleId、KR 信心输入（留空=50）。
- **KRProgress**：信心显示 + inline 编辑 + 越界拦截。
- **HabitCard**：单击进编辑、按钮 `stopPropagation`、hover 样式、批量选择模式优先选中。
- **回归**：现有 okrs 21 + habits 基线零新增失败；`tsc` 零新增错误。
- **/browse E2E**（真实 PG）：新建周期 → 添加目标 → 目标 `⋯` 菜单 → KR 信心编辑 → 删除空周期 → habits 单击编辑。

## 9. 验收标准

1. 目标创建/编辑表单不再出现周期字段；新建周期走右侧抽屉。
2. 左侧目录为「周期 → 目标」二级树；周期节点可"添加目标""删除周期"（仅空周期可删）；目标节点 `⋯` 菜单按状态动态。
3. KR 卡片显示并可 inline 编辑信心（0~100%）；新建 KR 时信心选填（默认 50%）。
4. 左侧目录独立滚动 + 细滚动条；KR / habits 卡片浅色边框。
5. habits 卡片 hover 颜色变深、底色更浅、单击进入编辑（无编辑按钮）；批量选择模式下单击=选中。
6. migration `0021` 在 `lifeware_dev` 跑通；`docs/database-design.md` + manifest 同步。
7. 所有单元/集成测试绿；`tsc` 零新增错误。
