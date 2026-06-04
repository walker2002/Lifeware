/**
 * @file hooks
 * @brief Habits 域钩子函数工厂
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
} from '@/usom/types/process'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID, ActionCategory } from '@/usom/types/primitives'
import type { DomainManifest } from '@/domains/manifest-loader/schema'
import { validateHabitFields, isValidHHMM } from './validation'

/**
 * Habits onEvent 钩子可注入的仓储接口
 * @property calculateStreak - 计算连续天数
 * @property calculateLongestStreak - 计算最长连续天数
 * @property calculateCompletion7d - 计算 7 天完成率
 * @property updateMetrics - 更新习惯指标
 */
export interface HabitsEventRepos {
  calculateStreak(habitId: USOM_ID, userId: string): Promise<number>
  calculateLongestStreak(habitId: USOM_ID, userId: string): Promise<number>
  calculateCompletion7d(habitId: USOM_ID, userId: string): Promise<number>
  updateMetrics(habitId: USOM_ID, userId: string, metrics: { streak: number; longestStreak: number; completionRate7d: number }): Promise<void>
}

/**
 * 创建习惯域钩子函数
 * @param manifest - 域 manifest
 * @param repos - 可选的仓储接口（用于 streak 重算等副作用）
 * @returns 钩子函数对象
 */
