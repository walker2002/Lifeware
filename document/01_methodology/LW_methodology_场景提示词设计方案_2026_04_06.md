# Lifeware 方法论场景提示词设计方案 2026_04_06

---

**本文档说明**

本文档定义 Lifeware 方法论落地的核心方案：**场景提示词工坊**。替代原方案中的"结构化知识库"路线，采用更轻量但更有效的场景驱动提示词方案。

核心判断：Lifeware 引用的方法论（精力管理、GTD、OKR、习惯养成、深度工作等）均为非垂直主流知识，大模型已在训练数据中充分覆盖。瓶颈不在"知识供给"而在"场景路由和操作化映射"。

关联文档：
- `LW_methodology_方法论落地设计规范_2026_03_18.md`（原方案，本文档替代其知识库建设部分）
- `LW_USOM_详细设计_2026_03_21.md`（USOM 字段映射依据）
- `LW_overall_总体设计_2026_03_18.md`（架构约束）

---

# 一、方案决策记录

## 1.1 为什么不建结构化知识库

| 维度 | 结构化知识库 | 场景提示词 |
|---|---|---|
| 建设成本 | 数月，数百条原则提取 + 检索系统 | 数周，8-10 个场景文件 |
| AI 效果 | ≈ 场景提示词（知识已在训练数据中） | 同等效果 |
| 维护成本 | 持续的知识库维护和索引更新 | 场景变化时才更新 |
| 真正独特价值 | 低（知识不独特） | 高（冲突仲裁和操作化映射是独特的） |
| MVP 可行性 | 不行，太重 | 可以立即开始 |

## 1.2 真正的护城河是什么

```
1. 方法论 → USOM 的操作化映射
   "保护高峰精力" 不是知识，而是：
   task.energyRequired == 'high' 时，
   检查 userCalibration.peakEnergyStart/End，
   和 timebox.startTime 对比，
   触发 suggest_reschedule

2. 方法论之间的冲突仲裁
   OKR 聚焦原则说"只做最重要的" vs
   习惯 streak 保护说"不要中断"
   → 当两者冲突时，Lifeware 怎么选？
   这个决策逻辑任何书都没写过，是 Lifeware 独家定义的

3. 个人校准数据
   用户实际的精力曲线、完成率模式、习惯脆弱时段
   → 这是唯一的数据护城河，也是唯一真正需要"积累"的东西
```

## 1.3 与原方案的关系

