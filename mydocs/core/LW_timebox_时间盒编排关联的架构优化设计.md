# 时间盒编排关联的架构优化设计



# 方案初稿

## 整体解决思路

结论：

1. 增加 Domain 对主动型事务的处理能力，即在 Hook(被动模式) 之外，另增加 Handler(主动模式) 响应机制。
2. 由Intent根据意图，负责从Domain 的声明中 从从 repository 中组装“信息材料”
3. "生成时间盒"归属 timebox domain，但是“材料”来自于其他 Domain和记忆等，timebox只负责构建算法和AI，而不管材料来源（可通过manifest 申请材料来源），同理后续的生成总结、制定下季度OKR 、分解项目/任务等，都按照类似模式操作，具体的算法和处理都在各自的Domain中



##  Handler 与 Hook 的本质区别

  ┌──────────┬───────────────────────┬───────────────────────────────────────┐
  │          │     Hook（被动）      │            Handler（主动）            │
  ├──────────┼───────────────────────┼───────────────────────────────────────┤
  │ 触发方式 │ 事件/通知驱动         │ 任务驱动                              │
  ├──────────┼───────────────────────┼───────────────────────────────────────┤
  │ 数据来源 │ 接收预组装的 snapshot │ 接收 Intent Engine 按需组装的完整数据 │
  ├──────────┼───────────────────────┼───────────────────────────────────────┤
  │ 职责     │ 判断/建议             │ 计算/生成                             │
  ├──────────┼───────────────────────┼───────────────────────────────────────┤
  │ 纯度     │ 纯函数，无 AI         │ 可含 AI、算法、启发式                 │
  ├──────────┼───────────────────────┼───────────────────────────────────────┤
  │ 输出     │ 判定结果              │ 产物（proposal、Markdown）            │
  └──────────┴───────────────────────┴───────────────────────────────────────┘

Hooks 管"能不能做"，Handlers 管"怎么做"。



##  执行流确认

  用户输入 "帮我安排今天的时间盒"
         ↓
  Intent Engine
    ├─ Phase A: 路由 → (timebox, createSmartSchedule)
    ├─ Phase B: 提取用户字段 → { date: "2026-05-17" }
    └─ Phase C（新增）: 读取 manifest.data_requirements
         → 从 repository 收集系统材料
         → 组装完整数据包
         ↓
  Orchestrator
    └─ 识别为 generative 路径
         → 调用 TimeboxSchedulingHandler(完整数据包)
         ↓
  Handler（纯计算）
    ├─ AI 生成编排方案
    ├─ 冲突检测
    └─ 输出 { proposals, markdown, warnings }
         ↓
  Rule Engine → 用户确认 Markdown → State Machine 批量执行



## 支持这么做的理由



- Intent Engine 已经知道 action 和 domain，天然知道要收集什么

- 当前 Intent Engine 的宪法职责是："Intent parsing and StructuredIntent production"。需要明确加 Phase C 后变成"intent parsing +
    data assembly"，这是一个职责扩展。

- 产出"完整数据包"后，Orchestrator 仍然是纯调度——只做路由

- Handler 保持纯计算，不关心数据从哪来

  

## 扩展

临时安排任务进时间盒的增量调整同路径，只是 action 换成 adjustRemainingSchedule，Phase C 只采集变更点之后的材料，Handler 只重排受影响时段。





## 具体设计

### 1. Manifest 声明

Manifest 新增 generation_actions 块

### domains/timebox/manifest.yaml — 新增块

  generation_actions:
    createSmartSchedule:
      description: "AI 生成当日时间盒编排方案"
      data_requirements:

        - key: habitTemplates       # 材料键名（Handler 用这个取数据）
          source: habits            # 来源 domain
          query: templates_for_date # 查询方法
          params: [date]            # 参数来源：intent.fields
    
        - key: activeTasks
          source: tasks
          query: active_with_details
          params: [date]
    
        - key: existingTimeboxes
          source: timebox
          query: timeboxes_for_date
          params: [date]
    
        - key: energyProfile
          source: calibration
          query: energy_profile
          params: []
    
        - key: pendingHabits
          source: habits
          query: unlogged_for_date
          params: [date]
    
    adjustRemainingSchedule:
      description: "增量调整剩余时段"
      data_requirements:
        - key: remainingTimeboxes
          source: timebox
          query: remaining_from
          params: [date, fromTime]    # fromTime = 当前时间
    
        - key: unscheduledTasks
          source: tasks
          query: unscheduled_for_date
          params: [date]
    
        - key: unloggedHabits
          source: habits
          query: unlogged_for_date
          params: [date]
    
        - key: energyProfile
          source: calibration
          query: energy_profile
          params: []

  设计要点：
  - key 是 Handler 内部引用数据的键名，强类型由 Handler 自定义
  - params 的值来自 intent.fields（如 date），Intent Engine 在 Phase C 时解析
  - 每个 source 对应一个 Repository，query 是 Repository 的方法名
  - Orchestrator 判断 action 是否有对应的 generation_actions 条目来识别 generative 路径





