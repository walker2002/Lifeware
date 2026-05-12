# Tasks: 任务管理系统

**Input**: `/specs/005-task-management/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: 本项目使用 Vitest，每个任务包含 Given-When-Then 验收测试用例描述。

**Organization**: 任务按 4 个用户故事分组，每个故事可独立实现和测试。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件，无依赖）
- **[Story]**: 归属用户故事（US1/US2/US3/US4）
- 描述中包含精确文件路径

---

## Phase 1: Setup（文档更新 — 前置必做）

**Purpose**: 按 Constitution IV 要求，在写代码前更新 Tier 2 设计文档

- [ ] T001 [P] 更新 `docs/usom-design.md` 新增 Project 类型定义（含 ProjectStatus 枚举、所有字段）
  - **验收**: Given 阅读 USOM 文档, When 查找 Project 类型, Then 找到完整的 Project 接口定义（id/status/name/startDate/endDate/defaultEarliestTime/defaultLatestStartTime/defaultDuration/priority/color/tags/createdAt/updatedAt/completedAt/archivedAt）
- [ ] T002 [P] 更新 `docs/usom-design.md` 扩展 Task 类型定义（新增 parentId/projectId/earliestTime/latestStartTime/defaultTime/defaultDuration/frequencyType/daysOfWeek/startDate/endDate）
  - **验收**: Given 阅读 USOM 文档 Task 章节, When 查看 Task 接口, Then 包含所有新增字段且标记 `scheduled` 为 deprecated
- [ ] T003 [P] 更新 `docs/usom-design.md` 新增 ProjectTemplate 和 TaskTemplate 类型定义
  - **验收**: Given 阅读 USOM 文档, When 查找 Template 类型, Then 找到 ProjectTemplate（name/description/defaultTimeFields/priority/color）和 TaskTemplate（含 parentTemplateId 自关联）接口定义
- [ ] T004 [P] 更新 `docs/database-design.md` 新增 projects 表定义（所有列、类型、约束、索引）
  - **验收**: Given 阅读 DB 设计文档, When 查找 projects 表, Then 包含完整的 Drizzle 表定义和索引说明
- [ ] T005 [P] 更新 `docs/database-design.md` 新增 project_templates 和 task_templates 表定义
  - **验收**: Given 阅读 DB 设计文档, When 查找 template 表, Then 包含两张模板表定义及其外键关系
- [ ] T006 [P] 更新 `docs/database-design.md` 扩展 tasks 表定义（新增列、枚举变更、索引）
  - **验收**: Given 阅读 DB 设计文档 tasks 表, When 查看扩展后的定义, Then status 枚举包含 in_progress/on_hold 且新增 parent_id/project_id 等 10 个字段

**Checkpoint**: 设计文档就绪 — 可开始代码实现

---

## Phase 2: Foundational（核心基础设施 — 阻塞所有用户故事）

**Purpose**: USOM 类型层 + Schema + Repository 接口 + 基础实现，所有用户故事依赖此阶段

**⚠️ CRITICAL**: 所有用户故事必须等待此阶段完成

- [ ] T007 更新 `frontend/src/usom/types/primitives.ts`：TaskStatus 新增 `'in_progress' | 'on_hold'`，保留 `'scheduled'` 兼容；新增 ProjectStatus 类型
  - **验收**: Given TaskStatus 类型, When 使用值为 `'in_progress'` 或 `'on_hold'`, Then TypeScript 编译通过且 `'scheduled'` 仍可用（标记 @deprecated）；Given ProjectStatus 类型, When 使用值为 `'planning' | 'active' | 'paused' | 'completed' | 'archived'`, Then 编译通过
- [ ] T008 在 `frontend/src/usom/types/objects.ts` 新增 Project 接口（含所有字段），扩展 Task 接口（新增 10 个字段）
  - **验收**: Given 导入 Project, When 创建 Project 对象（id/name/status/priority/startDate等）, Then TypeScript 编译通过；Given 导入 Task, When 访问 task.parentId / task.projectId / task.earliestTime 等新字段, Then 类型正确（optional）
- [ ] T009 [P] 在 `frontend/src/usom/types/objects.ts` 新增 ProjectTemplate 和 TaskTemplate 接口
  - **验收**: Given 导入 ProjectTemplate, When 创建模板对象, Then 所有模板字段类型正确；Given 导入 TaskTemplate, When 设置 parentTemplateId, Then 自关联类型编译通过
- [ ] T010 在 `frontend/src/lib/db/schema.ts` 新增 projects 表 Drizzle 定义（含索引）
  - **验收**: Given 运行 `npm run db:generate`, When 生成迁移文件, Then 包含 projects 表；Given 查询 `SELECT * FROM projects WHERE user_id = $1`, Then 索引 idx_projects_user_status 被使用
- [ ] T011 [P] 在 `frontend/src/lib/db/schema.ts` 新增 project_templates 表 Drizzle 定义
  - **验收**: Given 运行迁移, When 检查 project_templates 表, Then 包含 id/user_id/name/default_earliest_time 等所有列，索引 idx_project_templates_user 存在
- [ ] T012 [P] 在 `frontend/src/lib/db/schema.ts` 新增 task_templates 表 Drizzle 定义（含 parent_template_id 自关联外键）
  - **验收**: Given 运行迁移, When 检查 task_templates 表, Then 包含 project_template_id 和 parent_template_id 外键，索引 idx_task_templates_project / idx_task_templates_parent 存在
- [ ] T013 在 `frontend/src/lib/db/schema.ts` 扩展 tasks 表：更新 status 枚举（新增 in_progress/on_hold 保留 scheduled），新增 parent_id/project_id/earliest_time/latest_start_time/default_time/default_duration/frequency_type/days_of_week/start_date/end_date 列及对应索引
  - **验收**: Given 运行迁移, When 检查 tasks 表, Then status 列接受 'in_progress'/'on_hold'，所有新增列存在，索引 idx_tasks_user_project / idx_tasks_user_parent / idx_tasks_project_status 存在
- [ ] T014 在 `frontend/src/lib/db/repositories/mappers.ts` 新增 projectRowToUSOM/projectUSOMToRow 映射函数；更新 taskRowToUSOM 处理 `scheduled`→`in_progress` 兼容映射和所有新增字段
  - **验收**: Given DB 行 `{ status: 'scheduled', ... }`, When 调用 taskRowToUSOM, Then 返回 Task.status === 'in_progress'；Given Project USOM 对象, When 调用 projectUSOMToRow, Then 返回正确的 DB 行
- [ ] T015 在 `frontend/src/usom/interfaces/irepository.ts` 新增 IProjectRepository 接口（findById/findByUserId/findByStatus/create/update/updateStatus/saveAsTemplate/delete/archive）和 ITaskTemplateRepository 接口；扩展 ITaskRepository 新增 findByProject/findByParent/findIndependent/findByDateRange/updateStatus/bulkCreate
  - **验收**: Given 导入 IProjectRepository, When 查看接口方法签名, Then 所有方法使用 USOM 类型输入输出（无 Drizzle 行类型暴露），userId 在所有查询方法中出现
- [ ] T016 创建 `frontend/src/lib/db/repositories/project.repository.ts` 实现 IProjectRepository（含 CRUD、状态更新、模板转换入口）
  - **验收**: Given 调用 projectRepo.create(input, userId), When 输入 valid data, Then projects 表新增一行并返回 Project USOM 对象；Given 调用 projectRepo.findByUserId(userId, { status: 'active' }), Then 仅返回该用户该状态的项目
- [ ] T017 [P] 创建 `frontend/src/lib/db/repositories/task-template.repository.ts` 实现 ITaskTemplateRepository（含模板 CRUD、createFromTemplate 两遍算法、事务保护）
  - **验收**: Given 调用 templateRepo.createFromTemplate(projectTemplateId, {startDate, endDate}, userId), When 模板含 2 个顶级任务各 1 个子任务, Then 在一个事务中创建 1 个 Project + 4 个 Task，子任务 parent_id 正确映射
- [ ] T018 扩展 `frontend/src/lib/db/repositories/task.repository.ts`：新增 findByProject/findByParent/findIndependent/findByDateRange/updateStatus/bulkCreate 方法；所有读取方法在返回前调用 taskRowToUSOM（含 scheduled 兼容）
  - **验收**: Given taskRepo.updateStatus(taskId, 'in_progress', userId), When 任务原状态为 'active', Then 数据库 updated_at 更新；Given taskRepo.findByProject(projectId, userId), When 项目有 3 个任务, Then 返回 3 个 Task USOM 对象

**Checkpoint**: Foundation ready — 用户故事实现可以开始

---

## Phase 3: User Story 1 — 创建项目并组织任务 (Priority: P1) 🎯 MVP

**Goal**: 用户可以创建项目，在项目下创建任务和子任务，查看层级结构和整体进度

**Independent Test**: 创建项目 → 添加 3 个任务 → 各添加 1 个子任务 → 验证层级展示（子任务缩进显示在父任务下方）

- [ ] T019 [US1] 创建 `frontend/src/domains/projects/time-inheritance.ts`：实现 resolveTaskTime 纯函数（?? 链式查找 earliestTime/latestStartTime/defaultTime/defaultDuration：子任务→父任务→项目）
  - **验收**: Given 子任务 earliestTime=null, 父任务 earliestTime='08:00', 项目 defaultEarliestTime='09:00', When 调用 resolveTaskTime(subTask, parentTask, project), Then 返回 earliestTime='08:00'；Given 子任务 earliestTime='07:00', 父任务 earliestTime='08:00', When 调用 resolveTaskTime, Then 返回 earliestTime='07:00'（子任务优先）
- [ ] T020 [P] [US1] 创建 `frontend/src/components/projects/status-badge.tsx` 状态徽标组件（根据 ProjectStatus/TaskStatus 映射颜色和中文文本）
  - **验收**: Given status='active', When 渲染 StatusBadge, Then 显示绿色 "进行中" 徽标；Given status='planning', When 渲染 StatusBadge, Then 显示灰色 "规划中" 徽标
- [ ] T021 [P] [US1] 创建 `frontend/src/components/projects/split-warning.tsx` 拆分提示组件（estimatedDuration > 720 时显示黄色 "⚠ 预估时长超过 12 小时，建议拆分为子任务"）
  - **验收**: Given estimatedDuration=800, When 渲染 SplitWarning, Then 显示黄色警告文本；Given estimatedDuration=60, When 渲染 SplitWarning, Then 不渲染任何内容；Given estimatedDuration=null, When 渲染, Then 不渲染
- [ ] T022 [US1] 创建 `frontend/src/components/projects/project-form.tsx` 项目创建/编辑表单（名称、描述、日期范围、默认时间、优先级、颜色、标签），使用 shadcn/ui Form 组件
  - **验收**: Given 用户填写项目名称 "重构认证模块" + 优先级 P1 + 默认时间 09:00-12:00, When 点击保存, Then onSave 回调收到完整的 ProjectFormData；Given 编辑模式传入已有 project 数据, When 表单渲染, Then 所有字段预填当前值
- [ ] T023 [US1] 创建 `frontend/src/components/projects/task-form.tsx` 任务创建/编辑表单（标题、描述、优先级、能量、预估时长、时间调度、频率、截止日期），包含子任务模式（parentId 传入时标题改为 "添加子任务"）
  - **验收**: Given 用户在项目详情页点击 "添加任务", When 填写标题、预估时长 4h、优先级 P0, Then onSave 回调收到 TaskFormData；Given parentId 已传入, When 表单打开, Then 标题显示 "添加子任务" 且 projectId 自动继承
- [ ] T024 [US1] 创建 `frontend/src/components/projects/task-list.tsx` 可折叠任务列表组件（缩进展示子任务、左侧竖线、展开/折叠交互、显示子任务数量）
  - **验收**: Given 任务有 2 个子任务, When 折叠状态, Then 显示 "2 个子任务"；Given 用户点击展开, When 子任务列表显示, Then 子任务缩进 24px 且有左侧竖线连接；Given 任务无子任务, When 渲染, Then 不显示展开箭头
- [ ] T025 [US1] 创建 `frontend/src/components/projects/project-detail.tsx` 项目详情页（返回按钮、项目名称、默认时间、日期范围、编辑按钮、任务列表区域、"添加任务"按钮）；集成 task-list 和 split-warning
  - **验收**: Given URL `/projects/{projectId}`, When 页面加载, Then 显示项目名称、时间范围、任务层级列表；Given 项目下所有任务 completed, When 查看详情, Then 底部提示 "所有任务已完成，建议标记项目为已完成"
- [ ] T026 [US1] 创建 `frontend/src/components/projects/project-card.tsx` 项目卡片组件（名称、状态徽标、优先级、进度条、日期范围）
  - **验收**: Given 项目有 5/10 任务完成, When 渲染卡片, Then 进度条显示 50%；Given status='active', When 渲染, Then 显示绿色状态徽标 "进行中"
- [ ] T027 [US1] 创建 `frontend/src/app/projects/page.tsx` 项目目录页路由（操作栏："+ 新建项目" / "+ 新建任务" / "📥 导入模板"；项目卡片网格；空状态提示）；集成 project-directory
  - **验收**: Given 用户访问 /projects, When 页面加载, Then 显示操作栏和项目卡片列表；Given 无项目, When 页面加载, Then 显示 "暂无项目，点击新建项目开始" 空状态提示
- [ ] T028 [US1] 创建 `frontend/src/app/projects/[id]/page.tsx` 项目详情页路由（根据 URL params 加载项目数据，传递给 ProjectDetail 组件）
  - **验收**: Given URL `/projects/{validId}`, When 页面加载, Then 渲染项目详情组件；Given URL `/projects/{invalidId}`, When 页面加载, Then 显示 404 错误提示

**Checkpoint**: MVP 就绪 — 项目创建、任务层级、子任务管理完全可用

---

## Phase 4: User Story 2 — 任务时间调度与状态流转 (Priority: P2)

**Goal**: 任务可以在状态间流转（draft→active→in_progress→completed），时间参数沿层级继承，超过12小时显示拆分提示

**Independent Test**: 创建任务→激活→开始→完成→验证状态流转；设置父任务时间→创建子任务不设时间→验证继承

- [ ] T029 [US2] 创建 `frontend/src/domains/projects/index.ts` Projects 域插件（实现 onValidate/onEvent/onActionSurfaceRequest/onOutboundRequest 四钩子；onValidate 验证状态转换合法性，onEvent 返回项目进度指标）
  - **验收**: Given onValidate 收到 `{ action: 'activate', target: { status: 'completed' } }`, When 验证, Then 返回 `{ valid: false, reason: '已完成的任务不能重新激活' }`；Given onEvent 触发, When 计算项目指标, Then 返回 `{ taskCompletionRate, activeTaskCount, ... }`
- [ ] T030 [P] [US2] 在 `frontend/src/components/projects/project-detail.tsx` 新增状态切换操作按钮（根据当前状态显示可用操作：draft→"激活"/active→"开始"/in_progress→"完成"或"暂停"/on_hold→"恢复"），调用 updateStatus
  - **验收**: Given 任务状态为 active, When 渲染操作按钮, Then 显示 "开始" 和 "暂停" 两个选项；Given 用户点击 "开始", When updateStatus 成功, Then 任务状态变为 in_progress 且按钮更新为 "完成"/"暂停"
- [ ] T031 [P] [US2] 在 `frontend/src/components/projects/task-form.tsx` 新增时间调度字段（earliestTime/latestStartTime/defaultTime/defaultDuration/frequencyType/daysOfWeek/startDate/endDate），frequencyType='custom' 时显示星期选择器
  - **验收**: Given frequencyType='custom', When 表单渲染, Then 显示星期多选组件；Given frequencyType='once', When 表单渲染, Then 不显示星期选择器；Given 用户选择 daily + startDate '2026-05-15', Then 表单数据包含完整的周期定义
- [ ] T032 [P] [US2] 在 `frontend/src/components/projects/task-list.tsx` 中集成时间继承显示：每个任务行显示解析后的时段（"建议: 09:00-12:00"），在 tooltip 中标注时间来源（"继承自项目默认时间" 或 "继承自父任务"）
  - **验收**: Given 子任务无显式时间、父任务 earliestTime='08:00', When 渲染子任务行, Then 显示 "08:00" 且 hover tooltip 标注 "继承自父任务"；Given 任务有显式时间, When 渲染, Then tooltip 标注 "自定义"
- [ ] T033 [US2] 在 `frontend/src/lib/time-inheritance.test.ts` 中新增时间继承链纯函数单元测试（测试 self→parent→project 三级回退、null/undefined 区别、空字符串处理）
  - **验收**: Given 所有层级时间为 null, When 调用 resolveTaskTime, Then 返回所有字段为 undefined；Given 父任务 earliestTime='', 子任务 earliestTime=null, When 调用, Then 不继承空字符串（返回 undefined）

**Checkpoint**: 任务状态流转和时间调度完整可用

---

## Phase 5: User Story 3 — 模板与AI导入 (Priority: P3)

**Goal**: 用户可将项目保存为模板、从模板创建项目；下载/编辑/上传模板文件，AI 识别后预览保存

**Independent Test**: 创建项目→保存为模板→从模板创建新项目→验证结构一致；上传 Markdown 文件→AI 提取→预览→保存

- [ ] T034 [US3] 创建 `frontend/src/lib/task-import/template-markdown.ts` 模板 Markdown 生成器（projectToMarkdown）和解析器（markdownToProject 纯文本提取，不含 AI）
  - **验收**: Given 项目含 2 个任务各 1 个子任务, When 调用 projectToMarkdown, Then 生成符合模板格式的 Markdown（含 HTML 注释字段说明）；Given Markdown 模板文本, When 调用 markdownToProject, Then 提取出项目名和任务标题列表（不含层级关系——层级由 AI 处理）
- [ ] T035 [US3] 创建 `frontend/src/lib/task-import/task-extractor.ts` LLM 任务提取器：调用 OpenAI 将模板文本转为结构化 JSON（含 project/tasks/depth 层级），prompt 包含字段说明和输出 schema 约束
  - **验收**: Given Markdown 模板文本（含项目名+2 个 # 任务+各含 ## 子任务）, When 调用 extractTasks, Then LLM 返回 JSON（project.name 正确、tasks 含 depth:0 和 depth:1 层级）；Given LLM 调用失败, When 调用, Then 抛出明确的错误（不吞异常）
- [ ] T036 [US3] 扩展 `frontend/src/lib/task-import/file-parser.ts`（复用 OKR 的 validateFile/parseFileToText）：新增任务模板格式的特征检测（检测 `# 项目任务导入模板` 或 `## 项目:` 标记）
  - **验收**: Given 上传 .md 文件含 "## 项目:" 标记, When 调用 validateFile + parseFileToText, Then 返回完整文本内容；Given 上传 .xlsx 文件, When 调用 parseFileToText, Then 将单元格内容按行拼接为文本；Given 文件超过 5MB, When 调用 validateFile, Then 抛出文件过大错误
