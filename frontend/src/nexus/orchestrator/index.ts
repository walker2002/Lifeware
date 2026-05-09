// Orchestrator — Nexus 管道协调器
// 统一入口，按顺序协调: IntentEngine → RuleEngine → StateMachine → EventBus → ActionSurfaceEngine

import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import type { Timebox } from '@/usom/types/objects'
import type {
  StateProposal,
  SystemEvent,
  ActionSurface,
  ContextSnapshot,
} from '@/usom/types/process'
import type { StructuredIntent } from '@/usom/types/objects'
import type { ITimeboxRepository, ISystemEventRepository } from '@/usom/interfaces/irepository'
import type { TraceStep, TraceComponent, TracePhase } from '@/nexus/infrastructure/trace-logger/trace-types'
import { createTimeboxStateMachine } from '../core/state-machine'
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

export interface OrchestratorResult {
  success: boolean
  timebox?: Timebox
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
  }
}
