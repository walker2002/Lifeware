# Research: OKR 核心管理 (004-okr-core)

**Date**: 2026-05-10 (updated 2026-05-11) | **Branch**: `004-okr-core`

## 1. 现有 OKR 基础设施

### Decision: 在现有 Repository 和 USOM 基础上扩展

**Rationale**: 项目已有完整的 Objective/KeyResult USOM 类型定义、数据库 Schema、Repository 实现和 Mapper。State Machine 和 Orchestrator 缺少 OKR 路径但架构已为扩展预留。

**Alternatives considered**:
- 从零重写 OKR 模块 → 被否决，违反现有架构一致性
- 仅通过 Repository 直接 CRUD 不走 Nexus → 被否决，违反 Constitution III (Single-Writer) 和 VII (Bridge Readiness)

### 现有代码状态

| 组件 | 状态 | 需要变更 |
|------|------|----------|
| USOM types (Objective/KeyResult) | 存在，缺 discarded/okrType | 新增字段和状态枚举值 |
| DB schema (objectives/key_results) | 存在，缺 discarded/okr_type | 新增列和枚举值 |
| Repository (objective/key-result) | 存在基础 CRUD | 扩展查询和状态方法 |
| State Machine transitions | 不存在 OKR 转换 | 新增 10 个转换 |
| Orchestrator | 不存在 OKR 路径 | 新增 executeOKRIntent |
| Domain Plugin | 不存在 | 新建 domains/okrs/ |
| API 路由 | 项目无 route handler 模式 | UI 直接调用 Repository（与现有模式一致） |
| UI 页面 | 不存在 | 新建 okr 列表/详情/创建页 |

## 2. 状态机转换策略

### Decision: 为 Objective 和 KeyResult 各定义独立转换表，KeyResult 状态与 Objective 联动

**Rationale**:
- Objective 有完整独立的生命周期（draft → active → paused → completed/discarded → archived）
- KeyResult 状态大部分与 Objective 同步（激活/暂停/完成/废弃/归档），但支持独立的 currentValue 更新
- 遵循现有 habit 转换表模式（`nexus/core/state-machine/transitions.ts`）

**Alternatives considered**:
- KeyResult 完全独立状态机 → 被否决，KR 生命周期依赖 O，独立操作会导致不一致
- 仅用 Objective 状态机，KR 状态隐式推导 → 被否决，需要在事件记录中追踪 KR 状态变更

### 转换表设计

**Objective (10 transitions)**:

| From | To | Action |
|------|----|--------|
| null | draft | create |
| draft | active | activate |
| draft | discarded | discard |
| active | paused | pause |
| active | completed | complete |
| active | discarded | discard |
| paused | active | resume |
| paused | discarded | discard |
| completed | archived | archive |
| discarded | archived | archive |

**KeyResult**: 与 Objective 同步转换，额外支持 `updateProgress` 操作（不改变状态，仅更新 currentValue）。

## 3. KR 自动进度推进策略

### Decision: 等分策略 — 每个关联项贡献 targetValue / 关联项总数

**Rationale**: MVP 阶段最简策略，符合 spec 假设。等分策略计算简单、可预测、无需用户配置。

**Alternatives considered**:
- 自定义权重 → 推迟到 004b，增加复杂度
- 按任务优先级加权 → 被否决，优先级是调度概念不是进度概念

### 实现方式

- **任务关联**: KR 关联 N 个任务，每个任务完成时 currentValue += targetValue / N
- **习惯关联**: 每次打卡 currentValue += 1
- **混合关联**: 任务和习惯独立计算，贡献累加
- 在 OKR 领域插件的 `onEvent` 中实现，监听 TaskCompleted 和 HabitLogged

## 4. UI 架构策略

### Decision: 遵循现有页面模式，UI 组件直接调用 Repository

**Rationale**: 项目当前无 API route handler 层，UI 直接通过 Repository 访问数据（参见 habit 页面模式）。Nexus 管道用于状态转换操作（激活、暂停等），普通 CRUD 直接 Repository。

**Alternatives considered**:
- 新增 API route handler 层 → 被否决，与现有模式不一致，属于 Phase 2 Bridge Layer 范畴
- 全部走 Nexus 管道 → 被否决，简单 CRUD 不需要 Intent Engine 解析，过度设计

