# Tasks: OKR 核心管理增强 (004-okr-core)

**Input**: Design documents from `specs/004-okr-core/`
**Prerequisites**: plan.md, spec.md, data-model.md, quickstart.md, research.md
**Base**: 004a-okr-core 基础实现已完成 (T001-T044)，本任务列表为追加增强 (T045+)

**Tests**: 本阶段以手工验证为主，状态机已有单元测试覆盖。
**Organization**: 按计划阶段 (A→B→C) 组织，每条任务映射到 spec.md User Story。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件，无未完成依赖）
- **[Story]**: US1=创建编辑, US2=生命周期, US3=KR进度, US4=双栏工作区, US5=关联
- 每个任务 5-15 分钟，包含 Given-When-Then 验收和文件路径

## Path Conventions

所有路径相对于 `frontend/src/` 除非特别标注。

---

## Phase 1: Bug 修复（阻塞后续开发）

**Purpose**: 修复 3 个已知 Bug，确保基础功能正确

**CRITICAL**: 所有后续 Phase 依赖本阶段完成

- [x] T045 [US4] 修复"全部"筛选 Bug — IObjectiveRepository 新增 findAll 签名
  - **Files**: `frontend/src/usom/interfaces/irepository.ts:138-147`
  - **Given** IObjectiveRepository 接口中仅有 findActive/findByStatus 等方法，**When** 在接口中新增 `findAll(userId: USOM_ID): Promise<Objective[]>` 方法签名，**Then** 接口编译通过，ObjectiveRepository 报缺少 findAll 实现的 TS 错误

- [x] T046 [US4] 实现 findAll — 查询所有 status != 'archived' 的 Objective
  - **Files**: `frontend/src/lib/db/repositories/objective.repository.ts`
  - **Given** IObjectiveRepository 新增了 findAll 方法，**When** 在 ObjectiveRepository 中实现 findAll：`WHERE user_id = ? AND status != 'archived'`，附带 keyResultIds 查询，**Then** `findAll(userId)` 返回所有非归档状态的 Objective 列表（draft/active/paused/completed/discarded）

- [x] T047 [US4] 修复 getObjectives 调用 — 无 status 参数时用 findAll 替代 findActive
  - **Files**: `frontend/src/app/actions/okr.ts:24-36`
  - **Given** `getObjectives()` 在无 status 时调用 `repo.findActive()`（仅返回 active），**When** 改为三元分支：有 status 调用 `repo.findByStatus(status, userId)`，无 status 调用 `repo.findAll(userId)`，**Then** `getObjectives()` 返回全部非归档 OKR（验证：调用后应包含 draft/active/paused/completed/discarded）

- [x] T048 [US1] 修复编辑草稿 OKR 时 KR 空白 — 补充 keyResults 到 initial prop
  - **Files**: `frontend/src/components/okr/okr-detail.tsx:105-121`
  - **Given** 编辑模式渲染 `<OKRForm initial={{...}}>` 时缺少 keyResults 字段，**When** 从 `data.keyResults` 提取 KR 构造 `{ title, targetValue, unit }[]` 并加入 initial prop 的 keyResults 字段，**Then** 编辑草稿 OKR 时 OKRForm 的 KR 列表正确显示所有已有 KR

- [x] T049 [US4] 新增 updateLocal 方法 — useOKRs hook 支持局部更新
  - **Files**: `frontend/src/hooks/use-okrs.ts`
  - **Given** 所有 mutation 回调调用 `await refresh()` 触发 isLoading=true 导致列表闪烁，**When** 新增 `updateLocal(id: string, updated: Objective)` 方法：用 `setObjectives(prev => prev.map(o => o.id === id ? updated : o))` 局部替换，**Then** 调用 updateLocal 后列表即时更新且不触发 isLoading 状态变化

**Checkpoint**: Bug 修复完成。验证：`getObjectives()` 返回全部非归档 OKR；编辑草稿 OKR 时 KR 正确显示；`updateLocal` 可局部更新列表不闪烁。

