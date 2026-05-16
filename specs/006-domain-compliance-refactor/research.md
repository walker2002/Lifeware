# Research: Domain 全面合规重构

**Date**: 2026-05-15
**Feature**: 006-domain-compliance-refactor

## Decision 1: State Machine 通用化策略

**Decision**: 使用 `manifest.lifecycle` 作为状态转换的唯一定义源，State Machine 在运行时动态读取。

**Rationale**: 宪章 Principle III（Single-Writer Invariant）要求 State Machine 为唯一状态写入者。当前 State Machine 仅服务 timebox，其他域的状态转换在 Orchestrator 中硬编码，违反了这一原则。通用化后，State Machine 变为纯粹的规则执行器——接收 StateProposal、从 manifest 查找合法跃迁、执行或拒绝。这与注册指南 Step 2 区块 B 的设计完全对齐。

**Alternatives considered**:
- 每个域导出 transitions 数组，State Machine 从代码中读取：保留了代码级别的转换定义，但没有利用 manifest 的声明式优势
- 保留 createTimeboxStateMachine + 新建 createHabitStateMachine 等：每新增域就要加一个工厂函数，违反注册指南的"不修改 Nexus"原则

## Decision 2: Orchestrator 统一入口设计

**Decision**: 单一 `executeIntent(intent, userId, confirmed?)` 方法，通过 registry 查找域插件执行。

**Rationale**: 当前三入口模式（execute/executeHabitIntent/executeOKRIntent）意味着每新增域就要加方法。统一入口后，差异完全由 manifest 和 hooks 驱动。onEvent 在 State Machine 成功后、EventBus.publish 前同步调用（澄清 Q2），保证 OKR KR 联动的原子性。

**Alternatives considered**:
- 保持多入口但抽取公共逻辑：仍有域专属代码在 Orchestrator 中
- 使用策略模式按域分发：本质上是另一种形式的 if-else，不如 registry + manifest 纯粹

## Decision 3: intent.fields spread 策略

**Decision**: State Machine 的 create 路径将 `intent.fields` 直接 spread 为对象属性。

**Rationale**: 当前 Orchestrator 中 timebox 创建有 12 个硬编码字段映射，habits 有 13 个，OKR 有 8 个。这些映射是 Orchestrator 耦合的主要来源。spread 策略意味着 State Machine 不需要知道任何域的字段结构——字段校验由 onValidate 负责，State Machine 只关心 status 转换和持久化。

**Alternatives considered**:
- manifest field_metadata 声明字段列表并过滤：增加了 manifest 复杂度，且过滤逻辑本身也是耦合
- 域 hooks 导出 createPayload 映射函数：hooks 应为纯函数，映射函数需要知道完整的对象结构

## Decision 4: 渐进式部署策略

**Decision**: Phase 1 按域逐步完成，Phase 2 原子完成，Phase 3 按域逐步搬迁。

**Rationale**: Phase 2（Orchestrator/State Machine 通用化）是四个域共用的基础设施，必须原子完成才能保证一致性。Phase 1 和 Phase 3 是域自包含的变更，按域逐步完成可以降低风险、方便验证。

**Alternatives considered**:
- 大爆炸：三个 Phase 全部完成后发布，风险太高
- 按域端到端：先完成 timebox 的全部三个 Phase，但 Phase 2 是共享组件，无法按域拆分

## Decision 5: onEvent 同步执行时序

**Decision**: onEvent 在 State Machine 成功后、EventBus.publish 前同步调用。

**Rationale**: OKR 的 KR 联动（Objective 激活 → KR draft→active）需要在同一调用内完成。如果异步执行，用户看到 Objective 已激活但 KR 仍为 draft 的短暂不一致窗口，影响用户体验。同步执行保证原子性，且 onEvent 异常不回滚主流程（澄清 Q1）。

**Alternatives considered**:
- EventBus.publish 后异步触发：有短暂不一致窗口
- onEvent 返回联动意图由 Orchestrator 执行：增加了 Orchestrator 的复杂度，且需要新的返回类型

---

# 技术研究：Manifest Runtime Consumption 基础设施选型

