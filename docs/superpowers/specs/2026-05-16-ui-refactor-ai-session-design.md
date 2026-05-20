# Lifeware 界面重构及AI助手优化 — 设计规格

**版本**: 1.0.0 | **日期**: 2026-05-16 | **状态**: 待审阅

---

## 1. 概述

### 1.1 目标

对 APP 核心界面进行重构，升级 AI 助手为 session 级对话，增强意图驱动能力。

### 1.2 范围

本规格涵盖 6 个子系统，采用"整体设计、分阶段实施"策略：

| 子系统 | 需求编号 | 说明 |
|---|---|---|
| Domain Manifest 扩展 + Registry 增强 | [001] | 快捷方式别名、view_routes、运行时消费 |
| AI 会话数据模型 | [000] | Session 级对话、历史管理、续接机制 |
| UI 框架重构 | [002] | 左侧面板、主显示区动态路由、分裂视图 |
| 成长领域菜单 + 快捷方式执行 | [002] 子项 | 功能菜单、快捷方式解析 |
| template_markdown 工作流 | [003] | 表单与 Markdown 双路径、Timebox 模板 |
| 配置页面 | [004] | LLM 设置、时区、习惯模板、通用占位 |

### 1.3 实施阶段

```
P1: Domain Manifest 扩展 + Registry 增强     ← 数据层基础
P2: AI 会话数据模型                          ← 数据层基础
P3: UI 框架重构                              ← UI 壳
P4: 成长领域菜单 + 快捷方式执行               ← 功能接入
P5: template_markdown 工作流                 ← 功能接入
P6: 配置页面                                 ← 功能接入
```

P1→P2 无依赖可并行。P3 依赖 P1。P4/P5/P6 依赖 P1、P3。

---

## 2. Domain Manifest 扩展与 Registry 增强

### 2.1 manifest.yaml 新增内容

#### 2.1.1 快捷方式别名（intent_triggers 扩展）

在现有 `intent_triggers` 条目中增加 `shortcut` 字段：

```yaml
intent_triggers:
  - action: createHabit
    shortcut: /createHabit          # 新增：短格式别名，全局唯一
    description: 创建新习惯
    examples: ["我想培养一个新习惯", "帮我创建一个习惯"]
    keywords: ["习惯", "新建", "创建", "培养"]
    signals: ["用户想要建立一个新习惯"]
    excludes: ["临时的习惯（应归属 tasks Domain）"]
```

**约束**：
- 长格式 `/domain:action` 为规范名（如 `/habits:createHabit`），始终可用
- 短格式 `/action` 为别名，注册时校验全局唯一性
- 冲突时 Registry 初始化报错，拒绝启动

#### 2.1.2 view_routes 块（新增 G 块）

定义 action 到界面组件的映射：

```yaml
view_routes:
  createHabit:
    component: domains/habits/pages/HabitFormPage
    params:
      mode: create
  view_list:
    component: domains/habits/pages/HabitListPage
  editHabit:
    component: domains/habits/pages/HabitEditPage
    params:
      mode: edit
```

**消费方**：Presentation Layer（主显示区动态路由）。

#### 2.1.3 Markdown 模板声明（templates 扩展）

```yaml
templates:
  form:
    createHabit:
      - key: title
        label: "习惯名称"
        type: text
        required: true
      # ... 现有表单字段
  markdown:                          # 新增
    createHabit:
      template_file: "markdown_templates/create_habit.md"
      description: "批量创建习惯时使用的 Markdown 模板"
      output_action: "createHabit"
      max_objects: 1
```

### 2.2 Domain Registry 增强

当前 Registry 仅做 Domain 注册列表。增强后新增 accessor 方法：

```typescript
// domains/registry.ts
export const domainRegistry = {
  // 现有：插件列表
  plugins: DomainPlugin[],

  // 新增：按 DomainId 获取 manifest
  getManifest(domainId: DomainId): DomainManifest,

  // 新增：按 shortcut 查询 (domainId, action)
  getActionByShortcut(shortcut: string): { domainId: string; action: string } | undefined,

  // 新增：按 (domainId, action) 获取视图路由
  getViewRoute(domainId: string, action: string): ViewRoute | undefined,

  // 新增：获取所有 Domain 的 action 列表（供成长领域菜单使用）
  getAllDomainActions(): DomainActionSummary[],

  // 新增：按 (domainId, action) 获取 Markdown 模板路径
  getMarkdownTemplate(domainId: string, action: string): string | undefined,
}
```

