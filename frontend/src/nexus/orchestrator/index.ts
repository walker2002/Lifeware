// Orchestrator — Nexus 管道协调器
// 统一入口，按顺序协调: IntentEngine → RuleEngine → StateMachine → EventBus → ActionSurfaceEngine
// 支持两种域对象: Timebox 和 Habit

import type { USOM_ID, Timestamp, Tag } from '@/usom/types/primitives'
import type { Timebox, Habit, HabitFrequency, Objective, KeyResult } from '@/usom/types/objects'
import type {
  StateProposal,
  SystemEvent,
  ActionSurface,
  ContextSnapshot,
} from '@/usom/types/process'
import type { StructuredIntent } from '@/usom/types/objects'
import type {
  ITimeboxRepository,
  ISystemEventRepository,
  IHabitRepository,
  IHabitTemplateRepository,
  IObjectiveRepository,
  IKeyResultRepository,
} from '@/usom/interfaces/irepository'
import type { TraceStep, TraceComponent, TracePhase } from '@/nexus/infrastructure/trace-logger/trace-types'
import { createTimeboxStateMachine } from '../core/state-machine'
import { findTransition, habitTransitions, objectiveTransitions, keyResultTransitions } from '../core/state-machine/transitions'
import { createEventBus } from '../infrastructure/event-bus'

interface IntentEngine {
  parse(rawInput: string, userId: USOM_ID): Promise<StructuredIntent>
}

interface RuleEngine {
  evaluate(
    intent: StructuredIntent,
    snapshot: ContextSnapshot,
  ): Promise<{
    result: 'pass' | 'warning' | 'confirm'
    warnings?: string[]
    confirmations?: string[]
  }>
}

interface ActionSurfaceEngine {
  generate(snapshot: ContextSnapshot, event?: SystemEvent, userId?: USOM_ID): Promise<ActionSurface>
}

export interface ApplyTemplateResult {
  success: boolean
  generatedTimeboxes?: Timebox[]
  error?: string
}

export interface OrchestratorResult {
  success: boolean
  timebox?: Timebox
  habit?: Habit
  actionSurface?: ActionSurface
  error?: string
  warnings?: string[]
  needsConfirmation?: boolean
  confirmationMessage?: string
}

export interface OrchestratorDeps {
  timeboxRepo: ITimeboxRepository
  eventRepo: ISystemEventRepository
  intentEngine: IntentEngine
  ruleEngine: RuleEngine
  actionSurfaceEngine?: ActionSurfaceEngine
  habitRepo?: IHabitRepository
  templateRepo?: IHabitTemplateRepository
  objectiveRepo?: IObjectiveRepository
  keyResultRepo?: IKeyResultRepository
  onTrace?: (step: TraceStep) => void
}

function toLifecycleAction(domainAction: string): string {
  const map: Record<string, string> = {
    create_timebox: 'create',
    start_timebox: 'start',
    end_timebox: 'end',
    overtime_timebox: 'overtime',
    cancel_timebox: 'cancel',
    log_timebox: 'log',
  }
  return map[domainAction] ?? domainAction
}

/** 从 habit 意图的 action 提取状态机 action */
function toHabitAction(domainAction: string): string {
  const map: Record<string, string> = {
    createHabit: 'create',
    activateHabit: 'activate',
    suspendHabit: 'suspend',
    archiveHabit: 'archive',
    reactivateHabit: 'reactivate',
  }
  return map[domainAction] ?? domainAction
}

/** 从 OKR 意图的 action 提取状态机 action */
function toOKRAction(domainAction: string): string {
  const map: Record<string, string> = {
    createObjective: 'create',
    updateObjective: 'update',
    activateObjective: 'activate',
    pauseObjective: 'pause',
    resumeObjective: 'resume',
    completeObjective: 'complete',
    discardObjective: 'discard',
    archiveObjective: 'archive',
    createKeyResult: 'create',
    updateKeyResult: 'update',
    updateKeyResultProgress: 'updateProgress',
    deleteKeyResult: 'deleteDraft',
  }
  return map[domainAction] ?? domainAction
}

