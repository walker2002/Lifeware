# Lifeware 方法论落地设计规范 2026_03_18

---

**本文档说明**

本文档定义 Lifeware 中个人成长方法论的**提取、固化、校准**全流程设计规范，是「算法偏好」护城河的工程实现指南。

适用场景：
- 阅读一本有用的书或整理读书笔记后，将方法论知识结构化为系统可用的规则
- 为新增 Domain 设计其对应的方法论约束
- 迭代优化已有规则的个人校准参数

关联文档：
- `LW_overall_总体设计_2026_03_18.md`（架构约束，本文档在其框架内设计）
- `LW_overall_技术栈设计演进_2026_03_18.md`（实现阶段对应关系）

---

# 一、核心设计原则

## 1.1 两个阶段，性质不同

方法论落地严格分为两个阶段，两者绝对不能混用：

| 阶段 | 名称 | 执行者 | 产物 | 时机 |
|---|---|---|---|---|
| 设计时 | 方法论提取与固化 | 开发者 + AI 工具 | 静态配置文件，提交 git | 开发阶段，或方法论迭代时 |
| 运行时 | 规则执行与个人校准 | Nexus 自动执行 | 校准参数写回 DB | 用户日常使用中 |

**核心约束**：运行时 Nexus 只执行已固化的规则，不解释方法论原文。AI 在运行时参与的是「对话引导」（Intent Engine），不是「规则判断」（Rule Engine）。

## 1.2 两层规则，演化策略不同

```
第一层：方法论规则（methodology/rules/）
  ├── 来源：书籍 / 方法论 / 人工提炼
  ├── 性质：原则级，跨用户通用
  ├── 演化：人工维护，走 git 发布流程
  └── 示例："认知密集任务应在精力高峰时段执行"

第二层：个人校准参数（user_calibration，存 DB，用户级）
  ├── 来源：用户实际执行数据 + Review 周期确认
  ├── 性质：参数级，每个用户独立
  ├── 演化：Memory Framework 检测偏差 → Review 提案 → 用户确认
  └── 示例：你的精力高峰实际上是 10:00-12:00，而非默认的 09:00-12:00
```

**禁止**：不能让第一层规则随执行数据自动变化。执行失败不代表方法论原则错误，只代表个人参数需要校准。

## 1.3 方法论的「性格」定位

方法论不以功能形式呈现给用户，而是渗透在三个位置：

```
Rule Engine      ← 校验时：什么不能做 / 需要确认才能做
Action Surface   ← 排序时：什么更值得现在做
Intent Engine    ← 对话时：特定场景下如何引导用户决策
```

用户感知不到"OKR方法论"，但能感受到系统总是在帮他把时间用在最重要的事上。

---

# 二、设计时流水线（Design-time Pipeline）

## 2.1 总体流程

```
输入：书籍 / 读书笔记 / 方法论摘要
    ↓
Step 1：AI 辅助提取 MethodologySchema（结构化原则）
    ↓
Step 2：人工审核 MethodologySchema（关键步骤，不可跳过）
    ↓
Step 3：将 MethodologySchema 转化为三类产物
    ├── 规则文件（methodology/rules/*.yaml）→ Rule Engine 加载
    ├── 权重配置（methodology/weights/*.ts）→ Action Surface Engine 加载
    └── 场景提示库（methodology/prompts/*.ts）→ Intent Engine 加载
    ↓
Step 4：提交 git，进入发布流程
```

## 2.2 Step 1：AI 辅助提取 MethodologySchema

**输入 Prompt 模板**：

将以下内容复制给 AI，替换 `{{书名}}` 和 `{{笔记内容}}`：

