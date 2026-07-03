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
  ValidationResult,
} from '@/usom/types/process'
import type { StructuredIntent } from '@/usom/types/objects'
import type { Task } from '@/usom/types/objects'
import type {
  ISystemEventRepository,
} from '@/usom/interfaces/irepository'
import type { TraceStep, TraceComponent, TracePhase } from '@/nexus/infrastructure/trace-logger/trace-types'
import type { GenericRepo } from '@/nexus/core/state-machine'
import type { USOMSnapshot } from '@/usom/types/process'
import { createGenericStateMachine } from '@/nexus/core/state-machine'
import { createEventBus } from '../infrastructure/event-bus'
import { findDomain, findHandler, domainRegistry } from '@/domains/registry'
import { buildActionMap, resolveObjectType, getLifecycleFromManifest } from './lifecycle-configs'
import { assembleContext } from '@/nexus/context-engine'
import { ensureProvidersRegistered } from '@/nexus/context-engine/register-providers'
import { loadDomainManifest } from '@/domains/manifest-loader'
import { evaluateProposals } from '@/nexus/core/rule-engine'
import { createAIRuntime } from '@/nexus/ai-runtime'
import type { AIRuntime } from '@/nexus/ai-runtime'
import type { GeneratedProposal } from '@/usom/types/process'
import { resolvePathType } from './path-router'
import { formatCNUIFromContext, formatTextSummary } from './query-cnui-formatter'
import { createAISessionManager } from '@/nexus/ai-runtime/session'
import type { QueryResultEntry } from '@/nexus/ai-runtime/session'
import { TaskRepository } from '@/domains/tasks/repository/task'
import { ThreadRepository } from '@/domains/tasks/repository/thread'

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

// ─── T10：ValidationResult 聚合与 RuleEngine 映射（纯函数）────────
// 宪法 §VIII：onValidate 与 RuleEngine 各产 ValidationResult，Orchestrator
// 聚合取最严格（全序 Rejected > NeedConfirm > NeedInput > PassedWithWarning > Passed）。G3 起 5 变体；
// PassedWithWarning 已接 rule warning，NeedInput 待 ⑥ 字段补全回环落地其生产者。

/** RuleEngine 内部结果（severity 字段经 adapter 映射为 result） */
type RuleEngineOutcome = {
  result: 'pass' | 'warning' | 'confirm'
  warnings?: string[]
  confirmations?: string[]
}

/**
 * 把 RuleEngine 结果映射为 ValidationResult。
 *
 * 映射策略：
 * - confirm  → NeedConfirm({source:'rule', confirmations}) —— 需用户二次确认
 * - warning  → PassedWithWarning(warnings) —— 可通过但携带警告，经聚合后路由到 suspend 警告卡
 *   （G3 修复「静默吞 warning」缺口：原 warning 被吞成 Passed，现弹「继续/取消」确认卡）
 * - pass     → Passed
 */
export function ruleResultToValidation(outcome: RuleEngineOutcome): ValidationResult {
  if (outcome.result === 'confirm') {
    return { kind: 'NeedConfirm', data: { source: 'rule', confirmations: outcome.confirmations ?? [] } }
  }
  if (outcome.result === 'warning') {
    // G3：warning 不再静默吞成 Passed，映射为 PassedWithWarning → 经 Orchestrator 聚合后路由到 suspend 警告卡
    return { kind: 'PassedWithWarning', warnings: outcome.warnings ?? [] }
  }
  return { kind: 'Passed' }
}

/** 偏序优先级（全序，取最严格）：Rejected > NeedConfirm > NeedInput > PassedWithWarning > Passed */
const VALIDATION_RANK: Record<ValidationResult['kind'], number> = {
  Passed: 0,
  PassedWithWarning: 1,
  NeedInput: 2,
  NeedConfirm: 3,
  Rejected: 4,
}

/**
 * 聚合两个 ValidationResult，取最严格（全序：Rejected > NeedConfirm > NeedInput > PassedWithWarning > Passed）。
 *
 * - 任一方 Rejected → Rejected（取其 errors）
 * - 否则按 VALIDATION_RANK 取优先级更高者；同级取 a
 *
 * 这是 Orchestrator 调度职责（聚合判定结果路由），不属业务逻辑，合规。
 */
