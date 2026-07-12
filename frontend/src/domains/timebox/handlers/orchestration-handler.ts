/**
 * @file orchestration-handler
 * @brief 智能时间盒编排 Handler
 *
 * Handler + Context Engine 双轨架构中的 Handler 组件
 * 接收 GenerationRequest（意图 + 组装好的上下文数据），产出 GenerationResult
 *
 * 约束：
 * - 不直接访问 Repository
 * - 不写入状态、不触发事件
 * - 纯函数式：input → output
 *
 * [023.08] T3 fold: detectConflicts 现支持可选 rule-engine 集成（架构升级）。
 *   - 构造接受可选 deps { ruleEngine, timeboxRepo, userId }
 *   - 传 ruleEngine → 调 createRuleEngine().evaluate(intent, snapshot)
 *   - 不传 → 走 [023.07] 谓词 fallback（向后兼容）
 *   - rule-engine 抛错 → 走 fallback（不阻塞业务）
 *
 * [023.10] T4 A2 fold: snapshot builder 派生自 proposal.date + deriveDayOfWeek/TimeOfDay，
 *   废除当前硬编码 currentDate='2026-07-05' / dayOfWeek=0 / timeOfDay='morning'。
 *   resolveDate 复用 [023.08] T1 ship 版（line 545），本任务未新增同名方法。
 *
 * [028] T6 fold: onGenerate 接 NL（fold-in T5/T6-fix：不在 handle）
 *   - onGenerate 持有 aiRuntime，调 parseNL（[028] T5 纯函数）→ 注入 contexts.nlResult
 *   - 低置信（<0.6）或 Tier0 冲突 → 短路返 needConfirm（ArchetypePicker 候选 + 建议手动改约定）
 *   - handle() 仍无 aiRuntime（纯编排 IRON RULE：T6-fix 回归保护）
 *   - buildTimeboxItems 消费 nlResult.newEvents → sourceType='nl_event' items；
 *     timeExpressions 标 fixedTime 标记（供 T3 sortByHardRules 层 1 截止紧迫）
 *
 * [028] T6-UI-fix fold: Tier0 约定改时 handoff 评估 → defer（CNUI 架构不支持跨 surface 跳转）。
 *   - needConfirm 文案「建议手动改约定」返回，不跳 editAppointment surface。
 */

import type {
  DomainHandler,
  GenerationRequest,
  GenerationResult,
  GeneratedProposal,
  ProposalSet,
  Warning,
  PresentationPayload,
  ContextSnapshot,
} from '@/usom/types/process'
import type { StructuredIntent } from '@/usom/types/objects'
import type { TaskSummary, HabitSummary, TimeboxSummary } from '@/usom/types/summaries'
import type { AIRuntime } from '@/nexus/ai-runtime'
import type { EnergyCurve } from '@/usom/types/primitives'
import type { ITimeboxRepository } from '@/usom/interfaces/irepository'
import type { USOM_ID } from '@/usom/types/primitives'
import { createRuleEngine, type RuleEngine } from '@/nexus/core/rule-engine'
import { DEFAULT_ENERGY_CURVE } from '@/nexus/context-engine/energy-state-manager'
import { sortByHardRules } from '../lib/schedule-rules'
import { scheduleByTiers } from '../lib/tier-scheduler'
import { parseNL, type NLCatalog, type NLParseResult, LOW_CONFIDENCE } from '../lib/nl-parser'
import { scoreSchedule, SCORE_WARN_THRESHOLD } from '../lib/schedule-score'
// [028] I-2 polish: SCHEDULE_PROPOSAL_ACTION 常量（防字符串漂移）
import { SCHEDULE_PROPOSAL_ACTION } from '../constants'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'
// [TZ-1] Step 1: 时区分量 helper（user_tz arithmetic，跨 Node/browser 一致）
import { getUserTzHour, getUserTzMinute } from '@/lib/tz'
import { hhmmToIso } from '../cnui/surfaces/time-input-helpers'

// ─── 从 contexts 提取的强类型材料 ──────────────────────────────

/**
 * 时间盒项
 */
interface TimeboxItem {
  /** ID */
  id: string
  /** 标题 */
  title: string
  /** 来源类型 */
  sourceType: GeneratedProposal['sourceType']
  /** 优先级 */
  priority: string
  /** 持续时间（分钟） */
  durationMinutes: number
  /** 所需能量 */
  energyRequired?: string
  /** 关联对象 ID */
  relatedObjectId: string
  // [028] T2 加（fold-in T2-fix 类型）：T4 Tier2 窗口调度依赖
  /** 最早可开始时间（UTC hour，0-24）；默认 0 */
  earliestStart?: number
  /** 最晚可开始时间（UTC hour，0-24）；默认 22 */
  latestStart?: number
  /** 最小可接受时长（分钟）；默认 = durationMinutes */
  minDuration?: number
  // [028] T6：NL newEvent 的口述时间（UTC hour, 0-23）；非 undefined → 标 fixedTime
  //  → T3 sortByHardRules 层 1「截止紧迫」权重最高（fixedTime 不可改期）
  fixedTimeHour?: number
}

/**
 * 时间槽
 */
interface TimeSlot {
  /** 开始小时 */
  startHour: number
  /** 开始分钟 */
  startMinute: number
  /** 结束小时 */
  endHour: number
  /** 结束分钟 */
  endMinute: number
}

// ─── 优先级排序权重 ──────────────────────────────────────────

/** 优先级权重映射 */
const PRIORITY_WEIGHT: Record<string, number> = {
  P0: 0,
  critical: 0,
  P1: 1,
  high: 1,
  P2: 2,
  medium: 2,
  P3: 3,
  low: 3,
}

/** 来源权重映射 */
const SOURCE_WEIGHT: Record<string, number> = {
  planned: 0,
  habit: 1,
  task: 2,
  adhoc: 3,
}

// ─── Handler 实现 ─────────────────────────────────────────────

/**
 * [023.08] T3: TimeboxOrchestrationHandler 可选 deps — 注入 rule-engine + repo + userId。
 *
 * - ruleEngine: 存在 → detectConflicts 走 rule-engine 评估（含 TimeOverlapRule）。
 *   缺省 → 走 [023.07] 谓词 fallback（向后兼容测试 + 老调用点）。
 * - timeboxRepo + userId: 配合 rule-engine 使用；无 ruleEngine 时无用。
 *
 * 注: deps 全 optional，构造签名兼容 `new TimeboxOrchestrationHandler()`。
 */
export interface TimeboxOrchestrationHandlerDeps {
  ruleEngine?: RuleEngine
  timeboxRepo?: ITimeboxRepository
  userId?: USOM_ID
  // [028] T3: archetype lookup map for sortByHardRules（schedule 策略用）。
  // 缺省 = {}（无 archetype 标签信息时视作「无标签」，sortByHardRules 鲁棒）。
  archetypeMap?: Record<string, ActivityArchetype>
}

export class TimeboxOrchestrationHandler implements DomainHandler {
  private readonly deps: TimeboxOrchestrationHandlerDeps

  constructor(deps: TimeboxOrchestrationHandlerDeps = {}) {
    this.deps = deps
  }