---

## Phase 2: 数据模型扩展（基础层，阻塞 Phase 3-5）

**Purpose**: USOM 类型 → Tier 2 文档 → Schema → 迁移 → Mapper → Repository → Actions

**CRITICAL**: 内部严格顺序执行。Tier 2 文档必须在代码变更前完成。

### Tier 2 文档同步（先于代码）

- [x] T050 [P] [US1] 更新 USOM 设计文档 — Objective 新增 objectiveNumber/priority，PeriodType 新增 SemiAnnual
  - **Files**: `docs/usom-design.md`
  - **Given** usom-design.md 中 Objective 定义缺少 objectiveNumber/priority 且 PeriodType 无 SemiAnnual，**When** 在 Objective 接口区域新增 `objectiveNumber: string` 和 `priority: 'P0' | 'P1' | 'P2'` 字段说明，在 PeriodType 枚举新增 `SemiAnnual = 'semi_annual'`，**Then** 文档与即将修改的代码定义一致

- [x] T051 [P] [US1] 更新数据库设计文档 — objectives 新增 objective_number/priority 列，period_type 新增 semi_annual
  - **Files**: `docs/database-design.md`
  - **Given** database-design.md 中 objectives 表缺少 objective_number/priority 列，**When** 在 objectives 表定义新增 `objective_number TEXT` 和 `priority TEXT NOT NULL DEFAULT 'P1'` 列说明，period_type 枚举新增 semi_annual 值，**Then** 文档与即将生成的迁移 SQL 一致

### USOM 类型变更

- [x] T052 [US1] PeriodType 枚举新增 SemiAnnual
  - **Files**: `frontend/src/usom/types/primitives.ts:57-63`
  - **Given** PeriodType 枚举仅有 Daily/Weekly/Monthly/Quarterly/Annual，**When** 在 Quarterly 和 Annual 之间新增 `SemiAnnual = 'semi_annual'`，**Then** 编译通过，`PeriodType.SemiAnnual === 'semi_annual'`

- [x] T053 [US1] Objective 接口新增 objectiveNumber/priority 字段
  - **Files**: `frontend/src/usom/types/objects.ts:72-91`
  - **Given** Objective 接口缺少编号和优先级，**When** 在 okrType 之后新增 `objectiveNumber: string` 和 `priority: 'P0' | 'P1' | 'P2'`，**Then** 编译通过，新建 Objective 时 objectiveNumber 和 priority 为必填字段

### Schema + 迁移

- [x] T054 [US1] Schema objectives 表新增 objective_number/priority 列，period_type 新增 semi_annual
  - **Files**: `frontend/src/lib/db/schema.ts:65-93`
  - **Given** objectives 表定义缺少新列且 period_type 枚举不含 semi_annual，**When** 在 objectives 表新增 `objectiveNumber: text('objective_number')` 和 `priority: text('priority').notNull().default('P1')`，在 periodType enum 数组中新增 `'semi_annual'`，**Then** `npm run db:generate` 成功生成迁移文件

- [x] T055 [US1] 生成并执行数据库迁移 0004_okr_enhance
  - **Files**: `frontend/src/lib/db/migrations/0004_okr_enhance.sql` (NEW), `frontend/src/lib/db/migrations/meta/_journal.json`
  - **Given** schema.ts 已更新，**When** 执行 `cd frontend && npm run db:generate && npm run db:migrate`，**Then** 迁移成功执行，objectives 表新增 objective_number 和 priority 列，现有数据 priority 默认 'P1'，objective_number 为 NULL

### Mapper 更新

