// Orchestrator — Nexus 管道协调器
// 统一入口，按顺序协调: IntentEngine → RuleEngine → StateMachine → EventBus → ActionSurfaceEngine
// MVP 阶段: 仅接线已有组件，未实现的组件使用 stub 接口

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

// ─── Stub 接口（未实现的组件）──────────────────────────────────

/** 意图引擎 — 将原始输入解析为 StructuredIntent */
interface IntentEngine {
  parse(rawInput: string, userId: USOM_ID): Promise<StructuredIntent>
}

/** 规则引擎 — 校验意图，返回通过/警告/需确认 */
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

/** 动作面引擎 — 生成 ActionSurface */
interface ActionSurfaceEngine {
  generate(snapshot: ContextSnapshot, event?: SystemEvent, userId?: USOM_ID): Promise<ActionSurface>
}

// ─── 结果类型 ─────────────────────────────────────────────────

/** Orchestrator 执行结果 */
export interface OrchestratorResult {
  success: boolean
  /** 状态机产出的 Timebox 对象 */
  timebox?: Timebox
  /** 动作面（Phase 2） */
  actionSurface?: ActionSurface
  /** 失败时的错误信息 */
  error?: string
  /** 规则引擎的警告列表 */
  warnings?: string[]
  /** 是否需要用户确认 */
  needsConfirmation?: boolean
  /** 确认提示消息 */
  confirmationMessage?: string
}

// ─── 依赖接口 ─────────────────────────────────────────────────

export interface OrchestratorDeps {
  timeboxRepo: ITimeboxRepository
  eventRepo: ISystemEventRepository
  intentEngine: IntentEngine
  ruleEngine: RuleEngine
  /** 可选，MVP 阶段不实现 */
  actionSurfaceEngine?: ActionSurfaceEngine
  /** 可选，追踪日志回调（注入 TraceLogger） */
  onTrace?: (step: TraceStep) => void
}

// ─── 动作映射 ─────────────────────────────────────────────────

/** 意图引擎的领域动作 → 状态机生命周期动作 */
function toLifecycleAction(domainAction: string): string {
  const map: Record<string, string> = {
    create_timebox: 'create',
    start_timebox: 'start',
    pause_timebox: 'pause',
    resume_timebox: 'resume',
    end_timebox: 'end',
    log_timebox: 'log',
  }
  return map[domainAction] ?? domainAction
}

// ─── Stub 工具函数 ─────────────────────────────────────────────

/** 创建最小化的 ContextSnapshot（MVP 临时占位） */
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

// ─── 追踪辅助 ─────────────────────────────────────────────────

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

// ─── 工厂函数 ─────────────────────────────────────────────────

export function createOrchestrator(deps: OrchestratorDeps) {
  const eventBus = createEventBus()
  const stateMachine = createTimeboxStateMachine({
    timeboxRepo: deps.timeboxRepo,
    eventRepo: deps.eventRepo,
  })

  return {
    /** 暴露 eventBus 供外部注册订阅 */
    eventBus,

    /**
     * 执行 Nexus 管道
     */
    async execute(rawInput: string, userId: USOM_ID, confirmed?: boolean): Promise<OrchestratorResult> {
      // Step 1: 解析意图
      trace(deps.onTrace, 'IntentEngine', 'start', { input: { rawInput } })
      const intent = await deps.intentEngine.parse(rawInput, userId)
      trace(deps.onTrace, 'IntentEngine', 'end', { input: { rawInput }, output: { intent } })

      // Step 2: 构造最小快照（MVP 占位）
      const snapshot = createStubSnapshot(userId)

      // Step 3: 规则评估
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

      // Step 4: 从 StructuredIntent 创建 StateProposal
      const proposal: StateProposal = {
        id: crypto.randomUUID() as USOM_ID,
        intentId: intent.id,
        targetObject: { type: 'timebox' },
        action: toLifecycleAction(intent.action),
        payload: intent.fields,
        approvedAt: new Date().toISOString() as Timestamp,
        approvedBy: 'rule_engine',
      }

      // Step 5: 执行状态机
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

      // Step 6: 生成 ActionSurface
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
