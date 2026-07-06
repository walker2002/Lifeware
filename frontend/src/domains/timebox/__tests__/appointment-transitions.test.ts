/**
 * @file appointment-transitions.test
 * @brief Appointment SM transition 表测试（T5, AM3）
 *
 * [023.12] T5 新 lifecycle（3 态收敛）：scheduled / cancelled / completed。
 * 5 transitions：null→scheduled(create) / scheduled→cancelled(cancel) /
 *                scheduled→completed(complete) / cancelled→scheduled(revert) /
 *                completed→scheduled(revert)。terminal_states=[]（无终态，全部可 revert）。
 *
 * Appointment lifecycle 来自 manifest.yaml（[023.12] T5 收敛 3 态）——SSOT 是
 * manifest，而非 TS 内联对象。本测试通过 `loadDomainManifest` 直接读 manifest.yaml
 * 拿 transition 表（不绕 lifecycle-configs，避其 buildActionMap 的预存 DOMAIN_IDS
 * 循环依赖问题），等同于把 manifest 的 appointment 块锁死。
 *
 * AM3 要求至少 4 case，本文件覆盖 10+ case 把整张表锁死。
 */

import { describe, it, expect } from 'vitest'
import { loadDomainManifest } from '@/domains/manifest-loader'
import type { AppointmentStatus } from '@/usom/types/primitives'

/** AppointmentStatus | null 的 from 校验 */
type AnyStatus = AppointmentStatus | null

/** 缓存的 manifest（仅加载一次） */
const manifestResult = loadDomainManifest('timebox')
if (!manifestResult.success) {
  throw new Error(`loadDomainManifest('timebox') failed: ${JSON.stringify(manifestResult.error)}`)
}
const appointmentLifecycle = manifestResult.manifest.lifecycle?.appointment
if (!appointmentLifecycle) {
  throw new Error('manifest.timebox.lifecycle.appointment missing')
}
const transitions = appointmentLifecycle.transitions

/**
 * 在 manifest 的 appointment transitions 表中查 (from, action) → to/eventType
 */
function findTransition(
  from: AnyStatus,
  action: string,
): { from: string | null; to: string; action: string; eventType: string } | null {
  for (const t of transitions) {
    // manifest 字段：from (string|null) / to / action / event_type
    const tFrom = t.from as string | null
    if (tFrom === from && t.action === action) {
      return {
        from: tFrom,
        to: t.to as string,
        action: t.action as string,
        eventType: (t as any).event_type as string,
      }
    }
  }
  return null
}

/** 简化：能否 transition */
function canTransition(from: AnyStatus, action: string): boolean {
  return findTransition(from, action) !== null
}

/** 抽 eventType 验 */
function eventTypeOf(from: AnyStatus, action: string): string | undefined {
  return findTransition(from, action)?.eventType
}

