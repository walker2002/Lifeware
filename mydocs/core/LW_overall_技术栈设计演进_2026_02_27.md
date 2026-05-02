# Lifeware 技术栈设计演进 2026_02_27

---

**本文档说明**

本文档记录 Lifeware 技术栈的演进策略，是技术选型的决策依据与约束文件。
核心原则：**优先验证业务架构逻辑（Nexus 有效性），技术基础设施按阶段升级，过渡成本最小化。**

---

## 一、技术栈演进总览

```
阶段一 MVP（2026 Q2）
使用范围：开发者单人评估
验证目标：Nexus 架构是否有效
数据库：  PostgreSQL 直连（Supabase 托管）
本地化：  不实现
移动端：  不实现

    ↓ 升级成本：约 1 周（接入本地 DB + 同步层）

阶段二 Local First Web（2026 Q3）
使用范围：小范围熟人测试（1-20 人）
验证目标：本地优先可用性 + 多用户稳定性
数据库：  SQLite WASM（前端）+ PostgreSQL（后端）
同步层：  PowerSync
移动端：  不实现

    ↓ 升级成本：约 2-3 周（移动端接入 + 功能扩展）

阶段三 移动端接入（2026 Q4）
使用范围：大范围内测
验证目标：移动端核心功能可用性
数据库：  SQLite WASM（Web）+ Expo SQLite（Mobile）
同步层：  PowerSync（Web 全量 + Mobile 按 Shape 部分同步）
移动端：  执行辅助功能 + 时间盒编排调整

    ↓ 升级成本：待定，视成熟度评估

阶段四 技术栈深度优化（时机待定）
使用范围：正式推广
目标：    进一步优化 Local First 架构（如升级 PGlite、Electric SQL 等）
          具体内容在阶段三完成后评估，暂不细化
```

---

## 二、各阶段技术栈详情

### 2.1 阶段一：MVP

**定位：开发者单人评估，验证 Nexus 架构有效性**

#### 技术选型

```
终端：         Web（Next.js）
UI Layer：     Next.js/React + Tailwind CSS + shadcn/ui + dnd-kit
ORM：          Drizzle ORM
数据库：       PostgreSQL（Supabase 托管）
AI/Decision：  LangGraph/LangChain + goRules + 本地模型/云端混合
同步层：       无
移动端：       无
```

#### 选型理由

- **PostgreSQL 直连（而非本地 DB）**：MVP 阶段只有开发者单人使用，无离线需求，无多端同步需求，最大程度降低基础设施复杂度，聚焦 Nexus 逻辑验证。
- **Drizzle ORM（替代 Prisma）**：Drizzle 同时原生支持 PostgreSQL、SQLite WASM 和 Expo SQLite，更换底层数据库只需更换 adapter，Schema 定义不需要改动。Prisma 与 SQLite WASM 的兼容需要额外 adapter 绕路，结构性摩擦更高。
- **Supabase 托管**：零运维成本，提供 PostgreSQL 完整能力，MVP 阶段无需自建数据库。

#### 本阶段不实现

- Local First / 离线支持
- 端到端加密（E2E）
- 多端同步
- 移动端

---

### 2.2 阶段二：Local First Web

**定位：小范围熟人测试（1-20 人），验证本地优先可用性与多用户稳定性**

#### 技术变更

```
变更项：
  PostgreSQL 直连  →  SQLite WASM（前端本地 DB）
  无同步层        →  PowerSync（前后端同步）

不变项：
  Drizzle ORM Schema（零改动）
  Nexus 全部组件（零改动）
  Repository 接口层（零改动）
  Next.js / UI 层（零改动）
  Backend PostgreSQL（零改动）
```

#### 为什么是 SQLite WASM（而非 PGlite）

本阶段采用保守策略，优先选用成熟方案：

- SQLite WASM 在浏览器中的成熟度和实际案例显著高于 PGlite
- 与 Expo SQLite（移动端）同为 SQLite 方言，客户端两端方言统一，消除方言债务
- Drizzle 原生支持 SQLite WASM adapter，无额外适配成本
- 本阶段用户规模小，不需要 PGlite 的 PostgreSQL 专有特性

**注意**：SQLite WASM 的 multi-tab 并发写入支持有限，但 Lifeware 的使用场景下并发写入概率极低，可接受。

#### 为什么是 PowerSync

