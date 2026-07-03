/**
 * @file hooks
 * @brief OKR 域钩子函数工厂
 *
 * 工厂函数模式，遵循 Constitution Principle VI: 无副作用、无数据库调用
 * 提供意图验证、事件响应和动作表面请求处理能力
 */

import type {
  USOMSnapshot,
  SystemEvent,
  DerivedSignals,
  ActionCandidate,
  ActionSurfaceSuggestion,
  MetricUpdate,
  ValidationResult,
} from '@/usom/types/process'
import { validationPassed, validationRejected } from '@/usom/types/process'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID, ActionCategory } from '@/usom/types/primitives'
import type { DomainManifest } from '@/domains/manifest-loader/schema'
import type { IContributionRepository } from '@/usom/interfaces/irepository'

/**
 * OKR 域钩子可选仓储依赖
 * @property objectiveRepo - 目标仓储
 * @property keyResultRepo - 关键结果仓储
 * @property contributionRepo - 贡献仓储（[022] Phase 3 A4 跨域事件驱动 KR 进度重算）
 */
interface OkrsHookRepos {
  objectiveRepo: any
  keyResultRepo: any
  contributionRepo: IContributionRepository
}

/**
 * [022-A4] 处理 TaskCompleted 跨域事件 —— 查找受影响的 KR 并重算进度
 * @param event - TaskCompleted 事件
 * @param repos - 仓储依赖
 * @param userId - 来自 snapshot 的 userId（不在 payload 中）
 * @returns 空指标和建议（纯副作用，不污染 ActionSurface）
 */
async function handleTaskCompleted(
  event: SystemEvent,
  repos: OkrsHookRepos | undefined,
  userId: string | undefined,
): Promise<{ metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] }> {
  if (!repos?.contributionRepo || !userId) return { metrics: [], suggestions: [] }
  const taskId = event.payload['objectId'] as string | undefined
  if (!taskId) return { metrics: [], suggestions: [] }

  try {
    const contribs = await repos.contributionRepo.findByContributor(
      'task', taskId as USOM_ID, userId as USOM_ID,
    )
    for (const c of contribs) {
      try {
        await repos.contributionRepo.recomputeProgress(c.keyResultId, userId as USOM_ID)
      } catch (err) {
        console.error(`[okrs.onEvent] recomputeProgress failed for KR ${c.keyResultId}:`, err)
      }
    }
  } catch (err) {
    console.error('[okrs.onEvent] TaskCompleted handler failed:', err)
  }
  return { metrics: [], suggestions: [] }
}

/**
 * [022-A4] 处理 HabitLogged 跨域事件 —— 查找受影响的 KR 并重算进度
 * @param event - HabitLogged 事件
 * @param repos - 仓储依赖
 * @param userId - 来自 snapshot 的 userId
 * @returns 空指标和建议
 */
async function handleHabitLogged(
  event: SystemEvent,
  repos: OkrsHookRepos | undefined,
  userId: string | undefined,
): Promise<{ metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] }> {
  if (!repos?.contributionRepo || !userId) return { metrics: [], suggestions: [] }
  const habitId = event.payload['objectId'] as string | undefined
  if (!habitId) return { metrics: [], suggestions: [] }

  try {
    const contribs = await repos.contributionRepo.findByContributor(
      'habit', habitId as USOM_ID, userId as USOM_ID,
    )
    for (const c of contribs) {
      try {
        await repos.contributionRepo.recomputeProgress(c.keyResultId, userId as USOM_ID)
      } catch (err) {
        console.error(`[okrs.onEvent] recomputeProgress failed for KR ${c.keyResultId}:`, err)
      }
    }
  } catch (err) {
    console.error('[okrs.onEvent] HabitLogged handler failed:', err)
  }
  return { metrics: [], suggestions: [] }
}

/**
 * 创建 OKR 域钩子函数
 * @param manifest - 域 manifest
 * @param repos - 可选仓储实例（激活校验需要查询 DB）
 * @returns 钩子函数对象
 */