### 2. Handler 接口

  // usom/types/process.ts — 新增类型

  /** Intent Engine Phase C 组装的完整请求 */
  interface GenerationRequest {
    intent: StructuredIntent           // 用户参数 (date, scope 等)
    materials: Record<string, unknown> // 按 manifest.data_requirements 收集
  }

  /** Handler 输出 */
  interface GenerationResult {
    proposals: StateProposal[]         // 待执行的状态变更
    markdown: string                   // 用户可编辑的计划文件
    warnings: string[]                 // Rule Engine 标注 + 能量匹配警告
  }

  /** Domain Handler 接口 */
  interface DomainHandler {
    handle(request: GenerationRequest): Promise<GenerationResult>
  }



### 3. Handler 实现（以 SchedulingHandler 为例）

  // domains/timebox/handlers/scheduling-handler.ts

  interface SchedulingMaterials {
    habitTemplates: HabitTemplateSummary[]
    activeTasks: TaskDetail[]
    existingTimeboxes: TimeboxSummary[]
    energyProfile: EnergyProfile
    pendingHabits: HabitSummary[]
  }

  export class SchedulingHandler implements DomainHandler {
    async handle(request: GenerationRequest): Promise<GenerationResult> {
      // Handler 内部知道自己的 materials 结构
      const materials = request.materials as unknown as SchedulingMaterials
      const { date } = request.intent.fields

      // 1. 纯计算：冲突检测、时段分配
      // 2. AI 调用：生成最优编排 + Markdown
      // 3. 组装 proposals 和 warnings
    
      return {
        proposals,
        markdown: generateMarkdown(proposals, warnings),
        warnings,
      }
    }
  }

  关键约束：Handler 是纯计算单元——它不调用 Repository，不触发事件，不写状态。所有数据都从 GenerationRequest 获得。



###  4. 注册机制

  // domains/timebox/index.ts — 扩展现有导出

  export const timeboxHandlers: Record<string, DomainHandler> = {
    createSmartSchedule: new SchedulingHandler(),
    adjustRemainingSchedule: new SchedulingHandler(),
  }

  export const timeboxPlugin = createDomainPlugin(fullManifest)

  // domains/registry.ts — 扩展注册

  import { timeboxHandlers } from './timebox'
  import { habitsHandlers } from './habits'
  // ...

  const allHandlers: Record<string, Record<string, DomainHandler>> = {
    timebox: timeboxHandlers,
    habits: habitsHandlers,
    // ...
  }

  export function findHandler(domainId: string, action: string): DomainHandler | undefined {
    return allHandlers[domainId]?.[action]
  }

  Orchestrator 检查 findHandler(domainId, action) 是否存在来判断是 generative 路径还是普通路径。



### 5. 目录结构

  domains/timebox/
    ├── hooks.ts                    # 现有 4 hooks（不变）
    ├── handlers/                   # 新增
    │   ├── scheduling-handler.ts
    │   └── index.ts                # 导出 handler map
    ├── repository.ts               # 现有（可能需要新增查询方法）
    ├── manifest.yaml               # 扩展 generation_actions 块
    └── index.ts                    # 扩展导出 handlers



----

改进意见



------

当前的方案现在实际上形成了：

```
Reactive Path（Hook），Hook = Constraint System
Generative Path（Handler），Handler = Planning System
```



```
Intent Engine
  parse + data assembly
```





---





# 评审改进稿

## 需要修正的架构设计



### 1. Intent Engine 的 Phase C选择

之前在 phaseC 的选择中，我把它放在了 Intent Engine中，由于 Phase C 未来会存在各种更加复杂的要求，会远超出 Intent Engine 的职责，我现在考虑还是把它独立出来，就如你之前的建议，并不是放在 Orchestrator , 而是增加一个 Context Engine，专门负责整合上下文，

