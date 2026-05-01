# Lifeware 总体设计 2026_03_18

------
**本文档说明**

本文档为 Lifeware 设计的**最高约束文件**，用于**统一 Lifeware 的设计边界、系统职责与不可违背的原则**。
它不是 PRD，也不是功能说明，而是所有子 App 设计、AI 行为、架构决策的**最高约束文件**。

注：本文档有部分是超前规划，其内容并非全部在 MVP 中实现，但是其约束也适合后续版本迭代。

关联文档：
- `LW_overall_技术栈设计演进.md`（技术栈选型与演进路径，不在本文档重复）

**变更记录（2026_03_18）**：
- 新增第五层架构：Bridge Layer（外部接入层）
- 新增第五节：Lifeware 护城河定义
- 新增 3.11 Bridge Layer 设计规范
- 新增 Bridge Layer 四条架构约束（约束 A-D）
- 技术栈演进阶段与 Bridge Layer 实现时序对齐（详见技术栈文档）

------

# 一、Lifeware 总体架构设计

## 1.1 设计原则（Design Principles）

### Local First 及隐私安全

- 本地数据库是 **唯一真实数据源（Source of Truth）**，如计划编排、时间盒手工调整、打卡等常用操作可离线执行
- 服务端数据库只是：
  - 同步中转站
  - 多端一致性保障
  - 备份与恢复工具
- 端到端加密（E2E），客户端持有主密钥，服务端仅存密文（MVP 阶段不实现）

### 连续性优先于模块清晰

- 任何设计都不得打断用户的"我现在在干嘛"
- 不允许出现需要用户**重新理解语境**的跳转

### 逻辑自治，物理统一

- Domain 在模型与规则上完全独立
- 表现层始终保持一个统一 App

### 意图驱动，而非功能驱动

- Lifeware 核心主页面，不是为了指示"使用功能"
- 而是为了**回应当下的一个模糊或明确的意图**，并引导用户进入相关功能，形成意图驱动

### 开放接入，不主动适配

- Lifeware 通过标准协议（MCP、REST）暴露能力，不主动适配任何具体 Agent 平台
- 支持标准协议的接入方可自行对接，Lifeware 不做逐一集成

---

## 1.2 核心哲学（Core Philosophy）

### 资源观的升维：从"时间管理"到"能量配置"

在 Lifeware 的世界观里，**"能量"与"时间"具有同等的维度权重**。

- **观点**：传统的操作系统（OS）管理的是 CPU 和内存资源；而作为"人生操作系统"，Lifeware 管理的核心资源是**人的生理/心理能量**。
- **确定性结论**：任何不考虑执行者能量状态的任务调度方案，在 Lifeware 中都被视为"无效调度"。这决定了 Rule Engine 的最高准则：**能量不匹配，执行不开启**。

### 主观状态以用户校准为准（User-in-the-Loop Calibration）

- **原则**：系统可以计算概率，但无法感知痛苦或疲惫。
- **边界**：Lifeware 做的是"辅助驾驶"，而非"全自动驾驶"。在总体设计中明确"预留人工校准接口"，防止系统走向"赛博监控"的极端。
- **实现**：当系统预测的能量曲线与用户实测校准值存在偏差时，以用户校准值为准，同时系统记录偏差用于算法偏好的自我进化。

------

## 1.2 Lifeware 的总体框架

Lifeware 的五个层次：

- **USOM**（统一语义和对象层，Unified Semantic & Object Model）：是系统的底层基础，它不参与运作，只负责贯通全局的定义和规范
- **Nexus**（核心枢纽层）：是系统的大脑，作为系统的意识与语境枢纽，决定了"我是谁，现在是什么状态，可以做什么"
- **Domain Plugin**（领域插件层）：是外层可扩展器官（组件），包含在专业问题上的解决方案，只负责把领域内专职事做好，不能独立运作，是在 Nexus 支撑下运行的
- **Connector Layer**（连接器层）：是系统对外的桥梁，负责与外部数据源和外部服务的双向对接。Inbound Connector 将外部客观事实翻译为 USOM 事件注入系统；Outbound Connector 将 Domain 的推送意图投递到外部服务。**本层不在 MVP 中实现，接口预留。**
- **Bridge Layer**（外部接入层）：是 Lifeware 能力对外暴露的统一出口，通过标准协议（REST API、MCP Server、Webhook/SSE）将 Nexus 核心能力开放给 GUI、Agent 平台、CLI 等各类消费方。**本层不在 MVP 中实现，阶段二追加。**

整体架构图如下：

```
┌─────────────────────────────────────────────────────────────────┐
│                     Consumer Layer（接入方）                      │
│  Lifeware GUI（Next.js）  OpenClaw/Agent  CLI Tool  Future...   │
└─────────────────────────┬───────────────────────────────────────┘
                          │ 所有写操作统一转换为 StructuredIntent
┌─────────────────────────▼───────────────────────────────────────┐
│              Bridge Layer（外部接入层，阶段二实现）                │
│   REST API  │  MCP Server  │  Webhook/SSE  │  Auth/Scope        │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                        Nexus Core                                │
│  Intent Engine → Rule Engine → State Machine → Action Surface   │
│  Event Bus · Memory Framework · Orchestrator · Connector Runner │
└──────────────┬──────────────────────────────────┬──────────────┘
               │                                  │
┌──────────────▼──────────────┐   ┌───────────────▼──────────────┐
│      Domain Plugin Layer    │   │      Connector Layer          │
│ OKRs·Tasks·Habits·TimeBox.. │   │  Inbound / Outbound（预留）   │
└──────────────┬──────────────┘   └──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────┐
│                         USOM Layer                               │
│      统一语义和对象定义（只读快照传递）                            │
└──────────────┬──────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────────┐
│              Data Layer（PostgreSQL · Drizzle ORM · Repository） │
└─────────────────────────────────────────────────────────────────┘
```

