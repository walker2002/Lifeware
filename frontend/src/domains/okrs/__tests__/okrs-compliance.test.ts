import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { okrsPlugin } from '../index'
import { createOkrsHooks } from '../hooks'
import { objectiveTransitions, keyResultTransitions } from '../transitions'

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

  it('lifecycle 应包含 objective 和 key_result 两个对象的状态定义', () => {
    expect(manifestContent).toMatch(/objective:/)
    expect(manifestContent).toMatch(/key_result:/)
  })

  it('intent_triggers 应仅包含 okrs（[022-A4] Phase 3 清理后）', () => {
    // [022-A4] 移除 lifecycle action triggers；仅保留 okrs 导航类意图
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
    // 禁止直接 import DB / repository 实体（constitution §VI 无副作用原则）
    expect(hooksContent).not.toMatch(/from.*['"]@?\.?\.?\/?(lib\/db|drizzle)/)
    // 允许接口类型导入（IContributionRepository），但禁止具体实现类
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
      subscribed_events: ['ObjectiveCreated', 'ObjectiveActivated', 'ObjectivePaused', 'ObjectiveResumed', 'ObjectiveCompleted', 'ObjectiveDiscarded', 'ObjectiveArchived', 'KeyResultUpdated', 'KeyResultCompleted', 'KeyResultProgressUpdated', 'TaskCompleted', 'HabitLogged'],
    }
    const hooks = createOkrsHooks(mockManifest as any)
    expect(typeof hooks.onValidate).toBe('function')
    expect(typeof hooks.onEvent).toBe('function')
    expect(typeof hooks.onActionSurfaceRequest).toBe('function')
  })
})

describe('T013: OKRs transitions 一致性', () => {
  it('transitions.ts 应导出 objectiveTransitions (10 条)', () => {
    expect(Array.isArray(objectiveTransitions)).toBe(true)
    expect(objectiveTransitions.length).toBe(10)
  })

  it('transitions.ts 应导出 keyResultTransitions (10 条)', () => {
    expect(Array.isArray(keyResultTransitions)).toBe(true)
    expect(keyResultTransitions.length).toBe(10)
  })

  it('objectiveTransitions 应包含 create 转换 (null → draft)', () => {
    const create = objectiveTransitions.find(t => t.action === 'create')
    expect(create).toBeDefined()
    expect(create!.from).toBeNull()
    expect(create!.to).toBe('draft')
    expect(create!.eventType).toBe('ObjectiveCreated')
  })

  it('objectiveTransitions 应包含 activate 转换 (draft → active)', () => {
    const activate = objectiveTransitions.find(t => t.action === 'activate' && t.from === 'draft')
    expect(activate).toBeDefined()
    expect(activate!.to).toBe('active')
    expect(activate!.eventType).toBe('ObjectiveActivated')
  })

  it('keyResultTransitions 应包含 create 转换 (null → draft)', () => {
    const create = keyResultTransitions.find(t => t.action === 'create')
    expect(create).toBeDefined()
    expect(create!.from).toBeNull()
    expect(create!.to).toBe('draft')
    expect(create!.eventType).toBe('KeyResultUpdated')
  })

  it('keyResultTransitions 应包含 complete 转换 (active → completed)', () => {
    const complete = keyResultTransitions.find(t => t.action === 'complete')
    expect(complete).toBeDefined()
    expect(complete!.from).toBe('active')
    expect(complete!.to).toBe('completed')
    expect(complete!.eventType).toBe('KeyResultCompleted')
  })
})

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
