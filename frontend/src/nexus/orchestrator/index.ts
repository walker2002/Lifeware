// Orchestrator — Nexus 管道协调器
// 统一入口，按顺序协调: IntentEngine → RuleEngine → StateMachine → EventBus → ActionSurfaceEngine
// 所有域通过 executeIntent() 统一入口

import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import type { Timebox, Habit, HabitFrequency, Objective, KeyResult } from '@/usom/types/objects'
import type { HabitStatus, ObjectiveStatus, TaskStatus, ProjectStatus } from '@/usom/types/primitives'
import type {
  StateProposal,
  SystemEvent,
  SystemEventType,
  ActionSurface,
  ContextSnapshot,
  GenerationResult,
  QueryResult,
  QueryContext,
} from '@/usom/types/process'
import type { StructuredIntent } from '@/usom/types/objects'
import type {
  ITimeboxRepository,
  ISystemEventRepository,
  IHabitRepository,
  IHabitTemplateRepository,
  IObjectiveRepository,
  IKeyResultRepository,
  ITaskRepository,
  IProjectRepository,
  IHabitLogRepository,
} from '@/usom/interfaces/irepository'
import type { TraceStep, TraceComponent, TracePhase } from '@/nexus/infrastructure/trace-logger/trace-types'
import type { USOMSnapshot } from '@/usom/types/process'
import { createTimeboxStateMachine, createGenericStateMachine } from '../core/state-machine'
import { createEventBus } from '../infrastructure/event-bus'
import { findDomain, findHandler } from '@/domains/registry'
import { buildActionMap, resolveObjectType, getTransitionFromManifest } from './lifecycle-configs'
import { assembleContext } from '@/nexus/context-engine'
import { loadDomainManifest } from '@/domains/manifest-loader'
import { evaluateProposals } from '@/nexus/core/rule-engine'
import { createAIRuntime } from '@/nexus/ai-runtime'
import type { AIRuntime } from '@/nexus/ai-runtime'
import type { GeneratedProposal } from '@/usom/types/process'
import { resolvePathType } from './path-router'
import { formatCNUIFromContext, formatTextSummary } from './query-cnui-formatter'
import { createAISessionManager } from '@/nexus/ai-runtime/session'
import type { QueryResultEntry } from '@/nexus/ai-runtime/session'

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
  generativeResult?: GenerationResult
  queryResult?: QueryResult
}

