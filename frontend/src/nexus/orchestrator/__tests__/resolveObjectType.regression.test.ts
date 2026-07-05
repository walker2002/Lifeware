/**
 * @file resolveObjectType.regression.test.ts
 * @brief [023.05] PR2 阶段 2：F1 + T1 回归守护
 *
 * F1: resolveObjectType PascalCase 分派（lifecycle-configs.ts）
 *   - 守卫 timebox 域在 [023.05] 后正确把 action 名含 "Appointment" 路由到
 *     objectType='appointment'（与 manifest.lifecycle.appointment 对齐），
 *     而其他 action（createSmartTimeboxes / createTimebox）保留为 'timebox'。
 *
 * T1: isAppointmentIntent rule-engine 分派镜像（rule-engine/rules/timebox.ts）
 *   - 间接验证：isAppointmentIntent 在 timebox.ts 中**未 export**，因此通过
 *     FieldCompletenessRule 行为差异验证分派——
 *     appointment 类 action 走 evaluateCompleteness(['title','startTime','durationMin'])
 *     timebox 类 action 走 evaluateCompleteness(['title','startTime','endTime'])
 *     这是 [026] P0-2 修复点，T1 实际守卫此分派不被回滚。
 *
 * 历史背景：
 *   - codex #1 修正 import 路径：从 src/nexus/orchestrator/__tests__/ 出发到
 *     rule-engine/rules/timebox 应为 '../../core/rule-engine/rules/timebox'（3 层）
 *     而非 '../../../core/...'（4 层）。
 *   - resolveObjectType 顶层签名（lifecycle-configs.ts:120）：
 *       (domainId: string, action: string) => string
 *     返回 lifecycle objectType key（snake_case：timebox | appointment | objective | key_result）。
 *   - getTransitionFromManifest（lifecycle-configs.ts:169）：
 *       (domainId, objectType, fromState, action)
 *         => { from, action, to, eventType } | undefined
 *     注意返回字段是 camelCase `eventType`（内部从 manifest `event_type` 映射）。
 *
 * Mock 必要性（与 src/nexus/orchestrator/__tests__/orchestrator.test.ts 既有模式对齐）：
 *   - 真实 lifecycle-configs.ts 顶层 import '@/domains/registry' + '@/domains/manifest-loader'
 *     这条链（registry → timebox index → rules-registry → evaluate.ts → @/nexus/orchestrator
 *     → index.ts:322 const ACTION_MAP = buildActionMap()）在 ESM 下会触发循环 TDZ
 *     'Cannot access DOMAIN_IDS before initialization'（[022.01] 已记录但未根治）。
 *   - 既有 orchestrator.test.ts 用 vi.mock('../lifecycle-configs', ...) 绕开。
 *   - 本回归测试**必须验证真分派**（F1 是契约守护），所以 mock manifest-loader 提供
 *     真实 appointment manifest，lifecycle-configs.ts 仍走真函数体但避开循环顶层副作用。
 */

import { describe, it, expect, vi } from 'vitest'

// 提供真实 appointment manifest fixture，让 lifecycle-configs 真路径可走
vi.mock('@/domains/manifest-loader', () => ({
  loadDomainManifest: (domainId: string) => {
    if (domainId === 'timebox') {
      return {
        success: true,
        manifest: {
          lifecycle: {
            timebox: { transitions: [{ action: 'create' }, { action: 'start' }, { action: 'end' }] },
            appointment: {
              transitions: [
                { from: null, to: 'scheduled', action: 'create', event_type: 'AppointmentCreated' },
                { from: 'scheduled', to: 'in_progress', action: 'markInProgress', event_type: 'AppointmentMarkedInProgress' },
                { from: 'scheduled', to: 'expired', action: 'markExpired', event_type: 'AppointmentMarkedExpired' },
                { from: 'in_progress', to: 'expired', action: 'markExpired', event_type: 'AppointmentMarkedExpired' },
                { from: 'scheduled', to: 'cancelled', action: 'cancel', event_type: 'AppointmentCancelled' },
                { from: 'in_progress', to: 'cancelled', action: 'cancel', event_type: 'AppointmentCancelled' },
              ],
            },
          },
          intent_triggers: [],
        },
      }
    }
    return { success: false, errors: [{ domainId, message: 'mocked' }] }
  },
  formatManifestError: (e: any) => `[${e.phase}] ${e.domainId}: ${e.message}`,
}))

vi.mock('@/domains/registry', () => ({
  findDomain: () => undefined,
}))

import { resolveObjectType, getTransitionFromManifest } from '../lifecycle-configs'
import { FieldCompletenessRule } from '../../core/rule-engine/rules/timebox'
import type { StructuredIntent } from '@/usom/types/objects'
import type { ContextSnapshot } from '@/usom/types/process'