**Date**: 2026-05-16
**Scope**: 为 FR-020 ~ FR-031（Manifest 运行时消费 + YAML 校验）提供库选型、加载模式和校验策略的技术决策支持。

---

## Decision 6: YAML 解析库选型

**Decision**: 选用 `yaml`（eemeli/yaml），版本 2.7.x。

**Rationale**:

| 评估维度 | `js-yaml` (v4.1.0) | `yaml` (eemeli, v2.7.1) | `yamljs` (v0.3.0) |
|---|---|---|---|
| **TypeScript 支持** | 需要额外安装 `@types/js-yaml`，类型不完整 | 原生 TypeScript 编写，类型完整且与 API 同步更新 | 社区 `@types/yamljs`，质量参差不齐 |
| **YAML 规范** | 混合 YAML 1.1/1.2，行为不一致（pnpm #9395 讨论指出此问题） | 严格 YAML 1.2 兼容，通过完整 yaml-test-suite 测试 | YAML 1.2，但实现不完整 |
| **Bundle size** | ~88 kB min / ~22 kB gzip | ~72 kB min / ~18 kB gzip | ~18 kB min（功能最少） |
| **维护活跃度** | 2 年+ 无功能更新，仅维护修复 | 活跃维护，持续迭代（2025-2026 多次 release） | 已停止维护，最后发布 2018 年 |
| **错误报告** | 行号 + 基础描述 | 行号 + 列号 + 上下文片段 + warning 分级 | 基础错误信息 |
| **额外功能** | 安全模式（SAFE_LOAD） | AST 访问、注释保留、Document 对象、CLI 工具 | 无 |
| **零依赖** | 是 | 是 | 是 |

选择 `yaml` 的核心理由：

1. **类型安全优先**：项目使用 strict TypeScript，原生 TS 编写的库避免 `@types` 包滞后导致的类型丢失，与 `DomainManifest` 等接口无缝对接。
2. **规范一致性**：pnpm 团队专门因 js-yaml 的 1.1/1.2 混合行为将其替换为 `yaml`，说明这一问题在生产环境中有实际影响。manifest.yaml 中 `true`/`false`/`null` 等值的解析行为需要可预测。
3. **错误报告质量**：Decision 8 要求加载器输出"含文件路径和错误行号的结构化错误信息"，`yaml` 的 `YAMLWarning`/`YAMLError` 对象提供 `pos`（绝对偏移）、`linePos`（行列号）和消息，比 js-yaml 的错误对象更适合构建用户友好的诊断输出。
4. **Lifeware manifest 不进入客户端 bundle**：所有 manifest 加载在 server-side 完成（Decision 7），bundle size 差异不构成瓶颈。

**Alternatives considered**:
- `js-yaml`：生态最广泛，但类型依赖外部包、规范混合行为在 boolean/null 解析上有隐患。不推荐。
- `yamljs`：已停止维护 8 年，存在未修复的安全和兼容性问题。直接排除。
- 不引入库，使用 `eval('('+yamlContent+')')` 或正则解析：manifest 包含多行字符串和复杂嵌套，手写解析不可靠。排除。
- 在构建时通过 webpack loader 将 YAML 转为 JSON（`yaml-loader`）：引入构建工具链耦合，且无法满足"运行时修改即生效"的需求（Decision 7 详述）。排除。

---

## Decision 7: Next.js 中加载 YAML 文件的模式

**Decision**: 在 server-side 使用 `fs.readFileSync` + `yaml.parse()` 同步加载，配合模块级单例缓存（惰性加载 + 永不过期）。

**Rationale**:

### 7.1 加载位置：server-only

manifest.yaml 仅在以下场景消费：
- Server Actions（`frontend/src/app/*/actions.ts`）调用 Orchestrator
- API Route Handlers（Phase 2 Bridge Layer）
- Orchestrator / State Machine / Intent Engine 初始化

全部运行在 Next.js server-side。客户端组件不直接接触 manifest 数据——域的 UI 元数据（`intent_triggers`、`required_fields`、`list_actions`）通过 Server Actions 返回给客户端。