- [ ] T037 [US3] 创建 `frontend/src/components/projects/task-import-panel.tsx` AI 导入预览编辑面板（显示提取的 project 信息 + 任务树，每个字段可编辑，支持修改标题/优先级/时长/层级）
  - **验收**: Given AI 返回 ImportPreview（1 项目 + 4 任务）, When 面板渲染, Then 显示项目名、任务树形结构、每个任务的可编辑字段；Given 用户修改任务标题, When 点击保存, Then onSave 回调收到修改后的 ImportPreview
- [ ] T038 [US3] 创建 `frontend/src/components/projects/task-import-dialog.tsx` AI 导入对话框（文件上传区→解析进度→预览面板切换）；三步骤：上传→AI 分析（spinner）→预览编辑
  - **验收**: Given 用户点击 "📥 导入模板", When 对话框打开, Then 显示文件拖放区；Given 用户上传 .md 文件, When 解析进行中, Then 显示 spinner 和 "AI 正在分析任务结构..." 文本；Given AI 返回结果, When 切换到预览面板, Then 显示 TaskImportPanel
- [ ] T039 [US3] 创建 `frontend/src/components/projects/template-dialog.tsx` 模板管理对话框：模板列表 + 保存为模板（输入名称） + 从模板创建（选择模板后输入新日期）
  - **验收**: Given 用户在项目详情页点击 "保存为模板", When 对话框打开并输入模板名, Then 调用 saveAsTemplate 创建 ProjectTemplate + 对应 TaskTemplates；Given 用户点击 "从模板创建", When 选择模板并设置 startDate='2026-06-01', Then 调用 createFromTemplate 生成新项目（状态为 planning）