export interface OrchestratorDeps {
  timeboxRepo: ITimeboxRepository
  eventRepo: ISystemEventRepository
  intentEngine: IntentEngine
  ruleEngine: RuleEngine
  actionSurfaceEngine?: ActionSurfaceEngine
  habitRepo?: IHabitRepository
  habitLogRepo?: IHabitLogRepository
  templateRepo?: IHabitTemplateRepository
  objectiveRepo?: IObjectiveRepository
  keyResultRepo?: IKeyResultRepository
  taskRepo?: ITaskRepository
  projectRepo?: IProjectRepository
  onTrace?: (step: TraceStep) => void
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

function toUSOMSnapshot(snapshot: ContextSnapshot): USOMSnapshot {
  return {
    userId: snapshot.userId,
    activeObjectives: snapshot.activeObjectives,
    activeKeyResults: snapshot.activeKeyResults,
    activeTasks: snapshot.activeTasks,
    pendingHabits: snapshot.pendingHabits,
    currentTimebox: snapshot.currentTimebox,
    upcomingTimeboxes: snapshot.upcomingTimeboxes,
    pendingIntentions: snapshot.pendingIntentions,
    currentTime: snapshot.currentTime,
    currentDate: snapshot.currentDate,
    dayOfWeek: snapshot.dayOfWeek,
    timeOfDay: snapshot.timeOfDay,
    energyState: snapshot.energyState,
    sourceSnapshotId: snapshot.snapshotId,
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

// Intent action → SM action 的动态映射（从各域 manifest 构建）
const ACTION_MAP: Record<string, string> = buildActionMap()

function toStateMachineAction(domainAction: string): string {
  return ACTION_MAP[domainAction] ?? domainAction
}

// 从 targetDomain + action 动态推导 SM targetObject.type（基于 manifest.lifecycle 键）
function getObjectType(intent: StructuredIntent): string {
  return resolveObjectType(intent.targetDomain, intent.action)
}

function buildQueryResultSummary(intent: StructuredIntent, result: QueryResult): QueryResultEntry {
  const surfaceType = result.type === 'cnui' ? result.payload.surfaceType : undefined

  let count = 0
  let objectIds: string[] = []

  if (result.type === 'cnui') {
    const components = result.payload.components ?? []
    for (const comp of components) {
      const items = (comp.props as any)?.items
      if (Array.isArray(items)) {
        count = items.length
        objectIds = items.map((i: any) => i.id).filter(Boolean)
      }
    }
  } else if (result.type === 'text') {
    count = 1
  }

  return {
    action: intent.action,
    domain: intent.targetDomain,
    resultSummary: { count, objectIds, keyMetrics: {} },
    answerText: result.type === 'text' ? result.content : undefined,
    cnuiSurfaceType: surfaceType,
    timestamp: new Date().toISOString(),
  }
}

export function createOrchestrator(deps: OrchestratorDeps) {
  const eventBus = createEventBus()
  const sessionManager = createAISessionManager()
  const timeboxSM = createTimeboxStateMachine({
    timeboxRepo: deps.timeboxRepo as unknown as import('../core/state-machine').StateMachineDeps['timeboxRepo'],
    eventRepo: deps.eventRepo,
  })

  const orchestrator = {
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
        action: toStateMachineAction(intent.action),
        payload: intent.fields,
        approvedAt: new Date().toISOString() as Timestamp,
        approvedBy: 'rule_engine',
      }

      trace(deps.onTrace, 'StateMachine', 'start', { input: { proposal } })
      const smResult = await timeboxSM.execute(proposal, eventBus, userId)
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
        timebox: smResult.object as Timebox | undefined,
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
      const smResult = await timeboxSM.execute(proposal, eventBus, userId)
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
        timebox: smResult.object as Timebox | undefined,
        actionSurface,
        warnings: ruleResult.warnings,
      }
    },

    /** 统一意图执行入口 — 所有域通过此方法处理 */
    async executeIntent(
      intent: StructuredIntent,
      userId: USOM_ID,
      confirmed?: boolean,
    ): Promise<OrchestratorResult> {
      const snapshot = createStubSnapshot(userId)
      const usomSnapshot = toUSOMSnapshot(snapshot)
      const domainId = intent.targetDomain
      const domain = findDomain(domainId)

      // 1. Domain plugin validation
      if (domain) {
        const validation = domain.onValidate(intent, usomSnapshot)
        if (!validation.valid) {
          return { success: false, error: validation.errors.join('; ') }
        }
      }

      // 1.5 路径路由 — 根据 manifest 声明判定路径类型
      const manifestResult = loadDomainManifest(domainId)
      const manifest = manifestResult.success ? manifestResult.manifest : null
      const pathType = intent.pathType ?? resolvePathType(intent.action, manifest)

      if (pathType === 'query') {
        if (!manifest) {
          return { success: false, error: `未找到 Domain manifest: ${domainId}` }
        }
        return orchestrator.executeQueryPath(intent, userId, manifest)
      }

      if (pathType === 'generative' && manifest) {
        const genActionConfig = manifest.generation_actions?.[intent.action]
        if (genActionConfig) {
          return orchestrator.executeGenerativePath(intent, userId, manifest, genActionConfig)
        }
      }

      // pathType === 'contract' — 继续走现有被动型路径（行 421 起不变）

      // 2. RuleEngine 评估（被动型路径）
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

      // 3. 路由到域特定处理
      const action = toStateMachineAction(intent.action)

      // ─── Timebox 域: 使用旧版 SM（保持兼容） ──────────
      if (domainId === 'timebox') {
        const proposal: StateProposal = {
          id: crypto.randomUUID() as USOM_ID,
          intentId: intent.id,
          targetObject: { type: 'timebox' },
          action,
          payload: intent.fields,
          approvedAt: new Date().toISOString() as Timestamp,
          approvedBy: 'rule_engine',
        }

        const smResult = await timeboxSM.execute(proposal, eventBus, userId)
        if (!smResult.success) {
          return { success: false, error: smResult.error }
        }

        // 域插件 onEvent 回调
        if (domain && smResult.event) {
          domain.onEvent(smResult.event, usomSnapshot)
        }

        return {
          success: true,
          timebox: smResult.object as Timebox | undefined,
          warnings: ruleResult.warnings,
        }
      }

      // ─── Habit 域 ────────────────────────────────────
      if (domainId === 'habits') {
        if (!deps.habitRepo) {
          return { success: false, error: 'HabitRepository 未配置' }
        }

        const now = new Date().toISOString() as Timestamp

        if (action === 'create') {
          const transition = getTransitionFromManifest('habits', 'habit', null, 'create')
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
            type: transition.eventType as SystemEventType,
            occurredAt: now,
            triggeredBy: 'state_machine',
            payload: { habitId: habit.id, intentId: intent.id, toStatus: transition.to },
            snapshotId: '' as USOM_ID,
          }
          await deps.eventRepo.append(event, userId)
          eventBus.publish(event)

          return { success: true, habit, warnings: ruleResult.warnings }
        }

        if (action === 'updateHabit') {
          const habitId = intent.fields.habitId as USOM_ID
          const existing = await deps.habitRepo.findById(habitId, userId)
          if (!existing) {
            return { success: false, error: '习惯不存在' }
          }

          const { habitId: _hid, ...updateFields } = intent.fields
          const updated = await deps.habitRepo.update(habitId, updateFields as import('@/usom/interfaces/irepository').UpdateHabitInput, userId)

          const event: SystemEvent = {
            id: crypto.randomUUID() as USOM_ID,
            type: 'habit.updated' as SystemEventType,
            occurredAt: now,
            triggeredBy: 'state_machine',
            payload: { habitId, intentId: intent.id },
            snapshotId: '' as USOM_ID,
          }
          await deps.eventRepo.append(event, userId)
          eventBus.publish(event)

          return { success: true, habit: updated, warnings: ruleResult.warnings }
        }

        if (action === 'logHabit') {
          if (!deps.habitLogRepo) {
            return { success: false, error: 'HabitLogRepository 未配置' }
          }

          const habitId = intent.fields.habitId as USOM_ID
          const existing = await deps.habitRepo.findById(habitId, userId)
          if (!existing) {
            return { success: false, error: '习惯不存在' }
          }

          const today = now.slice(0, 10) as import('@/usom/types/primitives').DateOnly
          const existingLog = await deps.habitLogRepo.findByHabitAndDate(habitId, today, userId)
          if (existingLog) {
            return { success: false, error: '今日已打卡' }
          }

          const logId = crypto.randomUUID() as USOM_ID
          const habitLog: import('@/usom/types/objects').HabitLog = {
            id: logId,
            habitId,
            date: today,
            completionStatus: 'completed',
            actualDuration: intent.fields.actualDuration as number | undefined,
            plannedDuration: existing.defaultDuration,
            completionRating: intent.fields.completionRating as number | undefined,
            energyLevel: intent.fields.energyLevel as number | undefined,
            note: intent.fields.note as string | undefined,
            loggedAt: now,
            source: 'manual',
          }

          await deps.habitLogRepo.save(habitLog, userId)

          // 重新计算 streak 指标
          await orchestrator.recalculateHabitMetrics(habitId, userId)
          const updatedHabit = await deps.habitRepo.findById(habitId, userId)

          const event: SystemEvent = {
            id: crypto.randomUUID() as USOM_ID,
            type: 'HabitLogged' as SystemEventType,
            occurredAt: now,
            triggeredBy: 'state_machine',
            payload: {
              habitId,
              intentId: intent.id,
              streak: updatedHabit?.streak ?? existing.streak,
              title: existing.title,
              trackable: existing.trackable,
              logId,
            },
            snapshotId: '' as USOM_ID,
          }
          await deps.eventRepo.append(event, userId)
          eventBus.publish(event)

          return { success: true, habit: updatedHabit ?? undefined, warnings: ruleResult.warnings }
        }

        // 状态转换（activate/suspend/reactivate/archive）
        const habitId = intent.fields.habitId as USOM_ID
        const existing = await deps.habitRepo.findById(habitId, userId)
        if (!existing) {
          return { success: false, error: '习惯不存在' }
        }

        const transition = getTransitionFromManifest('habits', 'habit', existing.status, action)
        if (!transition) {
          return { success: false, error: `非法状态转换: action="${action}", fromState="${existing.status}"` }
        }

        const updated = await deps.habitRepo.updateStatus(habitId, transition.to as HabitStatus, userId)
        const event: SystemEvent = {
          id: crypto.randomUUID() as USOM_ID,
          type: transition.eventType as SystemEventType,
          occurredAt: now,
          triggeredBy: 'state_machine',
          payload: { habitId, intentId: intent.id, fromStatus: existing.status, toStatus: transition.to },
          snapshotId: '' as USOM_ID,
        }
        await deps.eventRepo.append(event, userId)
        eventBus.publish(event)

        return { success: true, habit: updated, warnings: ruleResult.warnings }
      }

      // ─── OKR 域 ──────────────────────────────────────
      if (domainId === 'okrs') {
        if (!deps.objectiveRepo || !deps.keyResultRepo) {
          return { success: false, error: 'ObjectiveRepository 或 KeyResultRepository 未配置' }
        }

        const now = new Date().toISOString() as Timestamp
        const target = getObjectType(intent)

        if (target === 'objective') {
          if (action === 'create') {
            const transition = getTransitionFromManifest('okrs', 'objective', null, 'create')
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
              type: transition.eventType as SystemEventType,
              occurredAt: now,
              triggeredBy: 'state_machine',
              payload: { objectiveId: objId, title: objective.title, toStatus: 'draft' },
              snapshotId: '' as USOM_ID,
            }
            await deps.eventRepo.append(event, userId)
            eventBus.publish(event)

            return { success: true, warnings: ruleResult.warnings }
          }

          // 非创建路径
          const objectiveId = intent.fields.objectiveId as USOM_ID
          const existing = await deps.objectiveRepo.findById(objectiveId, userId)
          if (!existing) {
            return { success: false, error: '目标不存在' }
          }

          const transition = getTransitionFromManifest('okrs', 'objective', existing.status, action)
          if (!transition) {
            return { success: false, error: `非法状态转换: action="${action}", fromState="${existing.status}"` }
          }

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

          const updated: Objective = {
            ...existing,
            status: transition.to as ObjectiveStatus,
            updatedAt: now,
            ...(transition.to === 'discarded' ? { discardedAt: now } : {}),
            ...(transition.to === 'completed' ? { completedAt: now } : {}),
            ...(transition.to === 'archived' ? { archivedAt: now } : {}),
          }
          await deps.objectiveRepo.save(updated, userId)

          // KR 联动
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
            type: transition.eventType as SystemEventType,
            occurredAt: now,
            triggeredBy: 'state_machine',
            payload: { objectiveId, title: existing.title, fromStatus: existing.status, toStatus: transition.to as string },
            snapshotId: '' as USOM_ID,
          }
          await deps.eventRepo.append(event, userId)
          eventBus.publish(event)

          return { success: true, warnings: ruleResult.warnings }
        }