- [x] T056 [US1] 更新 ObjectiveRow 类型和双向映射函数
  - **Files**: `frontend/src/lib/db/repositories/mappers.ts:333-383`
  - **Given** ObjectiveRow 类型缺少 objectiveNumber/priority，且 objectiveRowToUSOM/objectiveUSOMToRow 未映射新字段，**When** 在 ObjectiveRow 新增 `objectiveNumber: string | null` 和 `priority: string`；在 objectiveRowToUSOM 新增 `objectiveNumber: row.objectiveNumber ?? ''` 和 `priority: row.priority as Objective['priority']`；在 objectiveUSOMToRow 新增 `objectiveNumber: objective.objectiveNumber || null` 和 `priority: objective.priority`，**Then** DB 行与 USOM 对象双向映射正确，编译通过

### Repository 编号生成

- [x] T057 [US1] 实现目标编号生成逻辑 — ObjectiveRepository.save
  - **Files**: `frontend/src/lib/db/repositories/objective.repository.ts:85-91`
  - **Given** 新建 Objective 时 objectiveNumber 为空字符串需自动生成，**When** 在 save 方法中检测 `objective.objectiveNumber` 为空时，根据 periodType 和 periodStart 计算前缀（annual: YY+'Y'，semi_annual: YY+'H1'/'H2'，quarterly: YY+'Q1'~'Q4'，monthly: YY+'M'+MM），查询同前缀下已有 Objective 数量确定序号，赋值 `objectiveNumber = prefix + '-O' + seq`，**Then** 创建后 Objective 拥有唯一编号如 `26Q1-O1`，同前缀下序号自增不重排

### Actions 适配

- [x] T058 [US1] 更新 createObjective action — 支持 priority 和 period type
  - **Files**: `frontend/src/app/actions/okr.ts:105-122`
  - **Given** createObjective 的 input 类型缺少 priority，**When** 在 input 新增 `priority?: 'P0' | 'P1' | 'P2'`，在 makeIntent fields 中传入 priority（默认 'P1'），传入 periodType 时确保包含 semi_annual 支持，**Then** 创建的 Objective 包含正确 priority 值，编号由 Repository 自动生成

- [x] T059 [US1] 更新 updateObjective action — 确保 period 嵌套展开和新字段传递
  - **Files**: `frontend/src/app/actions/okr.ts:124-145`
  - **Given** updateObjective 用 spread 赋值但 period 嵌套结构需特殊处理，**When** 确保 fields 中的 priority 直接展开、period 的 type/start/end 正确重组为 period 对象、objectiveNumber 不被覆盖，**Then** 更新后 Objective 的所有字段（含新增的 objectiveNumber/priority）正确保存

**Checkpoint**: 数据模型完整。验证：创建 Objective 后数据库有 objective_number（如 26Q1-O1）和 priority 值；`PeriodType.SemiAnnual` 可用；`findAll()` 返回所有非归档 OKR。

---

## Phase 3: User Story 1 — 创建和编辑 OKR 增强 (Priority: P1) 🎯

**Goal**: OKR 表单支持优先级选择、半年度周期、周期日期自动填充

**Independent Test**: 创建 OKR → 选择季度 → 日期自动填充 → 选择 P0 → 保存 → 验证编号自动生成（如 26Q1-O1）且 priority 为 P0

- [x] T060 [US1] OKRForm 新增 priority 字段和选择器
  - **Files**: `frontend/src/components/okr/okr-form.tsx:9-17,26-36`
  - **Given** OKRFormFields 接口和表单 state 缺少 priority，**When** 在 OKRFormFields 新增 `priority: 'P0' | 'P1' | 'P2'`，在 OKRForm 新增 `[priority, setPriority]` state（默认 'P1'），渲染三按钮组（P0 必须完成 / P1 应该完成 / P2 有余力则做），onSubmit 传入 priority，initial prop 回填 priority，**Then** 用户可选择优先级，编辑时正确回显已保存值

- [x] T061 [US1] OKRForm 新增 semi_annual 周期选项
  - **Files**: `frontend/src/components/okr/okr-form.tsx:121-129`
  - **Given** 周期类型下拉仅有 quarterly/monthly/annual 三个选项，**When** 在 select 中新增 `<option value="semi_annual">半年度</option>`（位于季度和年度之间），**Then** 用户可选择半年度周期类型