- [ ] T040 [US3] 在 `frontend/src/app/projects/page.tsx` 操作栏接入 TaskImportDialog 和 TemplateDialog（"📥 导入模板" 按钮 → TaskImportDialog；"从模板创建" → TemplateDialog）
  - **验收**: Given 用户在项目目录页, When 点击 "📥 导入模板", Then 打开导入对话框；Given 用户在项目目录页, When 点击操作栏模板按钮, Then 打开模板管理对话框

**Checkpoint**: 模板系统和 AI 导入完整可用

---

## Phase 6: User Story 4 — 项目与任务的独立管理 (Priority: P4)

**Goal**: 不归属项目的独立任务在页面底部显示；项目目录页支持状态筛选；项目完成提示归档

**Independent Test**: 创建独立任务→验证在目录页底部显示；切换筛选→验证列表过滤；归档项目→验证从默认视图消失

- [ ] T041 [US4] 在 `frontend/src/app/projects/page.tsx` 底部新增独立任务区域（调用 taskRepo.findIndependent 获取 projectId=null 的任务，列表式展示标题/优先级/状态）
  - **验收**: Given 用户有 2 个独立任务, When 访问项目目录页, Then 底部 "独立任务" 区域显示 2 个任务；Given 无独立任务, When 页面加载, Then 不显示 "独立任务" 区域