与 SQLite WASM 配合的同步层，PowerSync 是当前更成熟的选择：

- 原生支持 SQLite ↔ PostgreSQL 同步
- 处理离线 / 冲突 / 回放
- 开源，可自托管

#### 阶段二升级约束

进入本阶段前需完成 POC 验证（约 1.5 天）：

| 验证点 | 方式 | 预计时间 |
|---|---|---|
| SQLite WASM 持久化稳定性 | 最小 demo 测试 Chrome / Safari / Firefox | 0.5 天 |
| PowerSync 自托管 Docker 部署 | 官方 Docker Compose + 本地 PostgreSQL 连接 | 0.5 天 |
| Drizzle Schema 驱动 SQLite WASM Migration | 跨平台 Schema 迁移测试 | 0.5 天 |

#### 本阶段不实现

- 移动端
- 端到端加密（E2E）

---

### 2.3 阶段三：移动端接入

**定位：大范围内测，移动端核心功能可用**

#### 技术变更

```
新增：
  React Native + Expo（移动端框架）
  Expo SQLite（移动端本地 DB）
  PowerSync Mobile Shape 部分同步

不变：
  Web 端全部技术栈
  Drizzle ORM Schema
  Nexus 全部组件
  Repository 接口层
  Backend PostgreSQL
```

#### 移动端功能边界

移动端定位为执行辅助端，不做 OKR 规划、完整任务管理，但包含时间盒编排调整（使用频率高，必须在移动端支持）：

| 功能 | 读/写 | 说明 |
|---|---|---|
| 今日任务列表 | 只读 | PowerSync Shape 同步当日数据子集 |
| 习惯打卡 | 写入 | 写入本地后异步同步回 Backend |
| 时间盒提醒 | 只读 | 推送通知 |
| **时间盒编排调整** | **读写** | **使用频率高，移动端必须支持** |
| 快速意图捕捉 | 写入 | 本地写入队列，后台同步，不要求即时一致 |
| 今日复盘查看 | 只读 | 读取 Web 端生成的数据 |

**不做**：OKR 规划、完整任务创建与管理、复盘生成。

#### 关于时间盒编排在移动端的实现

时间盒编排调整（拖拽、时间修改）在移动端的同步策略：

- 写入 Expo SQLite 本地，标记 `sync_pending`
- PowerSync 检测变更后，异步推送至 Backend PostgreSQL
- 冲突策略：Last-write wins（同一时间盒同时在 Web/Mobile 修改的概率极低）

Web 端的 dnd-kit 拖拽方案在移动端需替换为触摸友好的交互方案（Expo 原生手势库），UI 实现独立开发，数据层逻辑复用。

#### 移动端数据库

Expo SQLite 为确定选型（2026-02 当前状态下 pglite-react-native 无稳定 NPM 包，不采用）。Expo SQLite 与 Web 端 SQLite WASM 同为 SQLite 方言，客户端两端方言一致，无跨方言同步复杂度。

---

### 2.4 阶段四：技术栈深度优化

**定位：正式推广阶段，时机待定，暂不细化**

可能的优化方向（届时按实际情况评估）：

- 评估 PGlite + pglite-react-native 的成熟度，考虑全端方言升级至 PostgreSQL
- 评估 Electric SQL 替换 PowerSync 的收益
- 端到端加密（E2E）实现
- 多租户架构

**本阶段在阶段三完成后另立文档细化，当前不做任何技术决策。**

---

## 三、低成本升级的核心约束

以下约束必须从 MVP 第一行代码开始执行，是各阶段低成本升级的唯一前提。违反任何一条都会导致升级成本大幅上升。

### 约束 1：Repository 接口隔离（最重要）

所有 Nexus 组件只依赖 Repository 接口，不直接调用 Drizzle，不感知底层数据库。

```typescript
// ✓ 正确：Nexus 组件依赖接口
interface TaskRepository {
  findById(id: string): Promise<Task>
  findByStatus(status: TaskStatus): Promise<Task[]>
  save(task: Task): Promise<void>
  delete(id: string): Promise<void>
}

class StateMachine {
  constructor(
    private taskRepo: TaskRepository,    // 依赖接口，不依赖实现
    private habitRepo: HabitRepository
  ) {}
}

// ✓ 阶段一实现（MVP）：PostgreSQL via Drizzle
class DrizzlePostgresTaskRepository implements TaskRepository { ... }

// ✓ 阶段二实现（Local First）：SQLite WASM via Drizzle，只换这一层
class DrizzleSQLiteTaskRepository implements TaskRepository { ... }

// ✓ 阶段三实现（Mobile）：Expo SQLite via Drizzle，接口完全相同
class ExpoSQLiteTaskRepository implements TaskRepository { ... }
```