**shortcut 唯一性校验**：注册时遍历所有 manifest 的 shortcut，冲突时抛出 `ShortcutConflictError`。

### 2.3 Constitution 合规性

| 约束 | 合规方式 |
|---|---|
| Manifest Runtime Consumption | 所有 accessor 方法从运行时加载，无硬编码常量 |
| Domain Manifest Self-Description | 新增 G 块是被动声明，无需修改 Nexus 代码 |
| Domain Plugin Passivity (VI) | view_routes 和 shortcuts 是声明，不是执行能力 |
| Domain Registration Process | 新增 G 块是 manifest 扩展，不改变 8-step 流程 |

---

## 3. AI 会话数据模型

### 3.1 USOM 对象：AISession

```typescript
// usom/types/objects.ts 新增

type AISessionStatus = 'active' | 'archived'

interface AISession {
  id:              USOM_ID
  userId:          string
  title:           string                          // 由首条消息自动生成
  status:          AISessionStatus
  messages:        ChatMessage[]                   // JSONB
  stateSnapshot:   Record<string, unknown>         // JSONB：关联对象的 USOM 摘要快照
  referencedObjectIds: USOM_ID[]                   // 会话中引用的对象 ID 列表
  createdAt:       Timestamp
  updatedAt:       Timestamp
  archivedAt?:     Timestamp
}

interface AISessionSummary {
  id:        USOM_ID
  title:     string
  status:    AISessionStatus
  createdAt: Timestamp
  updatedAt: Timestamp
}

interface ChatMessage {
  role:       'user' | 'assistant' | 'system'
  content:    string
  timestamp:  Timestamp
  intentRef?: string                              // 关联的 StructuredIntent ID（若有）
}
```

### 3.2 数据库 Schema

```sql
CREATE TABLE ai_sessions (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL,
  title                 TEXT NOT NULL DEFAULT '新对话',
  status                TEXT NOT NULL DEFAULT 'active',
  messages              JSONB NOT NULL DEFAULT '[]',
  state_snapshot        JSONB NOT NULL DEFAULT '{}',
  referenced_object_ids JSONB NOT NULL DEFAULT '[]',
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  archived_at           TIMESTAMP
);
```

**JSONB 使用合规**：messages 是嵌入式文档，state_snapshot 是快照/配置，均符合 constitution JSONB 许可规则。

### 3.3 会话生命周期

```
创建 → active → archived（终态）
```

- **创建**：用户点击左侧面板"新对话"时创建
- **激活期**：用户可在左侧面板点击继续
- **归档**：用户删除或手动归档

### 3.4 会话续接机制

续接时执行双层状态合并：

1. 从 `state_snapshot` 加载该会话创建/上次继续时的对象快照
2. 从 Repository 读取 `referenced_object_ids` 对应的对象当前实际状态
3. 对比差异，构建系统消息告知 AI：例如 "会话创建时目标 X 处于 draft 状态，现已 active"
4. AI 基于合并后的完整上下文继续对话

### 3.5 Repository 接口

```typescript
export interface ISessionRepository {
  findById(id: USOM_ID): Promise<AISession | null>
  findByUserId(userId: string): Promise<AISessionSummary[]>
  create(session: AISession): Promise<void>
  updateMessages(id: USOM_ID, messages: ChatMessage[]): Promise<void>
  updateStateSnapshot(id: USOM_ID, snapshot: Record<string, unknown>, refIds: USOM_ID[]): Promise<void>
  archive(id: USOM_ID): Promise<void>
}
```

### 3.6 Constitution 合规性

| 约束 | 合规方式 |
|---|---|
| T-01 多租户 | user_id 字段 |
| R-01/R-02 Repository | 通过 ISessionRepository 访问，Nexus/UI 不直接调 Drizzle |
| JSONB 规则 | messages（嵌入式文档）、state_snapshot（快照）均许可 |
| 不涉及 State Machine | AISession 是基础设施对象，非业务对象 |

