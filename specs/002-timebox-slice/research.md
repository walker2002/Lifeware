# Research: 时间盒管理优化

**Feature**: 002-timebox-slice
**Date**: 2026-05-06（更新）

---

## R1: Intent Engine — AI 解析策略

**Decision**: 使用 OpenAI SDK 的 JSON mode + system prompt 解析自然语言为 StructuredIntent

**Rationale**:
- 已有 `lib/llm/` 封装了 OpenAI SDK，支持多提供商（DashScope、DeepSeek、OpenAI、智谱）
- LLM 返回 JSON 格式的 StructuredIntent 字段，前端做 schema 验证
- Template-form 作为独立分支，不依赖 AI，保证 fallback 可用性（Constitution VIII）

**Alternatives considered**:
- LangChain / Vercel AI SDK: 过重，MVP 不需要链式调用和流式输出
- 正则表达式解析: 无法处理自然语言灵活性
- 直接 Fetch 调 LLM: 绕过已有封装，增加维护成本

---

## R2: Rule Engine — 简单规则评估模式（goRules 风格）

**Decision**: 采用函数式规则注册 + 顺序评估模式，每条规则为纯函数 `(intent, snapshot) => RuleResult`

**Rationale**:
- MVP 只需 3 条确定性规则（时间重叠、时长合法性、字段完整性）
- goRules 风格：规则定义为独立函数，注册到评估器中，按优先级顺序执行
- 每条规则返回 `pass | warning | confirm`，符合 Constitution "Coaching, Not Gatekeeping" 原则
- 规则函数不依赖 AI（Constitution VIII），不写状态（Constitution III）

**Alternatives considered**:
- JSON 规则引擎 (json-rules-engine): 过度抽象，MVP 规则量少
- 数据库存储规则: MVP 无需动态规则
- 决策表模式: 适合复杂组合，MVP 函数更清晰

---

## R3: Event Bus — 进程内事件发布

**Decision**: 使用 TypeScript 回调注册模式（Observer），类型安全的事件分发

**Rationale**:
- MVP 只需进程内同步事件分发，无需跨进程/网络
- 事件量小（单次操作产生 1-3 个事件），无需消息队列
- Event Bus 不写状态，只通知订阅者

**Alternatives considered**:
- EventEmitter (Node.js): API 偏底层，需封装类型安全
- RxJS: 强大但过重
- 第三方库 (mitt, nanoevents): 增加依赖，功能等价

---

## R4: userId 注入策略（T-03 合规）

**Decision**: Server Actions 从上下文获取 userId → 调用 Orchestrator 时传入；Nexus 内部组件不感知 userId

**Rationale**:
- Constitution T-03: "Nexus 组件 MUST NOT be aware of user_id"
- MVP 无认证系统，使用硬编码 userId（后续替换为 NextAuth session）
- Server Actions 充当 Bridge Layer（约束 D）
- Orchestrator 接收 userId，仅传递给 Repository 层

---

## R5: State Machine — 有限状态机

**Decision**: 使用 Map 结构定义转移表 `Map<Status, Map<Trigger, Status>>`

**Rationale**:
- 时间盒只有 5 个状态、~6 条转移，FSM 足够
- 转移表显式声明，可枚举所有合法路径
- State Machine 是唯一写入系统状态的组件（Constitution III）

**Implementation notes**:
```
Timebox FSM:
  (new)       → planned   [Intent: create_timebox]
  planned     → running   [Time trigger / User: start]
  running     → paused    [User: pause]
  paused      → running   [User: resume]
  running     → ended     [Time trigger]
  paused      → ended     [Time trigger]
  ended       → logged    [User: log execution]
```

---

## R6: 测试框架

**Decision**: Vitest

**Rationale**: 与 Vite 生态兼容，TypeScript 开箱即用，Next.js 社区广泛使用。

---

## R7: Action Surface Engine — MVP 最简实现

**Decision**: 基于 ContextSnapshot + 时间盒事件，调用 Domain.onActionSurfaceRequest 获取候选列表

**Rationale**:
- MVP 只需两种：(1) 创建成功提示 (tile)；(2) 即将开始提醒 (cue)
- 权重硬编码，无需复杂计算

---

## R8: UI 框架 — 设计令牌映射到 Tailwind + shadcn/ui

**Decision**: 将 DESIGN.md 的设计令牌映射为 Tailwind CSS 4 自定义主题 + CSS 变量，shadcn/ui 组件按需引入并覆盖默认主题