- [x] T062 [US1] OKRForm 实现周期日期自动填充逻辑
  - **Files**: `frontend/src/components/okr/okr-form.tsx`
  - **Given** 切换周期类型后起止日期不自动填充，**When** 新增 `useEffect` 监听 periodType 变化：annual → 当年 01-01~12-31；semi_annual → 当前月份 ≤ 6 月为 01-01~06-30，否则 07-01~12-31；quarterly → 按当前月计算 Q1~Q4 起止；monthly → 当月首末日，自动设置 periodStart/periodEnd state，**Then** 选择"季度"且当前 5 月时自动填充 2026-04-01 ~ 2026-06-30；选择"半年度"时为 2026-01-01 ~ 2026-06-30

- [x] T063 [US1] OKRForm 验证编辑模式 keyResults 回填完整性
  - **Files**: `frontend/src/components/okr/okr-form.tsx:33-35`
  - **Given** T048 已在 okr-detail.tsx 补充 keyResults 传入，**When** 验证 OKRForm 的 `initial?.keyResults` 能正确初始化 KR state（含 title/targetValue/unit），**Then** 编辑模式下 KR 列表显示所有已有 KR 且数据正确

**Checkpoint**: US1 增强完成。验证：创建 OKR 可选 P0/P1/P2；可选半年度；切换周期自动填充日期；编号自动生成；KR 编辑回填正确。

---

## Phase 4: User Story 2 — 生命周期管理增强 (Priority: P1)

**Goal**: 为废弃/删除/归档操作添加二次确认对话框

**Independent Test**: 对 active OKR 执行废弃 → 弹出确认对话框 → 取消则无变化 → 确认后 OKR 变 discarded

- [x] T064 [US2] OKRDetail 集成 AlertDialog — 废弃/归档操作二次确认
  - **Files**: `frontend/src/components/okr/okr-detail.tsx`, `frontend/src/components/ui/alert-dialog.tsx` (已存在)
  - **Given** 废弃/归档操作直接执行无确认，**When** 新增 `confirmAction: { action: string; objectiveId: string } | null` state，在 handleStatusAction 中对 discard 和 archive 设置 confirmAction（而非直接执行），渲染 AlertDialog 显示操作名称和后果说明，确认后执行 `onChangeStatus(objectiveId, action)`，取消则清除 confirmAction，**Then** 点击"废弃"弹出确认对话框；确认后执行废弃；取消则关闭对话框无副作用

- [x] T065 [US2] KR 删除操作添加二次确认
  - **Files**: `frontend/src/components/okr/okr-detail.tsx:199-201`
  - **Given** draft KR 删除按钮直接执行 `onDeleteKR(kr.id)` 无确认，**When** 将 KR 删除纳入确认机制（新增 `krDeleteConfirm: string | null` state 或复用 confirmAction），删除按钮点击时先设置确认 state，确认后才调用 onDeleteKR，**Then** 删除 KR 时弹出确认对话框，确认后 KR 被移除

**Checkpoint**: US2 增强完成。验证：废弃/归档/KR 删除均弹出确认对话框；确认执行，取消不执行。

---

## Phase 5: User Story 4 — 双栏联动 OKR 工作区 (Priority: P2)

**Goal**: OKR 页面从列表+详情模式重构为左右双栏联动工作区

**Independent Test**: 创建 3 个不同状态 OKR → 验证左栏按状态筛选 + 周期分组 → 点击条目右栏显示详情 → 编辑保存后列表无闪烁

### 容器 + 左栏 + 右栏

- [x] T066 [US4] 创建 OKRWorkspace 双栏容器组件
  - **Files**: `frontend/src/components/okr/okr-workspace.tsx` (NEW)
  - **Given** 当前 OKRList 管理所有状态，**When** 创建 OKRWorkspace 作为状态管理中枢，持有 `selectedId | null`、`mode: 'empty' | 'detail' | 'edit' | 'create'`、`objectives: Objective[]` 状态，调用 useOKRs hook 获取数据，渲染左栏 OKRDirectory（固定 320px 宽度）+ 右栏 OKRPanel（flex-1），通过 props 传递数据和回调，**Then** 双栏布局正确渲染，状态由 Workspace 统一管理，选中 OKR 后右栏显示详情

