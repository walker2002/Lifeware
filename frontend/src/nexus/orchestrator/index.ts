/**
 * @file index
 * @brief Nexus 管道协调器
 * 
 * 统一入口，按顺序协调: IntentEngine → RuleEngine → StateMachine → EventBus → ActionSurfaceEngine
 * 所有域通过 executeIntent() 统一入口
 * 
 * @see docs/usom-design.md Section 4.2
 */

import type { USOM_ID, Timestamp, USOMObjectType } from '@/usom/types/primitives'
import type {
  StateProposal,
  SystemEvent,
  ActionSurface,
  ContextSnapshot,
  GenerationResult,
  GenerationRequest,
  QueryResult,
  QueryContext,
} from '@/usom/types/process'
import type { StructuredIntent } from '@/usom/types/objects'
import type {
  ISystemEventRepository,
} from '@/usom/interfaces/irepository'
import type { TraceStep, TraceComponent, TracePhase } from '@/nexus/infrastructure/trace-logger/trace-types'
import type { GenericRepo } from '@/nexus/core/state-machine'
import type { USOMSnapshot } from '@/usom/types/process'
import { createGenericStateMachine } from '../core/state-machine'
import { createEventBus } from '../infrastructure/event-bus'
import { findDomain, findHandler } from '@/domains/registry'
import { buildActionMap, resolveObjectType, getLifecycleFromManifest } from './lifecycle-configs'
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

/**
 * 意图引擎接口
 * 负责解析用户自然语言输入为结构化意图
 */
interface IntentEngine {
  /**
   * 解析用户输入
   * @param rawInput - 用户原始输入文本
   * @param userId - 用户ID
   * @returns 结构化意图对象
   */
  parse(rawInput: string, userId: USOM_ID): Promise<StructuredIntent>
}

/**
 * 规则引擎接口
 * 负责评估意图的合法性和风险
 */
interface RuleEngine {
  /**
   * 评估意图
   * @param intent - 结构化意图
   * @param snapshot - 上下文快照
   * @returns 评估结果（通过/警告/需确认）
   */
  evaluate(
    intent: StructuredIntent,
    snapshot: ContextSnapshot,
  ): Promise<{
    result: 'pass' | 'warning' | 'confirm'
    warnings?: string[]
    confirmations?: string[]
  }>
}

/**
 * 动作表面引擎接口
 * 负责生成用户界面上的推荐操作
 */
interface ActionSurfaceEngine {
  /**
   * 生成动作表面
   * @param snapshot - 上下文快照
   * @param event - 系统事件（可选）
   * @param userId - 用户ID（可选）
   * @returns 动作表面对象
   */
  generate(snapshot: ContextSnapshot, event?: SystemEvent, userId?: USOM_ID): Promise<ActionSurface>
}

/**
 * 协调器执行结果接口
 * @property success - 是否成功
 * @property object - 通用 SM 路径返回的对象（Record 形式）
 * @property objectType - 通用 SM 路径返回的对象类型
 * @property actionSurface - 动作表面
 * @property error - 错误信息
 * @property warnings - 警告信息列表
 * @property needsConfirmation - 是否需要确认
 * @property confirmationMessage - 确认消息
 * @property generativeResult - 生成式结果
 * @property queryResult - 查询结果
 */
export interface OrchestratorResult {
  success: boolean
  /** 通用 SM 路径返回的对象（Record 形式） */
  object?: Record<string, unknown>
  /** 通用 SM 路径返回的对象类型 */
  objectType?: string
  actionSurface?: ActionSurface
  error?: string
  warnings?: string[]
  needsConfirmation?: boolean
  confirmationMessage?: string
  generativeResult?: GenerationResult
  queryResult?: QueryResult
}

/**
 * 协调器依赖接口
 * @property eventRepo - 系统事件仓储
 * @property intentEngine - 意图引擎
 * @property ruleEngine - 规则引擎
 * @property actionSurfaceEngine - 动作表面引擎（可选）
 * @property getRepo - 通用仓储获取工厂
 * @property onTrace - 追踪回调函数（可选）
 */