**Rationale**:
- DESIGN.md 定义了完整的颜色、字体、间距、圆角令牌体系
- Tailwind CSS 4 支持 `@theme` 指令自定义设计令牌
- shadcn/ui 基于 Radix UI + Tailwind，可通过覆盖 CSS 变量适配 DESIGN.md 主题
- 字体替代方案：Copernicus → Cormorant Garamond（开源）；StyreneB → Inter

**Alternatives considered**:
- 纯 CSS 变量（不用 Tailwind）: 放弃 Tailwind 的工具类效率
- styled-components: 运行时开销，与 Next.js SSR 不够理想
- 主题 UI 库 (Chakra, Mantine): 替代 shadcn/ui 但增加学习成本

**Implementation notes**:
- `globals.css` 中使用 `@theme` 定义 DESIGN.md 的所有令牌
- 颜色：canvas=#faf9f5, primary=#cc785c, ink=#141413, surface-card=#efe9de, surface-dark=#181715
- 字体：display=Cormorant Garamond(serif), body=Inter(sans), code=JetBrains Mono
- 圆角：md=8px(buttons), lg=12px(cards), pill=9999px(badges)
- shadcn/ui 初始化时覆盖 `--background`, `--foreground`, `--primary` 等变量

---

## R9: Notion 风格两栏布局实现

**Decision**: 使用 CSS Grid + `calc()` 实现固定左侧面板 + 弹性右侧内容区

**Rationale**:
- Notion 风格：左侧面板固定宽度（~320px），右侧自适应
- 顶部导航栏固定高度 64px（与 DESIGN.md top-nav 一致）
- 响应式：移动端左侧面板折叠为抽屉（Sheet 组件）
- shadcn/ui 的 Sheet 组件可直接用于移动端侧边栏

**Alternatives considered**:
- CSS Flexbox: 也可以但 Grid 更精确控制两栏比例
- 专门布局库: 不必要，CSS Grid 足够

**Implementation notes**:
```
布局结构（原始）:
┌─────────── 顶部导航栏 (64px) ───────────┐
├────────────┬──────────────────────────────┤
│  AI 面板   │       主内容区               │
│  (320px)   │       (flex-1)               │
│            │                              │
│  输入框    │       时间盒列表             │
│  表单切换  │       Dynamic Tiles          │
│  Tiles     │                              │
├────────────┴──────────────────────────────┤
```

---

## R10: 日历组件选型（2026-05-06 新增）

**Decision**: 使用 `react-big-calendar`（基于 `date-fns`）

**Rationale**:
- 项目已使用 `date-fns`，无额外依赖冲突
- 支持自定义事件渲染，可使用项目设计令牌
- 支持月/周/日视图切换，满足日历展示需求
- TypeScript 支持完善，可通过 Tailwind CSS 定制样式

**Alternatives considered**:
- `@fullcalendar/react`: 功能强大但体积较大
- 纯手写日历：开发成本高，MVP 不值得
- `@hello-pangea/dnd` + 自定义网格：过度工程

---

## R11: 可视化时间轴实现方案（2026-05-06 新增）

**Decision**: 使用纯 CSS + SVG 的自定义组件

**Rationale**:
- 时间轴本质是水平/垂直时间线 + 区块渲染，不需要复杂图表库
- CSS Grid/Flexbox + SVG 连接线即可实现
- 完全控制样式，匹配 DESIGN.md 暖色奶油画布体系
- 与 shadcn/ui 组件风格一致
- 用户截图显示的是简洁的时间条可视化，纯 CSS 足够

**Alternatives considered**:
- D3.js: 过度复杂
- Recharts: 主要用于数据图表
- Canvas 2D: 可访问性差

---

## R12: 日志追踪架构（2026-05-06 新增）

**Decision**: 使用 EventBus 订阅 + Orchestrator 钩子的双层追踪模式

**Rationale**:
- 已有 EventBus（同步 pub/sub），可直接订阅事件
- Orchestrator 是唯一管道入口，各步骤间插入追踪点即可记录完整调用链
- 追踪数据存储在内存（React state），MVP 不持久化
- 配置参数 `ENABLE_TRACE_LOG` 控制开关，默认关闭

**调用链追踪结构**:
```
Orchestrator.execute(rawInput)
  ├── TRACE: intent-parse-start { rawInput }
  ├── IntentEngine.parse() → intent
  ├── TRACE: intent-parse-end { intent }
  ├── TRACE: rule-eval-start { intent }
  ├── RuleEngine.evaluate() → ruleResult
  ├── TRACE: rule-eval-end { ruleResult }
  ├── TRACE: state-machine-start { proposal }
  ├── StateMachine.execute() → result
  │   └── EventBus.publish(event) → TRACE: event-published { event }
  ├── TRACE: state-machine-end { result }
  ├── TRACE: action-surface-start { snapshot, event }
  ├── ActionSurfaceEngine.generate() → surface
  └── TRACE: action-surface-end { surface }
```