---

## 4. UI 框架重构

### 4.1 核心理念

AI 对话**移入主显示区**，左侧面板作为"导航入口"而非对话区。

### 4.2 整体布局

```
┌──────────────────────────────────────────────────────────┐
│ TopNav                                    [⚙ 设置]       │
├──────────────┬───────────────────────────────────────────┤
│ 左侧 Panel    │ 主显示区 (Main Content)                    │
│ (320px)      │                                           │
│              │  默认：当天时间盒安排 (DayView)              │
│ [🏠 Home]    │                                           │
│              │  对话激活时：                               │
│ [Tab]        │  ┌──────────────┬──┬────────────────────┐ │
│ ├ AI助手     │  │ AI 对话       │↕│ form/markdown 编辑  │ │
│ └ 成长领域   │  │ (min 300px)  │  │                    │ │
│              │  │              │  │                    │ │
│ (会话列表     │  │ 📎 上传文件   │  │ [表单] [Markdown]  │ │
│  或          │  │ ⬇ 下载模板   │  │                    │ │
│  领域菜单)    │  └──────────────┴──┴────────────────────┘ │
│              │            ↑ 可拖拽分割线                   │
└──────────────┴───────────────────────────────────────────┘
```

### 4.3 左侧 Panel 组件树

```
LeftPanel (320px)
├── HomeButton                    ← 🏠 + "Home"，固定显示
├── PanelTabs
│   ├── Tab: AI助手               ← 会话历史列表
│   └── Tab: 成长领域             ← 领域功能菜单
│
├── [AI 助手 Tab 内容]
│   ├── [+ 新对话] 按钮           ← 主显示区进入新对话
│   ├── 会话历史列表
│   │   ├── 2026-05-16 (可收起)   ← 按日期分组
│   │   │   ├── 会话1 (点击→主显示区)
│   │   │   └── 会话2
│   │   └── 2026-05-15
│   │       └── 会话3
│   └── 默认全部展开，超出滚动
│
├── [成长领域 Tab 内容]
│   ├── 习惯 - 行动
│   │   ├── 创建习惯    /createHabit
│   │   ├── 习惯打卡    /logHabit
│   │   └── ...
│   ├── OKR - 行动
│   │   └── ...
│   ├── 项目/任务 - 行动
│   │   └── ...
│   └── 时间盒 - 行动
│       └── ...
│
└── (取消 "表单填写" Tab)
```

### 4.4 主显示区状态

```typescript
type MainViewState =
  // 默认：时间盒安排
  | { type: 'schedule'; date: Date; viewMode: DateViewMode }
  // AI 对话激活
  | { type: 'conversation'; sessionId: string; splitWith?: StructuredContent }
  // Action 执行（从成长领域或快捷方式触发）
  | { type: 'action'; domainId: DomainId; action: string }

type StructuredContent =
  | { mode: 'form';   fields:   Record<string, unknown>; domain: string; action: string }
  | { mode: 'markdown'; content: string; domain: string; action: string }
```

**状态切换规则**：

| 触发源 | 目标状态 | 说明 |
|---|---|---|
| Home 点击 | `schedule` | 重置为时间盒视图，自动保存当前对话 |
| 左侧"新对话" | `conversation`（新 sessionId） | 创建新会话，自动保存当前对话 |
| 左侧"旧对话" | `conversation`（已有 sessionId） | 加载历史，合并当前状态，自动保存当前对话 |
| 成长领域菜单点击 | `action` | 加载 Domain 组件 |
| 快捷方式 `/xxx` | `action` | 同上 |
| AI 解析出结构化内容 | `conversation` + `splitWith` | 主显示区分裂 |

### 4.5 分裂视图（AI 对话 + 编辑区）

当 `splitWith` 不为空时，主显示区水平分为两部分：

- **左侧 AI 对话**（最小宽度 300px，默认 50%）
- **可拖拽分割线**（ResizableSplitter 组件）
- **右侧编辑区**（flex-1）包含：
  - `[表单]` / `[Markdown]` 标签切换
  - 编辑/填写区域
  - `[下一步 → 确认执行]` 按钮