export function createOkrsHooks(
  manifest: DomainManifest,
  repos?: OkrsHookRepos,
) {
  const subscribedEvents = new Set(manifest.subscribed_events)
  // [026] T23: 嵌套读取 manifest.field_metadata.objective.okrType.options
  const validOkrTypes = new Set(
    manifest.field_metadata.objective?.okrType?.options ?? ['visionary', 'committed']
  )

  /**
   * 验证意图（异步，支持激活前置校验）
   * @param intent - 结构化意图
   * @param _snapshot - USOM 快照
   * @returns 验证结果
   */
  async function onValidate(
    intent: StructuredIntent,
    _snapshot: USOMSnapshot,
  ): Promise<ValidationResult> {
    const errors: string[] = []
    const { fields } = intent
    const action = intent.action

    // [022.01] Phase 3：移除 activateObjective 校验块。
    // Objective 无独立状态机，无需激活前置（KR 草稿由 cycle.status 统一管控）。

    if (action === 'createObjective' || action === 'updateObjective') {
      const title = fields['title']
      if (action === 'createObjective' && (!title || (typeof title === 'string' && title.trim() === ''))) {
        errors.push('title 必填')
      }
      if (typeof title === 'string' && title.length > 200) {
        errors.push('title 不能超过 200 字符')
      }

      const okrType = fields['okrType']
      if (okrType !== undefined && !validOkrTypes.has(okrType as string)) {
        errors.push(`okrType 必须是 ${[...validOkrTypes].join(' 或 ')}`)
      }
    }

    if (action === 'createKeyResult' || action === 'updateKeyResult') {
      const title = fields['title']
      if (action === 'createKeyResult' && (!title || (typeof title === 'string' && title.trim() === ''))) {
        errors.push('title 必填')
      }
      if (typeof title === 'string' && title.length > 200) {
        errors.push('title 不能超过 200 字符')
      }

      const targetValue = fields['targetValue']
      if (targetValue !== undefined && (typeof targetValue !== 'number' || targetValue <= 0)) {
        errors.push('targetValue 必须大于 0')
      }

      const unit = fields['unit']
      if (action === 'createKeyResult' && (!unit || (typeof unit === 'string' && unit.trim() === ''))) {
        errors.push('unit 必填')
      }
      if (typeof unit === 'string' && unit.length > 20) {
        errors.push('unit 不能超过 20 字符')
      }
    }

    if (action === 'updateKeyResultProgress') {
      const keyResultId = fields['keyResultId']
      if (!keyResultId || typeof keyResultId !== 'string') {
        errors.push('keyResultId 必填')
      }
      const currentValue = fields['currentValue']
      if (typeof currentValue !== 'number' || currentValue < 0) {
        errors.push('currentValue 必须是非负数')
      }
    }

    return errors.length === 0 ? validationPassed() : validationRejected(errors)
  }

  /**
   * 处理系统事件（[022-A4] 升级为 async 以支持跨域事件驱动 KR 进度重算）
   * @param event - 系统事件
   * @param snapshot - USOM 快照（用于取 userId）
   * @returns 指标更新和动作表面建议
   */
  async function onEvent(
    event: SystemEvent,
    snapshot: USOMSnapshot,
  ): Promise<{ metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] }> {
    if (!subscribedEvents.has(event.type)) {
      return { metrics: [], suggestions: [] }
    }

    const title = (event.payload['title'] as string) || '未命名目标'
    // [022-A4] R2 缓解：userId 来自 snapshot，不来自 event.payload（payload 不含 userId）
    const userId = snapshot?.userId as string | undefined

    switch (event.type) {
      case 'ObjectiveCreated':
        return {
          metrics: [],
          suggestions: [{
            actionType: 'review_okr',
            label: `新目标已创建: ${title}，请添加关键结果`,
            weight: 60,
          }],
        }

      // [022.01] Phase 3：移除 Objective 状态事件（Activated/Paused/Resumed/
      // Completed/Discarded/Archived）以及 KeyResultCompleted，这些事件不再产生。
      // Obj/KR 完成语义迁移至 progressRate 判定。

      case 'KeyResultProgressUpdated': {
        const progressRate = (event.payload['progressRate'] as number) || 0
        return {
          metrics: [{
            metricKey: 'kr_progress_updated',
            value: progressRate,
          }],
          suggestions: [],
        }
      }

      // [022-A4] 跨域事件：TaskCompleted → 查找受影响 KR 并触发 recomputeProgress
      case 'TaskCompleted':
        return await handleTaskCompleted(event, repos, userId)

      // [022-A4] 跨域事件：HabitLogged → 查找受影响 KR 并触发 recomputeProgress
      case 'HabitLogged':
        return await handleHabitLogged(event, repos, userId)

      default:
        return { metrics: [], suggestions: [] }
    }
  }

  /**
   * 处理动作表面请求
   * @param snapshot - USOM 快照
   * @param _signals - 派生信号
   * @returns 动作候选列表、分类和权重
   */
  function onActionSurfaceRequest(
    snapshot: USOMSnapshot,
    _signals: Readonly<DerivedSignals>,
  ): { actions: ActionCandidate[]; category: ActionCategory; weight: number } {
    const actions: ActionCandidate[] = []
    const objectives = snapshot.activeObjectives ?? []
    const keyResults = snapshot.activeKeyResults ?? []

    for (const kr of keyResults) {
      if (kr.dueDate) {
        const dueDate = new Date(kr.dueDate)
        const now = new Date(snapshot.currentDate)
        const daysUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        if (daysUntilDue >= 0 && daysUntilDue < 7 && kr.progressRate < 0.7) {
          actions.push({
            id: `kr-due-warn-${kr.id}` as unknown as USOM_ID,
            sourceObjectId: kr.id as unknown as USOM_ID,
            sourceObjectType: 'key_result',
            label: `KR 即将到期 (${daysUntilDue}天): ${kr.title}`,
            actionType: 'review_okr',
            category: 'cue',
            weight: 85,
          })
        }
      }
    }

    for (const obj of objectives) {
      const periodEnd = obj.period?.end
      if (periodEnd) {
        const endDate = new Date(periodEnd)
        const now = new Date(snapshot.currentDate)
        const daysUntilEnd = Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        if (daysUntilEnd >= 0 && daysUntilEnd < 14) {
          actions.push({
            id: `obj-period-warn-${obj.id}` as unknown as USOM_ID,
            sourceObjectId: obj.id as unknown as USOM_ID,
            sourceObjectType: 'objective',
            label: `目标周期即将结束 (${daysUntilEnd}天): ${obj.title}`,
            actionType: 'review_okr',
            category: 'guide',
            weight: 75,
          })
        }
      }
    }

    const maxWeight = actions.length > 0 ? Math.max(...actions.map(a => a.weight)) : 0
    return { actions, category: 'cue', weight: maxWeight }
  }

  return { onValidate, onEvent, onActionSurfaceRequest }
}
