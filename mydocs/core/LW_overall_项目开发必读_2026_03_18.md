# Lifeware 项目状态概述 2026_03_18

## 1. 项目基本信息

### 1.1 项目名称

Lifeware

---

### 1.2 Lifeware 简介

**Lifeware** APP 是一款以「意图驱动」为核心的个人成长系统，致力于把人生的意义转化为可执行、可复盘的时间结构。它并非简单的任务或时间管理工具，而是一个贯穿**生涯规划 → 个人 OKR → 任务 / 习惯 → 时间盒执行 → 复盘反思**的"人生操作系统"。

Lifeware 的差异化定位：**个人成长私有逻辑框架**（Personal Growth Logic Framework），其护城河来自通用 Agent 平台无法轻易复制的资产，主要包括：

| 护城河资产       | 描述                              | 通用 Agent 平台是否可复制                      |
| ---------------- | --------------------------------- | ---------------------------------------------- |
| USOM 结构化对象  | 统一对象模型 + 生命周期定义       | 需重新开发，不可直接复制                       |
| 持续执行的状态机 | 跨会话持久状态，主动推送时间结构  | 结构性缺失，非对话模型的能力边界               |
| 算法偏好         | 个人成长方法论固化在代码逻辑里    | 可描述，但无法在不重新开发的前提下复制运行逻辑 |
| 数据厚度         | Memory Framework 长期行为闭环数据 | 任何新安装的 Agent 都不具备历史纵深            |

---



### 1.3 目标用户

**用户痛点**：个人效率管理普遍面临以下一种或多种困境：目标脱节、执行低效、计划崩溃、打卡幻象、复盘缺失等问题。

**目标用户**：主要面向知识工作者、创意人群和自由职业者

---

### 1.4 核心问题

Lifeware 将致力于解决传统个人管理工具面临的各种问题。

**战略层**：让「人生意义真正落地」

Lifeware 帮助用户将人生方向、阶段目标与日常时间结构打通，把"我想成为什么样的人"，持续转化为每天在做的事情。

**方法层**：内化多种成熟方法论，为推动科学的个人管理赋能

Lifeware 融合生涯建构理论、OKR目标管理、习惯养成、时间盒管理法、精力管理、教练技术、元认知、时间折叠等经过验证的理论，这些方法理论不会以概念形式呈现给用户，系统让用户无需学习和切换不同方法，在目标取舍、行动安排和时间分配等场景中持续做出更好的选择。

**实现层**：通过执行反馈，通过开放式整合机制构建成长闭环

Lifeware 采用AI驱动技术，试图会记住并沉淀用户的风格、节奏与执行反馈，融入到日常生活中的各类个人管理事务中，同时，以开放式的机制，不断整合个人成长的重要领域，如生涯管理、目标管理、任务管理、习惯管理、时间盒管理、复盘管理等，并在执行—反馈—复盘的闭环中形成自然的自律与成长机制。

---

## 2. 终极目标

### 2.1 时间目标

* 2026-3-31：完成规划和MVP
* 2026-6-30：完成自身使用迭代
* 2026-9-30：完成内测
* 2026-10：开始推广和运营

---

### 2.2 指标

到2026-10月止，要求：

* 使用频次：每天
* 意义/关注任务达成：每天 >= 2个
* AI 推荐准确率：85%
* 达成周闭环率：60%

---

## 3. MVP当前任务状态

当前处于MVP：阶段1

```
阶段1：总体设计（包括架构设计和基本技术栈选择）
  ↓
阶段2：核心功能的详细需求、详细设计、数据设计
  ↓
阶段3：项目开发环境
  ↓
阶段4：MVP 编码及调试
  ↓
阶段5：MVP 迭代
  ↓
阶段6：MVP 使用总结
```

---

## 4. 当前有效决策

### 4.1 架构模式

Lifeware 的五个层次：