**Alternatives considered**:
- AOP/装饰器模式：TypeScript 装饰器在函数式组件中不适用
- 中间件管道：会改变 Orchestrator 的纯调度器角色（违反 Constitution）
- 数据库持久化：MVP 阶段不需要

---

## R13: 界面布局调整策略（2026-05-06 新增）

**Decision**: Tiles 上移至 AppShell 的 TopNav 下方横幅区域，MainContent 支持模式切换

**Rationale**:
- 用户要求"磁贴位置显示在 MainContent 的上方"
- Tiles 作为全局通知/建议区，横跨全宽展示
- MainContent 内部通过 ViewMode 状态切换 Today/Calendar 视图
- 今日模式 CSS Grid 两栏（左列列表 + 右列时间轴），日历模式全宽

**布局变更**:
```
调整后:
┌──────────────── TopNav ────────────────┐
├──────────── Tiles Banner ──────────────┤
├── AiPanel ──┬──── MainContent ─────────┤
│  Input      │  [Today | Calendar]      │
│  Form       │  ┌────────┬──────────┐   │
│             │  │ List   │ Timeline │   │  ← Today 模式
│             │  └────────┴──────────┘   │
│             │  or                       │
│             │  ┌────────────────────┐   │
│             │  │   Calendar View    │   │  ← Calendar 模式
│             │  └────────────────────┘   │
└─────────────┴──────────────────────────┘
```

**Alternatives considered**:
- Tiles 仍在 AI 面板：不符合用户要求
- Tiles 在 MainContent 内部顶部：视觉权重不足

---

## R14: 运行日志 UI 展示方式（2026-05-06 新增）

**Decision**: 使用可折叠的底部调试面板 + TopNav 设置开关

**Rationale**:
- 日志信息对普通用户无意义，默认隐藏
- 底部抽屉不干扰主界面布局
- TopNav 设置按钮控制开关
- 日志面板显示结构化调用链（可展开每步查看 I/O）

**Alternatives considered**:
- 右侧面板：已用于 AI 面板
- 浏览器 console：信息散乱
- 独立页面：打断工作流

## R15: 三栏时间盒视图 — 取代双模式切换

**Decision**: 将 MainContent 的"今日模式/日历模式"切换替换为统一的日/周/月三模式视图。日视图采用三栏布局（列表 + 时间轴 + 小日历），周/月视图使用全宽日历。

**Rationale**:
- 用户需求明确要求取消模式切换，改为日期导航
- 日视图三栏信息密度高，一次看到列表、时间轴和日历
- 周/月视图不需要三栏，全宽日历更清晰
- 日期导航栏统一控制三种模式，交互一致

**Alternatives considered**:
- 保留双模式切换：用户明确要求取消
- 日/周/月都三栏：周/月视图全宽效果更好

## R16: DateNav 日期导航组件

**Decision**: 新建 DateNav 组件，包含左右翻页按钮、日期/周/月文本显示、日/周/月切换按钮。

**Rationale**:
- 替代 ViewModeToggle（今日/日历切换）
- 新增日期维度，支持浏览不同日期的时间盒
- 翻页行为：日模式±1天，周模式±1周，月模式±1月
- 移动端隐藏"周"选项（用户明确要求）

**Alternatives considered**:
- 使用 react-big-calendar 自带导航：样式不够定制化，与设计令牌不一致
- 独立页面路由：过于复杂，单页面切换更流畅

## R17: MiniCalendar 小日历组件

**Decision**: 日视图右栏使用自定义 MiniCalendar 组件（非 react-big-calendar），显示月历小网格。

**Rationale**:
- react-big-calendar 用于周/月全宽视图，不适合嵌在右栏做小日历
- 自定义组件可精确控制尺寸（约 280px 宽）
- 支持点击日期切换日视图的显示日期
- 有时间盒的日期显示标记点

**Alternatives considered**:
- 复用 react-big-calendar：尺寸和样式无法适配右栏
- 使用第三方小日历库：引入额外依赖不值得

## R18: 日期范围数据查询

**Decision**: Server Action 新增按日期范围查询 timeboxes 的能力，根据当前视图模式（日/周/月）动态计算查询范围。

**Rationale**:
- 当前 fetchTimeboxSummaries 只查当天，需要扩展为支持任意日期范围
- 日模式：查当天 00:00-23:59
- 周模式：查当周周一 00:00 至周日 23:59
- 月模式：查当月 1 日 00:00 至月末 23:59

**Alternatives considered**:
- 前端过滤全量数据：数据量大时性能差
- 每次切换请求新数据：符合当前架构模式