编辑区的内容和标签切换由 `splitWith` 的 `mode` 决定：
- `mode: 'form'` → 显示 template_form 表单
- `mode: 'markdown'` → 显示 template_markdown 编辑器

**确认执行后**：点击"下一步"触发 Intent Engine → Rule Engine → State Machine 链路。成功执行后，分裂视图折叠（`splitWith` 设为空），对话保持在左侧完整宽度，AI 报告执行结果。

### 4.6 文件上传与模板下载

**上传**（对话输入区附件按钮）：

| 格式 | 处理方式 |
|---|---|
| `.md` | 文本提取后注入 AI 上下文 |
| `.xlsx` / `.xls` | 解析为结构化数据后注入 |
| `.txt` / `.csv` | 文本提取，CSV 解析为表格 |

**模板下载**：
- 每个定义了 `templates.markdown` 的 action 旁显示下载按钮
- 下载对应模板文件供离线编辑
- 上传 .md 文件后由 AI 解析为 StructuredIntent

### 4.7 组件变更清单

| 组件 | 变更 |
|---|---|
| `ai-panel.tsx` | 重写为会话历史列表 + 新对话按钮，移除对话输入和 mode 切换 |
| `intent-input.tsx` | 移入主显示区，增加文件上传按钮、模板下载按钮 |
| `intent-form.tsx` | 保留，移入编辑区 |
| `main-content.tsx` | 支持分裂视图，集成 ResizableSplitter |
| 新增 `conversation-view.tsx` | 主显示区中的对话视图容器 |
| 新增 `resizable-splitter.tsx` | 可拖拽分割线组件 |
| 新增 `file-uploader.tsx` | 文件上传处理 |
| 新增 `growth-menu.tsx` | 成长领域功能菜单（从 registry 动态生成） |
| 新增 `markdown-editor.tsx` | Markdown 编辑器 |
| `page.tsx` | 重构 MainViewState，移除旧视图切换逻辑 |
| `app-shell.tsx` | 适应新的左侧面板结构 |

### 4.8 Constitution 合规性

| 约束 | 合规方式 |
|---|---|
| Single-Writer (III) | 左侧面板只做导航，不写状态 |
| R-04 | 组件只接收 USOM 对象 |
| Intent-Driven (I) | 文件上传/快捷方式/菜单点击均进入 Intent Engine |
| Bridge Layer (VII/D) | 主显示区状态管理不依赖 HTTP 上下文 |

---

## 5. 成长领域菜单 + 快捷方式执行

### 5.1 菜单数据流

```
manifest.yaml (intent_triggers + view_routes)
       ↓ Registry.getAllDomainActions()
GrowthMenu 组件 (左侧 Panel Tab)
       ↓ 用户点击
MainViewState → { type: 'action', domainId, action }
       ↓ domainRegistry.getViewRoute()
主显示区加载对应 Domain 页面组件
```

### 5.2 菜单结构

运行时从 Registry 生成，每个 Domain 一个可收起的分组：

```
成长领域
├── 习惯 - 行动              [▾ 可收起]
│   ├── 创建习惯      /createHabit
│   ├── 习惯打卡      /logHabit
│   ├── 激活习惯      /activateHabit
│   ├── 暂停习惯      /suspendHabit
│   ├── 归档习惯      /archiveHabit
│   ├── 查看列表      view_list
│   └── 查看模板      view_templates
├── OKR - 行动               [▾ 可收起]
│   ├── 创建目标      /createObjective
│   ├── 创建关键结果  /createKeyResult
│   └── ...
├── 项目/任务 - 行动          [▾ 可收起]
│   └── ...
└── 时间盒 - 行动             [▾ 可收起]
    └── ...
```

### 5.3 交互规则

- **默认全部展开**，点击 Domain 名收起/展开
- 每个 action 显示：行动名称 + 快捷方式（灰色 `/shortcut`）
- 点击 → 主显示区进入 action 视图
- 如果 action 有 `template_markdown`，显示 markdown 图标标记
- `view_route` 类型的 action 也出现在菜单中