------

# 二、语义层（USOM）设计规范

Unified Semantic & Object Model（USOM）是全系统的**共同语言**，定义了对象结构与生命周期，不含任何业务逻辑或执行规则。

## 2.1 USOM 规范原则

### 原则 1：对象先于能力（Object-before-Capability）

- Lifeware 的本质是数据驱动的应用
- 后续所有能力围绕对象设计

### 原则 2：USOM 只读快照（Read-Only Snapshot）的使用

- USOM 只读快照是 Domain 能够访问数据的唯一格式，Domain 不允许数据库连接或内部对象实现。

### 原则 3：语义版本演化机制

- **版本化：** USOM 需要支持版本管理，根据迭代需要有序扩容
- **兼容性策略：** 新版本如何向下兼容旧数据
- **废弃流程：** 如何安全地移除过时字段

## 2.2 核心对象类型

### 核心对象定义（Core Objects）

例如：

- status
- priority
- time_cost
- task
- habit
- timebox
- review
- context_snapshot（只读，由 State Machine 在每次状态变更后同步刷新）
- action_surface（Action Surface Engine 的输出对象）
- external_event（Inbound Connector 注入的外部事实，只读，不可被内部组件修改）
- external_payload（Domain.onOutboundRequest 的输出声明格式）

每个对象至少定义：

- 对象意图（Intent）
- 最小字段集
- 可参与的 Capability

### 对象生命周期约束

统一各类生命周期结果语义，例如：

- Task:     Draft → Active → Scheduled → Completed / Archived
- TimeBox:  Planned → Running → Paused → Ended → Logged
- Habit:    Draft → Active → Suspended / Archived

## 2.3 USOM 与 Nexus / Domain 的关系约定（治理条款）

- 所有 Nexus 组件的输入 / 输出对象，必须来自 USOM
- 所有 Domain 的提案、事件、行动，必须引用 USOM 只读快照

-----

# 三、核心层（Nexus）设计规范

## 3.1 Nexus 概述

### 一句话定义

Nexus 是 Lifeware 的运行时核心引擎，是系统中**唯一拥有执行权的层**。它协调意图、规则、状态与 Domain 之间的全部交互，统一决定何时调用哪个 Domain 的哪个钩子，并统一决定是否执行 Domain 返回的提案。

### 模块组成与分层

```
Nexus Layer
│
├── 交互层（用户面向，输入 / 输出）
│   ├── Intent Engine（意图引擎）          ← 唯一意图输入入口
│   └── Action Surface Engine（行动切面引擎）← 唯一输出出口
│
├── 业务逻辑层（编排与决策）
│   ├── Rule Engine（规则引擎）
│   └── State Machine（状态机）
│
├── 基础设施层（被动，无业务逻辑）
│   ├── Event Bus（事件总线）
│   ├── Memory Framework（记忆框架）
│   └── Connector Runner（连接器执行器）← 执行 Domain 的出站推送声明，不含业务逻辑
│
└── Orchestrator（编排器）
    └── 跨层流程调度，不含业务逻辑，不写状态，不参与 AI
```

**分层依赖原则**：上层组件依赖下层组件。Orchestrator 作为调度器，可跨层协调但不包含任何业务逻辑。

---

## 3.2 Orchestrator（编排器）

### 职责

Orchestrator 是 Nexus 内唯一负责**流程调度**的组件，根据不同场景构建各组件的合理链路。

- **链路调度**：根据触发场景，决定各组件的调用顺序
- **异常处理**：捕获链路上任意步骤的异常，执行重试 / 回滚 / 降级
- **人工决策暂停点**：Rule Engine 检测到冲突需人工确认时，Orchestrator 挂起执行链，等待用户响应后继续
- **场景编排**：为不同入口（对话输入 / 模板表单 / 时间触发 / Bridge Layer 请求）构建不同的执行链路

### 设计约束

- **不含任何业务逻辑**：不判断意图合法性，不生成提案，不参与 AI 调用
- **不写状态**：所有状态变更仍由 State Machine 执行
- **不参与 AI**：AI 调用由 Intent Engine 发起，Orchestrator 只等待结果

### 标准执行链

**意图驱动路径**（用户主动输入，含 Bridge Layer 转入的外部意图）：