因此：
- 不需要 webpack/turbopack 的 YAML loader 配置
- 不需要将 `yaml` 包打入客户端 bundle
- 直接用 Node.js `fs` 模块读取文件系统

### 7.2 为什么不使用 webpack/turbopack import

Next.js 16 的 Turbopack **不支持自定义 loader**（与 webpack 的 `module.rules` 不同）。虽然可以通过 `next.config.ts` 的 `turbopack.rules` 配置有限的自定义处理，但：

1. Turbopack 的 YAML 支持需要安装 `@aspect-build/rules_ts` 或类似第三方规则，配置复杂且文档稀缺。
2. `import manifest from './manifest.yaml'` 在构建时将 YAML 编译为 JS 对象，这意味着**运行时修改 manifest.yaml 不会生效**——必须重新构建。这直接违反 FR-020 的"修改 manifest 无需修改 TypeScript 代码即生效"要求。
3. 当前项目使用 Turbopack（`next dev` 默认），但生产构建仍走 webpack，双模式配置增加维护负担。

### 7.3 缓存策略：模块级单例（应用生命周期）

```typescript
// 伪代码示意
const cache = new Map<string, DomainManifest>()

export function loadManifest(domainDir: string): DomainManifest {
  const cached = cache.get(domainDir)
  if (cached) return cached

  const yamlPath = path.join(domainDir, 'manifest.yaml')
  const content = fs.readFileSync(yamlPath, 'utf-8')
  const parsed = parseAndValidate(content, yamlPath)  // yaml.parse + Zod 校验
  cache.set(domainDir, parsed)
  return parsed
}
```

选择"一次性加载 + 永不过期"的理由：

1. **manifest 是部署单元的一部分**：`manifest.yaml` 与 `hooks.ts` 同属一个域目录，不来自外部数据源。修改 manifest 等同于代码变更，需要重新部署才能生效（serverless 函数重新加载）。
2. **零运行时开销**：首次访问时解析和校验，后续直接返回缓存对象。对于每个 serverless 函数实例，总共解析 4 个 YAML 文件（约 200 行/文件），耗时可忽略。
3. **Next.js serverless 模型兼容**：Vercel / Docker 部署时，每个 serverless 函数冷启动时触发模块级缓存初始化。没有文件监听的开销和复杂度。

**为什么不使用文件监听（fs.watch）自动重载**：
- 增加了运行时复杂度（监听器管理、内存一致性、热更新时的请求竞态）
- manifest 修改在生产环境中不应自动生效，应通过正常部署流程
- 开发时 `next dev` 的 HMR 已经会在文件变更时重新加载模块，自然触发重新解析

**Alternatives considered**:
- **webpack `yaml-loader` + `import`**：构建时编译，运行时修改无效。违反 FR-020。排除。
- **每次请求重新读取文件**：YAML 解析虽快（~100μs/文件），但无意义的 I/O 和解析开销。且 Zod 校验也会重复执行。排除。
- **文件监听 + 热重载**：增加复杂度，且开发时 HMR 已覆盖需求。排除。
- **构建时将 YAML 转为 `.ts` 文件（codegen）**：引入构建步骤依赖，且生成的 `.ts` 文件可能被开发者误编辑。违反"单一数据源"原则。排除。

---

## Decision 8: 动态构建模式 — 闭包工厂函数

**Decision**: 使用工厂函数模式（闭包），每个域的 `index.ts` 通过 `createDomainPlugin(manifest)` 工厂函数构造 `DomainPlugin` 对象，manifest 数据通过闭包注入到 hooks 中。

**Rationale**:

### 8.1 当前模式（硬编码）

当前每个域的 `index.ts` 内联一个精简版 `DomainManifest`（仅 domainId、version、requiredFields、subscribedEvents），完整的六区块 manifest.yaml 数据未被消费。hooks.ts 中的 `SUBSCRIBED_EVENTS`、`TASK_TRANSITIONS` 等常量也是手动枚举的。

### 8.2 目标模式

```typescript
// domains/tasks/index.ts — 目标形态
import { loadManifest } from '@/domains/manifest-loader'
import { createDomainPlugin } from '@/domains/plugin-factory'

const manifest = loadManifest(__dirname)  // 读取 + 解析 + 校验 manifest.yaml
export const tasksPlugin = createDomainPlugin(manifest)
```

