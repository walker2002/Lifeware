/**
 * @file timebox-status-transition-guard.test
 * @brief [023.13] TD-019 A1 / AM2 守护测试 — FieldCompletenessRule 对派生 STATUS_TRANSITION_ACTIONS
 *        集合内的 action 返回 pass（不误判 missing field → 不弹 confirmation dialog）
 *
 * 防止 core/rule-engine/rules/timebox.ts 副本再次漂移（[023.12] revertTimebox 漏注册根因）。
 * 与 domains/timebox/rules-registry.test.ts 的 STATUS_TRANSITION_ACTIONS describe 同语义，
 * 守护两侧都对派生集合成员 pass。
 */
import { describe, it, expect } from 'vitest'
import { FieldCompletenessRule } from '../rules/timebox'
import { buildStatusTransitionActions } from '@/domains/timebox/lib/build-status-transition-actions'
import type { StructuredIntent } from '@/usom/types/objects'
import type { ContextSnapshot } from '@/usom/types/process'

function makeSnapshot(): ContextSnapshot {
  return {
    snapshotId: 'snapshot-001',
    userId: 'user-001',
    generatedAt: new Date().toISOString(),
    generatedBy: 'state_machine',
    activeObjectives: [],
    activeKeyResults: [],
    activeTasks: [],
    pendingHabits: [],
    upcomingTimeboxes: [],
    pendingIntentions: [],
    currentTime: new Date().toISOString(),
    currentDate: '2026-07-07',
    dayOfWeek: 2,
    timeOfDay: 'morning',
    energyState: { inferredLevel: 7, calibratedLevel: null, activeLevel: 7, source: 'system' },
  }
}

/** 构造 status-transition intent：fields 仅 { objectId }，缺 title/startTime/endTime/durationMin */
function makeTransitionIntent(action: string): StructuredIntent {
  return {
    id: 'test-intent-001',
    intentionId: 'test-intention-001',
    targetDomain: 'timebox',
    action,
    fields: { objectId: 'test-object-id' },
    confidence: 1,
    resolvedBy: 'form',
    createdAt: new Date().toISOString(),
  } as unknown as StructuredIntent
}

describe('[023.13] FieldCompletenessRule × 派生 STATUS_TRANSITION_ACTIONS 守护', () => {
  // 派生集合动态：保证 manifest 改了 → 测试自动覆盖（drift 探测）
  const transitionActions = Array.from(buildStatusTransitionActions())

  for (const action of transitionActions) {
    it(`${action} 仅有 objectId 字段也应当 pass（字段从 DB 加载）`, async () => {
      const intent = makeTransitionIntent(action)
      const snapshot = makeSnapshot()
      const result = await FieldCompletenessRule.evaluate(intent, snapshot)
      expect(result.severity).toBe('pass')
    })
  }
})