- [ ] T042 [US4] 在 `frontend/src/app/projects/page.tsx` 操作栏下方新增状态筛选标签栏（全部/进行中(active+paused)/已完成(completed)/已归档(archived)），点击标签过滤项目列表
  - **验收**: Given 项目列表含 2 active/1 completed/1 archived, When 点击 "进行中" 筛选, Then 仅显示 2 个 active+paused 项目；Given 点击 "全部", Then 显示所有未归档项目；Given 切换筛选, Then URL query params 同步更新（?filter=active）
- [ ] T043 [US4] 在 `frontend/src/components/projects/project-detail.tsx` 新增 "完成项目" 和 "归档项目" 按钮（仅当项目下所有任务已完成时显示完成提示；完成/归档后更新项目状态）
  - **验收**: Given 项目下所有任务 completed, When 查看项目详情, Then 顶部显示 "所有任务已完成" 提示 + "标记为已完成" 按钮；Given 用户点击 "标记为已完成", When 确认, Then 项目状态变为 completed；Given 项目为 completed, When 显示 "归档" 按钮并点击, Then 项目状态变为 archived

**Checkpoint**: 独立任务管理和筛选归档完整可用

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 跨故事改进、验证和清理

- [ ] T044 运行 `specs/005-task-management/quickstart.md` 验收清单，逐项验证所有功能
  - **验收**: Given 验收清单 8 项, When 逐项执行, Then 全部通过