```
用户输入（对话 / 模板表单 / Bridge Layer StructuredIntent）
    ↓ Orchestrator 启动链路
Intent Engine（AI 解析 + 澄清补全；AI 失败则降级为模板表单）
    ↓
Rule Engine（Domain.onValidate → 规则校验 + 冲突检测）
    ↓ 冲突时：Orchestrator 挂起，等待人工决策
State Machine（合法状态变更，唯一写入口；同步刷新 ContextSnapshot）
    ↓
Event Bus（广播事件 → 触发 Domain.onEvent → 收集指标与建议）
    ↓
Memory Framework（接收事件数据，写入分层记忆，更新 Derived Signals）
    ↓
Action Surface Engine（轮询 Domain.onActionSurfaceRequest → 排序 → 推送行动切面）
    ↓
Presentation（首页 Action Guide / Dynamic Tile / Continuity Cue）
```

**时间触发路径**（系统时间事件，无意图）：

```
时间事件（如 TimeBox 时间到）
    ↓ State Machine 自行捕捉，无需经过 Rule Engine
State Machine（状态变更；同步刷新 ContextSnapshot）
    ↓
Event Bus → Memory Framework → Action Surface Engine
```

---

## 3.3 Intent Engine（意图引擎）

系统的**唯一输入入口**，支持文字、语音识别转文字、附件、格式化模板表单输入，以及来自 Bridge Layer 的外部意图请求。

### 职责

- **意图记录**：临时的模糊念头、各类明确 / 模糊的需求、情绪感受等均可记录
- **意图拆解**：将复杂意图拆解为多个简单意图，每个意图对应一个可落地的行动
- **意图生命周期**：Captured → Clarified → Routed → Dissolved
- **意图澄清**：读取 Domain manifest 中的 `required_fields`，由 Intent Engine 负责补全，不下沉到 Domain

### AI 降级策略（template-form fallback）

AI 解析是 Intent Engine 的默认路径，但必须定义明确的降级机制：

```
正常路径：用户自然语言输入 → AI 解析 → StructuredIntent
    ↓ AI 调用失败 / 超时 / 低置信度时
降级路径：展示结构化模板表单 → 用户手动填写 → StructuredIntent
```

降级触发条件：
- AI 调用超时（本地模型不可用 / 网络断开）
- AI 返回置信度低于阈值
- 用户主动选择模板输入（斜杠快捷操作 `/create_task` 等）

降级后的表单数据与 AI 解析结果产出相同的 `StructuredIntent` 结构，后续链路无感知。

### 特殊输入设计

1. **意图快捷操作**：类似 CLI 的斜杠触发模式，例如 `/create_task 新建项目`，可调出项目模板表单
2. **模板化表单**：用户通过快捷操作选择 Domain 定制的表单模板，通过界面输入

### 关联关系

- 依赖 Domain manifest：读取 `required_fields`
- 依赖 Memory Framework：读取近期会话、Derived Signals
- 接受 Bridge Layer 转入的外部 StructuredIntent（Agent / CLI 提交的意图）
- 后续驱动 Rule Engine（经由 Orchestrator）

---

## 3.4 Rule Engine（规则引擎）

系统的决策中心，负责规则校验，形成决策意见，在需要的时候触发人工决策。

### 职责

- **规则校验**：在意图提案进入 State Machine 之前执行合法性校验
- **通用冲突检测**：检查基本逻辑冲突，如时间冲突、能量冲突等
- **个性冲突检测**：根据 Memory Framework 的 Derived Signals，检查与用户习惯和过度承诺的冲突
- **决策报告**：生成决策报告及推荐的冲突解决建议
- **人工决策触发**：冲突不通过时，通知 Orchestrator 挂起链路，等待用户手动决策

### 与 AI 的边界

```
AI          → 生成意图 Proposal（模糊处理）
Rule Engine → 校验 Proposal 合法性（确定性处理）
State Machine → 执行合法变更（唯一写入口）
```

### 关联关系

- 被 Orchestrator 驱动（接收 StructuredIntent）
- 依赖 Domain.onValidate：触发领域规则校验
- 依赖 Memory Framework：读取 Derived Signals，用于个性冲突检测
- 输出 StateProposal → Orchestrator → State Machine

---

## 3.5 State Machine（状态机）

根据各触发条件，管理所有 USOM 对象的生命周期状态。

### 职责

- **状态管理**：根据触发条件变更各对象的生命周期，拒绝非法状态跃迁
- **创建对象**：根据决策意见创建 USOM 对象
- **刷新 ContextSnapshot**：每次状态变更后同步刷新 `ContextSnapshot`（定义在 USOM 层），刷新为同步操作，不做异步延迟
- **发布事件**：将状态变更情况推送给 Event Bus

### 触发条件分类

| 类型 | 来源 | 是否经过 Rule Engine |
|---|---|---|
| 意图驱动事件 | Orchestrator 送达的 StateProposal | 是，唯一路径 |
| 时间触发事件 | State Machine 自行捕捉（如 TimeBox 时间到） | 否，直接执行 |

**设计约束**：除以上两类，State Machine 不接受任何其他触发来源。Domain、AI、Bridge Layer 均不可绕过 Orchestrator 直接驱动 State Machine。

### ContextSnapshot 规范

- **定义位置**：USOM 层（只读对象）
- **生成主体**：State Machine，每次状态变更后同步更新
- **消费方**：Action Surface Engine、Rule Engine、Memory Framework、Bridge Layer（只读查询）
- **内容**：当前所有活跃对象的状态聚合，不含历史事件流