- **USOM**（统一语义和对象层，Unified Semantic & Object Model）：是系统的底层基础，它不参与运作，只负责贯通全局的定义和规范
- **Nexus**（核心枢纽层）：是系统的大脑，作为系统的意识与语境枢纽，决定了"我是谁，现在是什么状态，可以做什么"
- **Domain Plugin**（领域插件层）：是外层可扩展器官（组件），包含在专业问题上的解决方案，只负责把领域内专职事做好，不能独立运作，是在 Nexus 支撑下运行的
- **Connector Layer**（连接器层）：系统对外的桥梁，**MVP 不实现，接口预留**。Inbound Connector 将外部客观事实注入 Event Bus；Outbound 由 Domain 声明、Connector Runner 执行
- **Bridge Layer**（外部接入层）：Lifeware 能力对外暴露的统一出口，通过标准协议（REST API、MCP Server、Webhook/SSE）开放给 GUI、Agent 平台、CLI 等消费方。**MVP 不实现，阶段二追加；MVP 起须保证 Nexus 方法签名与本层兼容。**

> **Connector Layer 与 Bridge Layer 的区别**：Connector Layer 负责外部数据源的双向对接（Apple Health、GitHub 等数据流入，Domain 推送声明执行）；Bridge Layer 负责外部消费方的能力接入（GUI、Agent、CLI 通过标准协议读取状态、提交意图）。两层职责不重叠。

---

### 4.2 Nexus 核心组件结构

```
Nexus Layer
│
├── 交互层
│   ├── Intent Engine（意图引擎）          ← 唯一意图输入入口（含 Bridge Layer 转入的外部意图）
│   └── Action Surface Engine（行动切面引擎）← 唯一输出出口
│
├── 业务逻辑层
│   ├── Rule Engine（规则引擎）
│   └── State Machine（状态机）
│
├── 基础设施层（被动，无业务逻辑）
│   ├── Event Bus（事件总线）
│   ├── Memory Framework（记忆框架）
│   └── Connector Runner（出站执行器，MVP 不实现）
│
└── Orchestrator（编排器）
    └── 跨层流程调度，不含业务逻辑，不写状态，不参与 AI
```

**关键设计决策**：

- **Orchestrator**：负责链路调度、异常处理、人工决策暂停点，不含业务逻辑
- **State Machine 触发条件**：仅接受两类触发——Orchestrator 送达的 StateProposal（经 Rule Engine 审批），以及时间触发事件（State Machine 自行捕捉）。Bridge Layer 不可绕过 Orchestrator 直接驱动 State Machine。
- **ContextSnapshot**：由 State Machine 在每次状态变更后同步刷新，定义在 USOM 层，供 Action Surface Engine、Rule Engine、Memory Framework、Bridge Layer（只读）消费
- **Action Surface Engine**：包含 Action Guide（常驻显著位置）、Dynamic Tile（立即可执行）、Continuity Cue（折叠队列）三类行动切面
- **Memory Framework 单一写入口**：外部组件不得直接写入，Bridge Layer 亦不例外
- **Intent Engine AI 降级**：AI 失败时降级为 template-form fallback，产出相同的 StructuredIntent
- **Connector Runner**：Nexus 基础设施层薄模块，执行 Domain.onOutboundRequest 返回的推送声明，不含业务逻辑，MVP 不实现

---

### 4.3 Bridge Layer 核心决策

**定位**：Lifeware 能力对外暴露的唯一标准出口，实现 GUI、Agent 平台、CLI 的统一接入。

**子模块**：REST API · MCP Server · Webhook/SSE · Auth/Scope

**实现时序**：阶段二：REST API + CLI Tool → 阶段三：MCP Server → 阶段四：Webhook/SSE

**MCP Tools 范围**：

| Tool | 类型 | 说明 |
|---|---|---|
| `get_context_snapshot` | 读 | 当前活跃对象状态 |
| `get_action_surface` | 读 | Action Guide / Tiles / Cues |
| `query_derived_signals` | 读 | 去语义化行为信号 |
| `submit_intent` | 写 | 唯一写入口，经完整 Nexus 链路 |
| `list_pending_decisions` | 读 | Rule Engine 挂起的待决策项 |

**四条架构约束**（从 MVP 第一行代码起生效）：

- **约束 A**：外部写操作必须经过完整 Nexus 链路（Intent Engine → Rule Engine → State Machine）
- **约束 B**：MCP Tools 只暴露读查询和意图提交，不暴露直接 CRUD 接口
- **约束 C**：Derived Signals 是 Agent 读取记忆的唯一入口，Memory Framework L2-L5 不对外暴露
- **约束 D**：Nexus 组件方法签名不依赖 HTTP 上下文，须与 Bridge Layer 直接调用兼容

---

### 4.4 技术栈演进策略

