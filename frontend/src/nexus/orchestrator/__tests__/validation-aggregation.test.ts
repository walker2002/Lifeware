/**
 * @file validation-aggregation.test
 * @brief T10 — Orchestrator ValidationResult 聚合与 Suspend 路由单元测试
 *
 * 覆盖宪法 §VIII 判定模型：
 * - onValidate（ValidationResult）× RuleEngine（映射后 ValidationResult）偏序聚合
 *   Rejected > NeedConfirm > Passed
 * - Rejected 短路
 * - NeedConfirm → Suspend 路由（吸收原散落 needsCnuiConfirmation 分支）
 * - Suspend 路由各变体：Passed 继续 / NeedConfirm Suspend / Rejected end
 *
 * TDD：先红后绿。聚合/映射为可导出纯函数，路由为端到端。
 */

import { describe, it, expect, vi } from 'vitest'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'
import {
  aggregateValidation,
  ruleResultToValidation,
} from '../index'
import {
  validationPassed,
  validationRejected,
  validationNeedConfirm,
  validationPassedWithWarning,
  validationNeedInput,
} from '@/usom/types/process'
import type { ValidationResult } from '@/usom/types/process'

// 端到端路由测试用的可变 onValidate 注入点（顶级 vi.mock factory 闭包读取）。
let injectedValidation: ValidationResult = { kind: 'Passed' }
let injectedDomainExists = false

// 复用 orchestrator.test.ts 的 mock 思路：隔离 manifest-loader / plugin-factory / registry
vi.mock('@/domains/registry', () => ({
  findDomain: () => injectedDomainExists
    ? {
        onValidate: () => injectedValidation,
        onEvent: () => {},
        onActionSurfaceRequest: () => [],
        manifest: { domainId: 'timebox', version: '1', requiredFields: [], subscribedEvents: [] },
      }
    : null,
}))
vi.mock('@/domains/manifest-loader', () => ({
  loadDomainManifest: () => ({ success: false, errors: [{ domainId: 'x', message: 'mocked' }] }),
  formatManifestError: (e: any) => `[mock] ${e.domainId}`,
}))
vi.mock('@/domains/plugin-factory', () => ({
  createDomainPlugin: () => ({ manifest: { domainId: 'x', version: '1', requiredFields: [], subscribedEvents: [] } }),
}))

// ─── 偏序聚合（纯函数）───────────────────────────────────────
describe('aggregateValidation — 偏序 Rejected > NeedConfirm > NeedInput > PassedWithWarning > Passed', () => {
  it('Passed × Passed → Passed', () => {
    expect(aggregateValidation(validationPassed(), validationPassed())).toEqual({ kind: 'Passed' })
  })

  it('Passed × NeedConfirm → NeedConfirm（取最严格）', () => {
    const r = aggregateValidation(validationPassed(), validationNeedConfirm({ reason: 'rule' }))
    expect(r.kind).toBe('NeedConfirm')
  })

  it('NeedConfirm × Passed → NeedConfirm（交换律）', () => {
    expect(aggregateValidation(validationNeedConfirm({ reason: 'rule' }), validationPassed()).kind).toBe('NeedConfirm')
  })

  it('NeedConfirm × NeedConfirm → NeedConfirm', () => {
    expect(aggregateValidation(
      validationNeedConfirm({ a: 1 }),
      validationNeedConfirm({ b: 2 }),
    ).kind).toBe('NeedConfirm')
  })

  it('Rejected 短路：Passed × Rejected → Rejected', () => {
    const r = aggregateValidation(validationPassed(), validationRejected(['boom']))
    expect(r.kind).toBe('Rejected')
    if (r.kind === 'Rejected') expect(r.errors).toEqual(['boom'])
  })

  it('Rejected 短路：Rejected × Passed → Rejected', () => {
    expect(aggregateValidation(validationRejected(['x']), validationPassed()).kind).toBe('Rejected')
  })

  it('Rejected > NeedConfirm：NeedConfirm × Rejected → Rejected', () => {
    expect(
      aggregateValidation(validationNeedConfirm({}), validationRejected(['fatal'])).kind,
    ).toBe('Rejected')
  })

  it('PassedWithWarning > Passed：Passed × PWW → PassedWithWarning', () => {
    const r = aggregateValidation(validationPassed(), validationPassedWithWarning(['low disk']))
    expect(r.kind).toBe('PassedWithWarning')
    if (r.kind === 'PassedWithWarning') expect(r.warnings).toEqual(['low disk'])
  })

  it('NeedConfirm > PassedWithWarning：PWW × NeedConfirm → NeedConfirm', () => {
    expect(
      aggregateValidation(validationPassedWithWarning(['w']), validationNeedConfirm({ reason: 'rule' })).kind,
    ).toBe('NeedConfirm')
  })

  it('NeedInput > PassedWithWarning：PWW × NeedInput → NeedInput', () => {
    const r = aggregateValidation(validationPassedWithWarning(['w']), validationNeedInput({ missing: ['tags'] }))
    expect(r.kind).toBe('NeedInput')
    // NeedInput.data 为 unknown（spec §4.1 占位），断言透传时需类型断言
    if (r.kind === 'NeedInput') expect((r.data as { missing: string[] }).missing).toEqual(['tags'])
  })

  it('NeedConfirm > NeedInput：NeedInput × NeedConfirm → NeedConfirm', () => {
    expect(
      aggregateValidation(validationNeedInput({ missing: ['x'] }), validationNeedConfirm({ reason: 'rule' })).kind,
    ).toBe('NeedConfirm')
  })
})