### 关联关系

- 被 Orchestrator 驱动（接收 StateProposal）
- 时间事件自行捕捉
- 写入 Event Bus（发布 StateChanged 事件）
- 同步刷新 ContextSnapshot（USOM 层只读对象）

---

## 3.6 Event Bus（事件总线）

Event Bus 是系统的广播频道，是跨模块通信的**唯一机制**。

### 职责

- 将状态变更打包为不可变事件
- 发布事件（驱动 Domain 的 `onEvent` 钩子）
- 支持基于 Event 的状态回滚、重放

### 设计约束

- Event 是不可变事实（What happened · When · By whom）
- Event Bus 本身**无业务逻辑、无状态**，只做广播
- Domain 的 `onEvent` 只能返回计算结果（指标、建议），不能触发状态变更
- Event Bus 不负责生成或维护 ContextSnapshot（由 State Machine 负责）

### 示例 Event

```
TimeBoxStarted  { timebox_id, started_at, task_ids }
TaskCompleted   { task_id, completed_at, duration }
HabitLogged     { habit_id, date, note }
ReviewCreated   { review_id, period, summary }
```

### 关联关系

- 被 State Machine 写入（接收 StateChanged 事件）
- 后续触发 Domain.onEvent
- 后续通知 Memory Framework（原始事件数据）

---

## 3.7 Memory Framework（记忆框架）

从短期到长期，构建五个层次的记忆框架（Unified Memory Framework），是实现用户个性化认知的基础。

### 结构

Unified Memory Framework = 分层记忆（Layered Memory）+ 记忆衍生信号（Derived Signals）

- **分层记忆**：跨时间尺度保存用户相关信息，对记忆进行分层、摘要与访问控制，从底层短期记忆逐步自动提炼沉淀到长期记忆
- **Derived Signals**：预先计算、压缩、脱敏后的信号（自动生成，可维护），为各模块提供决策依据

### 写入控制（关键约束）

**Memory Framework 是单一写入口。外部组件不得直接写入 Memory Framework，只能通过 Memory Framework 暴露的 API 发送原始数据请求，由 Memory Framework 自身决定如何存储。Bridge Layer 不得绕过此约束。**

```
✓ 正确：Event Bus 通知后，Memory Framework 监听事件，自行决定写入策略
✓ 正确：Orchestrator 调用 memoryFramework.record(event_data)（显式记录场景）
✗ 禁止：State Machine 直接写入 Memory Framework 任何层级
✗ 禁止：Event Bus 直接向 Memory Framework 写入派生指标
✗ 禁止：Bridge Layer 直接写入 Memory Framework 任何层级
```

### 分层记忆（Layered Memory）

| 层级 | 内容 | 生命周期 |
|---|---|---|
| L1 Session Layer | 会话层：保存对话上下文内容 | 分钟/会话 |
| L2 Episode Layer | 情境层：近期行为摘要、决策、偏差 | 天/周 |
| L3 Procedural Layer | 行为层：行为模式、执行倾向、稳定习惯特征 | 周/月 |
| L4 Semantic Layer | 认知层：思维模式、决策框架、心智模型 | 月/年 |
| L5 Core Layer | 核心层：长期偏好 / 模式 | 长期/人工维护 |

### 维护规范

- L1 自动管理（超出会话轮次的记忆，自动摘要）
- L2-L4 自动生成，可由人工维护
- L5 必须人工维护

### Derived Signals 设计约束

低语义、可量化、可回溯原则。Signal 不应包含原始文字内容，只包含经过计算的数值或枚举型标签。

> 注意：Derived Signals 不应包含原始文字内容，只包含经过计算的数值或枚举型标签

```
✓ 允许：{ energy_pattern: "morning_peak", confidence: 0.82 }
✓ 允许：{ habit_streak: 12, completion_rate_7d: 0.71 }
✗ 禁止：{ recent_reflection: "用户最近感到工作压力较大..." }
✗ 禁止：{ last_review_summary: "本周完成了3个目标..." }
```

### 共享原则

- 各模块可读取 Derived Signals
- Bridge Layer 可通过授权接口读取 Derived Signals，**不可访问分层原始记忆（L2-L5）**
- 除 L1 会话层记忆外，其他分层记忆不对外共享

### 触发机制

- 定时触发：根据时间窗口（天、周、月）自动生成摘要
- 事件触发：响应 Event Bus 广播
- 手工触发：用户手动请求摘要、调整偏好等

---

## 3.8 Action Surface Engine（行动切面引擎）

原 Dynamic Tile Engine，升级为 Action Surface Engine，是系统的**唯一输出出口**，体现"意图驱动"的核心设计理念。

### 职责

- 根据 ContextSnapshot + 优先级算法，将抽象行动候选转化为可执行的行动切面
- 管理三类行动切面的生成与展示策略
- 轮询各 Domain 的 `onActionSurfaceRequest`，统一排序后输出
- 通过 Bridge Layer 向外部消费方（如 Agent）暴露当前行动切面快照

### 三类行动切面