  async handle(request: GenerationRequest): Promise<GenerationResult> {
    const date = this.resolveDate(request)
    const materials = this.collectMaterials(request.contexts)
    // [028] T2-fold: A1/A2 隔离 — 读 request.intent.action 注入 strategy 贯穿
    // buildTimeboxItems / sortItems / generateProposals。
    //   'scheduleProposal' → strategy='schedule'（4 源 + Tier0 提取）
    //   其他（含 'adjustRemainingTimeboxes'）→ strategy='legacy'（旧 2 源 IRON RULE）
    const action = request.intent.action
    // [028] I-2 polish: 用 SCHEDULE_PROPOSAL_ACTION 常量防字符串漂移（[023.08] 8+ 处硬编码教训）
    const strategy: 'schedule' | 'legacy' = action === SCHEDULE_PROPOSAL_ACTION ? 'schedule' : 'legacy'
    const { items, tier0Slots } = this.buildTimeboxItems(materials, strategy)
    const sorted = this.sortItems(items, strategy)
    // [028] T2-fold: tier0Slots（来自 appointments）与 existingTimeboxes 合并为 occupied，
    // 防止 proposal 占到已约定的时段。
    const occupied = [...this.extractOccupiedSlots(materials.existingTimeboxes, materials.userTimezone), ...tier0Slots]
    // [023.07] #3 — 解构新 shape：generateProposals 现返回 { proposals, warnings }，
    // warnings 携带 SCHEDULER_BOUND_EXCEEDED（detection in deep loop），与 detectConflicts 并列追加。
    // 顺序：bound warnings 在前，conflict warnings 在后。
    const { proposals, warnings: boundWarnings } = this.generateProposals(sorted, occupied, materials.energyCurve, date, strategy)
    // [023.08] T3 [F3 fold]: detectConflicts 现 async（rule-engine.evaluate 是异步），
    // handle() 必须 await，否则 conflictWarnings 是 Promise<Warning[]> 与后续 spread 类型冲突。
    const conflictWarnings = await this.detectConflicts(proposals, materials.existingTimeboxes, materials.userTimezone)
    const presentation = this.renderMarkdown(proposals, date)

    // [028] T7: 5 维评分（fold-in T7-fix 数学定义 + 三态语义区分）。
    // - 必跑：scoreSchedule 是纯函数，对结果做 5 维评估；<6 分追加 warn（不 block）。
    // - 注意：onGenerate 路径会读 baseResult.proposalSet.proposals 拼 AI 文案，
    //   所以 proposals 必须保持原序（不在 handle 末尾改）。
    const scoreResult = this.evaluateScore(proposals, items, materials, conflictWarnings)

    const warnings: Warning[] = [...boundWarnings, ...conflictWarnings]
    if (scoreResult.score < SCORE_WARN_THRESHOLD) {
      warnings.push({
        code: 'LOW_SCHEDULE_SCORE',
        message: `今日编排评分 ${scoreResult.score.toFixed(1)}/10（维度: ${Object.entries(scoreResult.dimensions).map(([k, v]) => `${k}=${(v as number).toFixed(1)}`).join(', ')}），建议检查候选设置`,
        severity: 'warn',
      })
    }

    return {
      proposalSet: {
        id: crypto.randomUUID(),
        label: `${date} 智能编排方案`,
        proposals,
        tags: ['auto-schedule', 'smart'],
      },
      presentation,
      warnings,
      // [028.2] T2-fix: 暴露 5 维评分到 GenerationResult([028] ship 时漏注入 result)。
      // 不动 evaluateScore / scoreSchedule 算法本身,仅 result shape 完善。
      // cnui handlers.ts + AIOrchestratePanel 据此渲染 score 徽章 + 维度细目。
      score: scoreResult.score,
      dimensions: scoreResult.dimensions,
    }
  }

  async onGenerate(request: GenerationRequest, aiRuntime: AIRuntime): Promise<GenerationResult> {
    // [028] T6 fold-in T5/T6-fix：NL 解析在 onGenerate（handle 无 aiRuntime，IRON RULE）。
    //   1) 若 request.intent.fields.nlText 有值 → 先 parseNL（注入 aiRuntime）
    //   2) catalog 从 request.contexts 提取 tasks/templates/appointments id+title
    //   3) 低置信（< 0.6）或 Tier0 冲突（LLM 标 conflictsTier0=true）→ 短路返 needConfirm
    //   4) 否则注入 nlResult 到 request.contexts → handle() 消费
    //
    // [028] T6-UI-fix fold: Tier0 约定改时意图 → 「建议手动改约定」文案，不跨 surface 跳转
    //   （CNUI 架构不支持 needConfirm → editAppointment surface 直跳）
    const nlText = request.intent.fields.nlText
    if (typeof nlText === 'string' && nlText.trim()) {
      const catalog = this.buildCatalog(request.contexts)
      const nlResult = await parseNL(nlText, catalog, aiRuntime)

      // [T6] 低置信（< 0.6，含 LOW_CONFIDENCE=0.3 Tier0 撞 + FALLBACK_CONFIDENCE=0.2）
      // → 短路返 needConfirm（不调 handle）；供 [027-A] ArchetypePicker 复用 + 用户文案提示
      if (nlResult.confidence < 0.6) {
        return this.buildNeedConfirmResult(nlResult, request)
      }

      // 注入 NL 结果到 contexts（newEvents 作第 4 源 → buildTimeboxItems 消费；
      //   timeExpressions 标 fixedTime 标记 → T3 sortByHardRules 层 1 截止紧迫）
      request = {
        ...request,
        contexts: { ...request.contexts, nlResult },
      }
    }

    const baseResult = await this.handle(request)

    const response = await aiRuntime.generate({
      domainId: request.intent.targetDomain,
      action: request.intent.action,
      systemPrompt: '你是智能时间编排助手。根据已有的编排方案，优化时间分配建议。',
      messages: [
        { role: 'user', content: JSON.stringify(baseResult.proposalSet) },
      ],
      taskType: 'content_generation',
      temperature: 0.5,
    })

    if (response.content) {
      const aiContent = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content)

      return {
        ...baseResult,
        presentation: {
          type: 'markdown',
          content: (baseResult.presentation?.content ?? '') + '\n\n---\n### AI 优化建议\n' + aiContent,
        },
      }
    }