export function aggregateValidation(a: ValidationResult, b: ValidationResult): ValidationResult {
  // Rejected 短路：优先取 Rejected 方的 errors
  if (a.kind === 'Rejected') return a
  if (b.kind === 'Rejected') return b
  // NeedConfirm：取优先级更高者；同级取 a
  if (VALIDATION_RANK[a.kind] >= VALIDATION_RANK[b.kind]) return a
  return b
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
  // [023] CN-UI Write Confirmation 新增字段
  needsCnuiConfirmation?: boolean
  cnuiAction?: string
  cnuiDomain?: string
  cnuiSurface?: string
  cnuiIntentFields?: Record<string, unknown>
  // [018-G3]：ValidationResult 聚合后 Suspend 路由产物（⑤ 一等公民）。
  // 三路 suspend：need_confirm（确认卡）/ need_warning（警告卡，PWW）/ need_input（字段补全，预留）。
  // 仅 Orchestrator 内部状态；完整 CNUI Suspend 持久化回环延后到独立切片 ⑥。
  suspended?: { reason: 'need_confirm' | 'need_warning' | 'need_input'; data: unknown }
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
  /**
   * [025] D1：带字段 payload 的状态写（复用域业务事实写入口原子字段+状态写）。
   *
   * 当 intent 携带 manifest field_metadata 声明的非路由键字段、且目标对象已存在
   * （targetId 非空）时，Orchestrator 契约路径改走本回调，在单事务内原子完成
   * 「字段写 + 状态转换」，避免 SM updateStatus 丢弃 proposal.payload 字段
   * （state-machine/index.ts:272）。典型场景：completeTask 携带 actualDuration/notes。
   *
   * 缺省（未注入）→ 全部走 sm.execute（向后兼容，createTask/createThread 等创建
   * 路径不依赖此回调）。
   */
  executeFieldStateWrite?: (params: {
    domainId: string
    objectType: string
    targetId: USOM_ID
    intentId: USOM_ID
    fieldSteps: Array<{ field: string; value: unknown }>
    stateAction: string
    userId: USOM_ID
  }) => Promise<{ success: boolean; object?: Record<string, unknown>; error?: string }>
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

// ─── [025] 级联检测类型 ──────────────────────────────────────────

/** 级联 action 白名单 */
const CASCADE_ELIGIBLE_ACTIONS = new Set([
  'completeTask', 'archiveTask', 'deleteTask',
  'completeThread', 'archiveThread', 'deleteThread',
])

/** 父 action → 子 cascade_action 映射 */
const CASCADE_ACTION_MAP: Record<string, string> = {
  completeTask: 'cascade_complete',
  archiveTask: 'cascade_archive',
  deleteTask: 'cascade_delete',
  completeThread: 'cascade_complete',
  archiveThread: 'cascade_archive',
  deleteThread: 'cascade_delete',
}

/** 级联预览数据 */
interface CascadePreview {
  parentAction: string
  parentId: string
  parentTitle: string
  parentType: 'task' | 'thread'
  directCount: number
  totalCount: number
  cascadeAction: string
  allDescendants: Array<{ id: string; title: string; status: string; parentId: string | null }>
}

/**
 * 级联检测 — 识别 complete/archive/delete 操作，查询子任务并构造 CascadePreview。
 *
 * cascade_ 前缀的 action 直通（防递归）；非白名单 action 直通。
 * 返回 Passed（无级联）或 NeedConfirm（有级联，携带 CascadePreview）。
 */
async function cascadeCheck(
  intent: StructuredIntent,
  userId: USOM_ID,
): Promise<ValidationResult> {
  try {
    const action = intent.action

    // cascade_ action 直通，不递归检测
    if (action.startsWith('cascade_')) return { kind: 'Passed' }

    // 非白名单 action 直通
    if (!CASCADE_ELIGIBLE_ACTIONS.has(action)) return { kind: 'Passed' }

    // 提取父对象信息
    const isThreadAction = action.includes('Thread')
    const parentType = isThreadAction ? 'thread' : 'task'
    const parentIdKey = isThreadAction ? 'threadId' : 'taskId'
    const parentId = intent.fields[parentIdKey] as string | undefined

    if (!parentId) return { kind: 'Passed' }

    // 查询子任务
    const taskRepo = new TaskRepository()
    let directChildren: Task[]

    if (isThreadAction) {
      // findByThread: 查该 thread 下的所有 task（不含已删除）
      directChildren = await taskRepo.findByUserId(userId, {
        threadId: parentId,
        status: ['todo', 'planned', 'in_progress', 'completed', 'archived'],
      })
    } else {
      // findByParent: 查该 task 的直接子任务
      directChildren = await taskRepo.findByParent(parentId, userId)
    }

    // 过滤：只保留符合 cascade 规则的状态（非 deleted）
    const eligibleChildren = directChildren.filter(
      c => c.status !== 'deleted',
    )

    if (eligibleChildren.length === 0) return { kind: 'Passed' }

    // 递归收集所有后代（BFS）
    const allDescendants: CascadePreview['allDescendants'] = []
    const queue = eligibleChildren.map(c => ({ id: c.id, title: c.title, status: c.status, parentId: c.parentId ?? null }))
    allDescendants.push(...queue)

    let i = 0
    while (i < queue.length) {
      const current = queue[i++]!
      const grandchildren = await taskRepo.findByParent(current.id, userId)
      for (const gc of grandchildren) {
        if (gc.status !== 'deleted') {
          const entry = { id: gc.id, title: gc.title, status: gc.status, parentId: gc.parentId ?? null }
          queue.push(entry)
          allDescendants.push(entry)
        }
      }
    }

    // 获取父对象标题
    let parentTitle = ''
    if (isThreadAction) {
      const threadRepo = new ThreadRepository()
      const thread = await threadRepo.findById(parentId, userId)
      parentTitle = thread?.name ?? parentId
    } else {
      const taskRepo2 = new TaskRepository()
      const parent = await taskRepo2.findById(parentId, userId)
      parentTitle = parent?.title ?? parentId
    }

    const cascadePreview: CascadePreview = {
      parentAction: action,
      parentId,
      parentTitle,
      parentType,
      directCount: eligibleChildren.length,
      totalCount: allDescendants.length,
      cascadeAction: CASCADE_ACTION_MAP[action]!,
      allDescendants,
    }

    // 构造级联确认提示消息：根据父动作类型给出动词，区分直接子任务与孙级数量
    const grandchildCount = Math.max(0, cascadePreview.totalCount - cascadePreview.directCount)
    const actionLabel = action.startsWith('complete') ? '完成'
      : action.startsWith('archive') ? '归档' : '删除'
    const confirmationMessage = `将连带${actionLabel} ${cascadePreview.totalCount} 个下级任务` +
      (grandchildCount > 0 ? `（${cascadePreview.directCount} 个直接子任务 + ${grandchildCount} 个孙级）` : '') +
      `。确定连带处理？`

    return {
      kind: 'NeedConfirm',
      data: { source: 'cascade', cascadePreview, confirmationMessage },
    }
  } catch {
    // DB 查询失败（测试环境非 UUID ID / 连接异常等）→ 降级为无级联，放行
    return { kind: 'Passed' }
  }
}

/**
 * 双重约束检查 — createTask 时校验 threadId + parentId 状态。
 * completed/archived 的 Thread 下禁止创建；completed/archived/deleted 的父 Task 下禁止创建。
 */
async function parentConstraintCheck(
  intent: StructuredIntent,
  userId: USOM_ID,
): Promise<ValidationResult> {
  if (intent.action !== 'createTask') return { kind: 'Passed' }

  try {
    const errors: string[] = []
    const threadId = intent.fields['threadId'] as string | undefined
    const parentId = intent.fields['parentId'] as string | undefined

    if (threadId) {
      const threadRepo = new ThreadRepository()
      const thread = await threadRepo.findById(threadId, userId)
      if (thread && ['completed', 'archived'].includes(thread.status)) {
        errors.push('无法在已完成/已归档的主线下创建任务')
      }
    }

    if (parentId) {
      const taskRepo = new TaskRepository()
      const parent = await taskRepo.findById(parentId, userId)
      if (parent && ['completed', 'archived', 'deleted'].includes(parent.status)) {
        errors.push('无法在已完成/已归档/已删除的任务下创建子任务')
      }
    }

    return errors.length === 0
      ? ({ kind: 'Passed' } as ValidationResult)
      : ({ kind: 'Rejected', errors } as ValidationResult)
  } catch {
    // DB 查询失败（测试环境非 UUID ID / 连接异常等）→ 降级放行
    return { kind: 'Passed' }
  }
}

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

// [022-A4] 跨域事件分发器：post-mutation hook
// 在 SM.execute 完成后从 eventRepo 读取本次 intent 关联的事件，
// 按各域 manifest.subscribedEvents 列表分发给目标域 onEvent。
// - 同域跳过：上方 executeIntent L891-893 已对同域调 onEvent，此处跳过避免双重触发。
// - 走 eventRepo：与 [025] D1 executeFieldStateWrite 路径解耦（该路径不调 onEvent）。
// - [022] ADV-#1 修复 2026-06-26：使用 SystemEventRepository.findByIntent 精确查询，
//   替代「时间窗口 ±5 秒 + JS intentId 过滤」方案（spike §R7），消除并发场景下的
//   跨意图事件泄漏风险（用户同时发起 2 个 intent 时，旧方案可能误拾取他人事件）。
// - 错误隔离：try/catch + console.error，主写事务已 commit，失败不影响主流程。
//   [022] ADV-#2 修复：失败事件追加 system_events `OnEventDispatchFailed` 记录供回溯。
// - userId 不在 event.payload 中（payload 仅含 objectId/intentId/proposalId/fromStatus/toStatus），
//   显式从 executeIntent 入参透传，与多租户 T-02 一致。

async function dispatchCrossDomainEvents(params: {
  eventRepo: ISystemEventRepository
  intentId: USOM_ID
  userId: USOM_ID
  targetDomain: string
  snapshot: USOMSnapshot
}): Promise<void> {
  const { eventRepo, intentId, userId, targetDomain, snapshot } = params
  try {
    // 1. 按 intentId 精确查询（[022] ADV-#1）
    const intentEvents = await eventRepo.findByIntent(intentId, userId)
    if (intentEvents.length === 0) return

    // 2. 遍历 domainRegistry，分发到各订阅域（R1 缓解：跳过同域）
    for (const plugin of domainRegistry) {
      // [022-A4] R1 关键：跳过同域避免与 L891-893 既有 onEvent 双重触发
      if (plugin.manifest.domainId === targetDomain) continue
      const subscribedTypes = plugin.manifest.subscribedEvents ?? []
      for (const event of intentEvents) {
        if (subscribedTypes.includes(event.type) && plugin.onEvent) {
          try {
            await plugin.onEvent(event, snapshot)
          } catch (err) {
            // [022] ADV-#2 修复 2026-06-26：持久化失败事件供回溯
            // 此前仅 console.error，主写事务已 commit 后失败事件无任何痕迹。
            // 现在追加 OnEventDispatchFailed 事件（payload 含原 event 摘要 + 错误），
            // 可由运维脚本检索；事件本身不重试（spike §R6 defer 重试机制）。
            const errorEvent: SystemEvent = {
              id: crypto.randomUUID() as USOM_ID,
              type: 'OnEventDispatchFailed',
              occurredAt: new Date().toISOString() as Timestamp,
              triggeredBy: 'handler',
              payload: {
                originalEventId: event.id,
                originalEventType: event.type,
                originalIntentId: intentId,
                targetDomain: plugin.manifest.domainId,
                error: err instanceof Error ? err.message : String(err),
              },
              snapshotId: '' as USOM_ID,
            }
            eventRepo.append(errorEvent, userId).catch(appendErr => {
              // 兜底：连 system_events 写入都失败时，保留 console.error 兜底
              console.error(
                `[orchestrator.postHook] onEvent failed AND error-event append failed: domain=${plugin.manifest.domainId}, event=${event.type}`,
                err,
                appendErr,
              )
            })
            console.error(
              `[orchestrator.postHook] onEvent failed: domain=${plugin.manifest.domainId}, event=${event.type}`,
              err,
            )
          }
        }
      }
    }
  } catch (err) {
    // 整体兜底：dispatch 异常不影响主流程（主写事务已 commit）
    console.error('[orchestrator.postHook] dispatchCrossDomainEvents failed:', err)
  }
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
      // [025] 级联拆分计划：在 NeedConfirm 块中赋值，在 SM 执行后消费
      let cascadeSplitPlan: CascadePreview | undefined
      const domainId = intent.targetDomain
      const domain = findDomain(domainId)

      // 1. Domain plugin validation（T3 已返回 ValidationResult）
      // onValidate 默认 Passed；domain onValidate 仅产 Passed/Rejected（PWW/NeedInput/NeedConfirm 由 rule/cnui 产生后聚合，见下文路由）。
      let domainValidation: ValidationResult = { kind: 'Passed' }
      if (domain) {
        domainValidation = await domain.onValidate(intent, usomSnapshot)
        // Rejected 短路：onValidate 结构性拒绝直接终止（聚合前短路，行为同 T3）
        if (domainValidation.kind === 'Rejected') {
          return { success: false, error: domainValidation.errors.join('; ') }
        }
      }

      // 1.3 双重约束检查（[025] S3：createTask 校验父对象状态）
      const constraintValidation = await parentConstraintCheck(intent, userId)
      if (constraintValidation.kind === 'Rejected') {
        return { success: false, error: constraintValidation.errors!.join('; ') }
      }

      // 1.4 级联检测（[025] S2：complete/archive/delete 查子任务）
      const cascadeValidation = await cascadeCheck(intent, userId)

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
        // [023-01] 可观察性（非行为变更）：pathType=generative 但 action 不在
        // generation_actions 时本就落到 contract path（上方 if 未命中）。此处仅
        // dev warn 让未来 LLM 误标 pathType（R3）可定位。真实根因见 Task 0。
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            `[Orchestrator] pathType=generative 但 ${intent.targetDomain}/${intent.action} ` +
            `不在 generation_actions，回落 contract path（行为不变，仅可观察性）`,
          )
        }
      }

      // pathType === 'contract' — 继续走现有被动型路径

      // 2. RuleEngine 评估（被动型路径）
      trace(deps.onTrace, 'RuleEngine', 'start', { input: { intent } })
      const ruleResult = await deps.ruleEngine.evaluate(intent, snapshot)
      trace(deps.onTrace, 'RuleEngine', 'end', { input: { intent }, output: { ruleResult } })

      // T10：把 RuleEngine 结果映射为 ValidationResult。
      // confirmed=true 时 RuleEngine 的 confirm 降级为 Passed（保留二次确认后继续的语义）。
      const ruleValidation = confirmed
        ? { kind: 'Passed' } as ValidationResult
        : ruleResultToValidation(ruleResult)

      // CN-UI Write Confirmation 吸收：response_type==='cnui' 且 AI 解析意图需二次确认。
      // 原为独立 needsCnuiConfirmation 分支，现映射为 NeedConfirm 变体并入聚合。
      // confirmed=true 时（表单/CNUI 提交已人工确认）降级为 Passed，直接放行。
      const intentTrigger = manifest?.intent_triggers?.find(
        (t: any) => t.action === intent.action
      )
      let cnuiValidation: ValidationResult = { kind: 'Passed' }
      if (!confirmed && intentTrigger?.response_type === 'cnui' && intent.resolvedBy === 'ai') {
        cnuiValidation = {
          kind: 'NeedConfirm',
          data: {
            source: 'cnui',
            cnuiAction: intent.action,
            cnuiDomain: intent.targetDomain,
            cnuiSurface: intentTrigger.cnui_surface,
            cnuiIntentFields: intent.fields,
          },
        }
      }

      // 3. 聚合四方 ValidationResult：domain × cascade × rule × cnui，取最严格（全序 Rejected > NeedConfirm > NeedInput > PassedWithWarning > Passed）
      // Orchestrator 聚合属调度职责，不属业务逻辑，合规。
      const aggregated = aggregateValidation(
        aggregateValidation(
          aggregateValidation(domainValidation, cascadeValidation),
          ruleValidation,
        ),
        cnuiValidation,
      )

      if (aggregated.kind === 'Rejected') {
        return { success: false, error: aggregated.errors.join('; ') }
      }

      if (aggregated.kind === 'PassedWithWarning') {
        // G3 ⑤：PassedWithWarning 路由到 Suspend 警告卡。复用现有确认卡 surfacing
        // （needsConfirmation + confirmationMessage）；用户「继续」时 confirmed=true
        // 让 ruleValidation 降级为 Passed（:498-500）进写入口，无需 ⑥ 持久化回环。
        const warnings = aggregated.warnings
        return {
          success: false,
          suspended: { reason: 'need_warning', data: { warnings } },
          needsConfirmation: true,
          confirmationMessage: warnings.join('; '),
          warnings,
        }
      }

      if (aggregated.kind === 'NeedInput') {
        // G3 预留：本切片无生产者（domain/rule/cnui 均不产 NeedInput）。
        // 待 ⑥ CNUI 字段补全回环落地其生产者与 surfacing 字段。
        return {
          success: false,
          suspended: { reason: 'need_input', data: aggregated.data },
        }
      }

      if (aggregated.kind === 'NeedConfirm') {
        // Suspend 路由：仅 Orchestrator 内部状态。
        // 完整 CNUI Suspend 回环（持久化/回填/UI 回流）延后到独立切片 ⑥。
        // 向后兼容：同时回填旧字段 needsCnuiConfirmation/needsConfirmation/confirmationMessage。
        const data = aggregated.data as Record<string, unknown>
        // [025] 级联确认：若已确认，设置拆分计划并 fall through 到 SM 执行
        if (data?.source === 'cascade' && confirmed) {
          cascadeSplitPlan = data.cascadePreview as CascadePreview
          // fall through — 不 return，继续走下面的 SM 路径
        } else {
          const confirmations =
            data?.source === 'rule' ? (data.confirmations as string[] | undefined) : undefined
          return {
            success: false,
            suspended: { reason: 'need_confirm', data: aggregated.data },
            // 兼容旧消费方（intent.ts 透传字段）
            // [025] cascade 同样需要触发确认卡，且透传 cascadeCheck 构造的中文消息
            needsConfirmation: data?.source === 'rule' || data?.source === 'cascade' ? true : false,
            needsCnuiConfirmation: data?.source === 'cnui' ? true : false,
            confirmationMessage: data?.source === 'cascade' ? (data.confirmationMessage as string) : confirmations?.join('; '),
            cnuiAction: data?.source === 'cnui' ? (data.cnuiAction as string) : undefined,
            cnuiDomain: data?.source === 'cnui' ? (data.cnuiDomain as string) : undefined,
            cnuiSurface: data?.source === 'cnui' ? (data.cnuiSurface as string) : undefined,
            cnuiIntentFields: data?.source === 'cnui' ? (data.cnuiIntentFields as Record<string, unknown>) : undefined,
            warnings: ruleResult.warnings,
          }
        }
      }

      // 3. 路由到通用 SM 处理
      const action = toStateMachineAction(intent.action)

      // ─── 通用 SM 路径（contract path — 所有已迁移的域） ──────
      // 块作用域隔离 smObjectType/repo 等局部变量，避免与外层冲突
      {
        const smObjectType = getObjectType(intent)
        const repo = deps.getRepo(domainId, smObjectType)

        // [025] tasks 域级联由 Orchestrator 接管，SM 不再执行 cascade
        const cascadeRules = manifestResult.success && domainId !== 'tasks'
          ? (manifestResult.manifest.cascade_rules?.filter((r: any) => r.type === 'parent_child_status') ?? [])
          : []

        // [025] D1：带字段 payload 的状态写复用 mutation service（原子字段+状态）。
        // 判定 intent 是否携带 manifest field_metadata 声明的非路由键字段：
        //  - 有字段 + 已注入 executeFieldStateWrite + 目标对象已存在（targetId 非空）
        //    → 走 mutation service 单事务原子写字段+状态（修复 SM updateStatus 丢弃
        //      proposal.payload 字段的问题，state-machine/index.ts:272）
        //  - 否则 → 走现有 sm.execute（保持 createTask/createThread 创建路径与无字段
        //    状态转换行为不变；亦兼容未注入回调的旧调用方）
        //
        // 路由键约定：objectId / {camelCase objectType}Id（如 taskId/threadId），
        // 这些是定位用、非业务字段写，必须排除。cascade_ 子任务 intent 仅传 taskId
        // （见下方拆分块，已去掉 title），故递归路径必走 else 分支，不会被误接管。
        // [026] T23: 嵌套读取 manifest.field_metadata[smObjectType]（per-objectType 嵌套结构）
        const manifestFieldMeta = (manifest?.field_metadata as Record<string, Record<string, unknown>> | undefined)?.[smObjectType]
        const routingKeys = new Set(['objectId', `${smObjectType.replace(/_([a-z])/g, (_, c) => c.toUpperCase())}Id`])
        const targetId = resolveObjectId(intent.fields, smObjectType)
        const fieldSteps = Object.entries(intent.fields)
          .filter(([k, v]) =>
            !routingKeys.has(k) &&
            v !== undefined &&
            !!manifestFieldMeta &&
            k in manifestFieldMeta,
          )
          .map(([field, value]) => ({ field, value }))

        // 统一写入结果：两种写来源都产 { success, object? }；sm.execute 另产 event?
        // （用于 domain.onEvent）。executeFieldStateWrite 路径不调 domain.onEvent：
        // mutation service 内部 SM 已将事件落库到 eventRepo，与 completeTask 现状
        // （此前绕过 Orchestrator）一致，不构成回归。
        let writeResult: { success: boolean; object?: Record<string, unknown>; error?: string; event?: SystemEvent }

        if (fieldSteps.length > 0 && deps.executeFieldStateWrite && targetId) {
          // 带字段 → 走 mutation service（原子字段+状态写，单事务）
          const wr = await deps.executeFieldStateWrite({
            domainId,
            objectType: smObjectType,
            targetId,
            intentId: intent.id,
            fieldSteps,
            stateAction: action,
            userId,
          })
          if (!wr.success) {
            return { success: false, error: wr.error }
          }
          writeResult = { success: true, object: wr.object }
        } else {
          // 无字段 / 未注入回调 / 创建路径（targetId 为空）→ 现有 sm.execute 路径
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
              id: targetId,
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

          writeResult = { success: true, object: smResult.object, event: smResult.event }
        }

        // [022-A4] Post-mutation cross-domain event dispatch
        // SM.execute 已通过 eventRepo.append 落库到 system_events 表；
        // 此处从 eventRepo 读取本次 intent 关联的全部事件（按时间窗口 + intentId 过滤），
        // 按各域 manifest.subscribedEvents 分发给目标域 onEvent。
        // 同域（intent.targetDomain）事件由上方 L891-893 的同域 onEvent 调用处理，
        // 此处跳过避免双重触发（R1 风险缓解）。
        // 错误隔离：try/catch + console.error，主写事务已 commit，失败不影响主流程。
        await dispatchCrossDomainEvents({
          eventRepo: deps.eventRepo,
          intentId: intent.id,
          userId,
          targetDomain: domainId,
          snapshot: usomSnapshot,
        })

        // [025] 级联拆分执行（复用 writeResult.object —— 无论写来自 sm.execute 还是
        // executeFieldStateWrite）。注：级联仅 tasks 域，父对象走 else 分支（sm.execute），
        // 因 completeTask/archiveTask/deleteTask 的 intent 不带 manifest 业务字段。
        if (cascadeSplitPlan && cascadeSplitPlan.allDescendants.length > 0) {
          const childResults: Array<{ id: string; success: boolean; error?: string }> = []
          for (const child of cascadeSplitPlan.allDescendants) {
            const childIntent: StructuredIntent = {
              id: crypto.randomUUID() as USOM_ID,
              intentionId: intent.intentionId,
              targetDomain: 'tasks',
              action: cascadeSplitPlan.cascadeAction,
              // [025] 仅传 taskId 路由键，不传 title —— title 虽在 field_metadata，
              // 但级联子任务无需写字段（只做状态转换）；避免误命中 executeFieldStateWrite
              fields: {
                taskId: child.id,
              },
              confidence: 1.0,
              resolvedBy: 'template_form',
              pathType: 'contract',
              createdAt: new Date().toISOString() as Timestamp,
            }
            try {
              const r = await orchestrator.executeIntent(childIntent, userId)
              childResults.push({ id: child.id, success: r.success, error: r.error })
            } catch (err) {
              childResults.push({
                id: child.id,
                success: false,
                error: err instanceof Error ? err.message : '级联执行失败',
              })
            }
          }

          const failedCount = childResults.filter(r => !r.success).length
          const warnings = [
            ...(ruleResult.warnings ?? []),
            `级联操作完成：${cascadeSplitPlan.totalCount} 个子任务已处理` +
              (failedCount > 0 ? `，${failedCount} 个失败` : ''),
          ]

          return {
            success: failedCount === 0,
            object: writeResult.object,
            objectType: smObjectType,
            warnings,
            error: failedCount > 0
              ? `${failedCount}/${cascadeSplitPlan.totalCount} 个子任务级联失败`
              : undefined,
          }
        }

        return {
          success: true,
          object: writeResult.object,
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
        // [023-01] 通电 capability 注册（lazy + 幂等）：registerAllProviders 原死代码
        ensureProvidersRegistered()

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
