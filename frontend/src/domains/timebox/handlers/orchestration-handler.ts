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
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

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
    const strategy: 'schedule' | 'legacy' = action === 'scheduleProposal' ? 'schedule' : 'legacy'
    const { items, tier0Slots } = this.buildTimeboxItems(materials, strategy)
    const sorted = this.sortItems(items, strategy)
    // [028] T2-fold: tier0Slots（来自 appointments）与 existingTimeboxes 合并为 occupied，
    // 防止 proposal 占到已约定的时段。
    const occupied = [...this.extractOccupiedSlots(materials.existingTimeboxes), ...tier0Slots]
    // [023.07] #3 — 解构新 shape：generateProposals 现返回 { proposals, warnings }，
    // warnings 携带 SCHEDULER_BOUND_EXCEEDED（detection in deep loop），与 detectConflicts 并列追加。
    // 顺序：bound warnings 在前，conflict warnings 在后。
    const { proposals, warnings: boundWarnings } = this.generateProposals(sorted, occupied, materials.energyCurve, date, strategy)
    // [023.08] T3 [F3 fold]: detectConflicts 现 async（rule-engine.evaluate 是异步），
    // handle() 必须 await，否则 conflictWarnings 是 Promise<Warning[]> 与后续 spread 类型冲突。
    const conflictWarnings = await this.detectConflicts(proposals, materials.existingTimeboxes)
    const presentation = this.renderMarkdown(proposals, date)

    return {
      proposalSet: {
        id: crypto.randomUUID(),
        label: `${date} 智能编排方案`,
        proposals,
        tags: ['auto-schedule', 'smart'],
      },
      presentation,
      warnings: [...boundWarnings, ...conflictWarnings],
    }
  }

  async onGenerate(request: GenerationRequest, aiRuntime: AIRuntime): Promise<GenerationResult> {
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

    return {
      pendingHabits,
      activeTasks,
      existingTimeboxes,
      energyCurve,
      appointments,
      templates,
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
        const slot = this.appointmentToTier0Slot(appt)
        if (slot) tier0Slots.push(slot)
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
  }): TimeSlot | undefined {
    if (!appt.startTime || !Number.isFinite(appt.durationMin)) return undefined
    const start = new Date(appt.startTime)
    if (Number.isNaN(start.getTime())) return undefined
    const end = new Date(start.getTime() + appt.durationMin * 60_000)
    return {
      startHour: start.getUTCHours(),
      startMinute: start.getUTCMinutes(),
      endHour: end.getUTCHours(),
      endMinute: end.getUTCMinutes(),
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

  private extractOccupiedSlots(timeboxes: TimeboxSummary[]): TimeSlot[] {
    return timeboxes.map(tb => {
      const start = new Date(tb.startTime)
      const end = new Date(tb.endTime)
      // [023.09] I-3 TZ fragility 治本：DB / USOM 存 UTC ISO timestamp，
      // 过去用 .getHours()/.getMinutes() 读浏览器 local TZ（CST 浏览器下 UTC 22:00
      // 被读成 6 = 次日 06:00），与 findOccupyingSlot/isSlotOccupied UTC-invariant
      // 谓词（[023.07] 已统一）+ formatTime(HH:MM, UTC cursor) 错位。
      // 改用 .getUTCHours()/.getUTCMinutes() 与 DB 储存 canonical 一致，
      // arithmetic 与 proposal.payload.startTime zone-consistent。
      return {
        startHour: start.getUTCHours(),
        startMinute: start.getUTCMinutes(),
        endHour: end.getUTCHours(),
        endMinute: end.getUTCMinutes(),
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
      return scheduleByTiers(items, occupied, { dayStart: 8, dayEnd: 22 }, {
        isSlotOccupied: (h, m, d, occ) => this.isSlotOccupied(h, m, d, occ),
        findOccupyingSlot: (h, m, d, occ) => this.findOccupyingSlot(h, m, d, occ),
        formatTime: (h, m) => this.formatTime(h, m),
        computeEnergyMatch: (h, e) => this.computeEnergyMatch(h, e, energyCurve),
      })
    }
    // legacy（IRON RULE）：adjustRemainingTimeboxes 保留原线性贪心 body 不变
    const proposals: GeneratedProposal[] = []
    const warnings: Warning[] = []
    let cursorHour = 8  // 从 08:00 开始
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
  ): Promise<Warning[]> {
    // [F9 fold / partial]: existingTimeboxes 已在 contexts 一次性传入（context-engine
    // pre-fetched），透传 rule-engine 作为 snapshot.upcomingTimeboxes context 字段。
    // **重要**: TimeOverlapRule 当前实现仍按 proposal 区间调 timeboxRepo.findByDateRange
    // 做精确 status-aware 查询（per-proposal N 次），并不消费 snapshot.upcomingTimeboxes。
    // 因此本批 pre-fetch 实质是 **snapshot availability hook**（为未来 rule-engine 版本
    // 能复用 snapshot 提前到位而 wiring 已就绪），**不消解 N+1**。真正的 N+1 优化
    // 需 rule-engine 改造消费 snapshot.upcomingTimeboxes（[023.08] P1 backlog）。
    // 当前 handle() 调用上下文里 existingTimeboxes 即 context-engine 提供的同日快照。
    const preFetchedOccupied = existingTimeboxes

    if (this.deps.ruleEngine) {
      return this.detectConflictsViaRuleEngine(proposals, preFetchedOccupied)
    }

    return this.detectConflictsViaPredicate(proposals, preFetchedOccupied)
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
  ): Warning[] {
    const warnings: Warning[] = []

    for (const proposal of proposals) {
      const payload = proposal.payload
      const pStart = this.timeToMinutes(payload.startTime as string)
      const pEnd = this.timeToMinutes(payload.endTime as string)

      for (const tb of existingTimeboxes) {
        const tbStart = new Date(tb.startTime)
        const tbEnd = new Date(tb.endTime)
        // [023.09] I-3 TZ fragility 治本：与 extractOccupiedSlots 同 — UTC arithmetic。
        // tStart/tEnd 单位 = UTC minute-of-day；与 pStart/pEnd 来自 formatTime(cursorHour, ..)
        // (UTC cursor, [023.07] 已统一) zone-consistent。message 用 UTC hour 字符串，
        // 跨 TZ 一致；UI 期望 user-local 显示留给 surface render layer (out-of-scope)。
        const tStart = tbStart.getUTCHours() * 60 + tbStart.getUTCMinutes()
        const tEnd = tbEnd.getUTCHours() * 60 + tbEnd.getUTCMinutes()

        if (pStart < tEnd && pEnd > tStart) {
          warnings.push({
            code: 'SCHEDULE_OVERLAP',
            message: `"${payload.title}" 与已有时间盒 "${tb.title}" (${this.formatTime(tbStart.getUTCHours(), tbStart.getUTCMinutes())}-${this.formatTime(tbEnd.getUTCHours(), tbEnd.getUTCMinutes())}) 存在时间重叠`,
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
  private normalizeTimeField(proposalDate: string | null | undefined, time: string): string {
    if (!time) return time
    // ISO 串：含 'T' 或 'Z' 或 '+' 时区偏移 → 已是 ISO
    if (time.includes('T') || time.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(time)) {
      return time
    }
    // HH:MM → 必须配日期：proposalDate 优先；缺省回退 today UTC（向后兼容 legacy caller）
    const [h, m] = time.split(':').map(Number)
    if (proposalDate) {
      const [y, mo, d] = proposalDate.split('-').map(Number)
      // 手工拼接 YYYY-MM-DDTHH:MM:SSZ，与 legacy 路径格式一致（无 .000Z 后缀），
      // 保证下游 Date.parse / string compare 不受毫秒表示差异影响。
      return `${proposalDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`
    }
    // legacy 路径：HH:MM + server today UTC（与 orchestration cursor zone-consistent）
    const today = new Date().toISOString().slice(0, 10)
    return `${today}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`
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
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + (m ?? 0)
  }
}