        // KeyResult 操作
        if (target === 'key_result') {
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
      }

      // ─── Tasks 域 ──────────────────────────────────────
      if (domainId === 'tasks') {
        if (!deps.taskRepo) {
          return { success: false, error: 'TaskRepository 未配置' }
        }

        const now = new Date().toISOString() as Timestamp
        const isProjectAction = intent.action.toLowerCase().includes('project')

        if (isProjectAction) {
          // Project 操作
          if (!deps.projectRepo) {
            return { success: false, error: 'ProjectRepository 未配置' }
          }

          if (action === 'create') {
            const transition = getTransitionFromManifest('tasks', 'project', null, 'create')
            if (!transition) {
              return { success: false, error: '非法状态转换: 项目创建失败' }
            }

            const project = await deps.projectRepo.create(
              {
                name: intent.fields.name as string,
                description: intent.fields.description as string | undefined,
                priority: intent.fields.priority as import('@/usom/types/primitives').Priority | undefined,
                startDate: intent.fields.startDate as import('@/usom/types/primitives').DateOnly | undefined,
                endDate: intent.fields.endDate as import('@/usom/types/primitives').DateOnly | undefined,
                color: intent.fields.color as string | undefined,
              },
              userId,
            )

            const event: SystemEvent = {
              id: crypto.randomUUID() as USOM_ID,
              type: transition.eventType as SystemEventType,
              occurredAt: now,
              triggeredBy: 'state_machine',
              payload: { projectId: project.id, name: project.name, toStatus: transition.to },
              snapshotId: '' as USOM_ID,
            }
            await deps.eventRepo.append(event, userId)
            eventBus.publish(event)

            return { success: true, warnings: ruleResult.warnings }
          }

          // 非 create: 状态转换
          const projectId = intent.fields.projectId as USOM_ID
          const existing = await deps.projectRepo.findById(projectId, userId)
          if (!existing) {
            return { success: false, error: '项目不存在' }
          }

          const transition = getTransitionFromManifest('tasks', 'project', existing.status, action)
          if (!transition) {
            return { success: false, error: `非法状态转换: action="${action}", fromState="${existing.status}"` }
          }

          await deps.projectRepo.updateStatus(projectId, transition.to as ProjectStatus, userId)
          const event: SystemEvent = {
            id: crypto.randomUUID() as USOM_ID,
            type: transition.eventType as SystemEventType,
            occurredAt: now,
            triggeredBy: 'state_machine',
            payload: { projectId, name: existing.name, fromStatus: existing.status, toStatus: transition.to },
            snapshotId: '' as USOM_ID,
          }
          await deps.eventRepo.append(event, userId)
          eventBus.publish(event)

          return { success: true, warnings: ruleResult.warnings }
        }

        // Task 操作
        if (action === 'create') {
          const transition = getTransitionFromManifest('tasks', 'task', null, 'create')
          if (!transition) {
            return { success: false, error: '非法状态转换: 任务创建失败' }
          }

          const tasks = await deps.taskRepo.bulkCreate([{
            title: intent.fields.title as string,
            description: intent.fields.description as string | undefined,
            priority: (intent.fields.priority ?? 'medium') as import('@/usom/types/primitives').Priority,
            energyRequired: (intent.fields.energyRequired ?? 'medium') as import('@/usom/types/primitives').EnergyLevel,
            estimatedDuration: (intent.fields.estimatedDuration ?? 60) as number,
            projectId: intent.fields.projectId as USOM_ID | undefined,
            parentId: intent.fields.parentId as USOM_ID | undefined,
            frequencyType: intent.fields.frequencyType as 'once' | 'daily' | 'weekly' | 'custom' | undefined,
            daysOfWeek: intent.fields.daysOfWeek as number[] | undefined,
            startDate: intent.fields.startDate as import('@/usom/types/primitives').DateOnly | undefined,
            endDate: intent.fields.endDate as import('@/usom/types/primitives').DateOnly | undefined,
          }], userId)

          const created = tasks[0]
          if (!created) {
            return { success: false, error: '任务创建失败' }
          }

          const event: SystemEvent = {
            id: crypto.randomUUID() as USOM_ID,
            type: transition.eventType as SystemEventType,
            occurredAt: now,
            triggeredBy: 'state_machine',
            payload: { taskId: created.id, title: created.title, toStatus: transition.to as string },
            snapshotId: '' as USOM_ID,
          }
          await deps.eventRepo.append(event, userId)
          eventBus.publish(event)

          return { success: true, warnings: ruleResult.warnings }
        }

        // 非 create: 状态转换
        const taskId = intent.fields.taskId as USOM_ID
        const existing = await deps.taskRepo.findById(taskId, userId)
        if (!existing) {
          return { success: false, error: '任务不存在' }
        }

        const transition = getTransitionFromManifest('tasks', 'task', existing.status, action)
        if (!transition) {
          return { success: false, error: `非法状态转换: action="${action}", fromState="${existing.status}"` }
        }

        await deps.taskRepo.updateStatus(taskId, transition.to as TaskStatus, userId)
        const event: SystemEvent = {
          id: crypto.randomUUID() as USOM_ID,
          type: transition.eventType as SystemEventType,
          occurredAt: now,
          triggeredBy: 'state_machine',
          payload: { taskId, title: existing.title, fromStatus: existing.status, toStatus: transition.to },
          snapshotId: '' as USOM_ID,
        }
        await deps.eventRepo.append(event, userId)
        eventBus.publish(event)

        return { success: true, warnings: ruleResult.warnings }
      }