describe('appointmentTransitions（[023.12] T5 3 态收敛表，from manifest）', () => {
  // ─── 表结构断言 ────────────────────────────────────────────────

  it('manifest appointment 块含 5 条转换（1 create + 1 cancel + 1 complete + 2 revert）', () => {
    expect(transitions).toHaveLength(5)
  })

  it('manifest appointment 块不包含 markInProgress / markExpired 旧动作', () => {
    const actions = transitions.map(t => t.action)
    expect(actions).not.toContain('markInProgress')
    expect(actions).not.toContain('markExpired')
  })

  it('manifest appointment 块 initial_state=scheduled（create 转换 from=null to=scheduled）', () => {
    expect(appointmentLifecycle.initial_state).toBe('scheduled')
    const t = findTransition(null, 'create')
    expect(t).not.toBeNull()
    expect(t?.to).toBe('scheduled')
  })

  it('manifest appointment 块 terminal_states=[]（全部可 revert）', () => {
    expect(appointmentLifecycle.terminal_states).toEqual([])
    // 验证两个终态都能 revert → scheduled
    expect(canTransition('cancelled', 'revert')).toBe(true)
    expect(canTransition('completed', 'revert')).toBe(true)
  })

  // ─── 合法转换（[AM3] 必含 4 case + bonus）─────────────────────

  it('null→scheduled（create）合法', () => {
    expect(canTransition(null, 'create')).toBe(true)
  })

  it('scheduled→cancelled（cancel）合法', () => {
    expect(canTransition('scheduled', 'cancel')).toBe(true)
  })

  it('scheduled→completed（complete）合法', () => {
    expect(canTransition('scheduled', 'complete')).toBe(true)
  })

  // [AM3] 必含 4 case 之一：revert from cancelled
  it('cancelled→scheduled（revert）合法', () => {
    expect(canTransition('cancelled', 'revert')).toBe(true)
  })

  // [AM3] 必含 4 case 之一：revert from completed
  it('completed→scheduled（revert）合法', () => {
    expect(canTransition('completed', 'revert')).toBe(true)
  })

  // ─── 同态拒绝（[AM3] 必含 3 case）─────────────────────────────

  // [AM3] 必含 4 case 之一：cancelled→cancelled rejected
  it('cancelled→cancelled（同态）拒绝', () => {
    expect(canTransition('cancelled', 'cancel')).toBe(false)
  })

  // [AM3] 必含 4 case 之一：completed→completed rejected
  it('completed→completed（同态）拒绝', () => {
    expect(canTransition('completed', 'complete')).toBe(false)
  })

  // [AM3] 必含 4 case 之一：scheduled→scheduled rejected
  it('scheduled→scheduled（同态）拒绝（无任何 from=scheduled 转换的 to=scheduled）', () => {
    const fromScheduled = transitions.filter(t => t.from === 'scheduled')
    expect(fromScheduled.length).toBeGreaterThan(0)
    for (const t of fromScheduled) {
      expect(t.to).not.toBe('scheduled')
    }
  })

  // ─── 非法 forward（[AM3] 必含 2 case）─────────────────────────

  // [AM3] 必含 4 case 之一：cancelled→completed 非法 forward
  it('cancelled→completed（非法 forward）拒绝', () => {
    expect(canTransition('cancelled', 'complete')).toBe(false)
  })

  // [AM3] 必含 4 case 之一：completed→cancelled 非法 forward
  it('completed→cancelled（非法 forward）拒绝', () => {
    expect(canTransition('completed', 'cancel')).toBe(false)
  })

  // ─── 旧动作拒绝（bonus 守 SM 一致性）─────────────────────────

  it('旧 markInProgress 动作对所有 from 状态拒绝（已退役，读时派生）', () => {
    expect(canTransition(null, 'markInProgress')).toBe(false)
    expect(canTransition('scheduled', 'markInProgress')).toBe(false)
    expect(canTransition('cancelled', 'markInProgress')).toBe(false)
    expect(canTransition('completed', 'markInProgress')).toBe(false)
  })

  it('旧 markExpired 动作对所有 from 状态拒绝（已退役，读时派生）', () => {
    expect(canTransition(null, 'markExpired')).toBe(false)
    expect(canTransition('scheduled', 'markExpired')).toBe(false)
    expect(canTransition('cancelled', 'markExpired')).toBe(false)
    expect(canTransition('completed', 'markExpired')).toBe(false)
  })

  // ─── event_type 验证（事件订阅链路完整性）─────────────────────

  it('create 转换发 AppointmentCreated', () => {
    expect(eventTypeOf(null, 'create')).toBe('AppointmentCreated')
  })

  it('cancel 转换发 AppointmentCancelled', () => {
    expect(eventTypeOf('scheduled', 'cancel')).toBe('AppointmentCancelled')
  })

  it('complete 转换发 AppointmentCompleted', () => {
    expect(eventTypeOf('scheduled', 'complete')).toBe('AppointmentCompleted')
  })

  // [AM3] 必含：两条 revert 都发 AppointmentReverted（SM 一致）
  it('两条 revert 都发 AppointmentReverted（SM 一致）', () => {
    expect(eventTypeOf('cancelled', 'revert')).toBe('AppointmentReverted')
    expect(eventTypeOf('completed', 'revert')).toBe('AppointmentReverted')
  })

  it('所有转换的 eventType 字段非空', () => {
    for (const t of transitions) {
      expect((t as any).event_type).toBeTruthy()
    }
  })
})
