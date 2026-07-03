import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { okrsPlugin } from '../index'
import { createOkrsHooks } from '../hooks'

const MANIFEST_PATH = resolve(__dirname, '../manifest.yaml')

describe('T011: OKRs manifest.yaml 六区块完整性', () => {
  let manifestContent: string

  beforeAll(() => {
    manifestContent = readFileSync(MANIFEST_PATH, 'utf-8')
  })

  it('应包含 intent_triggers 区块 (A)', () => {
    expect(manifestContent).toContain('intent_triggers:')
  })

  it('应包含 lifecycle 区块 (B)', () => {
    expect(manifestContent).toContain('lifecycle:')
  })

  it('应包含 field_metadata 区块 (C)', () => {
    expect(manifestContent).toContain('field_metadata:')
  })

  it('应包含 list_actions 区块 (D)', () => {
    expect(manifestContent).toContain('list_actions:')
  })

  it('应包含 required_fields 区块 (E)', () => {
    expect(manifestContent).toContain('required_fields:')
  })

  it('应包含 subscribed_events 区块 (F)', () => {
    expect(manifestContent).toContain('subscribed_events:')
  })

  // [022.01] Phase 3：移除 objective/key_result 的独立状态机 transitions；
  // 仅保留 null→draft 最小 lifecycle 条目（orchestrator L951 要求）。
  // 状态权威收敛到 Cycle，Objective/KR 不再有 activate/pause/resume/complete 等状态转换。
  it('lifecycle objective/key_result 仅保留 null→draft 最小转换（Phase 3 收敛）', () => {
    expect(manifestContent).toMatch(/cycle:/)
    // 不应再有 activate/pause/resume/complete 等状态转换 action
    expect(manifestContent).not.toMatch(/action:\s*activate/)
    expect(manifestContent).not.toMatch(/action:\s*pause/)
    expect(manifestContent).not.toMatch(/action:\s*resume/)
    expect(manifestContent).not.toMatch(/action:\s*complete/)
    // objective/key_result terminal_states 应仅含 draft（无可达终态）
    expect(manifestContent).toMatch(/objective:[\s\S]*?terminal_states:\s*\[draft\]/)
    expect(manifestContent).toMatch(/key_result:[\s\S]*?terminal_states:\s*\[draft\]/)
  })

  it('intent_triggers 应仅包含 okrs（[022-A4] Phase 3 清理后）', () => {
    expect(manifestContent).toMatch(/action:\s*okrs/)
    expect(manifestContent).not.toMatch(/action:\s*createObjective/)
    expect(manifestContent).not.toMatch(/action:\s*activateObjective/)
    expect(manifestContent).not.toMatch(/action:\s*createKeyResult/)
    expect(manifestContent).not.toMatch(/action:\s*updateKeyResult/)
    expect(manifestContent).not.toMatch(/action:\s*updateKeyResultProgress/)
  })

  it('intent_triggers 应包含 okrs view_route', () => {
    expect(manifestContent).toMatch(/action:\s*okrs/)
    expect(manifestContent).toMatch(/view_route:\s*\/okrs/)
  })
})

describe('T012: OKRs hooks.ts 纯函数验证', () => {
  it('hooks.ts 不应包含数据库相关导入（[022-A4] 允许 IContributionRepository 类型导入）', async () => {
    const hooksContent = readFileSync(resolve(__dirname, '../hooks.ts'), 'utf-8')
    expect(hooksContent).not.toMatch(/from.*['"]@?\.?\.?\/?(lib\/db|drizzle)/)
    expect(hooksContent).not.toMatch(/import\s+(?!type).*[Rr]epository/)
  })

  it('createOkrsHooks 工厂函数应从 hooks.ts 导出', () => {
    expect(typeof createOkrsHooks).toBe('function')
  })

  it('createOkrsHooks 应返回三个钩子函数', () => {
    const mockManifest = {
      id: 'okrs',
      version: '1.0.0',
      name: 'OKR管理',
      description: '',
      intent_triggers: [],
      lifecycle: {},
      field_metadata: {
        okrType: { type: 'enum', label: 'OKR类型', required: false, options: ['visionary', 'committed'] },
      },
      list_actions: [],
      required_fields: {},
      // [022.01] Phase 3：subscribed_events 移除 7 个 ObjectiveCompleted/ObjectiveActivated/ObjectivePaused/ObjectiveResumed/ObjectiveDiscarded/ObjectiveArchived/KeyResultCompleted 等 Objective/KR 独立状态事件
      subscribed_events: ['ObjectiveCreated', 'KeyResultUpdated', 'KeyResultProgressUpdated', 'TaskCompleted', 'HabitLogged'],
    }
    const hooks = createOkrsHooks(mockManifest as any)
    expect(typeof hooks.onValidate).toBe('function')
    expect(typeof hooks.onEvent).toBe('function')
    expect(typeof hooks.onActionSurfaceRequest).toBe('function')
  })
})

// [022.01] Phase 3：删除 T013 objectiveTransitions/keyResultTransitions 测试 —
// Obj/KR 独立状态机已移除（状态权威收敛至 Cycle.status），不再有 transitions。

describe('T014: OKRs index.ts 插件入口', () => {
  it('okrsPlugin 应正确导出', () => {
    expect(okrsPlugin).toBeDefined()
  })

  it('okrsPlugin.manifest 应存在且 domainId 为 okrs', () => {
    expect(okrsPlugin.manifest).toBeDefined()
    expect(okrsPlugin.manifest.domainId).toBe('okrs')
  })

  it('okrsPlugin 应暴露 onValidate/onEvent/onActionSurfaceRequest 方法', () => {
    expect(typeof okrsPlugin.onValidate).toBe('function')
    expect(typeof okrsPlugin.onEvent).toBe('function')
    expect(typeof okrsPlugin.onActionSurfaceRequest).toBe('function')
  })
})