### 5.4 快捷方式解析

```typescript
// Intent Engine 输入预处理
function matchShortcut(rawInput: string) {
  const trimmed = rawInput.trim()

  // 1. 匹配 /domain:action 或 /domain:action-with-hyphens
  const match = trimmed.match(/^\/(\w+):([\w-]+)$/)
  if (match) {
    const [, domainId, action] = match
    const manifest = domainRegistry.getManifest(domainId as DomainId)
    if (manifest?.intent_triggers.some(t => t.action === action)) {
      return { domainId, action, confidence: 1.0 }
    }
  }

  // 2. 匹配 /action 或 /my-action（短别名，全局唯一）
  if (trimmed.match(/^\/([\w-]+)$/)) {
    return domainRegistry.getActionByShortcut(trimmed)
  }

  // 3. 无匹配 → 走自然语言路由
  return undefined
}
```

### 5.5 执行路径

```
快捷方式匹配 → Intent Engine Phase B（跳过 Phase A）
  → template_form 填充
  → 主显示区切换到 action 视图
  → 用户确认
  → Orchestrator pipeline
```

### 5.6 Constitution 合规性

| 约束 | 合规方式 |
|---|---|
| Manifest Runtime Consumption | 菜单从 Registry 动态生成，无硬编码 action 列表 |
| Domain Manifest Self-Description | 新增 Domain 只需更新 manifest，不修改 Intent Engine |
| Domain Registration Process | 菜单依赖 manifest 区块 A + G，页面组件遵循 Step 5.5 |
| Intent Engine 非侵入 | 快捷方式匹配是预处理，不改变核心路由逻辑 |

---

## 6. template_markdown 工作流

### 6.1 表单与 Markdown 双路径

对于支持 `template_markdown` 的 action，编辑区支持两个标签切换：

```
右侧编辑区
├── [表单] [Markdown]    ← 标签切换
├── 内容编辑区
└── [下一步 → 确认执行]
```

### 6.2 Timebox Markdown 模板（新增）

```markdown
# 时间盒安排

## 基本信息
- 日期：YYYY-MM-DD
- 时间盒总数：N

## 时间盒列表

### 时间盒 1
- 标题：
- 开始时间：HH:MM
- 时长：分钟
- 关联任务：（可选，填写任务标题）
- 关联习惯：（可选，填写习惯标题）
- 能量级别：1-10

### 时间盒 2
- 标题：
- 开始时间：HH:MM
- 时长：分钟
- 关联任务：
- 关联习惯：
- 能量级别：1-10

---
> 编辑完成后点击「下一步」提交
```

### 6.3 工作流闭环

```
1. 用户输入意图或点击 action
2. AI 建议使用 Markdown（复杂创建场景）或表单（简单场景）
3. 主显示区分裂：左侧 AI 对话 + 右侧编辑区（默认表单标签）
4. 用户可切换到 Markdown 标签编辑
5. AI 可依据对话上下文自动填充 Markdown 初稿
6. [下一步] → Intent Engine 解析 Markdown → StructuredIntent
7. → Rule Engine 校验 → State Machine 执行
```

**下载→离线→上传场景**：
```
下载模板 → 离线编辑 → 上传 .md → AI 解析为 StructuredIntent → 编辑区显示 → 确认执行
```

### 6.4 Markdown 解析策略

在 Intent Engine 中新增 `markdown-parser.ts`：

- 参照 `template-parser.ts` 模式，将 Markdown 结构映射为 `StructuredIntent.fields`
- 每个 action 的 template_markdown 定义了字段→Markdown 分区的映射关系
- **MVP 限制**：单个 Markdown 只产生单个 Domain 的单个 StructuredIntent
- 跨 Domain 批处理留后续版本

### 6.5 fallback 降级路径

```
Markdown 解析失败 → 高亮无法解析的部分 → 用户修正
                       ↓ 仍失败
                   降级到 template_form 路径
```

### 6.6 Constitution 合规性