```
Action Surface Engine
├── Action Guide（行动指南）
│   ├── 定位：未来价值最高的重要事项提示，帮助用户始终回到关键目标
│   ├── 来源：OKR / 目标域提供的高优先级候选
│   ├── 展示：首页显著位置常驻展示，可通过快捷方式随时调出
│   └── 频率：低频刷新，不随每次操作变化
│
├── Dynamic Tile（动态磁贴）
│   ├── 定位：当下立即可执行的行动，执行后即消失
│   ├── 来源：当前任务 / 习惯状态
│   ├── 展示：首页，一般不超过 3 个，立即可点击
│   └── 频率：高频刷新，随状态变化实时更新
│
└── Continuity Cue（连续性提示）
    ├── 定位：折叠的待处理项队列，避免积累过多磁贴造成认知过载
    ├── 可执行操作：忽略（降级）/ 继续 / 暂停
    └── 频率：按需展示
```

### 关联关系

- 依赖 ContextSnapshot（由 State Machine 维护，USOM 层只读对象）
- 依赖 Memory Framework：读取 Derived Signals（精力历史、未完成任务等）
- 依赖 Domain.onActionSurfaceRequest：收集行动候选
- 向 Bridge Layer 暴露只读快照（供 Agent 读取当前行动切面）

---

## 3.9 Connector Layer（连接器层）

### 说明

Connector Layer（本节）是系统架构的独立层，物理上位于 Nexus 之外，负责外部数据源的双向对接（Apple Health、GitHub、日历等）。

Connector Layer **不在 MVP 中实现，接口预留**。分为 Inbound 和 Outbound 两个方向，各自职责严格分离。

### **与 Connector  Runner 的区别**

> **注意**：Connector Layer 是系统架构的独立层，Connector Runner 是 Nexus 基础设施层的内部执行组件，是 Nexus 对 Connector Layer 出站声明的执行代理——两者名称相近，物理位置不同，不可混淆。

### 与 Bridge Layer 的区别

> **注意**：Bridge Layer 面向外部消费方（GUI、Agent、CLI），Connector Layer 面向外部数据源和推送目标。两层职责不重叠。

### Inbound Connector（入站连接器）

**职责**：将外部客观事实翻译为 USOM 格式事件，注入系统内部。

| 外部数据类型 | 语义 | 进入目标 |
|---|---|---|
| Apple Health 步数、GitHub Commit 等 | 已发生的客观事实 | Event Bus（如 HabitDataReceived） |
| 日历事件导入 | 已计划的时间结构 | Orchestrator → State Machine |
| 飞书机器人消息、快捷指令等 | 用户主动意图 | Intent Engine |

### Connector Runner（出站执行器，位于 Nexus 基础设施层）

**职责**：接收 Domain.onOutboundRequest 返回的推送声明，执行实际的外部 IO 调用。

---

## 3.10 Nexus 组件关系总结

### 完整依赖图

```
用户输入
    │
    ▼
┌─────────────────────────────────────────┐
│           Intent Engine                  │
│  ◀── Memory Framework（L1 会话 + Derived Signals）
│  ◀── Domain manifest（required_fields）  │
│  ◀── Inbound Connector（用户意图类外部输入）
│  AI 失败 → template-form fallback        │
└────────┬────────────────────────────────┘
         │ StructuredIntent
         ▼ Orchestrator 调度
┌─────────────────────────────────────────┐
│           Rule Engine                    │
│  ◀── Memory Framework（Derived Signals）│
│  ◀── Domain.onValidate（领域规则）       │
│  冲突 → Orchestrator 挂起 → 人工决策     │
└────────┬────────────────────────────────┘
         │ StateProposal（Orchestrator 传递）
         ▼
┌─────────────────────────────────────────┐
│           State Machine                  │
│  ◀── Inbound Connector（时间结构类外部输入，经 Orchestrator）
│  ──▶ Event Bus（发布 StateChanged）      │
│  ──▶ ContextSnapshot（同步刷新，USOM层） │
└─────────────────────────────────────────┘
         │ Event Bus 广播
         │ ◀── Inbound Connector（客观事实类外部输入直接注入）
         ▼
┌─────────────────────────────────────────┐
│           Memory Framework               │
│  接收事件原始数据，自主决定写入策略       │
│  ◀── Domain.onEvent（返回指标与建议）    │
│  自动生成 Derived Signals                │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│        Action Surface Engine             │
│  ◀── ContextSnapshot（USOM 只读快照）   │
│  ◀── Memory Framework（Derived Signals）│
│  ◀── Domain.onActionSurfaceRequest      │
│       → Action Guide（常驻显著位置）    │
│       → Dynamic Tile（立即可执行）      │
│       → Continuity Cue（折叠队列）      │
└─────────────────────────────────────────┘

Event Bus 广播同时触发出站路径：
         │
         ▼
┌─────────────────────────────────────────┐
│  Domain.onOutboundRequest（纯函数声明）  │
│  返回：connector + payload + condition   │
└────────┬────────────────────────────────┘
         │ 推送声明
         ▼
┌─────────────────────────────────────────┐
│        Connector Runner                  │
│  执行实际 IO → 飞书 / Shortcuts / MCP   │
└─────────────────────────────────────────┘
```

### 完整交互流程示例

**用户说："我想每天早上跑步，作为健康目标的一部分"**

