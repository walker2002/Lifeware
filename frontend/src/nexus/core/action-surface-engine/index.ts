/**
 * @file index
 * @brief Action Surface Engine — 动作面引擎
 * 
 * 调用 DomainPlugin.onActionSurfaceRequest 生成 ActionSurface
 * 将候选项分类为 guide / tile / cue 三类
 */

import type { USOM_ID, Timestamp } from '@/usom/types/primitives'
import type {
  ActionSurface,
  ActionCandidate,
  ContextSnapshot,
  SystemEvent,
  DerivedSignals,
} from '@/usom/types/process'
import type { DomainPlugin } from '@/usom/types/process'

// ─── 引擎接口 ─────────────────────────────────────────────────

/**
 * 动作面引擎接口
 */
export interface ActionSurfaceEngine {
  /**
   * 生成动作面
   * @param snapshot - 上下文快照
   * @param event - 触发事件（可选）
   * @param userId - 用户 ID（可选）
   * @returns 动作面
   */
  generate(
    snapshot: ContextSnapshot,
    event?: SystemEvent,
    userId?: USOM_ID,
  ): Promise<ActionSurface>
}

// ─── Stub Signals（MVP 占位） ──────────────────────────────────

/** 创建默认 DerivedSignals（MVP 阶段使用全零/默认值） */
/**
 * 创建默认的派生信号对象
 * @param userId - 用户 ID
 * @returns 默认的派生信号
 */
function createStubSignals(userId: USOM_ID): DerivedSignals {
  return {
    userId,
    energyPattern: null,
    activeTaskCount: 0,
    avgCompletionRate7d: 0,
    avgCompletionRate30d: 0,
    habitStreaks: {},
    habitCompletionRates: {},
    timeboxAdherence7d: 0,
    isOvercommitted: false,
    computedAt: new Date().toISOString() as Timestamp,
    dataWindowDays: 7,
  }
}

// ─── 工厂函数 ─────────────────────────────────────────────────

/**
 * 创建 Action Surface Engine
 *
 * @param domainPlugin - 领域插件（如 TimeboxDomainPlugin）
 * @returns ActionSurfaceEngine 实例
 */
export function createActionSurfaceEngine(
  domainPlugin: DomainPlugin,
): ActionSurfaceEngine {
  return {
    async generate(snapshot, event, userId) {
      const effectiveUserId = userId ?? snapshot.userId
      const signals = createStubSignals(effectiveUserId)

      // 调用领域插件获取候选动作
      const result = domainPlugin.onActionSurfaceRequest(
        // ContextSnapshot 兼容 USOMSnapshot，需要转换
        snapshot as unknown as import('@/usom/types/process').USOMSnapshot,
        signals,
      )

      const now = new Date().toISOString() as Timestamp

      return {
        id: crypto.randomUUID() as USOM_ID,
        userId: effectiveUserId,
        snapshotId: snapshot.snapshotId,
        generatedAt: now,
        // 按类别分类候选项
        guide: result.actions.filter((a: ActionCandidate) => a.category === 'guide'),
        tiles: result.actions.filter((a: ActionCandidate) => a.category === 'tile'),
        cues: result.actions.filter((a: ActionCandidate) => a.category === 'cue'),
      }
    },
  }
}
