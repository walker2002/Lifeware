/**
 * @file hooks
 * @brief Timebox 域钩子函数工厂
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
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID, ActionCategory } from '@/usom/types/primitives'
import type { DomainManifest } from '@/domains/manifest-loader/schema'
import { evaluateDomainRules } from '@/nexus/rules'
import { timeboxRuleRegistry } from './rules-registry'

/** 即将开始阈值（毫秒） */
const UPCOMING_THRESHOLD_MS = 15 * 60 * 1000

/**
 * 创建时间盒域钩子函数
 * @param manifest - 域 manifest
 * @returns 钩子函数对象
 */
export function createTimeboxHooks(manifest: DomainManifest) {
  const subscribedEvents = new Set(manifest.subscribed_events)

  /**
   * 验证意图（[018-G3] R2 + codex E5：改调 evaluateDomainRules，规则声明式化）
   * 规则逻辑全部迁入 timeboxRuleRegistry（见 ./rules-registry）；本处仅薄壳委托。
   *
   * **R11** — 唯一生产调用方 `nexus/orchestrator/index.ts:742` 已用 `await`，
   * async 签名安全。无其他生产 caller。tests `timebox-domain.test.ts`
   * 兼容（`await timeboxPlugin.onValidate`）。
   *
   * **R15** — 本 onValidate **有意省略** `normalizeFieldValues` 预处理：
   * timebox 字段简单无 enum（title 字符串 + startTime ISO + duration number），
   * 不存在中文→枚举映射或日期格式整理需求。A1 若给 timebox 加 enum 字段
   * （如 activityArchetypeId L1/L2 校验），需补 normalize 预处理。
   */
  async function onValidate(
    intent: StructuredIntent,
    snapshot: USOMSnapshot,
  ): Promise<ValidationResult> {
    return evaluateDomainRules('timebox', intent, {
      repos: {},
      userId: snapshot.userId,
      now: snapshot.currentTime ? Date.parse(snapshot.currentTime) : 0,
    }, timeboxRuleRegistry)
  }

  /**
   * 处理系统事件
   * @param event - 系统事件
   * @param _snapshot - USOM 快照
   * @returns 指标更新和动作表面建议
   */
  function onEvent(
    event: SystemEvent,
    _snapshot: USOMSnapshot,
  ): { metrics: MetricUpdate[]; suggestions: ActionSurfaceSuggestion[] } {
    if (!subscribedEvents.has(event.type)) {
      return { metrics: [], suggestions: [] }
    }

    const title = (event.payload['title'] as string) || '未命名时间盒'
    const metrics: MetricUpdate[] = []

    switch (event.type) {
      case 'TimeboxCreated':
        return {
          metrics,
          suggestions: [{
            actionType: 'start_timebox',
            label: `时间盒已创建: ${title}`,
            weight: 60,
          }],
        }

      case 'TimeboxStarted':
        return {
          metrics,
          suggestions: [{
            actionType: 'start_timebox',
            label: `时间盒开始: ${title}`,
            weight: 70,
          }],
        }

      case 'TimeboxOvertime':
        return {
          metrics,
          suggestions: [{
            actionType: 'start_timebox',
            label: `时间盒超时: ${title}`,
            weight: 85,
          }],
        }

      case 'TimeboxEnded':
        return {
          metrics,
          suggestions: [{
            actionType: 'capture_intent',
            label: '时间盒结束，请记录执行结果',
            weight: 70,
          }],
        }

      case 'TimeboxCancelled':
        return {
          metrics,
          suggestions: [{
            actionType: 'skip',
            label: `时间盒已取消: ${title}`,
            weight: 40,
          }],
        }

      case 'TimeboxLogged':
        return {
          metrics,
          suggestions: [{
            actionType: 'start_timebox',
            label: `已记录: ${title}`,
            weight: 50,
          }],
        }

      case 'ExecutionLogged': {
        const sourceType = event.payload['sourceType'] as string
        if (sourceType === 'timebox') {
          return { metrics, suggestions: [] }
        }
        const targetType = event.payload['targetType'] as string
        const targetId = event.payload['targetId'] as string
        if (sourceType === 'habit' && targetType === 'timebox' && targetId) {
          return {
            metrics,
            suggestions: [{
              actionType: 'start_timebox',
              suggestionType: 'state_transition',
              targetType: 'timebox',
              targetId,
              label: '关联习惯已打卡，确认执行记录？',
              weight: 70,
            }],
          }
        }
        return { metrics, suggestions: [] }
      }

      default:
        return { metrics, suggestions: [] }
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
    const now = new Date(snapshot.currentTime).getTime()

    if (snapshot.currentTimebox && snapshot.currentTimebox.status === 'overtime') {
      const tb = snapshot.currentTimebox
      actions.push({
        id: `action-${tb.id}-overtime` as USOM_ID,
        sourceObjectId: tb.id,
        sourceObjectType: 'timebox',
        label: `已超时: ${tb.title}`,
        actionType: 'start_timebox',
        category: 'tile',
        weight: 95,
      })
      return { actions, category: 'tile', weight: 95 }
    }

    if (snapshot.currentTimebox && snapshot.currentTimebox.status === 'running') {
      const tb = snapshot.currentTimebox
      actions.push({
        id: `action-${tb.id}-running` as USOM_ID,
        sourceObjectId: tb.id,
        sourceObjectType: 'timebox',
        label: `进行中: ${tb.title}`,
        actionType: 'start_timebox',
        category: 'tile',
        weight: 90,
      })
      return { actions, category: 'tile', weight: 90 }
    }

    for (const tb of snapshot.upcomingTimeboxes) {
      if (tb.status === 'planned') {
        const startMs = new Date(tb.startTime).getTime()
        const diff = startMs - now
        if (diff >= 0 && diff <= UPCOMING_THRESHOLD_MS) {
          actions.push({
            id: `action-${tb.id}-upcoming` as USOM_ID,
            sourceObjectId: tb.id,
            sourceObjectType: 'timebox',
            label: `即将开始: ${tb.title}`,
            actionType: 'start_timebox',
            category: 'cue',
            weight: 80,
          })
        }
      }
    }
    if (actions.length > 0) {
      return { actions, category: 'cue', weight: 80 }
    }

    if (snapshot.currentTimebox && snapshot.currentTimebox.status === 'ended') {
      const tb = snapshot.currentTimebox
      actions.push({
        id: `action-${tb.id}-ended` as USOM_ID,
        sourceObjectId: tb.id,
        sourceObjectType: 'timebox',
        label: `记录执行结果: ${tb.title}`,
        actionType: 'capture_intent',
        category: 'cue',
        weight: 70,
      })
      return { actions, category: 'cue', weight: 70 }
    }

    return { actions, category: 'cue', weight: 0 }
  }

  return { onValidate, onEvent, onActionSurfaceRequest }
}