技术栈按阶段演进，详见 `LW_overall_技术栈设计演进.md`。核心原则：**优先验证 Nexus 架构有效性，基础设施按阶段升级。**

| 演进阶段 | 使用范围 | 前端DB | 同步层 | 移动端 | Bridge Layer |
|---|---|---|---|---|---|
| 阶段一 MVP | 开发者单人 | 无（PostgreSQL 直连） | 无 | 无 | 无（兼容约束生效） |
| 阶段二 | 熟人测试 1-20 人 | SQLite WASM | PowerSync | 无 | REST API + CLI |
| 阶段三 | 大范围内测 | SQLite WASM | PowerSync | Expo SQLite（辅助端）| + MCP Server |
| 阶段四 | 正式推广 | 待评估 | 待评估 | 待评估 | + Webhook/SSE |

**从第一行代码起必须执行的约束**：

- Repository 接口隔离：Nexus 组件不直接调用 Drizzle，不感知底层数据库
- 禁止 raw SQL：所有查询通过 Drizzle query builder
- Schema 单一来源：各端共用同一份 Drizzle Schema
- USOM 对象与 DB 对象分离：Repository 层负责映射转换
- Nexus 方法签名与 Bridge Layer 兼容：不依赖 HTTP 上下文

---

### 4.5 Domain Plugin 钩子接口

Domain 通过四个钩子与 Nexus 交互（均为被动，由 Nexus 调用）：

- `onValidate`：意图校验
- `onEvent`：事件响应，返回指标与建议
- `onActionSurfaceRequest`：返回行动切面候选（含 category: 'guide' | 'tile' | 'cue'）
- `onOutboundRequest`：出站推送声明，可选，返回推送意图由 Connector Runner 执行，**MVP 不实现**

---

### 4.6 关键设计原则

#### Local First 及隐私安全

- 本地数据库是**唯一真实数据源（Source of Truth）**
- 服务端数据库只是同步中转站、多端一致性保障、备份与恢复工具
- E2E 加密在阶段四评估实现，MVP 不考虑

#### 意图驱动而非功能驱动

- Lifeware 核心主页面不是为了指示"使用功能"，而是**回应当下的意图**
- Action Surface Engine 的 Action Guide 常驻显著位置，始终提醒用户当前最重要的事项

#### AI 与规则的边界

- AI 处理模糊性，规则处理确定性
- AI 只生成 Proposal，不直接写入系统状态

#### 开放接入，不主动适配

- Lifeware 通过标准协议暴露能力（MCP、REST），不主动适配任何具体 Agent 平台
- 支持标准协议的接入方可自行对接，Bridge Layer 是 Lifeware 的出口，不是面向各平台的适配器

---

## 5. 已废弃方案

| 废弃项 | 废弃原因 |
|---|---|
| Prisma ORM | 与 SQLite WASM 兼容需要额外 adapter 绕路，结构性摩擦高；替换为 Drizzle ORM |
| Dynamic Tile Engine | 概念扩展为 Action Surface Engine，包含 Action Guide / Dynamic Tile / Continuity Cue |
| State Machine 直接写 Memory Framework | 违反单一写入口原则；改为通过 Memory Framework API |
| Event Bus 驱动 Memory Framework 写入 | 同上 |
| Core API Layer（命名） | 重命名为 Bridge Layer，更准确反映其"桥接外部消费方与 Nexus 核心"的职责定位 |

---

## 6. 角色模式

本项目中，你的默认角色是：产品合伙人 + 架构设计师 + 成本控制官

角色职责：

* 可以挑战任何已有决策，甚至质疑整个底层设计，明确指出方案的优缺点，不要默认赞同
* 对方案的风险等级进行评估
* 给出的答案需要区分"建议"与"确定性结论"

---

## 7. 版本控制机制

* 可将确认的意见更新至相关文档，所有修改必须生成新版本文件，目前暂时用"文件名+日期"来命名
* 涉及重大决策修订，除了修改相关文档，还必须更新本文档的"当前有效决策"部分，保持同步
* 例如修改了总体设计文档的关键内容，本文档也需要同步更新

---

## 8. 文件使用

- 项目的最高级别文档，即本文档：
  ```
  LW_overall_项目开发必读.md
  ```

- 重要文档清单：
  ```
  LW_overall_manifest.md
  ```