- [x] T067 [US4] 创建 OKRDirectory 左栏目录组件
  - **Files**: `frontend/src/components/okr/okr-directory.tsx` (NEW)
  - **Given** 左栏需展示状态标签页 + 周期分组 + OKR 条目，**When** 创建 OKRDirectory 组件接收 objectives/onSelect/onEdit/onDelete props，顶部渲染状态标签页按钮（全部/草稿/已暂停/已完成/已废弃），点击切换时按 status 过滤 objectives，下方按 periodType 分组（年度→半年度→季度→月度），每组内渲染 ObjectiveCard，**Then** 切换"草稿"仅显示 draft OKR，"全部"显示所有非归档 OKR，按周期分组排列

- [x] T068 [US4] 创建 OKRPanel 右栏面板组件
  - **Files**: `frontend/src/components/okr/okr-panel.tsx` (NEW)
  - **Given** 右栏需支持四种模式，**When** 创建 OKRPanel 接收 mode/data/onBack/onEdit/onDelete props：empty 模式显示引导文案和"+ 创建 OKR"按钮；detail 模式渲染 OKR 详情（标题、元数据、KR 卡片列表、操作按钮）；edit 模式渲染 OKRForm 并传入 initial（含 keyResults）；create 模式渲染空白 OKRForm，**Then** 点击左栏条目后右栏显示详情，点击编辑切换到编辑表单，创建后右栏切换到详情

### Hook 适配 + 页面入口

- [x] T069 [US4] 重构 useOKRs — mutation 回调使用 updateLocal 局部更新
  - **Files**: `frontend/src/hooks/use-okrs.ts`
  - **Given** T049 已新增 updateLocal 方法，当前 update 回调仍调用 refresh，**When** 将 update 回调改为成功后调用 `updateLocal(id, result.data!)` 局部替换，changeStatus 回调保持 refresh（状态变更影响多条记录），create 回调保持 refresh，**Then** 编辑保存后列表通过 updateLocal 即时更新，不触发 isLoading 闪烁（SC-006 通过）

- [x] T070 [US4] 更新 page.tsx 引入 OKRWorkspace 替换 OKRList
  - **Files**: `frontend/src/app/page.tsx:27,486`
  - **Given** page.tsx 导入 OKRList 并在 okrs 视图中渲染 `<OKRList />`，**When** 将 import 改为 `import { OKRWorkspace } from "@/components/okr/okr-workspace"`，将 `<OKRList />` 替换为 `<OKRWorkspace />`，**Then** OKR 页面显示双栏布局

### ObjectiveCard 增强

- [x] T071 [P] [US4] ObjectiveCard 显示编号和优先级标签
  - **Files**: `frontend/src/components/okr/objective-card.tsx`
  - **Given** ObjectiveCard 仅显示标题和状态标签，**When** 在标题前增加 objectiveNumber 显示（如 `26Q1-O1`，使用 `text-xs text-muted-foreground font-mono`），在 Badge 区域新增 priority 标签（P0 用 destructive variant，P1 用 default variant，P2 用 outline variant），**Then** 左栏每个 OKR 条目显示编号 + 标题 + 状态 + 优先级

**Checkpoint**: US4 完成。验证：双栏布局正常；左栏按状态筛选和周期分组；右栏四种模式切换；编辑保存后列表无闪烁；编号和优先级正确显示。

---

## Phase 6: Polish & 端到端验证

**Purpose**: 跨 Story 验证和提交