```
① 用户输入（自然语言对话框）
    ↓
② Intent Engine（AI 解析）
   → 识别两个意图：CreateHabit + GoalLink
   → 提取：name=跑步, frequency=daily, time_hint=早上
   → 读取 habit manifest.required_fields，发现缺少：时间点、时长、start_date
    ↓
③ 澄清推送
   → "好的，已关联健康目标。跑步几点开始？打算跑多久？从哪天开始？"
    ↓
④ 用户补全："7点，30分钟，下周一"
    ↓
⑤ StructuredIntent 构造完成 → Orchestrator 路由到 Rule Engine
    ↓
⑥ Rule Engine 调用 Habit.onValidate(intent, snapshot)
   → Habit Domain 返回：{ valid: true }
   → Rule Engine 自身检查时间冲突：发现周二早上有 TimeBox
   → Orchestrator 挂起链路，提示用户："周二早上有冲突，建议调整为晚上或跳过"
    ↓
⑦ 用户确认后，Orchestrator 恢复，State Machine 执行
   → 创建 Habit 对象（写入 USOM）
   → 状态：Draft → Active
   → 同步刷新 ContextSnapshot
   → Event Bus 发布：HabitCreated { habit_id, ... }
    ↓
⑧ Memory Framework 接收 HabitCreated 事件
   → 调用 Habit.onEvent(HabitCreated, snapshot)
   → Habit Domain 返回：{ metrics: [streak_reset], suggestions: [...] }
   → Memory Framework 处理并写入 Derived Signals
    ↓
⑨ Action Surface Engine 根据新 ContextSnapshot 刷新
   → 调用 Habit.onActionSurfaceRequest(snapshot)
   → Habit Domain 返回候选 + 分类建议 + 权重
   → Action Guide 更新：[健康目标：每日跑步 ← 下周一开始]
   → Dynamic Tile 推送：下周一早上 [7:00 跑步打卡] [跳过今天] [延后15分钟]
    ↓
⑩ 日报生成时
   → AI 读取 HabitLogged Events → 生成今日完成情况 → 用户可补充编辑
```

---

## 3.11 Bridge Layer（外部接入层）

**本层不在 MVP 中实现，阶段二追加，MVP 第一行代码起须保证 Nexus 接口与本层兼容。**

### 一句话定义

Bridge Layer 是 Lifeware 能力对外暴露的**唯一标准出口**，通过协议标准化将 Nexus 核心能力开放给所有外部消费方，实现 GUI、Agent 平台、CLI 工具的统一接入，无需各自独立适配 Nexus 内部结构。

### 定位与边界

```
Bridge Layer 做什么：
  - 将外部请求（HTTP / MCP Tool Call / CLI 命令）统一翻译为 StructuredIntent
  - 将 ContextSnapshot / ActionSurface / Derived Signals 以标准格式暴露给外部
  - 处理鉴权、操作边界（Auth/Scope）

Bridge Layer 不做什么：
  - 不包含任何业务逻辑
  - 不直接调用 State Machine
  - 不直接写入 Memory Framework
  - 不决定意图是否合法（由 Rule Engine 决定）
```

### 子模块

```
Bridge Layer
├── REST API          ← 标准 HTTP 接口，GUI 和通用客户端使用
├── MCP Server        ← Model Context Protocol，Agent 平台原生协议
├── Webhook / SSE     ← 主动推送：事件流、Action Surface 变更通知
└── Auth / Scope      ← 权限控制：读操作 / 意图提交 / 管理操作分级
```

### MCP Tools 设计规范

MCP Server 暴露以下 Tools，是 Agent 平台（如 OpenClaw）接入的标准界面：

```typescript
// ── 读操作（Agent 查询 Lifeware 状态）──────────────────────────

mcp_tool: get_context_snapshot()
  → 返回：当前所有活跃对象状态（时间盒、今日任务、习惯）
  → 格式：ContextSnapshot（USOM 只读对象）

mcp_tool: get_action_surface()
  → 返回：Action Guide + Dynamic Tiles + Continuity Cues
  → 格式：ActionSurface（USOM 只读对象）

mcp_tool: query_derived_signals()
  → 返回：Derived Signals（去语义化信号：能量模式、streak、完成率等）
  → 禁止：不返回 L2-L5 分层原始记忆内容

// ── 写操作（Agent 通过意图提交，不直接写状态）──────────────────

mcp_tool: submit_intent(intent: string, context?: object)
  → 内部路径：→ Intent Engine → Rule Engine → State Machine
  → 返回：{ status: 'executed' | 'pending_decision', result?, conflict? }
  → pending_decision：Rule Engine 挂起，需用户在 GUI 确认

// ── 辅助操作 ────────────────────────────────────────────────────

mcp_tool: list_pending_decisions()
  → 返回：Rule Engine 挂起的待人工决策事项列表
```

**禁止暴露的操作**：

```
✗ 不暴露：直接 CRUD 操作（create_task / delete_habit 等）
✗ 不暴露：State Machine 直接调用接口
✗ 不暴露：Memory Framework L2-L5 原始内容
✗ 不暴露：Drizzle ORM / 数据库直接查询接口
```

### CLI Tool 规范

CLI Tool 是 Bridge Layer 的第一个验证载体（阶段二优先实现），同时也是 REST API 接口设计的验证场。