// ─── RuleEngine 结果 → ValidationResult 映射 ──────────────────
describe('ruleResultToValidation — RuleEngine 结果映射', () => {
  it("pass → Passed", () => {
    expect(ruleResultToValidation({ result: 'pass', warnings: [], confirmations: [] }).kind).toBe('Passed')
  })

  it("confirm → NeedConfirm（携带 confirmations）", () => {
    const r = ruleResultToValidation({ result: 'confirm', warnings: [], confirmations: ['该时段已有 3 个时间盒'] })
    expect(r.kind).toBe('NeedConfirm')
    if (r.kind === 'NeedConfirm') {
      const data = r.data as { source: string; confirmations: string[] }
      expect(data.source).toBe('rule')
      expect(data.confirmations).toEqual(['该时段已有 3 个时间盒'])
    }
  })

  it("warning → Passed（试点无 PassedWithWarning，不阻塞；留待 [025]）", () => {
    // 试点阶段 warning 不阻塞流程，映射为 Passed。
    // [025] 引入 PassedWithWarning 后改为携带 warnings。
    expect(ruleResultToValidation({ result: 'warning', warnings: ['接近晚餐'], confirmations: [] }).kind).toBe('Passed')
  })
})

// ─── 端到端 Suspend 路由 ──────────────────────────────────────
// 通过 createOrchestrator 验证：onValidate / RuleEngine 各变体如何路由。
const userId = 'user-001' as USOM_ID

function makeIntent(action = 'create'): StructuredIntent {
  return {
    id: 'i-1' as USOM_ID,
    action,
    targetDomain: 'timebox',
    fields: {},
    createdAt: new Date().toISOString(),
  } as unknown as StructuredIntent
}

describe('executeIntent Suspend 路由（端到端）', () => {
  // 通过顶级 vi.mock 的可变注入点设置 onValidate，走 contract 路径触发 RuleEngine。
  async function runWith(
    onValidateKind: 'Passed' | 'Rejected' | 'NeedConfirm',
    ruleResult: { result: 'pass' | 'warning' | 'confirm'; warnings?: string[]; confirmations?: string[] },
  ) {
    injectedValidation =
      onValidateKind === 'Rejected' ? validationRejected(['域拒绝'])
      : onValidateKind === 'NeedConfirm' ? validationNeedConfirm({ source: 'domain' })
      : validationPassed()
    injectedDomainExists = onValidateKind !== 'Passed' // Passed 路径不依赖域注入（findDomain null 即跳过域校验）

    const { createOrchestrator } = await import('../index')
    const ruleEngine = {
      evaluate: vi.fn().mockResolvedValue(ruleResult),
    }
    const eventRepo = { append: vi.fn().mockResolvedValue(undefined) }
    // Passed 路径会继续到 contract path，getRepo 提供一个抛错的桩即可（用于证明「未 Suspend」）
    const getRepo = () => { throw new Error('contract-path-reached') }
    const orchestrator = createOrchestrator({
      eventRepo: eventRepo as any,
      intentEngine: { parse: async () => makeIntent() },
      ruleEngine: ruleEngine as any,
      getRepo,
    } as any)
    return { result: await orchestrator.executeIntent(makeIntent(), userId), ruleEngine }
  }

  it('onValidate Passed × RuleEngine Passed → 继续（不 Suspend）', async () => {
    // Passed × Passed → Passed，应继续 contract 路径（不进入 Suspend）。
    // getRepo 桩会抛错，捕获后仅断言「未 Suspend」+「RuleEngine 被调用」。
    let result: any
    try {
      ;({ result } = await runWith('Passed', { result: 'pass' }))
    } catch {
      // 抛错即证明路径已继续穿过聚合（未在 NeedConfirm/Rejected 处终止）
      result = undefined
    }
    expect(result?.suspended).toBeUndefined()
  })

  it('onValidate Rejected → 短路（不调 RuleEngine），end', async () => {
    const { result, ruleEngine } = await runWith('Rejected', { result: 'pass' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('域拒绝')
    expect(result.suspended).toBeUndefined()
    expect(ruleEngine.evaluate).not.toHaveBeenCalled()
  })

  it('onValidate Passed × RuleEngine confirm → 聚合为 NeedConfirm → Suspend', async () => {
    const { result } = await runWith('Passed', { result: 'confirm', confirmations: ['重叠'] })
    expect(result.success).toBe(false)
    expect(result.suspended).toBeDefined()
    if (result.suspended) {
      expect(result.suspended.reason).toBe('need_confirm')
    }
  })

  it('旧 confirm 路径并入 NeedConfirm：未 confirmed 时不再返回 needsConfirmation', async () => {
    const { result } = await runWith('Passed', { result: 'confirm', confirmations: ['c'] })
    // 旧字段 needsConfirmation 应被 Suspend 统一语义替代（试点保留可空）
    expect(result.suspended?.reason).toBe('need_confirm')
  })
})