```typescript
// domains/plugin-factory.ts
import type { DomainManifest } from '@/usom/types/domain-types'
import type { DomainPlugin } from '@/usom/types/process'

export function createDomainPlugin(
  rawManifest: DomainManifest,
): DomainPlugin {
  // 从 manifest 动态构建 process 层的精简 DomainManifest
  const processManifest: ProcessDomainManifest = {
    domainId: rawManifest.id as DomainId,
    version: rawManifest.version,
    requiredFields: extractRequiredFields(rawManifest),
    subscribedEvents: rawManifest.subscribed_events as SystemEventType[],
  }

  // 从 manifest 构建运行时常量，通过闭包注入到 hooks
  const subscribedEvents = new Set(rawManifest.subscribed_events)
  const lifecycleMap = buildLifecycleMap(rawManifest.lifecycle)
  const fieldMeta = rawManifest.field_metadata
  const actionTimestampMap = buildActionTimestampMap(rawManifest)

  return {
    manifest: processManifest,
    onValidate: (intent, snapshot) => onValidate(intent, snapshot, { rawManifest }),
    onEvent: (event, snapshot) => onEvent(event, snapshot, { subscribedEvents, lifecycleMap, rawManifest }),
    onActionSurfaceRequest: (snapshot, signals) => onActionSurfaceRequest(snapshot, signals, { rawManifest }),
  }
}
```

### 8.3 为什么选择工厂函数而非依赖注入

| 维度 | 工厂函数（闭包） | 依赖注入（DI 容器） |
|---|---|---|
| **复杂度** | 零框架依赖，一个纯函数 | 需要 DI 容器（tsyringe、inversify）或手动实现 |
| **类型安全** | 参数类型由函数签名保证，TypeScript 推断完整 | 通常依赖装饰器或 token，类型推断依赖配置 |
| **可测试性** | 传入不同 manifest 即可测试不同配置 | 需要构造 DI 容器的测试替身 |
| **与现有架构对齐** | 项目所有模块均使用函数式风格，无类/装饰器 | 引入完全不同的编程范式 |
| **调试友好度** | 调用栈清晰，闭包变量可直接查看 | 需要理解容器解析链路 |

选择工厂函数的核心理由：Lifeware 项目从 CLAUDE.md 到 constitution 一致强调"简洁优先"。引入 DI 容器为一个 4 域的系统增加了一个重量级抽象层，得不偿失。闭包模式在 TypeScript 生态中是处理"配置注入"的主流方案（Next.js 中间件、Express 路由、React Server Actions 均采用此模式）。

### 8.4 类型安全保证

`loadManifest()` 返回经过 Zod 校验的 `DomainManifest` 类型（Decision 9）。工厂函数的参数类型为 `DomainManifest`（已通过 `z.infer` 从 Zod schema 推导），确保：

1. 编译时：hooks 函数的参数类型与 manifest 结构一致
2. 运行时：Zod `parse()` 保证传入的值符合 schema
3. 类型变更时：修改 Zod schema 即可自动传播到所有消费方，无需手动同步

**Alternatives considered**:
- **依赖注入容器（inversify/tsyringe）**：对当前 4 域系统过度工程，违反"简洁优先"原则。
- **全局 Registry 对象 + getter**：manifest 数据挂在全局对象上，hooks 通过 `getManifest('tasks')` 访问。隐式依赖，测试困难。
- **React Context**：manifest 不在组件树中消费（server-only），不适用。
- **直接在每个 hooks.ts 中 `import { loadManifest } from '../manifest-loader'`**：每个 hooks 文件重复加载逻辑，且 hooks 应为纯函数，不应包含 I/O 操作。通过闭包注入保持 hooks 的纯函数特性。

---

## Decision 9: manifest.yaml 校验策略

**Decision**: 使用 **Zod**（v4.x）定义 manifest schema，`yaml.parse()` 后通过 `schema.parse()` 执行运行时校验，`z.infer` 推导 TypeScript 类型。三阶段校验：YAML 语法 -> 结构校验 -> 语义校验。