这个Context Assembler未来还可以

- 组装 Memory
- 知识方法论

从而拥有更大数据组合能力。 



关键在于：区分“解析意图”和“组装上下文”两种职责，一个是：语言理解；一个是：数据规划，它们长期演化方向完全不同。



### 2. 构建系统级上下文共享协议

#### "材料"的来源未来有多种

为了后续规范用语，"材料"是之前临时的用语，后续统一用“Context”来命名。



因为未来的上下文信息来源可能是：

- Repository
- Memory
- Vector DB
- AI Summary
- External Calendar
- HealthKit
- GitHub
- Cached Projection

**repository只是其中最常见的一种！**



#### “上下文”（材料）提供者需要明确声明共享

所以可以考虑新增：

```
interface ContextProvider {
  provide(query, params): Promise<unknown>
}
```

具体实现上，要求各其他 Domain 声明暴露自己的重要信息（可共享信息）； 其他“上下文信息”来源后续可迭代增加。

```
Habits Domain
  自己暴露：
    ContextProvider
```

而不是：

```
Nexus 直接调用 Repository
```



例如：

Task Repository 的职责是 **管理任务数据**

ActiveTasksProvider 的职责则是 **向各类生成Handle提供任务信息材料**



#### 建系统级上下文共享协议

为了确保各类“上下文材料”的共享，需要增加一个“系统级上下文共享协议”，在一个统一的地方注册 Provider。各 Domain可以把可共享的“材料”（信息）在这里注册，成为 Provider。



共享是受控的，根据业务需要来开发，Domain 需要建立自己的 context Providers，context Providers 作为对外暴露对象，而不是 Repository

```
Domain
 ├── Repository（内部真实数据）
 ├── Hooks
 ├── Handlers
 └── Context Providers（受控共享）
```



Registry 应该注册的不是“Provider 实例”而是“Context Capability”

例如：

```
interface ContextCapability {
  id: string

  provider: ContextProvider

  visibility: 'private' | 'planning' | 'system'

  schema: ZodSchema

  description?: string
}
```

例如：

```
registerContextCapability({
  id: 'activeTasks',

  visibility: 'planning',

  schema: ActiveTaskContextSchema,

  provider: new ActiveTasksProvider(),
})
```



这样确保上下文被“最小化”安全共享。



#### “生成式”处理的声明

Manifest 应该只声明“需要哪些 capability”：

例如：

```
generation_actions:
  createSmartSchedule:
    contexts:
      - activeTasks
      - pendingHabits
      - energyProfile
```





#### ContextAssembler流程

```
读取 manifest 生成式action 的 contexts
    ↓
查 registry
    ↓
验证 visibility
    ↓
调用 provider
    ↓
schema validate
    ↓
组装 GenerationRequest
```



#### 对Provider 的约束

架构上需要约束：Provider 只能：

1. 读取

2. 投影

3. 聚合轻量信息

不能做复杂 planning，否则 provider和handler的边界就会不清晰。





## 3. Handler 的输出

Handler 返回 markdown 可能需要调整，这不是Handler 的主输出



Handler 的核心职责是

```
生成 proposal graph
```



Markdown 只是：

```
一种 presentation layer
```

未来，不排除还有

- kanban
- UI tree
- calendar
- 甘特图
- mindmap等



改成：

```
interface GenerationResult {
  proposals: GeneratedProposal[]

  presentation?: PresentationPayload

  warnings?: Warning[]
}
```

例如：

```
presentation: {
  type: 'markdown',
  content: '...'
}
```





考虑改成：

```
interface GenerationResult {
  proposals: GeneratedProposal[]

  presentation?: PresentationPayload

  warnings?: Warning[]
}
```

例如：

```
presentation: {
  type: 'markdown',
  content: '...'
}
```

以后还能：

```
kanban
calendar
mindmap
timeline
```

否则 markdown 会绑定太深。





------

### 4. 预留proposal未来的可能机制

proposals 其实不应该是 flat array，时间盒未来一定会出现：

- alternative plans
- fallback plans
- partial acceptance
- conditional branches

例如：

```
方案A：高强度工作日
方案B：低能量恢复日
```

所以，未来演化方向：

```
ProposalSet {
  alternatives: GeneratedProposal[]
}
```

现在不一定做。但类型设计最好预留。

------