```
你是一个个人成长方法论的结构化专家。
我将给你一本书的读书笔记，请帮我提取其中可以固化为系统规则的核心原则。

书名：{{书名}}
笔记内容：
{{笔记内容}}

请按以下 MethodologySchema 格式输出，每条原则单独一个对象：

{
  "source": "书名",
  "principle_id": "snake_case唯一标识",
  "principle_name": "原则的简短中文名",
  "principle_statement": "一句话陈述这个原则",
  "rationale": "为什么这个原则有效（来自书中论据）",
  "applicable_domains": ["Tasks", "Habits", "TimeBox", "OKRs", "Review"],  // 适用的 Domain
  "operationalization": {
    "rule_candidates": [
      // 可以转化为 Rule Engine 规则的场景
      {
        "scenario": "描述触发场景",
        "condition_hint": "条件的自然语言描述",
        "action_hint": "建议的处理方式：warn / confirm / block",
        "severity": "warning | confirm"  // block 需要特别论证
      }
    ],
    "weight_candidates": [
      // 可以影响 Action Surface 排序的因素
      {
        "factor": "影响因素名称",
        "direction": "加分 | 减分",
        "magnitude": "low | medium | high",
        "rationale": "为何影响排序权重"
      }
    ],
    "scenario_prompt_candidates": [
      // 需要 AI 对话介入的关键场景
      {
        "trigger_scenario": "场景描述",
        "coaching_goal": "对话目标",
        "methodology_approach": "使用的方法论策略"
      }
    ]
  },
  "calibration_parameters": [
    // 这条原则中，哪些参数因人而异，需要个人校准
    {
      "param_name": "参数名",
      "default_value": "默认值",
      "unit": "单位",
      "calibration_signal": "通过什么执行数据来校准这个参数"
    }
  ],
  "anti_patterns": [
    // 这条原则常见的误用或边界情况
  ]
}

注意：
- 只提取可以操作化的原则，不提取纯理念性内容
- 每条原则尽量原子化，一个原则一个核心主张
- rule_candidates 的 severity 不能随意用 block，confirm 是上限
```

## 2.3 Step 2：人工审核 MethodologySchema

收到 AI 输出后，必须逐条审核以下问题，不合格项退回重新提取：

**审核清单**：

```
□ principle_statement 是否足够具体，还是过于抽象？
  （"保持专注"太抽象，"认知密集任务应安排在精力高峰时段"足够具体）

□ rule_candidates 的 condition_hint 是否可以用现有 USOM 字段表达？
  （如果需要系统没有的数据，标注为"需要新增字段"，不要强行转化）

□ severity 是否合理？
  （大多数规则应该是 warning，confirm 要慎重，block 需要特别论证）

□ calibration_parameters 的 default_value 是否有方法论依据？
  （不能随意设定默认值，必须来自方法论原文或普遍研究结论）

□ anti_patterns 是否考虑了用户可能的合理例外？
  （规则不应该阻断用户的合理决策，只提示和确认）
```

## 2.4 Step 3a：规则文件（Rule Engine）

**文件位置**：`methodology/rules/{domain}/{principle_id}.yaml`

**完整模板**：

```yaml
# ============================================================
# 规则文件模板
# 来源文档：MethodologySchema.principle_id
# 最后更新：YYYY-MM-DD
# ============================================================

rule_meta:
  id: "protect_peak_energy_for_deep_work"          # 全局唯一
  name: "保护高峰精力用于深度工作"
  source_principle: "energy_task_matching"           # 对应 MethodologySchema.principle_id
  source_book: "《精力管理》- 吉姆·洛尔"
  applicable_domains: ["Tasks", "TimeBox"]
  version: "1.0.0"
  created_at: "2026-03-18"

# ── 触发条件（使用 USOM 字段，禁止 raw 查询）──────────────────
condition:
  all_of:
    - field: "intent.task.cognitive_load"
      operator: "eq"
      value: "HIGH"
    - field: "user_calibration.peak_energy_window"
      operator: "not_contains"
      value: "{{intent.timebox.scheduled_hour}}"   # 运行时注入，与校准参数对比

# ── 触发后的处理 ────────────────────────────────────────────────
action:
  type: "suggest_reschedule"          # warn | confirm | suggest_reschedule
  severity: "warning"                 # warning（可忽略）| confirm（需确认）
  message_template: >
    根据你的精力节律（高峰时段 {{peak_start}}-{{peak_end}}），
    认知密集任务「{{task.name}}」建议安排在高峰时段。
    当前安排在 {{scheduled_time}}，确定继续吗？
  suggested_alternatives:
    - action: "reschedule_to_peak"
      label: "调整到明天上午"
    - action: "proceed_anyway"
      label: "忽略建议，继续安排"

# ── 个人校准参数引用 ────────────────────────────────────────────
calibration_refs:
  - param: "user_calibration.peak_energy_window"
    default: { start: 9, end: 12 }    # 默认值，首次使用前生效
    unit: "hour"

# ── 规则健康度追踪（Memory Framework 读取）────────────────────
tracking:
  track_override_rate: true           # 是否追踪覆盖率
  calibration_threshold: 0.70         # 覆盖率超过此值触发校准提案
  min_trigger_count: 10               # 触发次数不足时不计入校准判断
  observation_window_days: 30

# ── 边界情况说明 ────────────────────────────────────────────────
notes: >
  此规则对 cognitive_load == "LOW" 的任务不触发。
  用户可以通过调整 task.cognitive_load 字段来标记任务类型。
  如用户连续覆盖超过阈值，Review 周期会提案调整高峰时段参数。
```