export interface OrchestratorDeps {
  eventRepo: ISystemEventRepository
  intentEngine: IntentEngine
  ruleEngine: RuleEngine
  actionSurfaceEngine?: ActionSurfaceEngine
  /** 通用仓储获取工厂 */
  getRepo: (domainId: string, objectType: string) => GenericRepo
  onTrace?: (step: TraceStep) => void
}

/**
 * 创建存根上下文快照
 * @param userId - 用户ID
 * @returns 上下文快照对象
 */
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

/**
 * 将上下文快照转换为 USOM 快照格式
 * @param snapshot - 上下文快照
 * @returns USOM 快照对象
 */
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

/**
 * 追踪函数，记录执行步骤
 * @param onTrace - 追踪回调函数
 * @param component - 组件名称
 * @param phase - 阶段（开始/结束）
 * @param data - 输入输出数据
 */
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

/**
 * 将域动作转换为状态机动作
 * @param domainAction - 域动作名称
 * @returns 状态机动作名称
 */
function toStateMachineAction(domainAction: string): string {
  // AI 可能返回 "tasks.createThread" 格式（与 routing prompt 一致），
  // 需剥离 domain 前缀后再查 ACTION_MAP
  const bareAction = domainAction.includes('.')
    ? domainAction.split('.').pop()!
    : domainAction
  return ACTION_MAP[bareAction] ?? ACTION_MAP[domainAction] ?? bareAction
}

// 从 targetDomain + action 动态推导 SM targetObject.type（基于 manifest.lifecycle 键）
/**
 * 从意图推导目标对象类型
 * @param intent - 结构化意图
 * @returns 对象类型名称
 */
function getObjectType(intent: StructuredIntent): string {
  return resolveObjectType(intent.targetDomain, intent.action)
}

/**
 * 从意图字段提取目标对象 ID（基于命名约定，无域特定知识）
 * 查找顺序：objectId → {camelCase objectType}Id
 * @param fields - 意图字段
 * @param objectType - 对象类型（如 'habit', 'key_result'）
 * @returns 对象 ID，未找到返回 undefined
 */
function resolveObjectId(fields: Record<string, unknown>, objectType: string): USOM_ID | undefined {
  const camelType = objectType.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  return (fields.objectId ?? fields[`${camelType}Id`]) as USOM_ID | undefined
}

/**
 * 构建查询结果摘要
 * @param intent - 结构化意图
 * @param result - 查询结果
 * @returns 查询结果条目
 */
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

/**
 * 创建协调器实例
 * @param deps - 依赖项对象
 * @returns 协调器实例
 */
