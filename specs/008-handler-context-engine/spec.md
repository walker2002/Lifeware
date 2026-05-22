# Feature Specification: Handler + Context Engine 架构调整

**Feature Branch**: `008-handler-context-engine`
**Created**: 2026-05-20
**Status**: Draft
**Input**: 参照 `docs/superpowers/specs/2026-05-20-handler-context-engine-architecture.md` — 为 Lifeware Nexus 引入生成型操作路径，使系统能够主动生成方案（如时间盒智能编排），同时保持现有被动式 Hook 架构不变。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Context Engine 数据组装 (Priority: P1)

作为系统内部组件，Context Engine 接收一个结构化意图（如 createSmartSchedule），根据 manifest 声明从多个 Domain 收集所需数据（习惯模板、待办任务、已有时间盒、能量曲线），组装为完整的 GenerationRequest 供 Handler 消费。

**Why this priority**: 这是整个生成型路径的基础——没有数据组装，Handler 无法工作。所有后续功能都依赖这一层。

**Independent Test**: 可以通过构造一个 StructuredIntent，验证 Context Engine 能正确从各 Context Provider 收集数据并组装为 GenerationRequest，包含所有声明的 contexts 且通过 schema 校验。

**Acceptance Scenarios**:

1. **Given** manifest 中声明了 createSmartSchedule 需要 5 个 contexts，**When** Context Engine 收到 createSmartSchedule 意图，**Then** 组装的 GenerationRequest 包含所有 5 个 context 的数据，且每项数据通过对应 Zod schema 校验
2. **Given** manifest 中声明的某个 context id 在 Registry 中不存在，**When** Context Engine 尝试组装，**Then** 返回明确的错误信息指出缺失的 capability id
3. **Given** 某个 Provider 返回的数据不符合 schema，**When** Context Engine 执行 schema 校验，**Then** 拒绝该数据并报告校验失败的具体字段
4. **Given** intent.fields 包含 date 参数，**When** Context Engine 提取 params 映射，**Then** 正确将 date 传递给需要它的 Provider

---

### User Story 2 - Context Provider 受控共享 (Priority: P2)

每个 Domain 通过 Context Provider 向外暴露只读数据投影。Provider 只做读取、投影和轻量聚合，不做规划、决策或 AI 调用。其他 Domain 的 Handler 通过 Registry 按需获取数据，不直接访问其他 Domain 的 Repository。

**Why this priority**: Provider 是跨域数据共享的安全边界，必须在 Handler 之前就位，确保数据流通路径合规。

**Independent Test**: 可以注册一组 Provider，验证 Registry 能正确解析 capability id、校验 visibility、调用 Provider 并返回 schema 校验后的数据。

**Acceptance Scenarios**:

1. **Given** Tasks Domain 注册了 activeTasks capability，**When** Registry 解析 activeTasks 请求，**Then** 返回该 Domain 投影的任务数据且通过 schema 校验
2. **Given** Provider 被限制为只读操作，**When** 验证 Provider 实现，**Then** 确认 Provider 不修改任何数据、不触发事件、不调用 AI
3. **Given** 5 个 Provider 已注册（activeTasks、pendingHabits、habitTemplates、existingTimeboxes、energyProfile），**When** 通过 Registry 逐一解析，**Then** 每个 capability 都能正确返回其声明的数据格式

---

### User Story 3 - Handler 生成型操作 (Priority: P3)

Domain 的 Handler 接收 Context Engine 组装的完整数据，执行算法和/或 AI 调用，输出结构化的 proposalSet（方案集）和 presentation（展示格式）。Handler 不做数据获取、状态写入或 UI 渲染。

**Why this priority**: Handler 是生成型路径的最终执行单元，依赖 P1（数据组装）和 P2（Provider 数据）完成后才能工作。

**Independent Test**: 可以构造一个 GenerationRequest 作为输入，验证 SchedulingHandler 输出符合 GenerationResult 结构（包含 proposalSet、presentation、warnings）。

**Acceptance Scenarios**:

1. **Given** SchedulingHandler 收到包含 5 个 contexts 的 GenerationRequest，**When** 执行 handle()，**Then** 返回 GenerationResult 包含至少一个 proposalSet，每个 proposal 有 id、action、payload、sourceType、priority
2. **Given** 能量曲线显示下午为低谷，**When** Handler 生成方案，**Then** 高能量需求的 proposal 附带 energyMatch 警告（score < 1）
3. **Given** 已有不可动的时间盒占用了上午时段，**When** Handler 生成方案，**Then** 新 proposal 不与已有时间盒冲突
4. **Given** Handler 生成结果后，**When** 传递给 Rule Engine 验证，**Then** Rule Engine 能正确校验 proposalSet 的合法性

---

### User Story 4 - Orchestrator 路径识别与调度 (Priority: P4)

Orchestrator 通过检查 manifest 的 generation_actions 块来识别操作是生成型还是被动型，分别走不同的执行路径。生成型路径经过 Context Engine → Handler → Rule Engine → Presentation，被动型路径保持现有流程不变。

**Why this priority**: 路径整合层，把 P1-P3 的组件串联起来。依赖前面三个组件就位。

**Independent Test**: 可以模拟一个带有 generation_actions 声明的 intent，验证 Orchestrator 走生成型路径；模拟一个普通 intent，验证走现有被动型路径。

**Acceptance Scenarios**:

1. **Given** intent.action 为 createSmartSchedule 且 manifest 中有对应 generation_actions 声明，**When** Orchestrator 处理该 intent，**Then** 走生成型路径（Context Engine → Handler → Rule Engine）
2. **Given** intent.action 为普通写操作（如 createTimebox），**When** Orchestrator 处理该 intent，**Then** 走现有被动型路径（Hook.onValidate → Rule Engine → State Machine），行为与调整前完全一致
3. **Given** 生成型路径执行中 Handler 抛出异常，**When** Orchestrator 捕获错误，**Then** 返回用户友好的错误信息，不影响现有被动型路径

---

### User Story 5 - 方案确认与执行流程 (Priority: P5)

用户收到 Handler 生成的方案后，以 Markdown 格式查看完整的编排计划。用户可以直接确认全部方案，也可以编辑修改后再确认。确认后，系统将用户认可的 proposals 重新解析为批量 intent，经 Rule Engine 二次验证后，通过 State Machine 批量执行写入状态。

**Why this priority**: 这是生成型路径中唯一的用户可感知交互环节。前面的 Story 都是系统内部机制，本 Story 完成从"方案生成"到"状态落地"的闭环。放在 P5 因为它依赖 Orchestrator（P4）的路径识别完成后才能串联。

**Independent Test**: 可以模拟一个 GenerationResult，验证系统能正确将其渲染为 Markdown、支持用户编辑/确认、重解析为批量 intent、通过 Rule Engine 二次验证后批量执行。

**Acceptance Scenarios**:

1. **Given** Handler 生成了包含多个 proposal 的 proposalSet，**When** 系统渲染展示，**Then** 以 Markdown 格式呈现完整编排计划，用户可查看每个 proposal 的时间、来源、优先级、能量匹配信息
2. **Given** 用户对 Markdown 计划进行了编辑修改，**When** 用户确认提交，**Then** 系统将修改后的内容重新解析为批量 intent 列表，每个 intent 对应一个 proposal
3. **Given** 用户确认后数据已过期（如期间新增了冲突任务），**When** Rule Engine 执行二次验证，**Then** 检测到冲突的 proposal 被拒绝并附带具体冲突原因，未冲突的 proposal 正常执行
4. **Given** 用户确认全部 proposals，**When** Rule Engine 二次验证通过，**Then** State Machine 按顺序批量执行所有 proposals，生成对应的状态变更事件
5. **Given** 生成型路径的完整执行过程，**When** 从 Handler 输出到 State Machine 执行完成，**Then** 每个关键节点（生成、确认、重解析、验证、执行）都产生对应的追踪事件

---

### User Story 6 - Manifest 声明式配置 (Priority: P6)

Domain 的 manifest.yaml 新增 generation_actions 块，声明式地描述每个生成型操作需要哪些 contexts、参数如何映射。Orchestrator 和 Context Engine 通过读取 manifest 来确定行为，无需硬编码。

**Why this priority**: 这是配置基础设施，虽然支撑其他所有功能，但其实现相对简单——主要是 YAML 结构设计和消费逻辑。

**Independent Test**: 可以定义一个包含 generation_actions 的 manifest，验证系统能正确解析并据此驱动 Context Engine 和 Orchestrator。

**Acceptance Scenarios**:

1. **Given** timebox manifest 包含 createSmartSchedule 和 adjustRemainingSchedule 两个 generation_actions，**When** 系统加载该 manifest，**Then** Orchestrator 和 Context Engine 能正确读取 contexts 声明和参数映射
2. **Given** contexts 声明中指定 params: [date]，**When** Context Engine 从 intent.fields 提取，**Then** 正确将 intent.fields.date 映射到 Provider 调用参数

### Edge Cases

- **数据过期**：用户确认前 Provider 数据已变化（如新增了冲突任务）→ Rule Engine 二次验证捕获冲突，拒绝受影响的 proposal，未冲突的正常执行
- **AI 调用失败**：Handler 的 AI 调用超时或返回错误 → 降级为基于规则的简单排列（按用户优先级顺序排列），保证始终有方案输出
- **Provider 并发**：同一 capability 被多个 generation_actions 并发引用 → Registry 支持并发调用，每次调用独立执行，Provider 无副作用保证安全并发
- **空 contexts**：manifest 中 contexts 列表为空 → Context Engine 正常处理，GenerationRequest.contexts 为空对象，适用于无需外部数据的生成型操作
- **MVP 不支持 partial acceptance**：用户必须对整个 proposalSet 确认或拒绝，不支持选择部分 proposal。如需修改，用户编辑 Markdown 后整体重新确认
- **追踪完整性**：生成型路径的每个关键节点（数据组装、Handler 执行、用户确认、重解析、二次验证、批量执行）必须产生对应的追踪事件，确保异常时可回溯全链路

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系统必须提供 Context Engine 组件，能够根据 manifest 的 generation_actions 声明，从 Registry 中解析并调用对应的 Context Provider，组装为 GenerationRequest
- **FR-002**: 系统必须提供 Context Registry 注册中心，管理所有 ContextCapability 的注册、查询和校验
- **FR-003**: 每个 Domain 可以注册 Context Provider，通过受控接口（只读、投影、轻量聚合）向外暴露数据。"轻量聚合"限定为：filter、map、count、sum、排序、去重。禁止：多表 join、递归计算、AI 调用、分组统计、时序推导
- **FR-004**: Provider 必须声明 visibility 级别（private / planning / system），Registry 在解析时校验调用方的 visibility 权限
- **FR-005**: Provider 返回的数据必须通过 Zod schema 校验，不通过则拒绝并报告具体字段
- **FR-006**: 系统必须支持 Domain Handler 接口，接收 GenerationRequest 并返回 GenerationResult（含 proposalSet、presentation、warnings）
- **FR-007**: Handler 输出的 proposalSet 中的每个 proposal 必须包含 id、action、payload、sourceType、priority 四个必填字段
- **FR-008**: Handler 输出的 warning 必须包含 code、message、severity 三个字段，可选包含 affectedProposalIds
- **FR-009**: Orchestrator 必须通过检查 manifest 的 generation_actions 来区分生成型和被动型路径，两种路径互不干扰
- **FR-010**: 被动型路径（Hook.onValidate → Rule Engine → State Machine → EventBus → ActionSurface）的行为不得因本次架构调整而改变
- **FR-011**: manifest.yaml 必须支持 generation_actions 块，声明式描述每个生成型操作所需的 contexts、query 和参数映射
- **FR-012**: SchedulingHandler 必须支持 createSmartSchedule action，综合四类来源材料（习惯模板、待办任务、已有时间盒、能量曲线）生成编排方案
- **FR-013**: SchedulingHandler 必须支持 adjustRemainingSchedule action，增量调整 fromTime 之后的剩余时段，不移动已完成/进行中的时间盒
- **FR-014**: 生成型操作的结果必须经过 Rule Engine 验证后才能展示给用户
- **FR-015**: 宪法（constitution.md）必须进行 MINOR 修订：Principle III 新增 Context Engine 为第五大组件；Principle VI 扩展为双轨模型；Principle VIII 明确 AI 可参与 Handler
- **FR-016**: 生成型路径的每个关键阶段必须产生追踪事件：数据组装开始/完成、Handler 执行开始/完成（含耗时）、用户确认/拒绝、重解析结果、Rule Engine 二次验证结果、State Machine 批量执行结果
- **FR-017**: 用户确认后的批量 intent 重解析必须保留与原始 GenerationResult 中 proposal 的关联关系（通过 proposal.id 作为 intent.fields.sourceProposalId 传递），支持追踪单个 proposal 从生成到执行的全链路
- **FR-018**: Rule Engine 二次验证必须报告每个被拒绝 proposal 的具体冲突原因（如时间冲突、数据过期、违反规则 ID），而非仅返回整体通过/失败
- **FR-019**: 生成型路径执行失败时，系统必须记录完整的错误上下文（触发 intent、已完成的步骤、失败点），供后续排查使用