- [ ] T045 [P] 在 `frontend/src/lib/db/repositories/__tests__/` 创建 task.repository.test.ts（Vitest 单元测试：findByProject/findByParent/updateStatus 及 scheduled 兼容映射）
  - **验收**: Given mock DB 有 1 个 scheduled 状态任务, When findActive, Then 返回该任务且 status='in_progress'；`npm test` 通过
- [ ] T046 [P] 在 `frontend/src/lib/db/repositories/__tests__/` 创建 project.repository.test.ts（Vitest 单元测试：create/updateStatus/saveAsTemplate）
  - **验收**: Given 调用 create, When DB 插入成功, Then 返回完整 Project 对象；`npm test` 通过
- [ ] T047 运行 `npm run lint` 和 `npm run build` 确保无编译错误和 lint 警告
  - **验收**: Given 运行 lint, When 完成, Then exit code 0；Given 运行 build, When 完成, Then 构建成功

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖 — 立即开始
- **Foundational (Phase 2)**: 依赖 Setup 完成 — **阻塞所有用户故事**
- **User Story 1 (Phase 3)**: 依赖 Foundational — MVP 入口
- **User Story 2 (Phase 4)**: 依赖 Foundational — 可与 US1 并行但通常在其后（US1 提供基础 UI 组件）
- **User Story 3 (Phase 5)**: 依赖 Foundational + US1（复用 Project 表单/任务列表组件）
- **User Story 4 (Phase 6)**: 依赖 Foundational + US1（复用项目目录页）
- **Polish (Phase 7)**: 依赖所有用户故事完成