      return { success: false, error: `未知的域: ${domainId}` }
    },

    /** 生成型路径 — 从 executeIntent 提取的独立方法 */
    async executeGenerativePath(
      intent: StructuredIntent,
      userId: USOM_ID,
      manifest: import('@/domains/manifest-loader/schema').DomainManifest,
      _actionConfig: unknown,
    ): Promise<OrchestratorResult> {
      try {
        // ContextEngine 组装
        const ceStart = Date.now()
        trace(deps.onTrace, 'ContextEngine', 'start', { input: { intentId: intent.id, action: intent.action } })

        const generationRequest = await assembleContext(intent, manifest) as GenerationRequest

        trace(deps.onTrace, 'ContextEngine', 'end', {
          input: { intentId: intent.id },
          output: { contextCount: Object.keys(generationRequest.contexts).length, durationMs: Date.now() - ceStart },
        })

        // 发送 GenerativeContextAssembled 事件
        const ctxEvent: SystemEvent = {
          id: crypto.randomUUID() as USOM_ID,
          type: 'GenerativeContextAssembled',
          occurredAt: new Date().toISOString() as Timestamp,
          triggeredBy: 'context_engine',
          payload: { intentId: intent.id, contextCount: Object.keys(generationRequest.contexts).length, durationMs: Date.now() - ceStart },
          snapshotId: '' as USOM_ID,
        }
        await deps.eventRepo.append(ctxEvent, userId)
        eventBus.publish(ctxEvent)

        // Handler 执行
        const hStart = Date.now()
        trace(deps.onTrace, 'Handler', 'start', { input: { intentId: intent.id } })

        const handler = await findHandler(intent.targetDomain, intent.action)
        if (!handler) {
          return { success: false, error: `生成型路径未找到 Handler: ${intent.targetDomain}/${intent.action}` }
        }

        let generativeResult: GenerationResult
        if (handler.onGenerate) {
          const aiRuntime: AIRuntime = createAIRuntime()
          generativeResult = await handler.onGenerate(generationRequest, aiRuntime)
        } else {
          generativeResult = await handler.handle(generationRequest)
        }

        trace(deps.onTrace, 'Handler', 'end', {
          input: { intentId: intent.id },
          output: { proposalCount: generativeResult.proposalSet.proposals.length, durationMs: Date.now() - hStart },
        })

        // 发送 GenerativeHandlerCompleted 事件
        const handlerEvent: SystemEvent = {
          id: crypto.randomUUID() as USOM_ID,
          type: 'GenerativeHandlerCompleted',
          occurredAt: new Date().toISOString() as Timestamp,
          triggeredBy: 'handler',
          payload: {
            intentId: intent.id,
            proposalCount: generativeResult.proposalSet.proposals.length,
            durationMs: Date.now() - hStart,
          },
          snapshotId: '' as USOM_ID,
        }
        await deps.eventRepo.append(handlerEvent, userId)
        eventBus.publish(handlerEvent)

        return {
          success: true,
          generativeResult,
          warnings: generativeResult.warnings?.map(w => w.message),
        }
      } catch (err) {
        const errorEvent: SystemEvent = {
          id: crypto.randomUUID() as USOM_ID,
          type: 'GenerativeHandlerCompleted',
          occurredAt: new Date().toISOString() as Timestamp,
          triggeredBy: 'handler',
          payload: {
            intentId: intent.id,
            failedAt: 'Handler.handle',
            completedSteps: ['ContextEngine'],
            error: err instanceof Error ? err.message : String(err),
          },
          snapshotId: '' as USOM_ID,
        }
        await deps.eventRepo.append(errorEvent, userId)

        return {
          success: false,
          error: `生成型路径执行失败: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    },

    /** Query Path — Shortcut/Handler 双轨查询 */
    async executeQueryPath(
      intent: StructuredIntent,
      userId: USOM_ID,
      manifest: import('@/domains/manifest-loader/schema').DomainManifest,
    ): Promise<OrchestratorResult> {
      const actionConfig = manifest.query_actions?.[intent.action]
      if (!actionConfig) {
        return { success: false, error: `未找到 query_action: ${intent.action}` }
      }

      // Session 管理：复用同一 Domain 的 active Session
      let session = sessionManager.findActiveSessionByDomain(userId as string, intent.targetDomain)
      if (!session) {
        session = await sessionManager.create({ domainId: intent.targetDomain, action: intent.action, userId: userId as string })
        session = await sessionManager.activate(session.id)
      }

      // Context Engine 组装查询上下文
      trace(deps.onTrace, 'ContextEngine', 'start', { input: { intentId: intent.id } })
      const queryContext = await assembleContext(intent, manifest, session) as QueryContext
      trace(deps.onTrace, 'ContextEngine', 'end', {
        input: { intentId: intent.id },
        output: { contextCount: Object.keys(queryContext.contexts).length },
      })

      // 判定子路径
      let result: QueryResult
      const handler = await findHandler(intent.targetDomain, intent.action)

      if (handler?.onQuery) {
        // Handler Path（复杂分析型查询）
        trace(deps.onTrace, 'Handler', 'start', { input: { intentId: intent.id, subPath: 'handler' } })
        const aiRuntime: AIRuntime = createAIRuntime()
        result = await handler.onQuery(queryContext, aiRuntime)
        trace(deps.onTrace, 'Handler', 'end', { input: { intentId: intent.id }, output: { type: result.type } })
      } else if (actionConfig.response_mode === 'cnui') {
        // Shortcut Path（简单展示型查询）
        result = formatCNUIFromContext(queryContext, actionConfig)
      } else {
        // 降级：文本摘要
        result = { type: 'text', content: formatTextSummary(queryContext) }
      }

      // 记录查询摘要到 Session
      const summary = buildQueryResultSummary(intent, result)
      sessionManager.recordQueryResult(session.id, summary)

      return { success: true, queryResult: result }
    },

    /** 生成型方案确认：将已接受的 proposals 转换为批量 intent 并执行 */
    async executeGenerativeConfirmation(
      intentId: USOM_ID,
      acceptedProposals: GeneratedProposal[],
      userId: USOM_ID,
    ): Promise<{ success: boolean; results: OrchestratorResult[]; error?: string }> {
      const results: OrchestratorResult[] = []

      // 发送 GenerativeUserConfirmed 事件
      const confirmEvent: SystemEvent = {
        id: crypto.randomUUID() as USOM_ID,
        type: 'GenerativeUserConfirmed',
        occurredAt: new Date().toISOString() as Timestamp,
        triggeredBy: 'handler',
        payload: { intentId, acceptedProposalIds: acceptedProposals.map(p => p.id) },
        snapshotId: '' as USOM_ID,
      }
      await deps.eventRepo.append(confirmEvent, userId)
      eventBus.publish(confirmEvent)

      // 二次验证
      trace(deps.onTrace, 'Handler', 'start', { input: { phase: 'SecondValidation', proposalCount: acceptedProposals.length } })
      const proposalSet = { id: crypto.randomUUID(), label: 'confirmation', proposals: acceptedProposals, tags: [] }
      const validationResults = evaluateProposals({ proposalSet } as any)
      const rejected = validationResults.filter(r => r.status === 'reject')
      if (rejected.length > 0) {
        // 记录被拒绝的事件
        for (const r of rejected) {
          const rejectEvent: SystemEvent = {
            id: crypto.randomUUID() as USOM_ID,
            type: 'GenerativeProposalRejected',
            occurredAt: new Date().toISOString() as Timestamp,
            triggeredBy: 'handler',
            payload: { intentId, proposalId: r.proposalId, reasons: r.reasons },
            snapshotId: '' as USOM_ID,
          }
          await deps.eventRepo.append(rejectEvent, userId)
        }
      }
      trace(deps.onTrace, 'Handler', 'end', { input: { phase: 'SecondValidation' }, output: { rejectedCount: rejected.length } })

      // 批量执行：将每个 proposal 转为 StructuredIntent 并走 Reactive Path
      const executable = acceptedProposals.filter(
        p => !rejected.find(r => r.proposalId === p.id),
      )

      for (const proposal of executable) {
        const batchIntent: StructuredIntent = {
          id: crypto.randomUUID() as USOM_ID,
          intentionId: intentId,
          targetDomain: 'timebox',
          action: 'createTimebox',
          fields: {
            ...proposal.payload,
            sourceProposalId: proposal.id,
          },
          confidence: 1.0,
          resolvedBy: 'template_form',
          createdAt: new Date().toISOString() as Timestamp,
        }

        const result = await orchestrator.executeIntent(batchIntent, userId)
        results.push(result)
      }

      // 发送 GenerativeBatchExecuted 事件
      const batchEvent: SystemEvent = {
        id: crypto.randomUUID() as USOM_ID,
        type: 'GenerativeBatchExecuted',
        occurredAt: new Date().toISOString() as Timestamp,
        triggeredBy: 'handler',
        payload: {
          intentId,
          totalProposals: acceptedProposals.length,
          executedCount: executable.length,
          rejectedCount: rejected.length,
          successCount: results.filter(r => r.success).length,
        },
        snapshotId: '' as USOM_ID,
      }
      await deps.eventRepo.append(batchEvent, userId)
      eventBus.publish(batchEvent)

      return {
        success: results.every(r => r.success),
        results,
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

      const dayStart = `${date}T00:00:00+08:00` as Timestamp
      const dayEnd = `${date}T23:59:59+08:00` as Timestamp
      const existingTimeboxes = await deps.timeboxRepo.findByDateRange(dayStart, dayEnd, userId)

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

        const startTime = item.timeOverride ?? habit.defaultTime
        const duration = item.durationOverride ?? habit.defaultDuration

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
          payload: { timeboxId, templateId, habitId: habit.id, date },
          snapshotId: '' as USOM_ID,
        }

        await deps.eventRepo.append(event, userId)
        eventBus.publish(event)

        generated.push(timebox)
      }

      return { success: true, generatedTimeboxes: generated }
    },
  }

  return orchestrator
}