## 2.5 Step 3b：权重配置（Action Surface Engine）

**文件位置**：`methodology/weights/{domain}_weights.ts`

**完整模板**：

```typescript
// ============================================================
// Action Surface 权重配置
// 文件：methodology/weights/task_weights.ts
// 来源原则：energy_task_matching, okr_cascade, deadline_awareness
// ============================================================

import type { ActionCandidate, UserCalibration, DerivedSignals } from '@/types/usom'

export function computeTaskWeight(
  candidate: ActionCandidate,
  calibration: UserCalibration,
  signals: DerivedSignals,
  now: Date
): number {
  let weight = candidate.base_weight  // Domain 返回的基础权重

  // ── OKR 关联加成（来源：OKR 方法论，关键结果驱动日常优先级）
  if (candidate.task.okr_key_result_id) {
    weight += 0.40
  }

  // ── 精力匹配加成（来源：精力管理方法论）
  const currentHour = now.getHours()
  const inPeakWindow =
    currentHour >= calibration.peak_energy_window.start &&
    currentHour < calibration.peak_energy_window.end
  if (inPeakWindow && candidate.task.cognitive_load === 'HIGH') {
    weight += 0.30
  }

  // ── 时间盒锁定加成（来源：时间盒方法论，已规划 = 已承诺）
  if (candidate.task.scheduled_timebox_today) {
    weight += 0.50
  }

  // ── 截止日期紧迫度（来源：GTD，截止驱动）
  if (candidate.task.due_date) {
    const daysLeft = Math.ceil(
      (candidate.task.due_date.getTime() - now.getTime()) / 86400000
    )
    if (daysLeft <= 1) weight += 0.60
    else if (daysLeft <= 3) weight += 0.30
    else if (daysLeft <= 7) weight += 0.10
  }

  // ── 习惯连续性加成（来源：习惯养成方法论，streak 保护）
  if (candidate.type === 'habit') {
    const streak = signals.habit_streaks[candidate.habit_id] ?? 0
    weight += Math.min(streak * 0.05, 0.25)  // 上限 0.25，防止 streak 垄断切面
  }

  // ── 过度承诺惩罚（来源：精力管理，WIP 保护）
  if (signals.active_task_count > calibration.comfortable_wip_limit) {
    weight -= 0.20  // 超限时整体压低新增任务权重
  }

  return Math.max(0, Math.min(weight, 2.0))  // 硬边界：[0, 2.0]
}

// ── 权重硬边界（方法论兜底，防止参数漂移）──────────────────────
export const WeightBounds = {
  okr_linked_bonus: { min: 0.30, max: 0.50 },
  energy_match_bonus: { min: 0.20, max: 0.40 },
  scheduled_today_bonus: { min: 0.40, max: 0.60 },
  habit_streak_max: 0.25,                        // streak 加成硬上限
  total_weight_cap: 2.0,
} as const
```

## 2.6 Step 3c：场景提示库（Intent Engine）

**文件位置**：`methodology/prompts/scenario_prompts.ts`

**完整模板**：

```typescript
// ============================================================
// 场景对话提示库
// 文件：methodology/prompts/scenario_prompts.ts
// 设计原则：触发是确定性的，对话是 AI 生成的，输出是 StructuredIntent
// ============================================================

import type { ScenarioPrompt } from '@/types/nexus'

export const ScenarioPrompts: Record<string, ScenarioPrompt> = {

  // ── 场景：习惯 streak 中断 ────────────────────────────────────
  habit_streak_broken: {
    // 触发条件（确定性，Rule Engine 识别后通知 Intent Engine）
    trigger: {
      event: "HabitStreakBroken",
      condition: "streak_before >= 7"  // 只有连续7天以上的 streak 中断才触发
    },

    // 系统提示词（告诉 AI 如何引导这次对话）
    system_prompt: `