### User Story Dependencies

- **US1 (P1)**: Foundational → 即可开始。无其他故事依赖
- **US2 (P2)**: Foundational → 即可开始。扩展 US1 的 task-form/task-list/project-detail 组件
- **US3 (P3)**: Foundational + US1（复用表单和列表组件模式）
- **US4 (P4)**: Foundational + US1（复用项目目录页）

### Within Each User Story

- 域逻辑（纯函数） → 组件 → 路由页面
- 子组件（status-badge/split-warning）在父组件之前
- 表单组件在页面组件之前
- 每个故事以路由页面为终点

### Parallel Opportunities

- Phase 1: T001–T006 全部可并行（涉及不同文档段落）
- Phase 2: T009 可与 T008 并行；T011/T012 可与 T010/T013 并行；T017 可与 T016 并行
- Phase 3: T020/T021 可并行；T022/T023 可并行
- Phase 4: T030/T031/T032 可并行
- Phase 5: T034/T036 可在 T035 之前并行

---

## Parallel Example: User Story 1

```bash
# 并行启动 US1 的独立子组件：
Task: "T020 [P] [US1] 创建 status-badge.tsx"
Task: "T021 [P] [US1] 创建 split-warning.tsx"

# 并行启动表单组件：
Task: "T022 [US1] 创建 project-form.tsx"
Task: "T023 [US1] 创建 task-form.tsx"
```