```bash
lw status               # 查询 ContextSnapshot
lw surface              # 查看当前 Action Surface
lw intent "<文字>"      # 提交意图，触发完整 Nexus 链路
lw pending              # 查看 Rule Engine 挂起的待决策项
lw signals              # 查看 Derived Signals
```

**设计原则**：CLI 命令与 MCP Tool 一一对应，CLI 是 MCP Tools 的命令行包装，共享同一套 REST API 底层实现。

### Bridge Layer 四条架构约束

以下约束从 MVP 第一行代码起即生效（接口兼容性要求），实现在阶段二：

**约束 A：外部写操作必须经过完整 Nexus 链路**
所有通过 Bridge Layer 发起的写操作，必须经过 `Intent Engine → Rule Engine → State Machine` 完整链路。不允许任何 shortcut 直接修改状态。

**约束 B：MCP Tools 只暴露读查询和意图提交**
外部 Agent 不可直接调用 `create_task()` 类接口，只可调用 `submit_intent()`。规则引擎始终在决策链上，不可绕过。

**约束 C：Derived Signals 是 Agent 读取记忆的唯一入口**
Memory Framework 的 L2-L5 分层记忆不对外暴露。Bridge Layer 只可读取 Derived Signals，保护用户隐私，防止 Agent 基于原始记忆内容做出意外决策。

**约束 D：Nexus 组件方法签名须与 Bridge Layer 兼容**
Nexus 组件的所有公共方法，必须能在未来被 Bridge Layer 直接调用，不得依赖 HTTP 上下文，不得在方法签名中使用 `request` / `response` 对象。Repository 接口同样适用此约束。

---

## 3.12 资源调度准则：能量优先（Energy-First Scheduling）

### 定义

系统在任何行动建议（Action Guide）生成前，必须读取 `ContextSnapshot` 中的 `EnergyState`。

### 约束规则

| 约束 | 说明 |
|---|---|
| **能量不匹配，执行不开启** | 当 `ActiveEnergy` 低于任务定义的 `EnergyDemands` 时，Action Surface Engine 必须将其置于"非推荐执行区" |
| **主动触发恢复性意图** | 当用户能量低于阈值时，系统应主动触发"恢复性意图（Recovery Intent）"引导，如建议休息、轻度活动等 |
| **单一能量维度（MVP）** | MVP 阶段只推行 1-10 分的单一能量维度，避免体能/情感/思维/精神四维测量导致用户心理摩擦 |

### 进化逻辑

系统通过对比"预测能量曲线"与"用户实测校准值"的偏差，实现算法偏好的自我进化：

1. **预测阶段**：根据 `UserCalibration.baselineCurve` 和当前时间，系统计算 `inferredLevel`
2. **校准阶段**：用户主动输入 `calibratedLevel`（可选）
3. **决策阶段**：`activeLevel = calibratedLevel ?? inferredLevel`
4. **学习阶段**：系统记录偏差，用于优化 `baselineCurve` 参数

### 能量匹配阈值

| 用户能量区间 | 推荐任务类型 | 过滤策略 |
|---|---|---|
| 1-3（低能量） | 休息、轻度习惯、机械性任务 | 过滤 HIGH 消耗任务 |
| 4-6（中能量） | 常规任务、习惯打卡 | 可接收 MEDIUM 消耗任务 |
| 7-10（高能量） | 深度工作、挑战性任务 | 全部开放 |

---

# 四、Domain Plugin 的设计规范

## 4.1 核心定义

**Domain 是一组声明式规则与纯计算函数/算法的集合，是被动规则集，不是主动执行单元。** 只能被 Nexus 在固定时机通过钩子调用。

## 4.2 能力边界（四能 · 三禁）

**Domain 具备的四种能力：**

1. 通过 manifest 声明它关心的对象类型与结构完整性约束
2. 对意图提案进行合法性校验（`onValidate`）
3. 响应事件，返回派生指标与建议（`onEvent` / `onActionSurfaceRequest`）
4. 声明出站推送意图（`onOutboundRequest`，可选）——返回推送声明，由 Connector Runner 执行实际 IO

**Domain 的三条禁令：**

1. **不能写入状态**——所有状态变更归 State Machine，Domain 只返回提案
2. **不能主动运行**——Domain 只能被 Core 调用，无法自行触发任何逻辑
3. **不能访问其他 Domain 的内部数据**——只接收 USOM 格式的只读快照

---

## 4.3 统一插件接口：四钩子模型

```typescript
DomainPlugin {
  manifest.yaml

  onValidate(
    intent: StructuredIntent,
    snapshot: USOMSnapshot
  ) → { valid: bool, errors: string[] }

  onEvent(
    event: SystemEvent,
    snapshot: USOMSnapshot
  ) → { metrics: MetricUpdate[], suggestions: ActionSurfaceSuggestion[] }

  onActionSurfaceRequest(
    snapshot: USOMSnapshot
  ) → {
    actions: ActionCandidate[],
    category: 'guide' | 'tile' | 'cue',
    weight: number
  }

  onOutboundRequest(          // 可选，MVP 不实现
    trigger: SystemEvent,
    snapshot: USOMSnapshot
  ) → {
    connector: string,
    payload: ExternalPayload,
    condition?: string
  }
}
```