| 约束 | 合规方式 |
|---|---|
| AI/Rule Boundary (VIII) | AI 生成 Markdown 初稿和解析建议，不直接写状态 |
| Intent-Driven (I) | Markdown → StructuredIntent → 标准 Nexus 链 |
| VIII fallback | Markdown 解析失败降级到 template_form |
| MVP 单 Domain | 符合文档"跨 Domain 批处理留后续版本" |

---

## 7. 配置页面

### 7.1 入口

右上角设置按钮，点击后主显示区进入配置页面视图。

### 7.2 配置项

| 分类 | 内容 | 本次实现 |
|---|---|---|
| 通用 | 语言选择（预留） | 框架 + 占位 |
| 通用 | 界面颜色选择（预留） | 框架 + 占位 |
| 时区 | 时区选择器 | 完整实现 |
| 习惯模板 | 接入现有习惯模板管理功能 | 完整实现（复用 HabitTemplateManager） |
| 大语言模型 | 厂家选择、BASE_URL、API_KEY、默认模型 | 完整实现 |

### 7.3 LLM 设置实现

LLM 配置存储在本地（localStorage + 可选的数据库持久化），供 Intent Engine AI 解析器使用。

```typescript
interface LLMConfig {
  provider:    string   // 'openai' | 'anthropic' | 'custom'
  baseUrl:     string
  apiKey:      string   // 加密存储
  defaultModel: string
}
```

**安全考虑**：API Key 使用 localStorage 加密存储（Web Crypto API），不通过服务端中转。

### 7.4 时区设置

- 从浏览器自动检测默认值
- 提供时区下拉列表
- 保存到用户记录（users 表）
- 影响所有时间显示

### 7.5 Constitution 合规性

| 约束 | 合规方式 |
|---|---|
| 无违反 Single-Writer | 配置页面是只写配置数据，不操作业务状态 |
| 无违反 Nexus 边界 | 配置管理在读/写配置时走独立路径，不经过 Nexus 业务链 |
| LLM 配置影响范围 | 仅影响 Intent Engine AI 解析器，符合 VIII AI/Rule 边界 |

---

## 8. 数据库变更汇总

### 8.1 新增表

| 表名 | 用途 | 关键字段 |
|---|---|---|
| `ai_sessions` | AI 会话管理 | id, user_id, status, messages(JSONB), state_snapshot(JSONB) |
| `user_settings` | 用户设置 | id, user_id, timezone, llm_config(JSONB) |

### 8.2 现有表变更

无。所有变更通过新增表实现，不影响现有 schema。

---

## 9. Constitution 合规性总结

| 治理原则 | 影响评估 | 合规状态 |
|---|---|---|
| I. Intent-Driven | 所有写操作入 Intent Engine，无例外 | 合规 |
| II. Energy-First | 无变更 | 不受影响 |
| III. Single-Writer | UI 导航不写状态，配置页独立路径 | 合规 |
| IV. USOM Sovereignty | AISession/UserSettings 先定义本文档再写代码 | 合规 |
| V. Repository Isolation | 所有数据访问通过 Repository | 合规 |
| VI. Domain Plugin Passivity | manifest 扩展是声明，不违反四钩三禁 | 合规 |
| VII. Bridge Layer Readiness | 无 HTTP 上下文依赖 | 合规 |
| VIII. AI/Rule Boundary | AI 在对话层/解析层，不越界写状态 | 合规 |
| Manifest Runtime Consumption | Registry accessor 运行时加载，零硬编码 | 合规 |
| Domain Registration | 遵循 8-step，无需修改 Nexus | 合规 |
| Multi-Tenancy (T-01~04) | 新表包含 user_id | 合规 |
| JSONB 规则 | messages(嵌入文档)、state_snapshot(快照)、llm_config(配置) | 合规 |

---

## 10. 在规约覆盖范围外的内容

以下内容**不**在本次范围内：

- 跨 Domain 的 Markdown 批处理（MVP 单 Domain）
- 移动端适配（MVP 仅 Web）
- Bridge Layer 实现（Phase 2）
- AI 对话的实时流式响应（可后续优化）
- 多语言国际化

---

*文档版本：1.0.0 | 作者：Claude + Walker | 于 2026-05-16*