- [x] T072 端到端验证 — 按 quickstart.md E5 场景逐条测试
  - **Files**: 无文件变更（手工验证）
  - **Given** 所有 Phase 完成，**When** 执行 6 个验证场景：(1) 创建 Objective 验证编号自动生成；(2) 切换周期类型验证日期自动填充；(3) 双栏联动（选择、编辑、操作切换）；(4) "全部"筛选显示所有非归档 OKR；(5) 编辑保存后列表无闪烁；(6) 删除/废弃操作弹出确认对话框，**Then** 所有场景通过

- [ ] T073 提交增强代码到 004-okr-core 分支
  - **Files**: 所有变更文件
  - **Given** 所有验证通过，**When** 执行 `git add` 暂存所有变更文件，执行 `git commit` 提交，**Then** 代码提交到 `004-okr-core` 分支，准备 merge 到 main

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Bug 修复: T045-T049)
    ↓
Phase 2 (数据模型: T050-T059)
    ↓                ↓
Phase 3 (US1: T060-T063)  Phase 4 (US2: T064-T065)  ← 可并行
    ↓                ↓
Phase 5 (US4: T066-T071)
    ↓
Phase 6 (Polish: T072-T073)
```

- **Phase 1**: 无前置 — 立即开始
- **Phase 2**: 依赖 Phase 1 — Tier 2 文档先于代码
- **Phase 3 + Phase 4**: 依赖 Phase 2 — 可并行
- **Phase 5**: 依赖 Phase 3 + Phase 4
- **Phase 6**: 依赖所有 Phase

### Phase 2 内部严格顺序

```
T050 [P] + T051 [P]    ← Tier 2 文档可并行
    ↓
T052 (PeriodType) → T053 (Objective interface)
    ↓
T054 (Schema) → T055 (Migration)
    ↓
T056 (Mapper)
    ↓
T057 (Numbering) → T058 (create action) → T059 (update action)
```

### Phase 5 内部顺序

```
T066 (OKRWorkspace) → T067 (OKRDirectory) → T068 (OKRPanel)
                                          ↓
                              T069 (useOKRs) → T070 (page.tsx)
                                          ↓
                              T071 (ObjectiveCard) ← 可并行
```

### Parallel Opportunities

| 批次 | 可并行的任务 | 原因 |
|------|-------------|------|
| Phase 2 文档 | T050 + T051 | 不同 docs 文件 |
| Phase 3 + Phase 4 | T060-T063 + T064-T065 | 不同组件文件 |
| Phase 5 中 | T071 与 T066-T068 | ObjectiveCard 独立于容器组件 |

---

## Parallel Example: Phase 3 + Phase 4 并行

```bash
# 开发者 A: OKRForm 增强
Task T060: "OKRForm 新增 priority 选择器"
Task T061: "OKRForm 新增 semi_annual 选项"
Task T062: "OKRForm 周期日期自动填充"
Task T063: "OKRForm 编辑回填验证"

# 开发者 B: 确认弹窗（同时进行）
Task T064: "OKRDetail 集成 AlertDialog"
Task T065: "KR 删除确认"
```

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2 + Phase 3)

1. Phase 1: Bug 修复 (~30 min)
2. Phase 2: 数据模型扩展 (~60 min)
3. Phase 3: US1 创建编辑增强 (~40 min)
4. **STOP and VALIDATE**: 测试创建 OKR 完整流程
5. 此时 OKR 创建/编辑增强功能完整可用

### Full Delivery

1. Phase 1+2+3 → 基础增强就绪
2. + Phase 4 → 生命周期确认对话框
3. + Phase 5 → 双栏工作区 UI 重构
4. + Phase 6 → 端到端验证 + 提交
5. **总预估**: ~3.5 小时

---

## Notes

- 基础实现任务 T001-T044 已完成（见 git history）
- US3（KR 进度）和 US5（关联）在基础实现中已完成，本增强无需额外任务
- 编号生成在 T057 完成后，已有 Objective 的 objective_number 为 NULL，需考虑是否回填
- Phase 3 + Phase 4 可并行执行（不同文件），但若单人开发建议顺序完成
- 提交策略：每完成一个 Phase 提交一次