---

## 4.4 当前 Domain 及扩展路径

| 阶段 | Domain |
|---|---|
| MVP | OKRs · Tasks · Habits · TimeBox · Review |
| 扩展 | Project · Health · Career · Interest |

---

# 五、Lifeware 护城河

## 5.1 概述

| 护城河资产       | 描述                              | 通用 Agent 平台是否可复制                      |
| ---------------- | --------------------------------- | ---------------------------------------------- |
| USOM 结构化对象  | 统一对象模型 + 生命周期定义       | 需重新开发，不可直接复制                       |
| 持续执行的状态机 | 跨会话持久状态，主动推送时间结构  | 结构性缺失，非对话模型的能力边界               |
| 算法偏好         | 个人成长方法论固化在代码逻辑里    | 可描述，但无法在不重新开发的前提下复制运行逻辑 |
| 数据厚度         | Memory Framework 长期行为闭环数据 | 任何新安装的 Agent 都不具备历史纵深            |

## 5.2 USOM 和 持续状态机

Lifeware 的商业与技术护城河，来自通用 Agent 平台（如 OpenClaw）最稀缺的"**确定性逻辑**"：USOM 结构化对象定义 + 持续执行的状态机。

通用 Agent 平台擅长处理模糊性（语言理解、内容生成、信息检索），但缺乏处理确定性的基础设施：它们没有持久化的对象模型、没有状态机、没有执行纪律的时间结构。这正是 Lifeware 的立足点。

## 5.3 算法偏好（Algorithm Preference）

Lifeware 内化了多种成熟个人成长方法论，并将其**固化在代码逻辑里**：

- OKR 目标层级与任务绑定规则
- 时间盒编排的能量匹配算法
- 习惯养成的 streak 衰减与重建逻辑
- 复盘的闭环触发机制
- **生物节律模型（Biological Rhythm Model）**：基于用户历史行为与主动校准形成的个人能量曲线

这些方法论不以"功能"形式呈现给用户，而是渗透在 Rule Engine 校验规则、Action Surface 排序权重、Memory Framework Derived Signals 的计算逻辑中。它们是系统的"性格"——通用 AI 模型可以描述这些方法论，但无法在不重新开发的前提下复制这套运行逻辑。

### 能量匹配算法：非对称竞争优势

Lifeware 的算法偏好不仅包含 OKR、GTD 等外在方法论，更包含**内生的"生物节律模型"**。

- **价值点**：通用 AI Agent 知道什么是 OKR，但它不知道你下午 3 点的生理低谷。
- **护城河**：只有 Lifeware 通过持续的"系统预测 + 人工校准"积累下的能量数据，才能形成这种**不可迁移的个人资产**。
- **进化机制**：系统通过对比"预测能量曲线"与"用户实测校准值"的偏差，持续优化个人节律模型的准确性。

## 5.4 数据厚度（Data Depth）

Lifeware 通过 Memory Framework 积累用户长期行为闭环数据：

- L2-L4 分层记忆：近期行为摘要、执行倾向、行为模式
- Derived Signals：能量节律、习惯完成率、时间盒执行偏差等

这种历史纵深是任何新安装的 Agent 都不具备的。随着使用时间的增加，Lifeware 对用户的理解深度形成**不可迁移的个人资产**：数据厚度越高，Rule Engine 的个性冲突检测越精准，Action Surface 的推送越贴合用户实际节律。

## 5.5 护城河与 Bridge Layer 的关系

Bridge Layer 不削弱护城河，反而放大它：

- Agent 平台（如 OpenClaw）通过 MCP 接入后，**消费的是 Derived Signals 和 ContextSnapshot**——这正是 Lifeware 数据厚度的输出形式
- Agent 平台的语言能力 + Lifeware 的确定性结构 = 双方优势互补
- 用户使用 Agent 平台的时间越长，Lifeware 积累的数据越厚，Agent 给出的建议越精准——形成正向飞轮

**约束**：Bridge Layer 的设计必须确保，Agent 平台消费 Lifeware 数据只会加深用户对 Lifeware 的依赖，而非使 Lifeware 沦为可替换的数据源。具体体现在约束 B 和约束 C：Agent 只能提交意图（不直接写状态），只能读取 Derived Signals（不获取原始记忆）。

---

# 六、关于智能决策架构

## 6.1 AI 参与的位置

- **Intent Engine**：意图解析、澄清问题生成；AI 失败时降级为模板表单
- **Presentation**：日记生成、复盘报告撰写
- **Domain Plugin**：领域特定的内部 AI 逻辑，通过函数调用返回结果

## 6.2 AI 不参与的位置

- 规则校验（Rule Engine 纯规则执行）
- 状态变更（State Machine 控制）
- 行动切面优先级排序（MVP 阶段手写规则）
- 时间冲突判断（确定性逻辑）

> **原则：AI 处理模糊性，规则处理确定性。AI 只生成 Proposal，不直接写入系统状态。**

---

# 七、本文档的使用方式

- 本总体设计优先级高于任何 PRD
- 所有新功能必须能指出其所在模块与合法边界
- 一切争议设计，回到本总体设计裁决

> **如果一个设计无法被本文档清楚解释，它就是不合法的设计。**

------
