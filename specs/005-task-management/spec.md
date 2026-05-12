# Feature Specification: 任务管理系统

**Feature Branch**: `005-task-management`
**Created**: 2026-05-12
**Status**: Draft
**Input**: 基于 docs/superpowers/specs/2026-05-12-task-management-design.md 设计文档

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 创建项目并组织任务 (Priority: P1)

用户创建一个项目（如"重构认证模块"），在项目下创建多个任务（如"设计JWT方案"、"实现迁移"），每个任务可包含子任务（如"调研现有方案"、"编写设计文档"）。用户可以设置任务的优先级、预估时长和执行时段。项目页面展示任务层级结构和整体进度。

**Why this priority**: 项目-任务-子任务是核心数据结构，是所有其他功能的基础。没有这个三层结构，时间调度、模板、AI导入都无从谈起。

**Independent Test**: 可以通过创建一个项目、添加任务和子任务、验证层级展示来独立测试，交付"任务结构化组织"的核心价值。

**Acceptance Scenarios**:

1. **Given** 用户在任务管理页面, **When** 点击"新建项目"并填写名称和描述, **Then** 系统创建项目（planning 状态）并在列表中显示
2. **Given** 用户在项目详情页, **When** 点击"添加任务"并填写标题、预估时长和优先级, **Then** 系统创建任务（draft 状态）并显示在项目任务列表中
3. **Given** 用户在任务详情中, **When** 点击"添加子任务", **Then** 系统创建子任务，以缩进方式显示在父任务下方
4. **Given** 项目下所有任务已完成, **When** 用户查看项目, **Then** 系统提示"所有任务已完成，建议标记项目为已完成"

---

### User Story 2 - 任务时间调度与状态流转 (Priority: P2)

用户为任务设置执行时段（最早/最晚开始时间）和预估时长。一次性任务有建议执行时段，周期性任务每天自动生成实例。任务状态从 draft → active → in_progress → completed 流转，支持暂停（on_hold）。子任务无显式时间设置时，继承父任务或项目的默认时间。

**Why this priority**: 时间调度是将任务与时间盒（timebox）集成的关键，使任务从静态列表变为可执行的日程安排。状态流转是任务生命周期的基本操作。

**Independent Test**: 可以通过设置任务的时间参数、切换状态、验证继承链来独立测试，交付"任务可调度执行"的价值。

**Acceptance Scenarios**:

1. **Given** 任务处于 draft 状态, **When** 用户点击"激活", **Then** 任务变为 active 状态
2. **Given** 任务处于 active 状态, **When** 用户开始执行, **Then** 任务变为 in_progress 状态
3. **Given** 子任务未设置执行时段, **When** 用户查看子任务, **Then** 子任务显示从父任务或项目继承的时段
4. **Given** 任务预估时长超过12小时, **When** 用户查看任务, **Then** 系统显示"建议拆分为子任务"的黄色提示

---

### User Story 3 - 模板与AI导入 (Priority: P3)

用户可以将已有项目保存为模板，也可以从模板创建新项目。用户下载导入模板文件，编辑项目和任务信息后上传，AI 自动识别并提取结构化数据，用户预览确认后保存。

**Why this priority**: 模板和导入提升效率但依赖核心结构先行就绪。AI导入复用已有的OKR导入基础设施，开发成本较低但用户价值显著。

**Independent Test**: 可以通过下载模板文件、上传编辑后的文件、验证AI提取结果来独立测试，交付"快速创建项目"的价值。

**Acceptance Scenarios**:

1. **Given** 用户在项目列表页, **When** 点击"保存为模板", **Then** 系统将项目结构（不含日期和状态）复制到模板
2. **Given** 用户点击"从模板创建", **When** 选择一个模板并设置新日期, **Then** 系统复制模板结构到新项目
3. **Given** 用户上传了编辑好的任务模板文件, **When** AI 分析完成, **Then** 用户在预览面板中看到提取的项目和任务结构，可编辑后保存

---

### User Story 4 - 项目与任务的独立管理 (Priority: P4)

不归属任何项目的独立任务直接显示在任务管理页面底部。用户可以在项目目录页筛选状态（全部/进行中/已完成/已归档），查看项目进度。项目完成后可归档。

**Why this priority**: 独立任务支持和筛选/归档是完善的用户体验，但不是 MVP 核心。

**Independent Test**: 可以通过创建独立任务、筛选状态、归档项目来独立测试。

**Acceptance Scenarios**:

1. **Given** 用户创建了一个不归属项目的任务, **When** 查看任务管理页面, **Then** 底部"独立任务"区域显示该任务
2. **Given** 项目列表中有多状态项目, **When** 用户点击"进行中"筛选, **Then** 仅显示 active/paused 状态的项目

---

### Edge Cases

- 子任务最多支持两层（任务-子任务），超过时提示"仅支持两层结构"
- 项目下所有任务归档后，项目自动提示可归档
- 任务的 `in_progress` 状态替代了现有 `scheduled` 状态，需兼容旧数据
- 预估时长为空时不显示12小时拆分提示
- 从模板创建时，模板中子任务的 `parent_template_id` 需正确映射到新创建的父任务

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系统必须支持创建项目，包含名称、描述、状态、日期范围、默认执行时段、优先级、颜色标识
- **FR-002**: 系统必须支持创建任务并归属到项目，包含标题、描述、优先级、预估时长、能量要求、执行时段和频率
- **FR-003**: 系统必须支持创建子任务，子任务通过父任务自关联，最多两层（任务-子任务）
- **FR-004**: 任务必须支持 draft → active → in_progress → on_hold → completed → archived 状态流转
- **FR-005**: 项目必须支持 planning → active → paused → completed → archived 状态流转
- **FR-006**: 子任务的执行时段（最早/最晚时间、默认时长）无显式设置时，必须沿层级向上继承（子任务→父任务→项目）
- **FR-007**: 任务预估时长超过12小时（720分钟）时，必须在表单和列表中显示"建议拆分"提示（软提醒，不阻塞保存）
- **FR-008**: 系统必须支持将已有项目保存为模板（复制结构，不含实际日期和状态）
- **FR-009**: 系统必须支持从模板创建新项目（复制模板结构，填入新日期）
- **FR-010**: 系统必须支持通过文件上传（Markdown/Excel/Word/TXT）AI自动提取项目和任务信息，用户预览编辑后保存
- **FR-011**: 系统必须支持不归属项目的独立任务管理
- **FR-012**: 项目目录页必须支持按状态筛选（全部/进行中/已完成/已归档）
- **FR-013**: 项目完成时系统提示可标记为已完成（当项目下所有任务都已完成时，软提示）
- **FR-014**: 任务目录页复用 OKR 导入的 Dialog + Panel 组件模式

### Key Entities

- **Project（项目）**: 任务的组织容器，包含名称、状态、日期范围、默认执行时段、优先级、颜色标识。状态有 planning/active/paused/completed/archived
- **Task（任务）**: 可归属项目或独立存在的工作单元，支持两层自关联（任务-子任务）。包含标题、优先级、预估时长、能量要求、执行时段、频率。状态有 draft/active/in_progress/on_hold/completed/archived
- **ProjectTemplate（项目模板）**: 项目结构的可复用快照，不含实际日期和状态，包含默认时段、优先级、颜色
- **TaskTemplate（任务模板）**: 任务结构的可复用快照，可归属项目模板或独立存在，支持自关联（模板内子任务）
- **关系**: Project 1:N Task（可选），Task 1:N Task（子任务自关联），ProjectTemplate 1:N TaskTemplate，TaskTemplate 自关联

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 用户可以在3分钟内完成"创建项目→添加3个任务→添加子任务"的完整流程
- **SC-002**: 任务状态切换操作在2秒内响应完成
- **SC-003**: 从模板创建项目流程不超过1分钟
- **SC-004**: AI文件导入提取准确率达到80%以上（项目和任务标题、层级关系正确识别）
- **SC-005**: 90%的用户能在首次使用时无文档帮助完成项目创建和任务添加

## Assumptions

- MVP阶段仅支持Web端，移动端适配后续迭代
- 任务严格两层（任务-子任务），数据模型支持未来多层但UI不暴露更深层级
- 项目不直接关联OKR，后续通过规则引擎实现软关联
- AI导入复用现有的OKR导入基础设施（file-parser → LLM → markdown rendering 流水线）
- 现有 `scheduled` 状态由 `in_progress` 替代，旧数据需兼容处理
- 周期性任务的每日实例生成机制与习惯的 log 机制类似，存储在 timebox_tasks 关联表中
- 模板文件格式以 Markdown 为主，AI导入同时支持 Excel 和 Word
- 任务管理的 UI 组件（状态徽标、进度条）从 OKR 模块复用
- 所有数据操作遵循项目既有的 Repository Pattern 和多租户 (userId) 约束