**Rationale**:

### 9.1 校验方法对比

| 方法 | 类型安全 | 体积 | 错误报告 | 维护成本 | 生态 |
|---|---|---|---|---|---|
| **Zod schema** | `z.infer` 自动推导 TS 类型 | v4 约 13 kB gzip（66% 比 v3 小） | 结构化 `ZodError`，含 path/message/expected/received | schema 即文档，变更自动传播 | 生态最佳，Next.js/React 社区标准 |
| **JSON Schema (ajv)** | 需 json-schema-to-ts 或手动定义，类型同步困难 | ajv ~100 kB gzip | 详细的验证错误，但格式为 JSON Schema 标准（偏底层） | 需维护 .json 文件 + TS 类型两份 | 通用标准，但对 TS 不够友好 |
| **手动校验** | 无自动类型推导 | 0 kB（自写代码） | 自定义，但需手动实现每个字段的错误路径 | 每新增字段手动添加校验，易遗漏 | 无 |

选择 Zod 的核心理由：

1. **类型即校验，校验即类型**：`DomainManifest` 的 TypeScript 接口定义在 `usom/types/domain-types.ts` 中已存在 89 行。改用 Zod schema 后，这些接口可以通过 `z.infer` 自动推导，消除了"TS 接口与运行时校验不一致"的风险。
2. **Zod v4 性能和体积**：v4 相比 v3 体积减少 66%、解析速度提升 14 倍。对于 manifest 这种嵌套 3-4 层的结构，性能完全足够。
3. **错误报告质量**：`ZodError.issues` 数组中每个 issue 包含 `path`（字段路径，如 `['lifecycle', 'task', 'transitions', 0, 'to']`）、`message`、`expected`、`received`。可以轻松格式化为 "文件路径 + 字段路径 + 错误描述" 的结构化错误消息，满足 FR-027 和 FR-028 的要求。
4. **与 Next.js 生态对齐**：Next.js Server Actions 社区已将 Zod 作为事实标准（`action.ts` 中的 input validation）。引入 Zod 后，未来 Server Actions 的参数校验也可复用同一 schema。

### 9.2 三阶段校验流程

```
manifest.yaml 文件
      │
      ▼
┌─────────────────────────┐
│ Phase 1: YAML 语法校验    │  yaml.parse() 抛出 YAMLParseError
│ 输出：原始 JS 对象或错误   │  错误含 linePos（行号、列号）
└──────────┬──────────────┘
           │ 成功
           ▼
┌─────────────────────────┐
│ Phase 2: 结构校验 (Zod)   │  ManifestSchema.parse(raw)
│ 输出：类型安全的对象       │  错误含 path（字段路径）+ expected/received
└──────────┬──────────────┘
           │ 成功
           ▼
┌─────────────────────────┐
│ Phase 3: 语义校验 (自定义) │  validateSemantics(manifest)
│ - transitions 引用的状态   │    检查 from/to 是否在 states 中
│   均在 states 列表中       │    检查 required_fields 引用的字段在 field_metadata 中
│ - required_fields 引用    │
│   在 field_metadata 中    │
│ - initial_state 在 states │
│ - terminal_states 是 states│
│   的子集                   │
└──────────┬──────────────┘
           │ 成功
           ▼
     DomainManifest (已校验)
```

### 9.3 Zod Schema 定义策略

```typescript
// 伪代码示意 — manifest-schema.ts
import { z } from 'zod'

// 基础块 schema
const IntentTriggerSchema = z.object({
  action: z.string().min(1),
  description: z.string().min(1),
  examples: z.array(z.string()),
  keywords: z.array(z.string()),
  view_route: z.string().optional(),
})

const LifecycleTransitionSchema = z.object({
  from: z.union([z.string(), z.array(z.string()), z.null()]),
  to: z.string(),
  trigger: z.enum(['intent', 'time']),
  action: z.string(),
  event_type: z.string(),
})

const LifecycleDefinitionSchema = z.object({
  states: z.array(z.string()).min(1),
  initial_state: z.string(),
  transitions: z.array(LifecycleTransitionSchema).min(1),
  terminal_states: z.array(z.string()),
})

// 完整 manifest schema
const ManifestSchema = z.object({
  id: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  name: z.string().min(1),
  description: z.string(),
  intent_triggers: z.array(IntentTriggerSchema),
  lifecycle: z.record(z.string(), LifecycleDefinitionSchema),
  field_metadata: z.record(z.string(), FieldMetadataSchema),
  list_actions: z.array(ListActionSchema),
  required_fields: z.record(z.string(), z.array(FieldPromptSchema)),
  templates: z.object({ form: z.record(z.string(), z.array(FormFieldSchema)) }).optional(),
  subscribed_events: z.array(z.string()),
})

// 类型推导 — 替代 usom/types/domain-types.ts 中的手动接口
export type DomainManifest = z.infer<typeof ManifestSchema>
```

