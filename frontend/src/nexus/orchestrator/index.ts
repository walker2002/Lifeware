// Orchestrator — Nexus 管道协调器
// 统一入口，按顺序协调: IntentEngine → RuleEngine → StateMachine → EventBus → ActionSurfaceEngine
// 支持两种域对象: Timebox 和 Habit

import type { USOM_ID, Timestamp, Tag } from '@/usom/types/primitives'
import type { Timebox, Habit, HabitFrequency } from '@/usom/types/objects'
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
} from '@/usom/interfaces/irepository'
import type { TraceStep, TraceComponent, TracePhase } from '@/nexus/infrastructure/trace-logger/trace-types'
import { createTimeboxStateMachine } from '../core/state-machine'
import { findTransition, habitTransitions } from '../core/state-machine/transitions'
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
            latestEndTime: intent.fields.latestEndTime as string,
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
      const dayStart = `${date}T00:00:00Z` as Timestamp
      const dayEnd = `${date}T23:59:59Z` as Timestamp
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
          startTime: `${date}T${startTime}:00Z` as Timestamp,
          endTime: `${date}T${endTime}:00Z` as Timestamp,
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