你是一个个人成长教练，正在帮助用户处理习惯中断。

方法论依据：习惯养成中，中断后的"重启对话"至关重要。
目标：帮助用户重建动力，而不是引发内疚或空洞鼓励。

对话策略（按顺序）：
1. 先认可已有进展（streak 天数是真实成就）
2. 探索中断原因（是外部事件、内部阻力还是设计问题）
3. 共同制定重启方案（具体的：什么时间、哪一天开始）

禁止：
- 不说"没关系"、"加油"、"下次努力"之类空洞话语
- 不评判用户，不追问原因超过一次
- 不提供超过3个选项，认知负荷要低

数据上下文（已注入，直接引用）：
- 习惯名称：{{habit.name}}
- 中断前 streak：{{streak_before}} 天
- 中断日期：{{broken_date}}
- 该习惯的历史完成率：{{habit.completion_rate_30d}}%
    `,

    // 对话开场（固定，不由 AI 自由发挥）
    opening_message: >
      你的「{{habit.name}}」连续打卡 {{streak_before}} 天后中断了。
      这 {{streak_before}} 天是真实的积累。发生什么了？

    // 对话产出的结构化类型（必须，后续进入 Nexus 链路）
    expected_output_schema: "HabitRestartIntent"
    output_fields_required:
      - restart_date      # 具体重启日期
      - adjustment_notes  # 可选：是否调整时间 / 频率
  },

  // ── 场景：检测到过度承诺 ─────────────────────────────────────
  overcommitment_detected: {
    trigger: {
      event: "IntentCreated",
      condition: >
        intent.type == "CREATE_TASK" &&
        signals.active_task_count >= user_calibration.comfortable_wip_limit
    },

    system_prompt: `
你是一个帮助用户做取舍的教练，而不是拒绝者。

方法论依据：GTD 的 capture + clarify，OKR 的聚焦原则。
目标：帮助用户判断新任务与现有任务的优先级关系。

对话策略：
1. 呈现当前任务负载（数量 + 最重要的几项）
2. 引导用户判断新任务的紧迫性和重要性
3. 如果新任务重要，引导决定哪项现有任务可以延期或删除

数据上下文：
- 当前进行中任务数：{{signals.active_task_count}}
- 用户舒适上限：{{calibration.comfortable_wip_limit}}
- 当前最高优先级任务：{{top_3_tasks}}
- 新任务名称：{{intent.task.name}}
    `,

    opening_message: >
      你当前有 {{signals.active_task_count}} 个进行中的任务，
      已到你的舒适上限（{{calibration.comfortable_wip_limit}} 个）。
      「{{intent.task.name}}」需要现在加入吗，
      还是先完成一项再说？

    expected_output_schema: "TaskPriorityDecisionIntent"
    output_fields_required:
      - decision          # "add_now" | "defer_new" | "replace_existing"
      - replaced_task_id  # 如果 decision == "replace_existing"
  },

  // ── 场景：周复盘触发 ─────────────────────────────────────────
  weekly_review_due: {
    trigger: {
      event: "ReviewCycleDue",
      condition: "review_type == 'weekly'"
    },

    system_prompt: `
你是一个帮助用户完成周复盘的教练。

方法论依据：OKR 季度节奏中的周检视，复盘闭环触发机制。
目标：用最少的用户输入完成高质量复盘，帮助用户看到模式。

复盘结构（严格按此顺序）：
1. 本周完成了什么（基于系统数据，不要用户重复输入）
2. 什么没完成，为什么（引导用户分析，而不是列罪状）
3. 发现了什么规律或模式
4. 下周最重要的 1-3 件事