### 9.4 关于"是否用 Zod schema 替代现有手动接口"

**建议：渐进式迁移，最终替代。**

当前 `usom/types/domain-types.ts` 中定义了 89 行手动接口。引入 Zod 后：

1. **Phase 1（本次）**：在 `domains/manifest-loader/` 中定义 Zod schema，`z.infer` 推导出的类型用于 manifest 加载器内部。现有 `usom/types/domain-types.ts` 中的接口暂时保留，因为 `lifecycle-configs.ts`、`hooks.ts` 等消费者已依赖这些类型。Zod schema 的 `z.infer` 类型与手动接口做兼容性断言（`extends` 检查），确保二者一致。

2. **Phase 2（后续）**：当所有消费者都迁移到从 Zod schema 推导的类型后，删除 `domain-types.ts` 中的手动接口定义，统一使用 `z.infer` 作为单一类型来源。

**Alternatives considered**:
- **JSON Schema + ajv**：类型推导需要额外工具链（`json-schema-to-typescript`），维护两份定义（schema + TS 类型）。对 TypeScript 项目不够友好。
- **手动校验函数**：对于 manifest 的 6 个区块 + 嵌套结构（lifecycle 有 2 层嵌套、required_fields 有 3 层嵌套），手动校验代码量可能超过 Zod schema 本身，且无自动类型推导。错误报告也需要手动构建 path 信息。
- **不校验，信任 manifest.yaml**：YAML 语法错误会导致运行时 undefined 访问，且 spec 中 FR-027/FR-028 明确要求校验。
- **io-ts / effect/Schema**：功能与 Zod 相当，但生态和社区规模远小于 Zod。effect/Schema 引入了 Effect 体系，对项目而言过重。

---

## 依赖安装清单

基于以上决策，需要安装以下依赖：

```bash
# 生产依赖
npm install yaml       # YAML 1.2 解析器（~18 kB gzip）
npm install zod        # TypeScript-first 运行时校验（~13 kB gzip，v4）

# 无需安装
# @types/yaml          # yaml 包自带 TypeScript 类型
# @types/js-yaml       # 不使用 js-yaml
# yaml-loader          # 不使用构建时 loader
```

两个包合计约 31 kB gzip，但**仅 server-side 使用**，不增加客户端 bundle 体积。可通过 `import { parse } from 'yaml'` 的 tree-shaking 进一步减小实际引入量。

---

## 实现路径总结

```
1. npm install yaml zod
2. 创建 domains/manifest-loader/
   ├── schema.ts          # Zod schema 定义（六区块 A-F）
   ├── loader.ts          # loadManifest(dir) — 读取、解析、校验
   ├── validator.ts       # validateSemantics() — 语义校验
   └── errors.ts          # ManifestLoadError 结构化错误类型
3. 创建 domains/plugin-factory.ts
   └── createDomainPlugin(manifest) — 闭包工厂函数
4. 改造各域 index.ts
   └── 从 loadManifest + createDomainPlugin 构建 DomainPlugin
5. 改造各域 hooks.ts
   └── 接收 manifest 数据作为参数，消除硬编码常量
6. 改造 nexus/orchestrator/lifecycle-configs.ts
   └── 从 manifest 加载 lifecycle，替代内联对象
7. 改造 nexus/core/state-machine/
   └── 从 manifest.field_metadata 动态构建 actionTimestampMap
```