// ─── 测试用 mock 工厂 ─────────────────────────────────────────

function makeIntent(overrides: Partial<StructuredIntent> = {}): StructuredIntent {
  const startTime = new Date(Date.now() + 3600_000).toISOString()
  const endTime = new Date(Date.now() + 5400_000).toISOString()
  return {
    id: 'test-intent-001',
    intentionId: 'test-intention-001',
    targetDomain: 'timebox',
    action: 'create_timebox',
    fields: {
      title: '测试约定',
      startTime,
      endTime,
      durationMin: 60,
    },
    confidence: 0.9,
    resolvedBy: 'ai',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

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
    currentDate: '2026-07-05',
    dayOfWeek: 0,
    energyLevel: 'medium',
  } as unknown as ContextSnapshot
}

// ─── F1: resolveObjectType PascalCase 分派 ─────────────────────

describe('[023.05] F1 resolveObjectType PascalCase 分派', () => {
  it('createAppointment 路由到 appointment lifecycle（不是 timebox）', () => {
    expect(resolveObjectType('timebox', 'createAppointment')).toBe('appointment')
  })

  it('createSmartTimeboxes 仍路由到 timebox（不含 Appointment 子串）', () => {
    expect(resolveObjectType('timebox', 'createSmartTimeboxes')).toBe('timebox')
  })

  it('editAppointment/deleteAppointment/viewAppointments/cancelAppointment 全路由到 appointment', () => {
    expect(resolveObjectType('timebox', 'editAppointment')).toBe('appointment')
    expect(resolveObjectType('timebox', 'deleteAppointment')).toBe('appointment')
    expect(resolveObjectType('timebox', 'viewAppointments')).toBe('appointment')
    expect(resolveObjectType('timebox', 'cancelAppointment')).toBe('appointment')
  })

  it('getTransitionFromManifest: appointment create → to=scheduled, eventType=AppointmentCreated', () => {
    const t = getTransitionFromManifest('timebox', 'appointment', null, 'create')
    expect(t).toBeDefined()
    expect(t?.eventType).toBe('AppointmentCreated')
    expect(t?.to).toBe('scheduled')
    expect(t?.from).toBeNull()
    expect(t?.action).toBe('create')
  })

  it('getTransitionFromManifest: appointment markExpired（from in_progress）存在', () => {
    const t = getTransitionFromManifest('timebox', 'appointment', 'in_progress', 'markExpired')
    expect(t).toBeDefined()
    expect(t?.to).toBe('expired')
    expect(t?.eventType).toBe('AppointmentMarkedExpired')
  })
})

// ─── T1: isAppointmentIntent 分派镜像（行为验证） ──────────────

describe('[023.05] T1 isAppointmentIntent rule-engine 镜像分派', () => {
  it('appointment action: 缺 durationMin → warning（缺 durationMin）', async () => {
    // appointment 域必含 title/startTime/durationMin（[026] P0-2 修复）
    const intent = makeIntent({
      action: 'createAppointment',
      fields: {
        title: 'T1 测试约定',
        startTime: new Date(Date.now() + 3600_000).toISOString(),
        // 故意不传 durationMin
      },
    })
    const result = await FieldCompletenessRule.evaluate(intent, makeSnapshot())
    expect(result.severity).toBe('warning')
    if (result.severity === 'warning') {
      expect(result.message).toMatch(/durationMin/)
    }
  })

  it('timebox action: 缺 endTime → warning（缺 endTime，不验 durationMin）', async () => {
    // timebox 域必含 title/startTime/endTime（durationMin 不必含）
    const startTime = new Date(Date.now() + 3600_000).toISOString()
    const intent = makeIntent({
      action: 'createSmartTimeboxes',
      fields: {
        title: 'T1 测试时间盒',
        startTime,
        durationMin: 60,
        // 故意不传 endTime
      },
    })
    const result = await FieldCompletenessRule.evaluate(intent, makeSnapshot())
    expect(result.severity).toBe('warning')
    if (result.severity === 'warning') {
      expect(result.message).toMatch(/endTime/)
      // 关键：不应提示缺 durationMin（timebox 域不要求）
      expect(result.message).not.toMatch(/durationMin/)
    }
  })

  it('appointment action 全字段齐 → pass（不误报）', async () => {
    const intent = makeIntent({
      action: 'editAppointment',
      fields: {
        title: 'T1 改约定',
        startTime: new Date(Date.now() + 3600_000).toISOString(),
        durationMin: 30,
      },
    })
    const result = await FieldCompletenessRule.evaluate(intent, makeSnapshot())
    expect(result.severity).toBe('pass')
  })
})