### Key Entities

- **ContextProvider**: Domain 的受控共享接口，接收 query 和 params，返回投影后的只读数据。每个 Provider 对应一个 ContextCapability 注册到 Registry
- **ContextCapability**: Provider 的注册信息，包含 id（全局唯一）、visibility 级别、Zod schema、描述
- **Context Registry**: 系统级注册中心，管理所有 ContextCapability 的注册和查询，执行 visibility 校验和 schema 验证
- **DomainHandler**: Domain 的主动计算单元，接收 GenerationRequest，执行算法/AI 调用，输出 GenerationResult
- **GenerationRequest**: Handler 的输入，包含 StructuredIntent 和 Context Engine 组装的 contexts 数据
- **GenerationResult**: Handler 的输出，包含 proposalSet（方案集）、可选的 alternatives、presentation、warnings
- **GeneratedProposal**: 单个方案项，包含 id、action、payload、sourceType、priority、可选的 energyMatch
- **ProposalSet**: 方案集合，包含 id、label、proposals 列表、可选 tags。MVP 阶段只使用单个 set
- **Warning**: 结构化警告，包含 code、message、severity、可选的 affectedProposalIds
- **generation_actions**: manifest.yaml 新增块，声明式描述生成型操作的 contexts 需求和参数映射

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Context Engine 能在 500ms 内完成一个包含 5 个 contexts 的 GenerationRequest 组装（不含 AI 调用时间）
- **SC-002**: 所有 5 个 Context Provider（activeTasks、pendingHabits、habitTemplates、existingTimeboxes、energyProfile）都能通过 Registry 正确注册和查询
- **SC-003**: 被动型路径的现有行为 100% 不受影响——所有已有的 Hook 校验、Rule Engine 规则、State Machine 转换正常运作
- **SC-004**: SchedulingHandler 能根据四类来源材料生成至少一个完整的 proposalSet，每个 proposal 包含所有必填字段
- **SC-005**: 生成的方案中，不与已有不可动时间盒冲突的 proposal 占比达到 100%
- **SC-006**: Constitution 修订为 MINOR 版本升级（不删除/修改现有原则，只新增能力描述）
- **SC-007**: 生成型路径从 Handler 输出到 State Machine 执行完成的完整链路中，100% 的关键节点都有对应的追踪事件
- **SC-008**: 用户确认后的二次验证能在 200ms 内完成冲突检测（不含 State Machine 执行时间）
- **SC-009**: 单个 proposal 从生成到执行完成的全链路可通过关联关系完整回溯

## Assumptions

- MVP 阶段所有 Context Provider 使用 `planning` 级别 visibility，不需要 private 和 system 级别的实际权限区分逻辑
- MVP 阶段 GenerationResult 只使用单个 proposalSet，alternatives 留空
- Presentation 的 MVP 格式为 Markdown，其他格式（kanban、calendar、timeline、mindmap）在后续迭代中实现
- Handler 的 AI 调用失败时，降级策略为基于规则的简单排列（按优先级顺序排列），此降级逻辑作为 Handler 内部实现
- Context Provider 的数据来源在 MVP 阶段仅限于 Repository，未来可扩展到 Memory、Vector DB、外部 API 等
- 现有 manifest 运行时消费机制（`specs/006-domain-compliance-refactor` 中实现）已支持动态读取 manifest，本 feature 在其基础上扩展 generation_actions 块
- 宪法修订为 MINOR 级别（新增能力描述），需用户审批后生效
- 用户确认流程采用 Markdown 文件模式：Handler 输出 Markdown 格式的编排计划 → 用户查看/编辑 → 确认后系统重解析为批量 intent
- MVP 阶段不支持 partial acceptance（部分确认），用户需编辑 Markdown 后整体重新确认
- 生成型路径的追踪事件复用现有 system_events 表结构，通过 event_type 前缀区分（如 `generative.*`）
- 追踪事件的关联关系通过 proposal id 和 generation_request id 实现，不引入新的关联表