### UI 技术选择

- 列表页：客户端组件 + 数据获取
- 表单：React Hook Form + Zod 验证（如项目已使用）
- 进度展示：自定义 SVG 进度环 + 进度条
- 状态操作：调用 Orchestrator 的 executeOKRIntent
- 普通 CRUD：直接调用 Repository

## 5. 与现有系统的集成点

### 与 Nexus 的集成

- OKR 领域插件注册到 Orchestrator（与 habits/tasks/timebox 并列）
- 状态转换通过 State Machine 统一管理
- Action Surface Engine 基于 OKR 状态生成建议

### 与任务/习惯的关联

- `tasks.key_result_id` FK 已存在（schema.ts line 137）
- `habits.key_result_id` FK 已存在（schema.ts line 175）
- 无需新增关联表，直接使用现有 FK

### 与 system_events 的集成

- 复用现有 system_events 表（schema.ts line 411）
- 新增事件类型：ObjectiveCreated/Activated/Paused/Resumed/Completed/Discarded/Archived, KeyResultUpdated/Completed/ProgressUpdated
- 事件记录由 Orchestrator 在状态转换后通过 EventBus 发布

---

## Enhancement Research (2026-05-11)

### 6. Bug 修复策略

#### Bug #1: "全部"筛选只显示"进行中"

### Decision: 在 ObjectiveRepository 新增 findAll 方法

**Root Cause**: `actions/okr.ts` 中 `getObjectives()` 无 status 参数时调用 `repo.findActive()`，该方法仅查 `status='active'`。

**Fix**:
- `IObjectiveRepository` 新增 `findAll(userId)` 方法签名
- `ObjectiveRepository` 实现 `findAll`：查询所有 `status != 'archived'` 的 Objective
- `actions/okr.ts` 的 `getObjectives` 无 status 参数时调用 `findAll` 代替 `findActive`

**Alternatives considered**:
- 前端传入所有非归档状态列表调用 `findByStatusInPeriod` → 被否决，语义不清晰
- 在 findActive 中添加参数控制 → 被否决，违反单一职责

#### Bug #2: 编辑草稿 OKR 时 KR 空白

### Decision: OKRDetail 编辑模式完整传入 keyResults 到 OKRForm

**Root Cause**: `okr-detail.tsx` 编辑模式渲染 OKRForm 时，`initial` prop 未包含 `keyResults` 字段。

**Fix**: 从 `data.keyResults` 提取 KR 信息，构造 `keyResults` 数组传入 `initial` prop。

#### Bug #3: 编辑返回后列表空白

### Decision: 双栏容器统一管理状态，编辑保存后局部更新

**Root Cause**: `onBack()` → `hook.refresh()` 全量重载时 `isLoading=true` 的竞态导致短暂空白。

**Fix**:
- OKRWorkspace 作为唯一状态管理容器，持有 selectedId、mode、objectives 列表
- 编辑保存后用返回的更新数据直接替换列表中对应条目，不重新全量获取
- useOKRs hook 新增 `updateLocal` 方法用于局部更新

**Alternatives considered**:
- optimistic update → 被否决，MVP 阶段不需要，等保存成功再更新即可
- SWR/React Query 缓存 → 被否决，引入新依赖，现有模式足够

### 7. 目标编号生成策略

### Decision: 服务端生成，Repository 层实现，基于前缀计数

**Rationale**: 编号必须全局唯一且按顺序递增，服务端生成可避免并发冲突。在 Repository 的 save/create 流程中，根据 periodType 和 periodStart 计算前缀，查询同一前缀下已有 Objective 数量确定序号。

**编号规则**:

| 层次 | 前缀格式 | 示例 |
|------|----------|------|
| annual | YY + 'Y' | 26Y-O1 |
| semi_annual | YY + 'H1'/'H2' | 26H1-O1 |
| quarterly | YY + 'Q1'~'Q4' | 26Q1-O1 |
| monthly | YY + 'M' + MM | 26M05-O1 |

**序号规则**: 同一前缀下按创建时间排序自增（O1, O2, O3...），删除不重排。