## Parallel Example: Foundational

```bash
# 模板表可并行创建：
Task: "T011 [P] 新增 project_templates 表"
Task: "T012 [P] 新增 task_templates 表"

# Repository 实现可并行：
Task: "T016 实现 project.repository.ts"
Task: "T017 [P] 实现 task-template.repository.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup（文档更新）
2. Complete Phase 2: Foundational（类型+Schema+Repository）— **CRITICAL**
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: 创建项目→添加任务→添加子任务→验证层级展示
5. 可部署/演示 MVP

### Incremental Delivery

1. Setup + Foundational → 基础设施就绪
2. + US1 → 完整项目-任务-子任务创建流程 → **MVP!**
3. + US2 → 状态流转 + 时间调度 → 任务可执行
4. + US3 → 模板 + AI 导入 → 批量创建
5. + US4 → 独立任务 + 筛选 → 完整体验
6. 每个故事独立增加价值，不破坏已有功能

---

## Notes

- 每个任务预计 5–15 分钟
- 验收用例为 Given-When-Then 格式
- 涉及文件路径均使用 `frontend/src/` 前缀
- [P] 标记的任务操作不同文件，可并行执行
- [US?] 标签将任务映射到具体用户故事
- 每个 Checkpoint 后停顿验证故事独立性
- 提交粒度：每个任务或逻辑组完成后提交