数据上下文（系统自动注入，直接在回复中引用）：
- 本周已完成任务：{{completed_tasks_this_week}}
- 本周习惯完成率：{{habit_completion_rate_this_week}}%
- 本周时间盒利用率：{{timebox_utilization_this_week}}%
- 未完成任务：{{incomplete_tasks}}
    `,

    # 复盘对话数据预填充（系统自动注入，减少用户输入）
    prefill_from_data:
      - "completed_tasks_this_week"
      - "habit_completion_rate_this_week"
      - "timebox_utilization_this_week"
      - "incomplete_tasks"

    opening_message: >
      本周复盘时间到了。我先把数据整理好再问你几个问题。

    expected_output_schema: "ReviewCreatedIntent"
    output_fields_required:
      - summary_text
      - key_learnings
      - next_week_priorities   # 1-3 项
  },
}
```

---

# 三、运行时架构（Runtime Architecture）

## 3.1 Rule Engine 的合并逻辑

Rule Engine 在运行时将两层合并成最终校验逻辑：

```
规则执行 = 方法论规则（原则）× 个人校准参数（刻度）

示例：
  原则：认知密集任务 → 精力高峰时段
  默认参数：peak_energy_window = { start: 9, end: 12 }
  用户校准后：peak_energy_window = { start: 10, end: 12 }
  ↓
  实际校验：task.cognitive_load == HIGH && scheduled_hour NOT IN [10, 11]
```

Rule Engine 触发结果只有三种，不允许扩展：

| 结果类型 | 含义 | 用户体验 | 场景适用 |
|---|---|---|---|
| `pass` | 规则通过，继续执行 | 无感知 | 大多数情况 |
| `warning` | 建议调整，用户可忽略 | 弹出提示，可一键忽略 | 精力匹配、WIP 建议 |
| `confirm` | 需要明确确认才能继续 | 需要用户主动点击确认 | 时间冲突、承诺超限 |

**禁止**：Rule Engine 不能 block 用户操作。Lifeware 的角色是教练，不是门卫。

## 3.2 用户校准参数（UserCalibration）

存储在 DB，用户级完全独立，初始值全部来自方法论默认值：

```typescript
interface UserCalibration {
  user_id: string

  // ── 精力参数（从时间盒执行时段与完成质量中学习）────────────
  peak_energy_window: {
    start: number        // 默认：9（来自精力管理研究普遍结论）
    end: number          // 默认：12
    confidence: number   // 0-1，数据量越多置信度越高，初始 0
  }

  // ── 执行容量参数（从任务完成率中学习）──────────────────────
  comfortable_wip_limit: number             // 默认：5（GTD 经验值）
  sustainable_deep_work_hours: number       // 默认：4（单位：小时/天）

  // ── 习惯执行参数（从 streak 断裂模式中学习）──────────────────
  habit_risk_days: number[]                 // 默认：[]，学习后填入风险高的周几
  habit_preferred_time_slots: string[]      // 默认：[]

  // ── 规则覆盖历史（用于触发校准提案）──────────────────────────
  rule_override_history: {
    [rule_id: string]: {
      trigger_count: number
      override_count: number
      last_triggered_at: Date
      calibration_proposal_sent: boolean
    }
  }

  updated_at: Date
}

// ── 校准参数硬边界（方法论兜底，不允许漂移到失效区间）──────────
const CalibrationBounds = {
  comfortable_wip_limit:          { min: 1,  max: 12  },  // OKR 聚焦原则不支持 >12
  sustainable_deep_work_hours:    { min: 1,  max: 8   },
  peak_energy_window_duration:    { min: 60, max: 240 },   // 单位：分钟
} as const
```

## 3.3 CalibrationSignal 检测逻辑

Memory Framework 在 L2-L3 层持续监控以下偏差模式，生成 `CalibrationSignal`：

```typescript
type CalibrationSignal =
  | {
      type: 'rule_override_pattern'
      rule_id: string
      override_rate: number              // 最近 observation_window_days 内的覆盖率
      trigger_count: number
      interpretation: string             // AI 生成的可读解释，在 Review 中展示
      proposal: CalibrationProposal
    }
  | {
      type: 'capacity_mismatch'
      avg_completion_rate: number        // 近4周平均完成率
      avg_active_task_count: number
      proposal: CalibrationProposal
    }
  | {
      type: 'habit_fragile_pattern'
      fragile_days: number[]             // 周几（0-6）
      completion_rate_by_day: Record<number, number>
      proposal: CalibrationProposal
    }

// 触发阈值（硬编码，不由 AI 决定）
const CalibrationTriggerThresholds = {
  rule_override_rate:      0.70,   // 70% 以上的覆盖率触发提案
  rule_min_trigger_count:  10,     // 触发次数不足时不计入
  rule_observation_days:   30,
  capacity_completion_low: 0.60,   // 连续4周完成率低于60%
  capacity_observation_weeks: 4,
  habit_fragile_diff:      0.40,   // 某天完成率低于均值40%以上
  habit_observation_weeks: 8,      // 至少8周数据才触发
}
```