| 原方案模块 | 本方案处理方式 |
|---|---|
| 设计时流水线（Step 1-2 提取审核） | 保留简化，但产物是场景文件而非原子原则 |
| 规则文件 rules/*.yaml | 保留概念，但 MVP 阶段以 P0 硬约束形式内嵌在场景文件中 |
| 权重配置 weights/*.ts | 保留，作为 Action Surface Engine 的代码实现 |
| 场景提示库 prompts/*.ts | 本方案的核心产出，扩展为完整的场景提示词文件 |
| 校准参数 UserCalibration | 完全保留原方案设计 |
| CalibrationSignal 检测 | 完全保留原方案设计 |
| Review 校准提案 | 完全保留原方案设计 |

---

# 二、场景提示词模板规范

## 2.1 文件命名与位置

```
methodology/
├── prompts/                          # 场景提示词（核心产出）
│   ├── daily_planning.md
│   ├── task_creation.md
│   ├── timebox_scheduling.md
│   ├── evening_closure.md
│   ├── habit_streak_broken.md
│   ├── overcommitment.md
│   ├── weekly_review.md
│   └── okr_check_in.md
│
├── conflict_resolution.md            # 方法论冲突仲裁矩阵
│
├── calibration/                      # 校准参数定义（沿用原方案）
│   ├── defaults.ts
│   └── bounds.ts
│
└── weights/                          # Action Surface 权重（沿用原方案）
    ├── task_weights.ts
    ├── habit_weights.ts
    └── timebox_weights.ts
```

## 2.2 通用模板结构

每个场景文件遵循以下统一结构：

```markdown
# {场景中文名} — {scenario_id}

## 元信息
- 触发时机：{什么时候这个提示词被注入}
- 涉及 Domain：{Tasks | Habits | TimeBox | OKRs | Review}
- 注入位置：Intent Engine / Action Surface / 独立对话
- 依赖数据：{需要哪些 USOM 对象和 DerivedSignals}

## 方法论原则

### P0 — 硬约束（不可越过）
- {原则}：{USOM 字段映射}

### P1 — 强烈建议
- {原则}（来源：{方法论名}）
  - 触发条件：{基于哪些字段判断}
  - 建议动作：{系统行为}
  - 用户可覆盖：是

### P2 — 温和建议
- {原则}（来源：{方法论名}）
  - 触发条件：{条件描述}
  - 建议动作：{行为描述}

## 原则冲突仲裁
| 冲突对 | 仲裁策略 | 理由 |
|---|---|---|
| {原则A} vs {原则B} | {谁优先} | {为什么} |

## USOM 数据注入
运行时注入以下数据供 AI 引用（禁止请求额外数据）：
{具体字段列表，精确引用 USOM 字段名}

## 教练行为规范
- 语调：{具体描述}
- 禁止：{具体禁止事项}
- 输出约束：{结构化输出要求}

## 校准参数引用
| 参数 | 默认值 | 校准信号 |
|---|---|---|
| {参数名} | {值} | {什么数据会触发校准提案} |
```

---

# 三、第一批场景清单

## 3.1 优先级分层

### Tier 1 — 每日高频（MVP 必做）

| # | scenario_id | 中文名 | 触发时机 | 核心方法论 | 预计篇幅 |
|---|---|---|---|---|---|
| 1 | `daily_planning` | 日计划生成 | 每日首次打开 / 主动触发 | 精力匹配 + 时间盒 + OKR 对齐 | ~200行 |
| 2 | `task_creation` | 任务创建 | 用户输入新任务意图 | GTD 澄清 + OKR 关联 + WIP 检查 | ~120行 |
| 3 | `timebox_scheduling` | 时间盒安排 | 用户安排/调整时间盒 | 精力匹配 + 深度工作 + 时间折叠 | ~100行 |
| 4 | `evening_closure` | 晚间收尾 | 每日结束 / 主动触发 | 复盘闭环 + 精力记录 + 次日预备 | ~80行 |

### Tier 2 — 关键教练时刻（用户最需要方法论支撑的时刻）

| # | scenario_id | 中文名 | 触发时机 | 核心方法论 | 预计篇幅 |
|---|---|---|---|---|---|
| 5 | `habit_streak_broken` | 习惯中断 | streak ≥ 7 的习惯未完成 | 习惯回路 + 教练技术 + 元认知 | ~100行 |
| 6 | `overcommitment` | 过度承诺 | WIP 超限 或 新任务加入时超限 | GTD 聚焦 + OKR 取舍 + 精力容量 | ~80行 |
| 7 | `weekly_review` | 周复盘 | 每周固定时间 | OKR 周检视 + 复盘方法论 + 校准提案 | ~180行 |

### Tier 3 — 对齐检查（确保日常行为不偏离目标）

| # | scenario_id | 中文名 | 触发时机 | 核心方法论 | 预计篇幅 |
|---|---|---|---|---|---|
| 8 | `okr_check_in` | OKR 对齐 | 周/月检视 或 用户主动 | OKR 季度节奏 + 关键结果驱动 | ~60行 |

## 3.2 场景间的调用关系

```
daily_planning ──┬──→ timebox_scheduling（安排具体时间盒）
                 ├──→ task_creation（新增待办任务）
                 └──→ evening_closure（日计划完成度比对）

task_creation ───┬──→ overcommitment（触发 WIP 检查）
                 └──→ daily_planning（提示重新安排日计划）

habit_streak_broken → weekly_review（中断模式在复盘中讨论）

weekly_review ───┬──→ okr_check_in（OKR 进度对齐）
                 ├──→ calibration 提案（校准参数调整）
                 └──→ daily_planning（下周计划参考）
```

---

# 四、方法论冲突仲裁矩阵

以下矩阵定义不同方法论原则冲突时的仲裁策略，是 Lifeware 的独家知识：

## 4.1 全局仲裁优先级

```
硬约束层（不可协商）：
  时间互斥 > 容量上限

强烈建议层（可覆盖，有倾向）：
  截止紧迫 > 精力匹配 > 时间盒锁定 > OKR 关联 > 习惯保护

温和建议层（仅提示）：
  交替安排 / streak 保护 / 学习曲线
```

## 4.2 冲突仲裁详表

| # | 冲突对 | 仲裁策略 | 理由 |
|---|---|---|---|
| C-01 | 截止紧迫 vs 精力匹配 | 截止紧迫优先 | 紧急任务不容延误，精力匹配是优化而非底线 |
| C-02 | OKR 关联 vs 时间盒锁定 | 时间盒锁定优先 | 已承诺 > 待规划，稳定性 > 最优化 |
| C-03 | 习惯时间保护 vs OKR 任务 | OKR 任务优先，但提示习惯冲突 | 目标驱动日常，习惯可微调时间 |
| C-04 | 精力匹配 vs 习惯固定时间 | 习惯保持原时间 | 习惯的固定性比精力匹配更重要（习惯回路需要线索一致性） |
| C-05 | WIP 上限 vs 紧急新任务 | 新任务允许加入，但触发取舍对话 | 不硬性阻止，但让用户意识到取舍 |
| C-06 | 深度工作块 vs 习惯打断 | 深度工作块优先 | 深度工作状态中断代价极高，习惯可推迟到块结束 |
| C-07 | streak 保护 vs 合理暂停 | 用户可暂停，但需确认 | 不因 streak 绑架用户，但让暂停成为有意识的决定 |
| C-08 | 多个 OKR 争抢同一高峰时段 | 高优先级 OKR 关联任务优先 | 资源有限时，聚焦而非均分 |

## 4.3 仲裁原则的指导规则

- **稳定性 > 最优化**：已承诺的计划（时间盒锁定）优先于理论上更优的安排
- **底线 > 锦上添花**：截止日期是底线，精力匹配是锦上添花
- **有意识 > 无意识**：宁可让用户做有意识的取舍决定，也不替用户做静默优化
- **可恢复 > 不可恢复**：streak 可重建，深度工作状态不可恢复（一旦中断）

---

# 五、校准参数体系

（沿用 `LW_methodology_方法论落地设计规范_2026_03_18.md` 的设计，此处做索引）

## 5.1 参数清单

| 参数 | 默认值 | 硬边界 | 校准信号 | 来源方法论 |
|---|---|---|---|---|
| peakEnergyStart | 9 | - | 规则 override > 70% | 精力管理 |
| peakEnergyEnd | 12 | - | 规则 override > 70% | 精力管理 |
| comfortableWipLimit | 5 | [1, 12] | 连续4周完成率 < 60% | GTD / OKR 聚焦 |
| sustainableDeepWorkHours | 4 | [1, 8] | 深度任务实际 vs 估算偏差 | 深度工作 |
| habitRiskDays | [] | - | 8周数据后各天完成率差异 > 40% | 习惯养成 |

## 5.2 校准提案触发阈值

| 信号类型 | 阈值 | 观察窗口 |
|---|---|---|
| rule_override_rate | 70% | 30天 |
| rule_min_trigger_count | 10次 | - |
| capacity_completion_low | 60% | 连续4周 |
| habit_fragile_diff | 40% 低于均值 | 8周 |

---

# 六、实施路径

| 阶段 | 行动 | 产出 |
|---|---|---|
| **现在** | 完成 4 个 Tier 1 场景提示词文件 | `methodology/prompts/` 下 4 个 .md 文件 |
| **MVP 开发** | Intent Engine 按场景注入对应提示词，验证效果 | AI 对话中有方法论支撑 |
| **MVP 迭代** | 完成 Tier 2 的 3 个场景提示词 | 覆盖关键教练时刻 |
| **Phase 2** | 从使用数据中提炼 5-10 条硬规则为 YAML | Layer 3 确定性规则 |
| **Phase 2** | 接入向量检索（RAG），覆盖长尾场景 | 更精准的场景匹配 |
| **长期** | 积累校准数据和冲突仲裁案例 | 数据护城河 |

---

# 七、示例：日计划生成完整提示词

> 此为示范文件，展示最终场景提示词的完整样貌。
> 其余 7 个场景待逐个讨论后编写。

## 文件：daily_planning.md

```markdown
# 日计划生成 — daily_planning

## 元信息
- 触发时机：每日首次打开 App，或用户主动触发"规划今天"
- 涉及 Domain：Tasks, TimeBox, Habits, OKRs
- 注入位置：Intent Engine（AI 生成日计划提案，用户确认或调整）
- 依赖数据：ContextSnapshot, DerivedSignals, UserCalibration

## 方法论原则

### P0 — 硬约束
- 时间盒互斥：同一时段不可安排多个时间盒
  - 字段：timebox.startTime ~ timebox.endTime 区间不可重叠
- 精力总容量不可超：已安排高精力任务总时长 ≤ sustainableDeepWorkHours
  - 字段：task.energyRequired == 'high' 的任务汇总时长 vs userCalibration.sustainableDeepWorkHours

### P1 — 强烈建议
- 精力匹配（来源：精力管理）
  - 触发：task.energyRequired == 'high' 且安排时间不在 peakEnergyStart~peakEnergyEnd
  - 动作：suggest_reschedule，建议调整到高峰时段
  - 用户可覆盖：是
- 时间盒承诺优先（来源：时间盒方法论）
  - 触发：task 已关联 timebox 且 timebox.status == 'planned'/'running'
  - 动作：这类任务权重 +0.5，优先排入
  - 用户可覆盖：是，但需确认
- OKR 关联任务优先（来源：OKR 聚焦原则）
  - 触发：task.keyResultId 非空
  - 动作：这类任务优先排入高峰时段
  - 用户可覆盖：是
- 习惯时间保护（来源：习惯养成）
  - 触发：habit.scheduledTime 对应时段被任务占用
  - 动作：warning，提醒习惯执行时间冲突
  - 用户可覆盖：是

### P2 — 温和建议
- 交替安排（来源：精力管理 — 精力恢复间隙）
  - 触发：连续两个以上高精力任务紧邻
  - 动作：建议插入低精力任务或休息间隙
- 截止紧迫度提升（来源：GTD 时间感知）
  - 触发：task.dueDate 距今 ≤ 3天
  - 动作：权重提升，建议优先安排

## 原则冲突仲裁

| 冲突对 | 仲裁策略 | 理由 |
|---|---|---|
| 精力匹配 vs 截止紧迫 | 截止紧迫优先 | 紧急任务不容延误，精力匹配是锦上添花 |
| OKR 关联 vs 时间盒锁定 | 时间盒锁定优先 | 已承诺 > 待规划，稳定性 > 最优化 |
| 习惯时间保护 vs OKR 任务 | OKR 任务优先，但提示习惯冲突 | 目标驱动日常，习惯可微调时间 |
| 精力匹配 vs 习惯固定时间 | 习惯保持原时间 | 习惯的固定性比精力匹配更重要 |

## USOM 数据注入

运行时注入以下数据（AI 直接引用，不请求额外查询）：

### ContextSnapshot 字段
- currentDate, dayOfWeek, timeOfDay
- activeTasks: [{ id, title, status, priority, energyRequired, dueDate, keyResultId, timeboxId }]
- pendingHabits: [{ id, title, scheduledTime, streak, todayLogged }]
- currentTimebox / upcomingTimeboxes: [{ id, title, startTime, endTime, taskIds, habitIds }]
- activeObjectives: [{ id, title, status, period }]
- activeKeyResults: [{ id, title, progressRate, status, dueDate }]
- energyState: { currentLevel, trend }

### DerivedSignals 字段
- activeTaskCount
- avgCompletionRate7d / avgCompletionRate30d
- habitStreaks: { [habitId]: number }
- timeboxAdherence7d
- isOvercommitted
- energyPattern: { peakHours, lowHours, confidence }

### UserCalibration 字段
- peakEnergyStart / peakEnergyEnd
- comfortableWipLimit
- sustainableDeepWorkHours
- chronotype
- habitRiskDays

## 教练行为规范

### 语调
- 呈现计划时先给结论："今天建议重点做 X 和 Y"
- 不列举所有可能方案让用户选，而是给最优解 + 允许调整
- 用具体时间而非模糊建议（"9:00-10:30 做 X" 而非 "上午做 X"）
- 如果数据不足（新用户），明确说"我先按通用建议安排，使用一段时间后会更精准"

### 禁止
- 不说"你应该"、"建议你考虑"等模糊表述
- 不生成超过 8 个时间段（认知负荷控制）
- 不在日计划中引发内疚（"昨天没完成的"→"这些待处理"）
- 不重复用户已知道的信息

### 输出约束
- 产出为结构化的日计划提案，格式：
  ```
  {
    date: DateOnly,
    blocks: [
      { startTime: "09:00", endTime: "10:30", type: "task",
        ref: USOM_ID, reason: "精力高峰+OKR关联" },
      { startTime: "10:30", endTime: "11:00", type: "break",
        reason: "精力恢复间隙" },
      ...
    ],
    unresolved: [{ taskId, reason: "容量不足，需要取舍" }],
    warnings: ["习惯「冥想」10:00 与任务时间冲突"]
  }
  ```
- 如果有 unresolved 任务，附上取舍建议

## 校准参数引用

| 参数 | 默认值 | 校准信号 |
|---|---|---|
| peakEnergyStart | 9 | 规则 override_rate > 70% 在 Review 中提案调整 |
| peakEnergyEnd | 12 | 同上 |
| comfortableWipLimit | 5 | 连续4周完成率 < 60% 提案调整 |
| sustainableDeepWorkHours | 4 | 深度任务实际完成时长 vs 估算偏差 |
| habitRiskDays | [] | 8周数据后检测各天完成率差异 |
```

---

# 八、版本记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-04-06 | v0.1 | 初始版本，确定场景提示词方案方向和第一批场景清单 |