### 约束 2：禁止 raw SQL

所有数据查询通过 Drizzle query builder 完成，禁止直接使用 SQL 字符串，禁止使用任何数据库专有语法。

```typescript
// ✓ 正确：Drizzle query builder，方言无关
const tasks = await db.select().from(tasks)
  .where(eq(tasks.status, 'active'))
  .orderBy(desc(tasks.createdAt))

// ✗ 禁止：raw SQL，各端方言不同，升级时需手工重写
const tasks = await db.execute(
  sql`SELECT * FROM tasks WHERE status = 'active'
      AND created_at > NOW() - INTERVAL '7 days'`
)
```

### 约束 3：Schema 单一来源

Drizzle Schema 是全系统数据结构的唯一定义，Web、Mobile、Backend 共用同一份 Schema 文件，不允许在不同端维护不同的 Schema 副本。

### 约束 4：USOM 对象与 DB 对象分离

Nexus 组件内流转的是 USOM TypeScript 类型，不是 Drizzle 返回的原始 DB 行对象。Repository 层负责在两者之间做映射转换。

---

## 四、技术风险登记表

| 风险点 | 等级 | 阶段 | Plan B |
|---|---|---|---|
| Supabase 免费额度超限 | 低 | 阶段一 | 升级付费计划或迁移至自建 PostgreSQL |
| SQLite WASM multi-tab 并发写入问题 | 低 | 阶段二 | Lifeware 使用场景并发写入极少，可接受 |
| PowerSync 自托管稳定性 | 低 | 阶段二/三 | 切换为 PowerSync 托管版 |
| Drizzle SQLite WASM adapter 边缘 bug | 低 | 阶段二 | 临时绕过或 patch，社区响应较快 |
| 移动端时间盒编排冲突（Web/Mobile 同时修改） | 低 | 阶段三 | Last-write wins，概率极低 |
| 移动端 PowerSync Shape 同步延迟 | 低 | 阶段三 | 加本地乐观更新缓解用户感知 |

---

## 五、各阶段完整技术栈对照

| 层次 | 阶段一 MVP | 阶段二 Local First | 阶段三 移动端接入 | 阶段四 |
|---|---|---|---|---|
| 使用范围 | 开发者单人 | 熟人测试 1-20 人 | 大范围内测 | 正式推广 |
| Web 框架 | Next.js/React | 不变 | 不变 | 不变 |
| Mobile 框架 | — | — | React Native + Expo | 不变 |
| UI（Web） | Tailwind + shadcn/ui + dnd-kit | 不变 | 不变 | 不变 |
| UI（Mobile） | — | — | Tailwind + Expo 手势库 | 不变 |
| 前端 DB（Web） | — | SQLite WASM | 不变 | 评估 PGlite 升级 |
| 前端 DB（Mobile） | — | — | Expo SQLite | 评估 pglite-RN |
| ORM | Drizzle | 不变 | 不变 | 不变 |
| 同步层 | — | PowerSync | 不变（Mobile 按 Shape） | 评估 Electric SQL |
| 后端 DB | PostgreSQL（Supabase） | 不变 | 不变 | 不变 |
| AI/Agent | LangGraph/LangChain | 不变 | 不变 | 不变 |
| 规则引擎 | goRules | 不变 | 不变 | 不变 |
| LLM | 本地模型 + 云端混合 | 不变 | 不变 | 不变 |
| E2E 加密 | 不实现 | 不实现 | 不实现 | 评估实现 |
| 开发工具 | Claude Code + WSL Ubuntu + Docker | 不变 | 不变 | 不变 |

---

## 六、本文档的使用方式

- 每次阶段升级前，重新评估本文档的技术风险登记表
- 阶段升级后，更新对照表中的实际选型，并记录与计划的差异
- 任何违反第三章约束的代码提交，视为技术债务，需在当次迭代内修复
- 阶段四内容在阶段三完成后另立文档细化