## 3.4 Review 周期校准提案交互

校准提案只在 Review 周期出现，不主动打断用户。呈现格式：

```
── 系统发现一个规律，想和你确认 ───────────────────────

过去30天，「保护高峰精力用于深度工作」规则触发了 23 次
你选择「忽略建议」了 18 次（覆盖率 78%）

这可能意味着：
  A. 你的精力高峰实际上不在 09:00-12:00（规则参数需要调整）
  B. 你知道建议但有其他考量（规则没问题，你在做例外）

如果是 A，你的高峰时段大约是几点到几点？
  [09:00-11:00]  [10:00-12:00]  [14:00-16:00]  [自定义...]

[ 调整参数 ]   [ 这是例外，规则没问题 ]   [ 跳过 ]
```

用户操作后的处理：

| 操作 | 系统行为 |
|---|---|
| 确认调整参数 | 写入 `user_calibration`，Rule Engine 下次执行时生效 |
| 这是例外 | `override_history` 计数重置，规则不变，记录偏好 |
| 跳过 | 信号保留，下个 Review 周期再次出现 |

---

# 四、方法论文件目录结构

```
methodology/
├── schemas/                          # Step 1-2 的中间产物，人工维护
│   ├── 精力管理_schema.json
│   ├── GTD_schema.json
│   └── OKR方法论_schema.json
│
├── rules/                            # Rule Engine 加载，一个文件一条规则
│   ├── tasks/
│   │   ├── protect_peak_energy.yaml
│   │   ├── prevent_overcommitment.yaml
│   │   └── okr_task_linkage.yaml
│   ├── habits/
│   │   ├── streak_protection.yaml
│   │   └── habit_energy_alignment.yaml
│   ├── timebox/
│   │   └── deep_work_block_minimum.yaml
│   └── review/
│       └── weekly_cycle_enforcement.yaml
│
├── weights/                          # Action Surface Engine 加载
│   ├── task_weights.ts
│   ├── habit_weights.ts
│   └── timebox_weights.ts
│
└── prompts/                          # Intent Engine 加载
    └── scenario_prompts.ts
```

---

# 五、已固化的方法论清单

当前已完成提取和固化的方法论（持续追加）：

| 方法论来源 | 核心原则数 | 规则文件数 | 状态 |
|---|---|---|---|
| 精力管理（吉姆·洛尔） | - | - | 待提取 |
| GTD（大卫·艾伦） | - | - | 待提取 |
| OKR（约翰·杜尔） | - | - | 待提取 |
| 习惯的力量（杜希格） | - | - | 待提取 |
| 深度工作（卡尔·纽波特） | - | - | 待提取 |

---

# 六、实施阶段规划

| 阶段 | 方法论落地工作内容 |
|---|---|
| 阶段一 MVP | 手工硬编码 3-5 条核心规则（不走 YAML 加载流程），验证机制有效性；开始收集规则触发和覆盖的原始数据 |
| 阶段二 | 实现 YAML 规则加载机制；完成第一批书籍的 MethodologySchema 提取；实现 UserCalibration 表和初始默认值写入 |
| 阶段三 | 实现 Memory Framework 的 CalibrationSignal 检测；在 Review Domain 中实现校准提案 UI |
| 阶段四 | 基于实际用户数据评估校准机制有效性；优化提案触发阈值 |

---

# 七、本文档的使用方式

每次读完一本有价值的书，执行以下流程：

1. 整理读书笔记（核心论点 + 关键方法 + 可操作建议）
2. 用 **2.2 节的 Prompt 模板** 提取 MethodologySchema
3. 按 **2.3 节审核清单** 逐条检查，退回修改直到通过
4. 按 **2.4-2.6 节的模板** 转化为三类产物
5. 提交 git，更新本文档第五章的方法论清单

> 方法论的价值，不在于读了多少书，而在于固化了多少条可以在每次决策中自动生效的规则。

---