export function createHabitsHooks(manifest: DomainManifest, repos?: HabitsEventRepos) {
  const subscribedEvents = new Set(manifest.subscribed_events)
  const validFrequencyTypes = new Set(
    manifest.field_metadata.frequencyType?.options ?? ['daily', 'weekly', 'custom']
  )

  /**
   * 验证意图
   * @param intent - 结构化意图
   * @param _snapshot - USOM 快照
   * @returns 验证结果
   */
  function onValidate(
    intent: StructuredIntent,
    _snapshot: USOMSnapshot,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    const { fields } = intent
    const action = intent.action

    if (action === 'createHabit' || action === 'updateHabit') {
      const result = validateHabitFields(fields, action as 'createHabit' | 'updateHabit')
      errors.push(...result.errors)
    }

    if (action === 'logHabit') {
      const habitId = fields['habitId']
      if (!habitId || typeof habitId !== 'string') {
        errors.push('habitId 必填')
      }
    }

    // lifecycle actions: activate, suspend, archive, reactivate
    const lifecycleActions = ['activateHabit', 'suspendHabit', 'archiveHabit', 'reactivateHabit']
    if (lifecycleActions.includes(action)) {
      const habitId = fields['habitId']
      if (!habitId || typeof habitId !== 'string') {
        errors.push('habitId 必填')
      }
    }

    if (action === 'createTemplate') {
      const name = fields['name']
      if (!name || (typeof name === 'string' && name.trim() === '')) {
        errors.push('name 必填')
      }

      const applicableDays = fields['applicableDays']
      if (!Array.isArray(applicableDays) || applicableDays.length === 0) {
        errors.push('applicableDays 不能为空')
      }
    }

    if (action === 'addHabitToTemplate') {
      const templateId = fields['templateId']
      if (!templateId || typeof templateId !== 'string') {
        errors.push('templateId 必填')
      }

      const habitId = fields['habitId']
      if (!habitId || typeof habitId !== 'string') {
        errors.push('habitId 必填')
      }

      const timeOverride = fields['timeOverride']
      if (timeOverride !== undefined && !isValidHHMM(timeOverride)) {
        errors.push('timeOverride 必须是有效的 HH:MM 格式')
      }
    }

    if (action === 'removeHabitFromTemplate') {
      const templateId = fields['templateId']
      if (!templateId || typeof templateId !== 'string') {
        errors.push('templateId 必填')
      }

      const habitId = fields['habitId']
      if (!habitId || typeof habitId !== 'string') {
        errors.push('habitId 必填')
      }
    }

    if (action === 'applyTemplate') {
      const templateId = fields['templateId']
      if (!templateId || typeof templateId !== 'string') {
        errors.push('templateId 必填')
      }

      const date = fields['date']
      if (!date || typeof date !== 'string') {
        errors.push('date 必填')
      }
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * 处理系统事件
   * @param event - 系统事件
   * @param _snapshot - USOM 快照
   * @returns 指标更新和动作表面建议
   */
  async function onEvent(
    event: SystemEvent,
    _snapshot: USOMSnapshot,
  ): Promise<{ metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] }> {
    if (!subscribedEvents.has(event.type)) {
      return { metrics: [], suggestions: [] }
    }

    const title = (event.payload['title'] as string) || '未命名习惯'
    const streak = (event.payload['streak'] as number) || 0

    switch (event.type) {
      case 'HabitCreated':
        return {
          metrics: [],
          suggestions: [{
            actionType: 'log_habit',
            label: `新习惯已激活: ${title}`,
            weight: 50,
          }],
        }

      case 'HabitActivated':
        return {
          metrics: [],
          suggestions: [{
            actionType: 'log_habit',
            label: `习惯已激活: ${title}`,
            weight: 50,
          }],
        }

      case 'HabitStreakMilestone':
        return {
          metrics: [{
            metricKey: 'habit_streak',
            value: streak,
          }],
          suggestions: [{
            actionType: 'log_habit',
            label: `${streak}天连续成就: ${title}`,
            weight: 90,
          }],
        }

      case 'HabitLogged': {
        const trackable = (event.payload['trackable'] as boolean) ?? false
        const metrics: MetricUpdate[] = []
        if (trackable) {
          metrics.push({
            metricKey: 'habit_metrics_needs_update',
            value: 1,
          })
        }

        // streak 重算：当 repos 可用时，在 onEvent 中执行指标更新
        if (repos) {
          const habitId = event.payload['habitId'] as string | undefined
          if (habitId) {
            try {
              const streak = await repos.calculateStreak(habitId, _snapshot.userId)
              const longestStreak = await repos.calculateLongestStreak(habitId, _snapshot.userId)
              const completionRate7d = await repos.calculateCompletion7d(habitId, _snapshot.userId)
              await repos.updateMetrics(habitId, _snapshot.userId, { streak, longestStreak, completionRate7d })
            } catch {
              // streak 重算失败不影响主流程
            }
          }
        }

        return {
          metrics,
          suggestions: [{
            actionType: 'log_habit',
            label: `已打卡: ${title}`,
            weight: 40,
          }],
        }
      }

      case 'HabitSkipped':
        return {
          metrics: [],
          suggestions: [{
            actionType: 'log_habit',
            label: `streak 保护提醒: ${title}`,
            weight: streak > 3 ? 80 : 60,
          }],
        }

      case 'HabitSuspended':
        return {
          metrics: [],
          suggestions: [{
            actionType: 'log_habit',
            label: `习惯已暂停: ${title}`,
            weight: 45,
          }],
        }

      case 'HabitArchived':
        return {
          metrics: [],
          suggestions: [{
            actionType: 'log_habit',
            label: `习惯已归档: ${title}`,
            weight: 30,
          }],
        }

      case 'ExecutionLogged': {
        const sourceType = event.payload['sourceType'] as string
        if (sourceType === 'habit') {
          return { metrics: [], suggestions: [] }
        }
        return {
          metrics: [{ metricKey: 'habit_metrics_needs_update', value: 1 }],
          suggestions: [],
        }
      }

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
    const habits = snapshot.pendingHabits ?? []

    for (const habit of habits) {
      if (habit.trackable && !habit.todayLogged) {
        actions.push({
          id: `log-${habit.id}` as unknown as USOM_ID,
          sourceObjectId: habit.id as unknown as USOM_ID,
          sourceObjectType: 'habit',
          label: `待打卡: ${habit.title}`,
          actionType: 'log_habit',
          category: 'tile',
          weight: 70,
        })
      }

      if (habit.trackable && habit.streak === 6) {
        actions.push({
          id: `milestone-${habit.id}` as unknown as USOM_ID,
          sourceObjectId: habit.id as unknown as USOM_ID,
          sourceObjectType: 'habit',
          label: `再坚持1天就达成7天连续: ${habit.title}`,
          actionType: 'streak_milestone_hint',
          category: 'cue',
          weight: 85,
        })
      }
    }

    const maxWeight = actions.length > 0 ? Math.max(...actions.map(a => a.weight)) : 0
    return { actions, category: 'cue', weight: maxWeight }
  }

  return { onValidate, onEvent, onActionSurfaceRequest }
}