**Alternatives considered**:
- 客户端生成 → 被否决，并发场景可能冲突
- 数据库序列 → 被否决，过于复杂，查询计数已足够
- 随时间戳拼接 → 被否决，不符合 OKR 编号的简洁可读要求

### 8. 半年度周期类型

### Decision: PeriodType 枚举新增 SemiAnnual，OKR 表单仅展示 4 项

**Rationale**: 半年度是 OKR 管理中常见的周期层次（与年度、季度、月度并列）。daily/weekly 保留在枚举中供习惯/任务等其他领域使用，但 OKR 表单不展示。

**周期自动填充规则**:

| 周期类型 | 起始日期 | 结束日期 |
|----------|----------|----------|
| 年度 | 当前年 01-01 | 12-31 |
| 半年度 | 1-6月: 01-01, 7-12月: 07-01 | 1-6月: 06-30, 7-12月: 12-31 |
| 季度 | Q1: 01-01, Q2: 04-01, Q3: 07-01, Q4: 10-01 | Q1: 03-31, Q2: 06-30, Q3: 09-30, Q4: 12-31 |
| 月度 | 当月 01 | 当月最后一天 |

### 9. 双栏 UI 架构策略

### Decision: OKRWorkspace 单容器管理状态，OKRDirectory + OKRPanel 子组件

**Rationale**:
- 单容器模式统一管理 selectedId / mode 状态，避免组件间通信复杂性
- 左栏固定宽度 320px，右栏弹性填充，适配 Notion 风格三栏布局
- 右栏支持 empty/detail/edit/create 四种模式，通过 mode 状态切换

**组件职责**:
- `OKRWorkspace`: 状态管理中枢 (selectedId, mode, objectives 列表, 局部更新)
- `OKRDirectory`: 状态标签页 + 周期分组 + OKR 条目列表 + 操作按钮
- `OKRPanel`: 空状态 / 详情视图 / 编辑表单 / 新增表单

**Alternatives considered**:
- URL 路由驱动 (/okr?id=xxx) → 被否决，双栏布局不需要页面跳转
- React Context 共享状态 → 被否决，单容器 prop drilling 已足够
- 独立状态管理库 (Zustand) → 被否决，与现有 useOKRs hook 模式不一致

### 10. 确认弹窗策略

### Decision: 直接使用 shadcn/ui AlertDialog，不额外封装

**Rationale**: shadcn/ui 的 AlertDialog 已满足所有需求（标题、内容、确认/取消按钮、destructive 变体）。创建通用 confirm-dialog.tsx 封装仅在多处复用时才有价值。

**触发场景**:
- Objective 废弃操作
- Objective 删除操作（通过废弃实现）
- KR 删除操作（仅 draft 状态）

---

## Phase D Research: UI 优化 (2026-05-11)

### 11. KR 即时刷新策略

### Decision: 操作成功后重新加载详情数据

**Root Cause**: `okr-panel.tsx` 中 KR 添加/删除成功后，组件持有的是旧的 detailData 状态，没有重新调用 `loadDetail`。

**Fix**: 在 KR 添加和删除的成功回调中，重新调用 `loadDetail(selectedId)` 获取最新数据并更新 detailData state。由于详情面板是独立组件，局部刷新不会影响左栏列表。

**Alternatives considered**:
- 手动拼接新 KR 到 detailData → 被否决，需要处理排序和 ID 生成等复杂逻辑
- 全局 refresh → 被否决，会导致左栏也重载

### 12. 右栏占满宽度策略

### Decision: 移除 OKRPanel 内部 max-w-2xl 约束，让内容区自适应

**Root Cause**: `okr-panel.tsx` 内部使用了 `max-w-2xl mx-auto` 限制内容宽度。在双栏布局下，右栏已经是独立的弹性区域，不需要额外的最大宽度约束。

**Fix**: 从 `okr-panel.tsx` 的各模式容器中移除 `max-w-2xl mx-auto` 类。保持 p-4 padding 即可，内容自然占满右栏宽度。

**Alternatives considered**:
- 使用更大 max-width（如 max-w-4xl）→ 被否决，不够弹性，不同屏幕尺寸体验不一致
- 仅详情模式移除、编辑模式保留 → 被否决，布局不统一