function createStubSnapshot(userId: USOM_ID): ContextSnapshot {
  const now = new Date().toISOString() as Timestamp
  return {
    snapshotId: crypto.randomUUID() as USOM_ID,
    userId,
    generatedAt: now,
    generatedBy: 'state_machine',
    activeObjectives: [],
    activeKeyResults: [],
    activeTasks: [],
    pendingHabits: [],
    upcomingTimeboxes: [],
    pendingIntentions: [],
    currentTime: now,
    currentDate: now.slice(0, 10) as unknown as import('@/usom/types/primitives').DateOnly,
    dayOfWeek: new Date().getDay(),
    timeOfDay: 'morning' as const,
    energyState: {
      inferredLevel: 5,
      calibratedLevel: null,
      activeLevel: 5,
      source: 'system',
    },
  }
}

function trace(
  onTrace: OrchestratorDeps['onTrace'],
  component: TraceComponent,
  phase: TracePhase,
  data: { input: Record<string, unknown>; output?: Record<string, unknown>; error?: string },
): void {
  if (!onTrace) return
  onTrace({
    id: 0,
    component,
    phase,
    timestamp: new Date().toISOString() as Timestamp,
    input: data.input,
    output: data.output,
    error: data.error,
  })
}

export function createOrchestrator(deps: OrchestratorDeps) {
  const eventBus = createEventBus()
  const stateMachine = createTimeboxStateMachine({
    timeboxRepo: deps.timeboxRepo,
    eventRepo: deps.eventRepo,
  })

  return {
    eventBus,

    /** 通过自然语言输入执行 Nexus 管道（创建路径） */
    async execute(rawInput: string, userId: USOM_ID, confirmed?: boolean): Promise<OrchestratorResult> {
      trace(deps.onTrace, 'IntentEngine', 'start', { input: { rawInput } })
      const intent = await deps.intentEngine.parse(rawInput, userId)
      trace(deps.onTrace, 'IntentEngine', 'end', { input: { rawInput }, output: { intent } })

      const snapshot = createStubSnapshot(userId)

      trace(deps.onTrace, 'RuleEngine', 'start', { input: { intent } })
      const ruleResult = await deps.ruleEngine.evaluate(intent, snapshot)
      trace(deps.onTrace, 'RuleEngine', 'end', { input: { intent }, output: { ruleResult } })

      if (ruleResult.result === 'confirm' && !confirmed) {
        return {
          success: false,
          needsConfirmation: true,
          confirmationMessage: ruleResult.confirmations?.join('; '),
        }
      }

      const proposal: StateProposal = {
        id: crypto.randomUUID() as USOM_ID,
        intentId: intent.id,
        targetObject: { type: 'timebox' },
        action: toLifecycleAction(intent.action),
        payload: intent.fields,
        approvedAt: new Date().toISOString() as Timestamp,
        approvedBy: 'rule_engine',
      }

      trace(deps.onTrace, 'StateMachine', 'start', { input: { proposal } })
      const smResult = await stateMachine.execute(proposal, eventBus, userId)
      trace(deps.onTrace, 'StateMachine', 'end', {
        input: { proposal },
        output: { success: smResult.success, object: smResult.object },
        error: smResult.error,
      })

      if (!smResult.success) {
        return { success: false, error: smResult.error }
      }

      trace(deps.onTrace, 'ActionSurfaceEngine', 'start', { input: { snapshot, event: smResult.event } })
      let actionSurface: ActionSurface | undefined
      if (deps.actionSurfaceEngine) {
        actionSurface = await deps.actionSurfaceEngine.generate(snapshot, smResult.event, userId)
      }
      trace(deps.onTrace, 'ActionSurfaceEngine', 'end', { input: { snapshot }, output: { actionSurface } })

      return {
        success: true,
        timebox: smResult.object,
        actionSurface,
        warnings: ruleResult.warnings,
      }
    },

    /** 直接执行状态转换（非创建路径：start/end/cancel/log/overtime） */
    async executeTransition(
      objectId: USOM_ID,
      action: string,
      userId: USOM_ID,
      payload: Record<string, unknown> = {},
      confirmed?: boolean,
    ): Promise<OrchestratorResult> {
      const snapshot = createStubSnapshot(userId)

      // 构造一个最小化的 StructuredIntent 供规则引擎评估
      const stubIntent: StructuredIntent = {
        id: crypto.randomUUID() as USOM_ID,
        intentionId: '' as USOM_ID,
        targetDomain: 'timebox',
        action: action + '_timebox',
        fields: { objectId, ...payload },
        confidence: 1.0,
        resolvedBy: 'template_form',
        createdAt: new Date().toISOString() as Timestamp,
      }

      trace(deps.onTrace, 'RuleEngine', 'start', { input: { intent: stubIntent } })
      const ruleResult = await deps.ruleEngine.evaluate(stubIntent, snapshot)
      trace(deps.onTrace, 'RuleEngine', 'end', { input: { intent: stubIntent }, output: { ruleResult } })

      if (ruleResult.result === 'confirm' && !confirmed) {
        return {
          success: false,
          needsConfirmation: true,
          confirmationMessage: ruleResult.confirmations?.join('; '),
          warnings: ruleResult.warnings,
        }
      }

      const proposal: StateProposal = {
        id: crypto.randomUUID() as USOM_ID,
        intentId: '' as USOM_ID,
        targetObject: { type: 'timebox', id: objectId },
        action,
        payload,
        approvedAt: new Date().toISOString() as Timestamp,
        approvedBy: 'rule_engine',
      }

      trace(deps.onTrace, 'StateMachine', 'start', { input: { proposal } })
      const smResult = await stateMachine.execute(proposal, eventBus, userId)
      trace(deps.onTrace, 'StateMachine', 'end', {
        input: { proposal },
        output: { success: smResult.success, object: smResult.object },
        error: smResult.error,
      })

      if (!smResult.success) {
        return { success: false, error: smResult.error }
      }

      trace(deps.onTrace, 'ActionSurfaceEngine', 'start', { input: { snapshot, event: smResult.event } })
      let actionSurface: ActionSurface | undefined
      if (deps.actionSurfaceEngine) {
        actionSurface = await deps.actionSurfaceEngine.generate(snapshot, smResult.event, userId)
      }
      trace(deps.onTrace, 'ActionSurfaceEngine', 'end', { input: { snapshot }, output: { actionSurface } })

      return {
        success: true,
        timebox: smResult.object,
        actionSurface,
        warnings: ruleResult.warnings,
      }
    },

    /** 处理 Habit 类型意图（createHabit/activateHabit/suspendHabit/archiveHabit/reactivateHabit） */
    async executeHabitIntent(
      intent: StructuredIntent,
      userId: USOM_ID,
      confirmed?: boolean,
    ): Promise<OrchestratorResult> {
      if (!deps.habitRepo) {
        return { success: false, error: 'HabitRepository 未配置' }
      }

      const snapshot = createStubSnapshot(userId)
      const action = toHabitAction(intent.action)

      // RuleEngine 评估
      trace(deps.onTrace, 'RuleEngine', 'start', { input: { intent } })
      const ruleResult = await deps.ruleEngine.evaluate(intent, snapshot)
      trace(deps.onTrace, 'RuleEngine', 'end', { input: { intent }, output: { ruleResult } })

      if (ruleResult.result === 'confirm' && !confirmed) {
        return {
          success: false,
          needsConfirmation: true,
          confirmationMessage: ruleResult.confirmations?.join('; '),
          warnings: ruleResult.warnings,
        }
      }

      const now = new Date().toISOString() as Timestamp

      if (action === 'create') {
        // 创建路径: null → draft
        const transition = findTransition(habitTransitions, null, 'create')
        if (!transition) {
          return { success: false, error: '非法状态转换: 习惯创建失败' }
        }

        const habit = await deps.habitRepo.create(
          {
            title: intent.fields.title as string,
            description: intent.fields.description as string | undefined,
            defaultTime: intent.fields.defaultTime as string,
            earliestTime: intent.fields.earliestTime as string,
            latestStartTime: intent.fields.latestStartTime as string,
            defaultDuration: intent.fields.defaultDuration as number,
            minDuration: intent.fields.minDuration as number,
            trackable: intent.fields.trackable as boolean,
            frequencyType: (intent.fields.frequencyType ?? 'daily') as HabitFrequency['type'],
            daysOfWeek: intent.fields.daysOfWeek as number[] | undefined,
            startDate: intent.fields.startDate as import('@/usom/types/primitives').DateOnly,
            endDate: intent.fields.endDate as import('@/usom/types/primitives').DateOnly | undefined,
            keyResultId: intent.fields.keyResultId as USOM_ID | undefined,
            tags: intent.fields.tags as string[] | undefined,
          },
          userId,
        )

        const event: SystemEvent = {
          id: crypto.randomUUID() as USOM_ID,
          type: transition.eventType,
          occurredAt: now,
          triggeredBy: 'state_machine',
          payload: {
            habitId: habit.id,
            intentId: intent.id,
            toStatus: transition.to,
          },
          snapshotId: '' as USOM_ID,
        }

        await deps.eventRepo.append(event, userId)
        eventBus.publish(event)

        return {
          success: true,
          habit,
          warnings: ruleResult.warnings,
        }
      }

      // 非创建路径: 加载已有习惯并执行状态转换
      const habitId = intent.fields.habitId as USOM_ID
      const existing = await deps.habitRepo.findById(habitId, userId)
      if (!existing) {
        return { success: false, error: '习惯不存在' }
      }

      const transition = findTransition(habitTransitions, existing.status, action)
      if (!transition) {
        return {
          success: false,
          error: `非法状态转换: action="${action}", fromState="${existing.status}"`,
        }
      }

      const updated = await deps.habitRepo.updateStatus(habitId, transition.to, userId)

      const event: SystemEvent = {
        id: crypto.randomUUID() as USOM_ID,
        type: transition.eventType,
        occurredAt: now,
        triggeredBy: 'state_machine',
        payload: {
          habitId,
          intentId: intent.id,
          fromStatus: existing.status,
          toStatus: transition.to,
        },
        snapshotId: '' as USOM_ID,
      }

      await deps.eventRepo.append(event, userId)
      eventBus.publish(event)

      return {
        success: true,
        habit: updated,
        warnings: ruleResult.warnings,
      }
    },

    /** 重新计算习惯打卡指标并持久化 */
    async recalculateHabitMetrics(habitId: USOM_ID, userId: USOM_ID): Promise<void> {
      if (!deps.habitRepo) return
      const streak = await deps.habitRepo.calculateStreak(habitId, userId)
      const longestStreak = await deps.habitRepo.calculateLongestStreak(habitId, userId)
      const completionRate7d = await deps.habitRepo.calculateCompletion7d(habitId, userId)
      await deps.habitRepo.updateMetrics(habitId, userId, { streak, longestStreak, completionRate7d })
    },

    /** 处理 OKR 类型意图 */
    async executeOKRIntent(
      intent: StructuredIntent,
      userId: USOM_ID,
      confirmed?: boolean,
    ): Promise<OrchestratorResult> {
      if (!deps.objectiveRepo || !deps.keyResultRepo) {
        return { success: false, error: 'ObjectiveRepository 或 KeyResultRepository 未配置' }
      }

      const snapshot = createStubSnapshot(userId)
      const action = toOKRAction(intent.action)

      // RuleEngine 评估
      trace(deps.onTrace, 'RuleEngine', 'start', { input: { intent } })
      const ruleResult = await deps.ruleEngine.evaluate(intent, snapshot)
      trace(deps.onTrace, 'RuleEngine', 'end', { input: { intent }, output: { ruleResult } })

      if (ruleResult.result === 'confirm' && !confirmed) {
        return {
          success: false,
          needsConfirmation: true,
          confirmationMessage: ruleResult.confirmations?.join('; '),
          warnings: ruleResult.warnings,
        }
      }

      const now = new Date().toISOString() as Timestamp
      const target = intent.targetDomain as string

      // ─── Objective 操作 ──────────────────────────────
      if (target === 'objective') {
        if (action === 'create') {
          const transition = findTransition(objectiveTransitions, null, 'create')
          if (!transition) {
            return { success: false, error: '非法状态转换: 目标创建失败' }
          }

          const objId = crypto.randomUUID() as USOM_ID
          const objective: Objective = {
            id: objId,
            status: 'draft',
            title: intent.fields.title as string,
            description: intent.fields.description as string | undefined,
            period: {
              type: (intent.fields.periodType ?? 'quarterly') as Objective['period']['type'],
              start: (intent.fields.periodStart ?? '') as unknown as import('@/usom/types/primitives').DateOnly,
              end: (intent.fields.periodEnd ?? '') as unknown as import('@/usom/types/primitives').DateOnly,
            },
            keyResultIds: [],
            okrType: (intent.fields.okrType ?? 'committed') as 'visionary' | 'committed',
            objectiveNumber: '',
            priority: (intent.fields.priority ?? 'P1') as 'P0' | 'P1' | 'P2',
            tags: (intent.fields.tags ?? []) as string[],
            createdAt: now,
            updatedAt: now,
          }

          await deps.objectiveRepo.save(objective, userId)

          const event: SystemEvent = {
            id: crypto.randomUUID() as USOM_ID,
            type: transition.eventType,
            occurredAt: now,
            triggeredBy: 'state_machine',
            payload: { objectiveId: objId, title: objective.title, toStatus: 'draft' },
            snapshotId: '' as USOM_ID,
          }
          await deps.eventRepo.append(event, userId)
          eventBus.publish(event)

          return { success: true, warnings: ruleResult.warnings }
        }

        // 非创建路径: 加载已有目标并执行状态转换
        const objectiveId = intent.fields.objectiveId as USOM_ID
        const existing = await deps.objectiveRepo.findById(objectiveId, userId)
        if (!existing) {
          return { success: false, error: '目标不存在' }
        }

        const transition = findTransition(objectiveTransitions, existing.status, action)
        if (!transition) {
          return { success: false, error: `非法状态转换: action="${action}", fromState="${existing.status}"` }
        }

        // 激活前置校验
        if (action === 'activate') {
          const krs = await deps.keyResultRepo.findByObjective(objectiveId, userId)
          const draftKRs = krs.filter(kr => kr.status === 'draft')
          if (draftKRs.length === 0) {
            return { success: false, error: '激活失败: 至少需要 1 个草稿关键结果' }
          }
          if (!existing.period.start || !existing.period.end) {
            return { success: false, error: '激活失败: 必须设置周期起止日期' }
          }
        }

        // 更新 Objective 状态
        const updated: Objective = {
          ...existing,
          status: transition.to,
          updatedAt: now,
          ...(transition.to === 'discarded' ? { discardedAt: now } : {}),
          ...(transition.to === 'completed' ? { completedAt: now } : {}),
          ...(transition.to === 'archived' ? { archivedAt: now } : {}),
        }
        await deps.objectiveRepo.save(updated, userId)

        // KR 联动状态变更
        if (action === 'activate') {
          await deps.keyResultRepo.batchUpdateStatus(objectiveId, 'draft', 'active', userId)
        } else if (action === 'pause') {
          await deps.keyResultRepo.batchUpdateStatus(objectiveId, 'active', 'paused', userId)
        } else if (action === 'resume') {
          await deps.keyResultRepo.batchUpdateStatus(objectiveId, 'paused', 'active', userId)
        } else if (action === 'complete') {
          await deps.keyResultRepo.batchUpdateStatus(objectiveId, 'active', 'completed', userId)
          await deps.keyResultRepo.batchUpdateStatus(objectiveId, 'paused', 'completed', userId)
        } else if (action === 'discard') {
          // 所有 KR → discarded
          const krs = await deps.keyResultRepo.findByObjective(objectiveId, userId)
          for (const kr of krs) {
            if (kr.status !== 'discarded' && kr.status !== 'archived') {
              const krUpdated: KeyResult = { ...kr, status: 'discarded', discardedAt: now, updatedAt: now }
              await deps.keyResultRepo.save(krUpdated, userId)
            }
          }
        } else if (action === 'archive') {
          const krs = await deps.keyResultRepo.findByObjective(objectiveId, userId)
          for (const kr of krs) {
            if (kr.status !== 'archived') {
              const krUpdated: KeyResult = { ...kr, status: 'archived', updatedAt: now }
              await deps.keyResultRepo.save(krUpdated, userId)
            }
          }
        }

        const event: SystemEvent = {
          id: crypto.randomUUID() as USOM_ID,
          type: transition.eventType,
          occurredAt: now,
          triggeredBy: 'state_machine',
          payload: { objectiveId, title: existing.title, fromStatus: existing.status, toStatus: transition.to },
          snapshotId: '' as USOM_ID,
        }
        await deps.eventRepo.append(event, userId)
        eventBus.publish(event)

        return { success: true, warnings: ruleResult.warnings }
      }

      // ─── KeyResult 操作 ──────────────────────────────
      if (target === 'keyResult') {
        if (action === 'create') {
          const objectiveId = intent.fields.objectiveId as USOM_ID
          const krId = crypto.randomUUID() as USOM_ID
          const kr: KeyResult = {
            id: krId,
            objectiveId,
            title: intent.fields.title as string,
            description: intent.fields.description as string | undefined,
            targetValue: intent.fields.targetValue as number,
            currentValue: 0,
            unit: intent.fields.unit as string,
            progressRate: 0,
            status: 'draft',
            createdAt: now,
            updatedAt: now,
          }
          await deps.keyResultRepo.save(kr, userId)

          // 更新 Objective 的 keyResultIds
          const obj = await deps.objectiveRepo.findById(objectiveId, userId)
          if (obj) {
            await deps.objectiveRepo.save({ ...obj, keyResultIds: [...obj.keyResultIds, krId], updatedAt: now }, userId)
          }

          const event: SystemEvent = {
            id: crypto.randomUUID() as USOM_ID,
            type: 'KeyResultUpdated',
            occurredAt: now,
            triggeredBy: 'state_machine',
            payload: { keyResultId: krId, objectiveId, title: kr.title },
            snapshotId: '' as USOM_ID,
          }
          await deps.eventRepo.append(event, userId)
          eventBus.publish(event)

          return { success: true, warnings: ruleResult.warnings }
        }

        if (action === 'updateProgress') {
          const krId = intent.fields.keyResultId as USOM_ID
          const currentValue = intent.fields.currentValue as number
          const kr = await deps.keyResultRepo.updateProgress(krId, currentValue, userId)

          const eventType = kr.status === 'completed' ? 'KeyResultCompleted' as const : 'KeyResultProgressUpdated' as const
          const event: SystemEvent = {
            id: crypto.randomUUID() as USOM_ID,
            type: eventType,
            occurredAt: now,
            triggeredBy: 'state_machine',
            payload: { keyResultId: krId, currentValue, progressRate: kr.progressRate, krTitle: kr.title },
            snapshotId: '' as USOM_ID,
          }
          await deps.eventRepo.append(event, userId)
          eventBus.publish(event)

          return { success: true, warnings: ruleResult.warnings }
        }

        if (action === 'deleteDraft') {
          const krId = intent.fields.keyResultId as USOM_ID
          await deps.keyResultRepo.deleteDraft(krId, userId)
          return { success: true, warnings: ruleResult.warnings }
        }

        // update (字段更新)
        if (action === 'update') {
          const krId = intent.fields.keyResultId as USOM_ID
          const existing = await deps.keyResultRepo.findById(krId, userId)
          if (!existing) {
            return { success: false, error: '关键结果不存在' }
          }
          const updatedKR: KeyResult = {
            ...existing,
            ...(intent.fields.title != null ? { title: intent.fields.title as string } : {}),
            ...(intent.fields.description != null ? { description: intent.fields.description as string | undefined } : {}),
            ...(intent.fields.targetValue != null ? { targetValue: intent.fields.targetValue as number } : {}),
            ...(intent.fields.unit != null ? { unit: intent.fields.unit as string } : {}),
            updatedAt: now,
          }
          await deps.keyResultRepo.save(updatedKR, userId)
          return { success: true, warnings: ruleResult.warnings }
        }
      }

      return { success: false, error: `未知的 OKR 操作: ${intent.action}` }
    },

    /** 应用模板生成每日时间盒计划 */
    async applyTemplate(
      templateId: USOM_ID,
      date: string,
      userId: USOM_ID,
    ): Promise<ApplyTemplateResult> {
      if (!deps.templateRepo || !deps.habitRepo) {
        return { success: false, error: 'TemplateRepository 或 HabitRepository 未配置' }
      }

      const template = await deps.templateRepo.findById(templateId, userId)
      if (!template) {
        return { success: false, error: '模板不存在' }
      }

      if (template.habits.length === 0) {
        return { success: false, error: '模板中没有习惯' }
      }

      // 幂等性检查：查找当天已有的时间盒
      const dayStart = `${date}T00:00:00+08:00` as Timestamp
      const dayEnd = `${date}T23:59:59+08:00` as Timestamp
      const existingTimeboxes = await deps.timeboxRepo.findByDateRange(dayStart, dayEnd, userId)

      // 检查模板中所有习惯是否已在当天时间盒中（完全重合 = 重复应用）
      const templateHabitIds = new Set(template.habits.map(h => h.habitId))
      const coveredHabits = new Set<string>()
      for (const tb of existingTimeboxes) {
        for (const hid of tb.habitIds) {
          if (templateHabitIds.has(hid)) {
            coveredHabits.add(hid)
          }
        }
      }
      if (coveredHabits.size === templateHabitIds.size && templateHabitIds.size > 0) {
        return {
          success: false,
          error: '今日已使用该模板生成计划，如需调整请直接编辑时间盒',
        }
      }

      const now = new Date().toISOString() as Timestamp
      const generated: Timebox[] = []

      for (const item of template.habits) {
        const habit = await deps.habitRepo.findById(item.habitId, userId)
        if (!habit) continue

        // 使用 timeOverride 或习惯的 defaultTime
        const startTime = item.timeOverride ?? habit.defaultTime
        const duration = item.durationOverride ?? habit.defaultDuration

        // 计算结束时间
        const [sh, sm] = startTime.split(':').map(Number)
        const totalMin = sh * 60 + sm + duration
        const eh = Math.floor(totalMin / 60) % 24
        const em = totalMin % 60
        const endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`

        const timeboxId = crypto.randomUUID() as USOM_ID
        const timebox: Timebox = {
          id: timeboxId,
          status: 'planned',
          title: habit.title,
          startTime: `${date}T${startTime}:00+08:00` as Timestamp,
          endTime: `${date}T${endTime}:00+08:00` as Timestamp,
          taskIds: [],
          habitIds: [habit.id],
          isRecurring: false,
          tags: [],
          createdAt: now,
          updatedAt: now,
        }

        await deps.timeboxRepo.save(timebox, userId)

        const event: SystemEvent = {
          id: crypto.randomUUID() as USOM_ID,
          type: 'TimeboxCreated',
          occurredAt: now,
          triggeredBy: 'template_apply',
          payload: {
            timeboxId,
            templateId,
            habitId: habit.id,
            date,
          },
          snapshotId: '' as USOM_ID,
        }

        await deps.eventRepo.append(event, userId)
        eventBus.publish(event)

        generated.push(timebox)
      }

      return { success: true, generatedTimeboxes: generated }
    },
  }
}