export function createOrchestrator(deps: OrchestratorDeps) {
  const eventBus = createEventBus()
  const sessionManager = createAISessionManager()

  const orchestrator = {
    eventBus,

    /**
     * 通过自然语言输入执行 Nexus 管道（创建路径）
     * @param rawInput - 用户自然语言输入
     * @param userId - 用户ID
     * @param confirmed - 是否已确认（用于二次确认场景）
     * @returns 协调器执行结果
     */
    async execute(rawInput: string, userId: USOM_ID, confirmed?: boolean): Promise<OrchestratorResult> {
      trace(deps.onTrace, 'IntentEngine', 'start', { input: { rawInput } })
      const intent = await deps.intentEngine.parse(rawInput, userId)
      trace(deps.onTrace, 'IntentEngine', 'end', { input: { rawInput }, output: { intent } })

      // 委托给 executeIntent（统一走通用 SM 路径）
      const result = await orchestrator.executeIntent(intent, userId, confirmed)

      // ActionSurface 生成（executeIntent 不处理，由 execute 补充）
      if (result.success) {
        const snapshot = createStubSnapshot(userId)
        trace(deps.onTrace, 'ActionSurfaceEngine', 'start', { input: { snapshot } })
        if (deps.actionSurfaceEngine) {
          result.actionSurface = await deps.actionSurfaceEngine.generate(snapshot, undefined, userId)
        }
        trace(deps.onTrace, 'ActionSurfaceEngine', 'end', { input: { snapshot }, output: { actionSurface: result.actionSurface } })
      }

      return result
    },

    /**
     * 直接执行状态转换（非创建路径：start/end/cancel/log/overtime）
     *
     * NOTE: 当前仅服务 timebox 域（targetDomain 硬编码为 'timebox'）。
     * 其他域如有类似需求，应扩展参数签名或走 executeIntent。
     *
     * @param objectId - 对象ID
     * @param action - 动作类型
     * @param userId - 用户ID
     * @param payload - 附加负载数据
     * @param confirmed - 是否已确认（用于二次确认场景）
     * @returns 协调器执行结果
     */
    async executeTransition(
      objectId: USOM_ID,
      action: string,
      userId: USOM_ID,
      payload: Record<string, unknown> = {},
      confirmed?: boolean,
    ): Promise<OrchestratorResult> {
      // 构造 stub intent 并委托给 executeIntent（统一走通用 SM 路径）
      const stubIntent: StructuredIntent = {
        id: crypto.randomUUID() as USOM_ID,
        intentionId: '' as USOM_ID,
        targetDomain: 'timebox',
        action: action + '_timebox',
        fields: { objectId, ...payload },
        confidence: 1.0,
        resolvedBy: 'template_form',
        pathType: 'contract',
        createdAt: new Date().toISOString() as Timestamp,
      }

      const result = await orchestrator.executeIntent(stubIntent, userId, confirmed)

      return result
    },

    /**
     * 统一意图执行入口 — 所有域通过此方法处理
     * @param intent - 结构化意图对象
     * @param userId - 用户ID
     * @param confirmed - 是否已确认（用于二次确认场景）
     * @returns 协调器执行结果
     */
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
        const validation = await domain.onValidate(intent, usomSnapshot)
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

      // 3. 路由到通用 SM 处理
      const action = toStateMachineAction(intent.action)

      // ─── 通用 SM 路径（contract path — 所有已迁移的域） ──────
      // 块作用域隔离 smObjectType/repo 等局部变量，避免与外层冲突
      {
        const smObjectType = getObjectType(intent)
        const repo = deps.getRepo(domainId, smObjectType)

        // 复用上方已加载的 manifest，提取 cascade 规则
        const cascadeRules = manifestResult.success
          ? (manifestResult.manifest.cascade_rules?.filter((r: any) => r.type === 'parent_child_status') ?? [])
          : []

        const sm = createGenericStateMachine({
          getRepository: () => repo,
          eventRepo: deps.eventRepo,
          getLifecycle: (dId, objType) => {
            const lc = getLifecycleFromManifest(dId, objType)
            if (!lc) throw new Error(`未找到 lifecycle: ${dId}/${objType}`)
            return lc
          },
          domainId,
          getCascadeRules: cascadeRules.length > 0 ? () => cascadeRules as any : undefined,
        })

        const proposal: StateProposal = {
          id: crypto.randomUUID() as USOM_ID,
          intentId: intent.id,
          targetObject: {
            type: smObjectType as USOMObjectType,
            id: resolveObjectId(intent.fields, smObjectType),
          },
          action,
          payload: intent.fields,
          approvedAt: new Date().toISOString() as Timestamp,
          approvedBy: 'rule_engine',
        }

        const smResult = await sm.execute(proposal, eventBus, userId)

        if (!smResult.success) {
          return { success: false, error: smResult.error }
        }

        if (domain && smResult.event) {
          await domain.onEvent(smResult.event, usomSnapshot)
        }

        return {
          success: true,
          object: smResult.object,
          objectType: smObjectType,
          warnings: ruleResult.warnings,
        }
      }
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

  }

  return orchestrator
}