    return baseResult
  }

  // ─── [028] T6 helpers: NL catalog + needConfirm payload ─────────

  /**
   * [028] T6：从 request.contexts 提取 tasks/templates/appointments 的 id+title 目录，
   * 供 parseNL 的 LLM 参考 + deriveConfidence 校验（matched.id 必须在 catalog）。
   *
   * 形状对齐 nl-parser.ts:25 NLCatalog 接口；未知来源（缺字段）→ 空数组（不报错）。
   */
  private buildCatalog(contexts: Record<string, unknown>): NLCatalog {
    const tasks = (contexts.activeTasks ?? []) as Array<{ id?: unknown; title?: unknown }>
    const templates = (contexts.templates ?? []) as Array<{ id?: unknown; title?: unknown }>
    const appointments = (contexts.appointments ?? []) as Array<{ id?: unknown; title?: unknown }>

    const pick = (arr: Array<{ id?: unknown; title?: unknown }>): Array<{ id: string; title?: string }> => {
      const out: Array<{ id: string; title?: string }> = []
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue
        if (typeof item.id !== 'string') continue
        out.push({
          id: item.id,
          title: typeof item.title === 'string' ? item.title : undefined,
        })
      }
      return out
    }

    return {
      tasks: pick(tasks),
      templates: pick(templates),
      appointments: pick(appointments),
    }
  }

  /**
   * [028] T6：从 NL 解析结果推导 ArchetypePicker 候选（[027-A] 复用范式）。
   *
   * 规则：
   *   - 引用 appointment 且 conflictsTier0=true → 「约定改时」类候选（不改 archetype）
   *   - newEvent 标题含能量特征词 → AI 匹配返回 archetypeId
   *   - 兜底：从 appointments 中前 N 个作为「可挂载候选」
   *
   * 返回数组元素：{ id, title, source: 'inferred'|'appointment'|'fallback', reason }
   */
  private deriveArchetypeCandidates(nlResult: NLParseResult): Array<{
    id: string
    title: string
    source: 'inferred' | 'appointment' | 'fallback'
    reason: string
  }> {
    const candidates: Array<{
      id: string
      title: string
      source: 'inferred' | 'appointment' | 'fallback'
      reason: string
    }> = []

    // 规则 1：引用且撞 Tier0 → 提示「建议手动改约定」
    const tier0Conflict = [...nlResult.matchedTasks, ...nlResult.matchedTemplates, ...nlResult.matchedAppointments]
      .some(m => m.conflictsTier0 === true)
    if (tier0Conflict) {
      candidates.push({
        id: '__manual_appointment__',
        title: '手动改约定',
        source: 'fallback',
        reason: 'NL 涉及 Tier0 约定改时意图，现有 CNUI 架构不支持跨 surface 跳转，建议手动打开约定列表修改',
      })
    }

    // 规则 2：newEvents 标题含能量特征词 → AI 匹配候选占位（[023.11] runAiMatch 路径）
    for (const ev of nlResult.newEvents) {
      candidates.push({
        id: `__inferred_${ev.title}__`,
        title: ev.title,
        source: 'inferred',
        reason: 'NL 解析新事件，可由 ArchetypePicker AI 匹配活动原型',
      })
    }

    return candidates
  }

  /**
   * [028] T6：构造 needConfirm 短路返回结果（type-punned 到 GenerationResult 扩展字段）。
   *
   * 路径：
   *   - proposalSet 留空（不调 handle）
   *   - presentation 写「建议手动改约定」文案 + NL 置信度提示
   *   - needConfirm=true + archetypeCandidates + confirmReason 由 cnui/handlers submit 分支透传
   */
  private buildNeedConfirmResult(
    nlResult: NLParseResult,
    request: GenerationRequest,
  ): GenerationResult & { needConfirm?: boolean; archetypeCandidates?: unknown[]; confirmReason?: string } {
    const archetypeCandidates = this.deriveArchetypeCandidates(nlResult)
    const tier0Conflict = [...nlResult.matchedTasks, ...nlResult.matchedTemplates, ...nlResult.matchedAppointments]
      .some(m => m.conflictsTier0 === true)
    const reason = tier0Conflict
      ? `NL 涉及 Tier0 约定改时（置信度 ${nlResult.confidence.toFixed(2)}），建议手动改约定`
      : `NL 解析置信度低（${nlResult.confidence.toFixed(2)} < 0.6），请补充明确描述`

    const date = this.resolveDate(request)

    return {
      proposalSet: {
        id: crypto.randomUUID(),
        label: `${date} 智能编排方案`,
        proposals: [],
        tags: ['need-confirm', 'low-confidence'],
      },
      presentation: {
        type: 'markdown',
        content: [
          `# ${date} 智能编排方案`,
          '',
          `> ${reason}`,
          '',
          tier0Conflict
            ? '> 现有 CNUI 架构不支持跨 surface 跳转，建议您打开约定列表手动修改。'
            : '> 请补充更具体的描述（明确任务名 / 时间 / 对象）。',
        ].join('\n'),
      },
      warnings: [{
        code: 'NL_LOW_CONFIDENCE',
        message: reason,
        severity: 'confirm',
      }],
      needConfirm: true,
      archetypeCandidates,
      confirmReason: reason,
    } as unknown as GenerationResult & { needConfirm?: boolean; archetypeCandidates?: unknown[]; confirmReason?: string }
  }

  // ─── collectMaterials: 从通用 contexts 提取类型化数据 ──────

  private collectMaterials(contexts: Record<string, unknown>) {
    const pendingHabits = (contexts.pendingHabits ?? []) as HabitSummary[]
    const activeTasks = (contexts.activeTasks ?? []) as TaskSummary[]
    const existingTimeboxes = (contexts.existingTimeboxes ?? []) as TimeboxSummary[]
    const energyCurve = (contexts.energyCurve ?? DEFAULT_ENERGY_CURVE) as EnergyCurve
    // [028] T1-fold：appointments + templates 上下文由 [028] T1 provider 注入；
    // shape 详见 appointments-provider.ts:22-25 与 templates-provider.ts:21-31。
    // appointments 用 startTime + durationMin（[026] D2-A USOM SSOT 无 endTime）。
    // templates 用 HH:MM string 表示 earliestStart/latestStart（schema.ts:734-751）。
    const appointments = (contexts.appointments ?? []) as Array<{
      id: string
      title: string
      startTime: string
      durationMin: number
      status?: string
    }>
    const templates = (contexts.templates ?? []) as Array<{
      id: string
      title: string
      defaultStart: string
      defaultDuration: number
      earliestStart?: string | null
      latestStart?: string | null
      shortestDuration?: number | null
      activityArchetypeId?: string | null
      source?: string
    }>
    // [028] T6 fold：NL 解析结果由 onGenerate 注入（handle 内直接读 materials.nlResult）。
    //   - newEvents：第 4 源 → items（sourceType='nl_event'）
    //   - timeExpressions：标 fixedTime 标记（T3 sortByHardRules 层 1 截止紧迫）
    //   - 旧路径（无 nlText）→ undefined（不破坏现有 [023.08] handle 行为）
    const nlResult = contexts.nlResult as NLParseResult | undefined

    // [TZ-1] Step 1: user_tz 注入 — handler 内部 arithmetic 从"UTC canonical"
    //   （[023.09] 治本）切到 "user_tz canonical"。context-engine 透传
    //   userTimezone（来自 getEffectiveTimezone(userId)），缺省 'Asia/Shanghai'。
    //   extractOccupiedSlots / appointmentToTier0Slot / detectConflictsViaPredicate
    //   都用此 tz 分量，与 hhmmToIso 写路径对齐（双向 round-trip 一致）。
    const userTimezone = (contexts.userTimezone as string | undefined) ?? 'Asia/Shanghai'

    return {
      pendingHabits,
      activeTasks,
      existingTimeboxes,
      energyCurve,
      appointments,
      templates,
      nlResult,
      userTimezone,
    }
  }

  // ─── buildTimeboxItems: 将 4 个来源统一为 TimeboxItem ────
  //
  // [028] T2 fold：strategy 参数隔离 A1/A2。
  //   - 'schedule'（scheduleProposal）：4 源归集 + Tier0 提取
  //     sources: templates + habits + tasks → items；appointments → tier0Slots
  //   - 'legacy'（adjustRemainingTimeboxes）：IRON RULE——只吃 habits+tasks，
  //     不读 templates/appointments，tier0Slots=[]，行为完全等同 pre-T2 实现。
  //
  // 返回 shape：{ items: TimeboxItem[], tier0Slots: TimeSlot[] }
  //   - items 进 generateProposals（沿用现有线性贪心）
  //   - tier0Slots 与 existingTimeboxes 一起进 occupied（阻止 proposal 占时段）

  private buildTimeboxItems(
    materials: ReturnType<typeof this.collectMaterials>,
    strategy: 'schedule' | 'legacy' = 'legacy',
  ): { items: TimeboxItem[]; tier0Slots: TimeSlot[] } {
    const items: TimeboxItem[] = []
    const tier0Slots: TimeSlot[] = []

    // 来源 1: pendingHabits（schedule + legacy 都读，旧 2 源行为保留）
    for (const habit of materials.pendingHabits) {
      if (habit.todayLogged) continue

      items.push({
        id: crypto.randomUUID(),
        title: habit.title,
        sourceType: 'habit',
        priority: 'P1',
        durationMinutes: 30,
        energyRequired: 'low',
        relatedObjectId: habit.id,
        // [028] T2：defaults 兜底，Tier2 调度（[028] T4）会读这些字段
        earliestStart: 0,
        latestStart: 22,
        minDuration: 30,
      })
    }

    // 来源 2: activeTasks（schedule + legacy 都读，旧 2 源行为保留）
    for (const task of materials.activeTasks) {
      const dur = 60
      items.push({
        id: crypto.randomUUID(),
        title: task.title,
        sourceType: 'task',
        priority: this.normalizePriority(task.priority),
        durationMinutes: dur,
        energyRequired: task.energyRequired,
        relatedObjectId: task.id,
        // [028] T2：defaults 兜底，Tier2 调度（[028] T4）会读这些字段
        earliestStart: 0,
        latestStart: 22,
        minDuration: dur,
      })
    }

    // 来源 3 & 4 仅 schedule 策略走；legacy IRON RULE 完全跳过这两块。
    if (strategy === 'schedule') {
      // 来源 3: templates — [028] T1-fold 形状：HH:MM string → UTC hour number
      for (const tmpl of materials.templates) {
        const earliestStart = this.hhmmToHour(tmpl.earliestStart) ?? 0
        const latestStart = this.hhmmToHour(tmpl.latestStart) ?? 22
        const minDuration = tmpl.shortestDuration ?? tmpl.defaultDuration

        items.push({
          id: crypto.randomUUID(),
          title: tmpl.title,
          sourceType: 'planned',  // templates 映射到 'planned'（与 SOURCE_WEIGHT 兼容）
          priority: 'P2',         // templates 默认中优先级（用户日常规律）
          durationMinutes: tmpl.defaultDuration,
          energyRequired: 'medium',  // 模板未标能量时默认 medium
          relatedObjectId: tmpl.id,
          // [028] T2-fold: 从 HH:MM string 转 UTC hour number，null → default
          earliestStart,
          latestStart,
          minDuration,
        })
      }

      // 来源 4: appointments — 不进 items，转 tier0 硬占用
      // [026] D2-A USOM SSOT：appointments 无 endTime 字段，必须派生
      // endTime = startTime + durationMin。tier0Slots 与 existingTimeboxes 合并进 occupied。
      for (const appt of materials.appointments) {
        const slot = this.appointmentToTier0Slot(appt, materials.userTimezone)
        if (slot) tier0Slots.push(slot)
      }

      // 来源 5（[028] T6 fold）：NL newEvents → items（sourceType='nl_event'）。
      //   - time 字段（HH:MM）→ 转 UTC hour → 标 fixedTimeHour（T3 sortByHardRules 层 1 截止紧迫）
      //   - 无 time → 默认 60min slot + 不标 fixedTime（NL 解析未给时间时退化为灵活编排）
      //   - 注入的最早/最晚窗口以 fixedTimeHour 为中心 ±2h（容忍 ±30min 拖动余地）
      //   IRON RULE: legacy 策略完全跳过（adjustRemainingTimeboxes 不消费 NL；NL 仅 schedule 走）
      if (materials.nlResult) {
        for (const ev of materials.nlResult.newEvents) {
          const fixedHour = ev.time ? this.hhmmToHour(ev.time) : undefined
          const earliestStart = fixedHour !== undefined ? Math.max(0, fixedHour - 2) : 0
          const latestStart = fixedHour !== undefined ? Math.min(22, fixedHour + 2) : 22
          items.push({
            id: crypto.randomUUID(),
            title: ev.title,
            sourceType: 'nl_event',
            priority: 'P1',         // NL 解析的新事件 → 高优先级（用户当下关注）
            durationMinutes: 60,    // 默认 1h（与 activeTasks 60min 同）
            energyRequired: 'medium',
            relatedObjectId: `nl-${crypto.randomUUID()}`,
            earliestStart,
            latestStart,
            minDuration: 60,
            // [028] T6：固定时间标记（供 T3 sortByHardRules 层 1「截止紧迫」用）
            ...(fixedHour !== undefined ? { fixedTimeHour: Math.floor(fixedHour) } : {}),
          })
        }
      }
    }

    return { items, tier0Slots }
  }

  /**
   * [028] T2-fold: HH:MM("09:00") → UTC hour number(9)；支持 "09:30"→9.5。
   * null/undefined → undefined（caller 决定 fallback default）。
   * T4 Tier2 窗口调度依赖此类型转换。
   */
  private hhmmToHour(hhmm: string | null | undefined): number | undefined {
    if (!hhmm) return undefined
    const parts = hhmm.split(':')
    if (parts.length < 2) return undefined
    const h = Number(parts[0])
    const m = Number(parts[1])
    if (!Number.isFinite(h)) return undefined
    return h + (Number.isFinite(m) ? m : 0) / 60
  }

  /**
   * [028] T2-fold: Appointment（startTime + durationMin）→ TimeSlot。
   * [026] D2-A USOM SSOT 无 endTime 字段；T2 派生 endTime = startTime + durationMin。
   * 跨日 / 异常数据：返回 undefined（不进 occupied，避免坏数据污染）。
   */
  private appointmentToTier0Slot(appt: {
    startTime: string
    durationMin: number
  }, tz: string = 'Asia/Shanghai'): TimeSlot | undefined {
    if (!appt.startTime || !Number.isFinite(appt.durationMin)) return undefined
    const start = new Date(appt.startTime)
    if (Number.isNaN(start.getTime())) return undefined
    const end = new Date(start.getTime() + appt.durationMin * 60_000)
    // [TZ-1] Step 1：与 extractOccupiedSlots 同 — 用 user_tz 分量而非 getUTCHours，
    //   与 hhmmToIso 写路径对齐（Shanghai 22:00 → UTC 14:00 → getUserTzHour=22）。
    return {
      startHour: getUserTzHour(start, tz),
      startMinute: getUserTzMinute(start, tz),
      endHour: getUserTzHour(end, tz),
      endMinute: getUserTzMinute(end, tz),
    }
  }

  // ─── sortItems: 按优先级 + sourceType 排序 ─────────────────
  //
  // [028] T2-fold：strategy 参数（plumbing 透传；T3 §04 硬规则词典序替换此处的
  // PRIORITY_WEIGHT + SOURCE_WEIGHT 实现，但保留签名兼容 + IRON RULE：legacy 走旧
  // 词典序逻辑不变）。

  private sortItems(items: TimeboxItem[], strategy: 'schedule' | 'legacy' = 'legacy'): TimeboxItem[] {
    if (strategy === 'schedule') {
      // [028] T3: schedule 策略走 §04 硬规则词典序（4 层：截止紧迫 > 能量 > lock > OKR）。
      // archetype 标签通过 deps.archetypeMap 注入（纯函数，避免直读 DB）。
      return sortByHardRules(items, {
        archetypeMap: this.deps.archetypeMap ?? {},
        priorityWeight: PRIORITY_WEIGHT,
        sourceWeight: SOURCE_WEIGHT,
      })
    }
    // legacy（IRON RULE）：adjustRemainingTimeboxes 保留旧 PRIORITY_WEIGHT + SOURCE_WEIGHT 词典序
    return [...items].sort((a, b) => {
      const pa = PRIORITY_WEIGHT[a.priority] ?? 9
      const pb = PRIORITY_WEIGHT[b.priority] ?? 9
      if (pa !== pb) return pa - pb
      const sa = SOURCE_WEIGHT[a.sourceType] ?? 9
      const sb = SOURCE_WEIGHT[b.sourceType] ?? 9
      return sa - sb
    })
  }

  // ─── extractOccupiedSlots: 提取已有 timebox 的时间区间 ─────

  private extractOccupiedSlots(timeboxes: TimeboxSummary[], tz: string = 'Asia/Shanghai'): TimeSlot[] {
    return timeboxes.map(tb => {
      const start = new Date(tb.startTime)
      const end = new Date(tb.endTime)
      // [TZ-1] Step 1：从 [023.09] UTC canonical 切到 user_tz canonical。
      //   旧实现用 `getUTCHours/Minutes` 在 CST 浏览器下读 UTC 22:00 → startHour=22
      //   （DB 语义 OK）但与 parse-timeboxes "ISO=本地时刻字面读" 约定冲突；
      //   且 ScheduleProposal 用户在 Shanghai 看 "08:00"（cursor UTC 8）→ 接受 →
      //   hhmmToIso 字面拼 → DB UTC 8 → 显示端 getHours Shanghai = 16 → +8h 偏移。
      //   新实现：所有 internal arithmetic 用 user_tz 分量（与 hhmmToIso 写路径对齐）；
      //   user_tz 默认 'Asia/Shanghai'（与系统其他位置硬编码一致；MVP 单用户）。
      //   反向：DB UTC 14:00（=Shanghai 22:00）→ getUserTzHour=22 → 与 cursor 22:00
      //   一致 → conflict detection 正确。
      return {
        startHour: getUserTzHour(start, tz),
        startMinute: getUserTzMinute(start, tz),
        endHour: getUserTzHour(end, tz),
        endMinute: getUserTzMinute(end, tz),
      }
    })
  }

  // ─── generateProposals: 分配时间槽，生成提案 ───────────────

  private generateProposals(
    items: TimeboxItem[],
    occupied: TimeSlot[],
    energyCurve: EnergyCurve,
    date: string,
    // [028] T4: strategy 隔离 — 'schedule' 委托 scheduleByTiers（Tier0/1/2），
    // 'legacy' 保留原线性贪心 body 不变（IRON RULE，adjustRemainingTimeboxes 行为对齐）。
    strategy: 'schedule' | 'legacy' = 'legacy',
  ): { proposals: GeneratedProposal[]; warnings: Warning[] } {
    if (strategy === 'schedule') {
      // [028] T4: Tier0 已合并进 occupied（Tier0 slots from appointments，T2-fold）；
      // Tier1 主游标 + Tier2 窗口兜底 + ITEM_UNSCHEDULABLE warning + SCHEDULER_BOUND_EXCEEDED 复刻 [023.07]
      // [TZ-1] Step 1：dayStart: 8 / dayEnd: 22 含义从 UTC hour 切到 user_tz hour
      //   （与 occupied slot 来源 [extractOccupiedSlots/appointmentToTier0Slot] 一致）。
      //   cursor 8:00 / 22:00 现在是 user_tz 8:00 / 22:00，对 Shanghai 用户 = 8 AM / 10 PM。
      return scheduleByTiers(items, occupied, { dayStart: 8, dayEnd: 22 }, {
        isSlotOccupied: (h, m, d, occ) => this.isSlotOccupied(h, m, d, occ),
        findOccupyingSlot: (h, m, d, occ) => this.findOccupyingSlot(h, m, d, occ),
        formatTime: (h, m) => this.formatTime(h, m),
        computeEnergyMatch: (h, e) => this.computeEnergyMatch(h, e, energyCurve),
      })
    }
    // legacy（IRON RULE）：adjustRemainingTimeboxes 保留原线性贪心 body 不变
    //   [TZ-1] Step 1：cursor 起始 8:00 含义切到 user_tz（与 schedule strategy 对齐）。
    const proposals: GeneratedProposal[] = []
    const warnings: Warning[] = []
    let cursorHour = 8  // 从 user_tz 08:00 开始
    let cursorMinute = 0

    // [023.07] #3 — 动态 iteration bound（defense-in-depth）：
    // 单 item 最多走 ~28 个半小时槽（8:00-22:00），items.length × 48 给足余量，
    // +100 兜底空 items / 极端 occupied。超出 → break + emit warning + 返 partial。
    // 正常路径（谓词统一后 fallback 实质死代码）永不触发；纯粹防止未来回归。
    const maxIterations = items.length * 48 + 100
    let iterations = 0

    for (const item of items) {
      // 向前移动游标，跳过被占用的时段
      while (this.isSlotOccupied(cursorHour, cursorMinute, item.durationMinutes, occupied)) {
        if (++iterations > maxIterations) {
          warnings.push({
            code: 'SCHEDULER_BOUND_EXCEEDED',
            message: `智能编排超出最大推进次数 ${maxIterations}，已返回部分方案（${proposals.length} 项）。可能存在异常占用数据。`,
            severity: 'warn',
          })
          return { proposals, warnings }
        }
        const overlap = this.findOccupyingSlot(cursorHour, cursorMinute, item.durationMinutes, occupied)
        if (overlap) {
          cursorHour = overlap.endHour
          cursorMinute = overlap.endMinute
        } else {
          // 安全回退：前进 30 分钟（谓词统一后此分支为死代码，bound 兜底）
          cursorMinute += 30
          if (cursorMinute >= 60) {
            cursorHour += Math.floor(cursorMinute / 60)
            cursorMinute = cursorMinute % 60
          }
        }
      }

      const endTotalMin = cursorHour * 60 + cursorMinute + item.durationMinutes
      const endHour = Math.floor(endTotalMin / 60) % 24
      const endMinute = endTotalMin % 60

      const energyMatch = this.computeEnergyMatch(
        cursorHour,
        item.energyRequired,
        energyCurve,
      )

      proposals.push({
        id: crypto.randomUUID(),
        action: 'createTimebox',
        payload: {
          title: item.title,
          date,
          startTime: this.formatTime(cursorHour, cursorMinute),
          endTime: this.formatTime(endHour, endMinute),
          duration: item.durationMinutes,
          sourceObjectId: item.relatedObjectId,
        },
        sourceType: item.sourceType,
        priority: item.priority,
        energyMatch,
      })

      cursorHour = endHour
      cursorMinute = endMinute

      // 一天最多编排到 22:00
      if (cursorHour >= 22) break
    }

    return { proposals, warnings }
  }

  // ─── detectConflicts: 检测提案与已有 timebox 的时间重叠 ────
  //
  // [023.08] T3 升级：
  //   - 现 async（rule-engine.evaluate 是 Promise）
  //   - deps.ruleEngine 存在 → 走 rule-engine 评估（含 TimeOverlapRule，status-aware）
  //   - deps.ruleEngine 缺省 → 走 [023.07] UTC 谓词 fallback（向后兼容）
  //   - rule-engine.evaluate() 抛错 → fallback 谓词继续执行，业务不阻塞 [G11]

  private async detectConflicts(
    proposals: GeneratedProposal[],
    existingTimeboxes: TimeboxSummary[],
    tz: string = 'Asia/Shanghai',
  ): Promise<Warning[]> {
    // [F9 fold / partial]: existingTimeboxes 已在 contexts 一次性传入（context-engine
    // pre-fetched），透传 rule-engine 作为 snapshot.upcomingTimeboxes context 字段。
    // **重要**: TimeOverlapRule 当前实现仍按 proposal 区间调 timeboxRepo.findByDateRange
    // 做精确 status-aware 查询（per-proposal N 次），并不消费 snapshot.upcomingTimeboxes。
    // 因此本批 pre-fetch 实质是 **snapshot availability hook**（为未来 rule-engine 版本
    // 能复用 snapshot 提前到位而 wiring 已就绪），**不消解 N+1**。真正的 N+1 优化
    // 需 rule-engine 改造消费 snapshot.upcomingTimeboxes（[023.08] P1 backlog）。
    // 当前 handle() 调用上下文里 existingTimeboxes 即 context-engine 提供的同日快照。
    // [TZ-1] Step 1: tz 透传到 fallback 谓词路径（rule-engine 路径内仍按 [023.09] UTC）。
    const preFetchedOccupied = existingTimeboxes

    if (this.deps.ruleEngine) {
      return this.detectConflictsViaRuleEngine(proposals, preFetchedOccupied)
    }

    return this.detectConflictsViaPredicate(proposals, preFetchedOccupied, tz)
  }

  /**
   * 走 rule-engine 评估路径；evaluate() 抛错时回落到谓词（不阻塞）。
   */
  private async detectConflictsViaRuleEngine(
    proposals: GeneratedProposal[],
    existingTimeboxes: TimeboxSummary[],
  ): Promise<Warning[]> {
    const warnings: Warning[] = []

    for (const proposal of proposals) {
      const intent = this.proposalToIntent(proposal)
      // [023.10] T4 A2 stale-date fix: snapshot 派生自 proposal date + server now，
      // 废除硬编码 '2026-07-05' / dayOfWeek=0 / timeOfDay='morning'。复用 [023.08] T1
      // resolveDate 同源语义（先读 .fields.date，回退 server today UTC），但因
      // detectConflictsViaRuleEngine 只持 proposals（不持 request），此处 inline
      // 复制 resolveDate 逻辑而不是新增同名私有方法。
      const resolvedDate = (proposal.payload.date as string | undefined)
        ?? new Date().toISOString().slice(0, 10)
      const snapshot: ContextSnapshot = {
        // 占位 snapshotId — handler 评估 intent 时不需要 persistent snapshot id；
        // rule-engine 仅读 snapshot 字段（如 upcomingTimeboxes / currentDate）。
        snapshotId: '' as any,
        userId: (this.deps.userId ?? 'unknown') as any,
        generatedAt: new Date().toISOString(),
        generatedBy: 'state_machine',
        activeObjectives: [],
        activeKeyResults: [],
        activeTasks: [],
        pendingHabits: [],
        // [F9 fold / partial]: 透传 batch pre-fetched existingTimeboxes 给 rule-engine
        // 作 snapshot.upcomingTimeboxes context。注意：当前 TimeOverlapRule 不消费
        // snapshot.upcomingTimeboxes（仍 per-proposal 查 DB），故此字段是
        // snapshot availability hook，不消解 N+1（N+1 修复需后续 rule-engine 改造）。
        upcomingTimeboxes: existingTimeboxes as any,
        pendingIntentions: [],
        currentTime: new Date().toISOString(),
        // [023.10] T4: 从 resolved proposal date 派生，不再硬编码 dev date
        currentDate: resolvedDate,
        dayOfWeek: this.deriveDayOfWeek(resolvedDate),
        timeOfDay: this.deriveTimeOfDay(new Date()),
        energyState: { inferredLevel: 5, calibratedLevel: null, activeLevel: 5, source: 'system' },
        // [F9 fold / partial] metadata 标记 batch 预取就绪；当前仅作 hook，不影响查询路径。
        metadata: { batchPreFetched: true },
      } as any

      try {
        const result = await this.deps.ruleEngine!.evaluate(intent, snapshot)
        // 仅将 severity='confirm'（如 TimeOverlapRule 触发重叠）映射为 SCHEDULE_OVERLAP。
        // severity='warning'（如 EndTimeAfterStartRule、StartTimeInFutureRule）属
        // 字段完整性问题，不归 detectConflicts 负责，orchestrator 会另走 NeedConfirm
        // 路径聚合（参见 ruleResultToValidation）。
        for (const confirmMsg of result.confirmations) {
          warnings.push({
            code: 'SCHEDULE_OVERLAP',
            message: `"${proposal.payload.title}" ${confirmMsg}`,
            severity: 'warn',
            affectedProposalIds: [proposal.id],
          })
        }
      } catch {
        // [G11] rule-engine 抛错（timeout / DB error）→ 走 fallback 谓词，业务不阻塞。
        const fallback = this.detectConflictsViaPredicate([proposal], existingTimeboxes)
        warnings.push(...fallback)
      }
    }

    return warnings
  }

  /**
   * [023.07] 谓词路径 — UTC interval arithmetic（向后兼容；无 deps 时使用）。
   *
   * 半开区间重叠: pStart < tEnd && pEnd > tStart。
   * status-agnostic（不区分 planned/ended/...），因为这是 fallback 而非权威源。
   */
  private detectConflictsViaPredicate(
    proposals: GeneratedProposal[],
    existingTimeboxes: TimeboxSummary[],
    tz: string = 'Asia/Shanghai',
  ): Warning[] {
    const warnings: Warning[] = []

    for (const proposal of proposals) {
      const payload = proposal.payload
      const pStart = this.timeToMinutes(payload.startTime as string)
      const pEnd = this.timeToMinutes(payload.endTime as string)

      for (const tb of existingTimeboxes) {
        const tbStart = new Date(tb.startTime)
        const tbEnd = new Date(tb.endTime)
        // [TZ-1] Step 1：从 [023.09] UTC arithmetic 切到 user_tz arithmetic。
        //   tStart/tEnd 单位 = user_tz minute-of-day；与 pStart/pEnd 来自
        //   formatTime(cursorHour, ..)（[023.07] UTC cursor，[TZ-1] 切 user_tz cursor）
        //   zone-consistent。message 用 user_tz hour 字符串，与 UI 显示一致。
        const tStart = getUserTzHour(tbStart, tz) * 60 + getUserTzMinute(tbStart, tz)
        const tEnd = getUserTzHour(tbEnd, tz) * 60 + getUserTzMinute(tbEnd, tz)

        if (pStart < tEnd && pEnd > tStart) {
          warnings.push({
            code: 'SCHEDULE_OVERLAP',
            message: `"${payload.title}" 与已有时间盒 "${tb.title}" (${this.formatTime(getUserTzHour(tbStart, tz), getUserTzMinute(tbStart, tz))}-${this.formatTime(getUserTzHour(tbEnd, tz), getUserTzMinute(tbEnd, tz))}) 存在时间重叠`,
            severity: 'warn',
            affectedProposalIds: [proposal.id],
          })
        }
      }
    }

    return warnings
  }

  /**
   * [023.08] T3: proposal → StructuredIntent 转换。
   * TimeOverlapRule 读 intent.fields.startTime/endTime（[023.04] 改读 endTime）。
   *
   *   - 若 startTime/endTime 已是 ISO (含 'T' / 'Z' / '+')，直接用
   *   - 否则按 HH:MM + proposalDate 组合成 ISO（[023.10] T3 A1 fix）
   */
  private proposalToIntent(proposal: GeneratedProposal): StructuredIntent {
    const startTime = proposal.payload.startTime as string
    const endTime = proposal.payload.endTime as string
    // [023.10] T3 A1 fix: 传 proposal.payload.date 让 normalizeTimeField 用 proposal 日期
    // 而不是 server today（否则未来日期 proposal 的 intent.startTime 会被错算到 today，
    // TimeOverlapRule 用 today 窗口查冲突 → 漏报/错报）
    const proposalDate = proposal.payload.date as string | undefined
    return {
      id: crypto.randomUUID() as any,
      intentionId: '' as any,
      targetDomain: 'timebox',
      action: 'createTimebox',
      fields: {
        title: proposal.payload.title,
        startTime: this.normalizeTimeField(proposalDate, startTime),
        endTime: this.normalizeTimeField(proposalDate, endTime),
      },
      confidence: 1.0,
      resolvedBy: 'template_form',
      createdAt: new Date().toISOString() as any,
    } as StructuredIntent
  }

  /**
   * 把 HH:MM 转换为 ISO；已是 ISO 格式则原样返回。
   * TimeOverlapRule 内部用 Date.parse，HH:MM 会得到 NaN；统一转 ISO。
   *
   * [023.10] T3 A1 fix: 接 proposalDate 参数（形如 '2026-07-15'），proposalDate 优先；
   * 仅 legacy 调用未传 proposalDate 时回退 today UTC（向后兼容）。
   * 旧实现用 server today (new Date()) 转 HH:MM 为 ISO，导致未来日期 proposal
   * （cursor date > server today）的 intent.startTime 被错算到 today，
   * TimeOverlapRule 拿错日期窗口查冲突。
   */
  private normalizeTimeField(proposalDate: string | null | undefined, time: string, tz: string = 'Asia/Shanghai'): string {
    if (!time) return time
    // ISO 串：含 'T' 或 'Z' 或 '+' 时区偏移 → 已是 ISO
    if (time.includes('T') || time.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(time)) {
      return time
    }
    // HH:MM → 必须配日期：proposalDate 优先；缺省回退 today UTC（向后兼容 legacy caller）
    const [h, m] = time.split(':').map(Number)
    if (proposalDate) {
      // [TZ-1] Step 1: 把 (HH:MM, date) 当 user_tz 本地时间转 UTC（与 hhmmToIso 同源）。
      //   旧实现字面拼 `${date}T${hh}:${mm}:00Z` 把 08:00 当 UTC → rule-engine 拿到错位时间；
      //   新实现经 tzLocalToUtcMs 转 UTC，Shanghai 08:00 → UTC 00:00 → 与 DB canonical 一致。
      //   输出无 .000Z 后缀保持与 legacy 同格式（Date.parse / string compare 兼容）。
      const utcIso = hhmmToIso(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, proposalDate, tz)
      // hhmmToIso 返 'YYYY-MM-DDTHH:MM:00.000Z'（带 .000 后缀），legacy caller 要 'YYYY-MM-DDTHH:MM:00Z'（不带 .000）
      // 兼容：去掉 .000 段，保持历史输出格式不变（rule-engine / Date.parse 都吃这两种格式）
      return utcIso.replace(/\.000Z$/, 'Z')
    }
    // legacy 路径：HH:MM + server today UTC（向后兼容）
    const today = new Date().toISOString().slice(0, 10)
    return `${today}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`
  }

  // ─── [028] T7: evaluateScore — 5 维评分入参计算 ──────────────────
  //
  // scoreSchedule 纯函数（lib/schedule-score.ts）需要 caller 预先计算 5 个数值：
  //   - totalCandidates, scheduledP0P1 / totalP0P1
  //   - hasOverlap（来自 conflictWarnings 含 SCHEDULE_OVERLAP）
  //   - hasArchetypeData + restMealScheduled（基于 archetypeMap 查 templates 的睡眠/饮食）
  //
  // 本方法把所有派生逻辑收到一处，保持 handle() 干净。

  private evaluateScore(
    proposals: GeneratedProposal[],
    items: TimeboxItem[],
    materials: ReturnType<typeof this.collectMaterials>,
    conflictWarnings: Warning[],
  ): { score: number; dimensions: Record<string, number> } {
    // totalCandidates = items 数（不含 appointments；appointments 走 Tier0）
    // 注：items 含 templates + habits + tasks + NL events（4 源）；
    // strategy='legacy' 时不含 templates/NL（IRON RULE），totalCandidates 自然小。
    const totalCandidates = items.length

    // 高优命中率：从 proposals / items 中数 priority in {P0, P1, critical, high}
    //   items.priority 已 normalize 到 PRIORITY_WEIGHT 兼容值（含 P0/P1/critical/high）
    const p0p1Set = new Set(['P0', 'P1', 'critical', 'high'])
    const totalP0P1 = items.filter(i => p0p1Set.has(i.priority)).length
    const scheduledP0P1 = proposals.filter(p => p0p1Set.has(p.priority)).length

    // 冲突：detectConflicts 返回的 SCHEDULE_OVERLAP warnings
    const hasOverlap = conflictWarnings.some(w => w.code === 'SCHEDULE_OVERLAP')

    // archetype 数据可得性 + restMealScheduled：
    //   - 数据可得：deps.archetypeMap 已注入
    //   - restMeal 已安排：templates 含睡眠/饮食 archetypeId 且对应 proposal 在 proposals 中
    const archetypeMap = this.deps.archetypeMap
    const hasArchetypeData = !!archetypeMap && Object.keys(archetypeMap).length > 0
    let restMealScheduled = false
    if (hasArchetypeData) {
      // 收集 sleep/meal archetypeId（templates 持有 activityArchetypeId）
      const restMealArchetypeIds = new Set<string>()
      for (const tmpl of materials.templates) {
        const aid = tmpl.activityArchetypeId
        if (!aid) continue
        const arch = archetypeMap[aid]
        if (arch && arch.l1Category === '生存' && (arch.l2Name === '睡眠' || arch.l2Name === '饮食')) {
          restMealArchetypeIds.add(aid)
        }
      }
      // 检查 proposals 是否命中这些 archetype（payload.sourceObjectId == archetypeId
      // 不成立 — sourceObjectId == templateId；此处用 templates 自身 id 作 key）
      if (restMealArchetypeIds.size > 0) {
        const scheduledTemplateIds = new Set<string>()
        for (const p of proposals) {
          const sid = p.payload.sourceObjectId
          if (typeof sid === 'string') scheduledTemplateIds.add(sid)
        }
        for (const tmpl of materials.templates) {
          if (tmpl.activityArchetypeId && restMealArchetypeIds.has(tmpl.activityArchetypeId)
              && scheduledTemplateIds.has(tmpl.id)) {
            restMealScheduled = true
            break
          }
        }
      }
    }

    return scoreSchedule(proposals, {
      totalCandidates,
      hasOverlap,
      totalP0P1,
      scheduledP0P1,
      hasArchetypeData,
      restMealScheduled,
    })
  }

  // ─── renderMarkdown: 将提案转为可读 Markdown ──────────────

  private renderMarkdown(proposals: GeneratedProposal[], date: string): PresentationPayload {
    const lines: string[] = []
    lines.push(`# ${date} 智能编排方案`)
    lines.push('')

    if (proposals.length === 0) {
      lines.push('> 当前无可编排项目')
    } else {
      for (const p of proposals) {
        const start = p.payload.startTime as string
        const end = p.payload.endTime as string
        const title = p.payload.title as string
        lines.push(`## ${start}-${end} ${title} [${p.sourceType}] ${p.priority}`)

        if (p.energyMatch) {
          lines.push(`能量匹配: ${p.energyMatch.required}需求/${p.energyMatch.actual}实际 (${p.energyMatch.score.toFixed(1)})`)
        }
        lines.push('')
      }
    }

    return {
      type: 'markdown',
      content: lines.join('\n'),
    }
  }

  // ─── 工具方法 ───────────────────────────────────────────────

  private resolveDate(request: GenerationRequest): string {
    const date = request.intent.fields.date
    if (typeof date === 'string' && date) return date
    return new Date().toISOString().slice(0, 10)
  }

  /**
   * [023.10] T4 A2 fix: derive dayOfWeek from a YYYY-MM-DD date string。
   * 用 UTC midday (T12:00:00Z) parse 避开 TZ 漂移；getUTCDay() 返 0-6 (Sun-Sat)。
   * 仅供 snapshot builder 内部使用 — rule-engine 实际不消费 dayOfWeek（占位字段保留，
   * 是 future rule 的扩展点）。
   */
  private deriveDayOfWeek(date: string): number {
    return new Date(`${date}T12:00:00Z`).getUTCDay()
  }

  /**
   * [023.10] T4 A2 fix: derive timeOfDay from server now UTC hour。
   * 分段: night <6, morning <12, afternoon <18, evening >=18。UTC canonical，
   * 跨浏览器 TZ 一致；与 [023.09] I-3 UTC 改造同源。
   * 仅供 snapshot builder 内部使用。
   */
  private deriveTimeOfDay(date: Date): 'night' | 'morning' | 'afternoon' | 'evening' {
    const h = date.getUTCHours()
    if (h < 6) return 'night'
    if (h < 12) return 'morning'
    if (h < 18) return 'afternoon'
    return 'evening'
  }

  private normalizePriority(priority: string): string {
    if (priority in PRIORITY_WEIGHT) return priority
    const lower = priority.toLowerCase()
    for (const key of Object.keys(PRIORITY_WEIGHT)) {
      if (key.toLowerCase() === lower) return key
    }
    return 'P2'
  }

  private computeEnergyMatch(
    hour: number,
    energyRequired: string | undefined,
    energyCurve: EnergyCurve,
  ): GeneratedProposal['energyMatch'] {
    const required = energyRequired ?? 'medium'
    const isPeak = energyCurve.peakHours.includes(hour)
    const isLow = energyCurve.lowHours.includes(hour)

    let actual: string
    let score: number

    if (isPeak) {
      actual = 'high'
      score = required === 'high' ? 0.9 : required === 'medium' ? 0.7 : 0.5
    } else if (isLow) {
      actual = 'low'
      score = required === 'low' ? 0.8 : required === 'medium' ? 0.4 : 0.2
    } else {
      actual = 'medium'
      score = 0.6
    }

    return { required, actual, score }
  }

  private isSlotOccupied(
    startHour: number,
    startMinute: number,
    durationMinutes: number,
    occupied: TimeSlot[],
  ): boolean {
    const sStart = startHour * 60 + startMinute
    const sEnd = sStart + durationMinutes

    for (const slot of occupied) {
      const oStart = slot.startHour * 60 + slot.startMinute
      const oEnd = slot.endHour * 60 + slot.endMinute
      if (sStart < oEnd && sEnd > oStart) return true
    }
    return false
  }

  private findOccupyingSlot(
    startHour: number,
    startMinute: number,
    durationMinutes: number,
    occupied: TimeSlot[],
  ): TimeSlot | undefined {
    // [023.07] #3 — 谓词统一为区间重叠语义（与 isSlotOccupied 一致）：
    // 旧谓词 `sStart >= oStart && sStart < oEnd`（包含起点）与 isSlotOccupied 的重叠语义
    // 不一致，导致「cursor 槽重叠但起点不在 occupied 内」时返 undefined → 走 fallback +30，
    // 多数情况能自愈但异常 occupied 数据可触发长时间不退出。
    const sStart = startHour * 60 + startMinute
    const sEnd = sStart + durationMinutes
    for (const slot of occupied) {
      const oStart = slot.startHour * 60 + slot.startMinute
      const oEnd = slot.endHour * 60 + slot.endMinute
      if (sStart < oEnd && sEnd > oStart) return slot
    }
    return undefined
  }

  private formatTime(hour: number, minute: number): string {
    // [TZ-1] Step 1：hour/minute 含义从 UTC hour 切到 user_tz hour（与 occupied/cursor 同源）。
    //   输出"HH:MM"字符串由 hhmmToIso(it.startTime, it.date, tz) 在 handler.submit 阶段
    //   当 user_tz 本地时间转 UTC 落库（[023.08] T2 fold 保留 + [TZ-1] 加 tz 参数）。
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + (m ?? 0)
  }
}
