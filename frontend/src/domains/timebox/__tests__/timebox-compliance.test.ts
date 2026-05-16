import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { timeboxPlugin } from '../index'
import { createTimeboxHooks } from '../hooks'
import { timeboxTransitions } from '../transitions'
import type { DomainManifest } from '@/usom/types/domain-types'

const MANIFEST_PATH = resolve(__dirname, '../manifest.yaml')

describe('T003: Timebox manifest.yaml 六区块完整性', () => {
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

  it('lifecycle 应包含 timebox 对象的状态定义', () => {
    expect(manifestContent).toContain('timebox:')
  })

  it('lifecycle.transitions 应包含 create/start/end/overtime/cancel/log', () => {
    expect(manifestContent).toMatch(/action:\s*create/)
    expect(manifestContent).toMatch(/action:\s*start/)
    expect(manifestContent).toMatch(/action:\s*end/)
    expect(manifestContent).toMatch(/action:\s*overtime/)
    expect(manifestContent).toMatch(/action:\s*cancel/)
    expect(manifestContent).toMatch(/action:\s*log/)
  })

  it('lifecycle.states 应包含所有 timebox 状态', () => {
    // 从 states 列表中提取验证
    const statesMatch = manifestContent.match(/states:\s*\[([^\]]+)\]/)
    expect(statesMatch).not.toBeNull()
    const states = statesMatch![1]
    expect(states).toContain('planned')
    expect(states).toContain('running')
    expect(states).toContain('ended')
    expect(states).toContain('overtime')
    expect(states).toContain('cancelled')
    expect(states).toContain('logged')
  })
})

describe('T004: Timebox hooks.ts 纯函数验证', () => {
  it('hooks.ts 不应包含数据库相关导入', async () => {
    const hooksContent = readFileSync(resolve(__dirname, '../hooks.ts'), 'utf-8')
    expect(hooksContent).not.toMatch(/from.*['"]@?\.?\.?\/?(lib\/db|drizzle|repository)/)
    expect(hooksContent).not.toMatch(/import.*[Rr]epository/)
  })

  it('createTimeboxHooks 工厂函数应从 hooks.ts 导出', () => {
    expect(typeof createTimeboxHooks).toBe('function')
  })

  it('createTimeboxHooks 应返回三个钩子函数', () => {
    // 使用 mock manifest 构造 hooks
    const mockManifest = {
      id: 'timebox', version: '1.0.0', name: 'Timebox', description: '',
      intent_triggers: [],
      lifecycle: { timebox: { states: ['planned'], initial_state: 'planned', transitions: [], terminal_states: [] } },
      field_metadata: {}, list_actions: [], required_fields: {},
      subscribed_events: ['TimeboxCreated'],
    }
    const hooks = createTimeboxHooks(mockManifest as any)
    expect(typeof hooks.onValidate).toBe('function')
    expect(typeof hooks.onEvent).toBe('function')
    expect(typeof hooks.onActionSurfaceRequest).toBe('function')
  })
})

describe('T005: Timebox transitions 一致性', () => {
  it('transitions.ts 应导出 timeboxTransitions 数组', () => {
    expect(Array.isArray(timeboxTransitions)).toBe(true)
    expect(timeboxTransitions.length).toBe(7)
  })

  it('应包含 create 转换 (null → planned)', () => {
    const create = timeboxTransitions.find(t => t.action === 'create')
    expect(create).toBeDefined()
    expect(create!.from).toBeNull()
    expect(create!.to).toBe('planned')
    expect(create!.eventType).toBe('TimeboxCreated')
  })

  it('应包含 start 转换 (planned → running)', () => {
    const start = timeboxTransitions.find(t => t.action === 'start')
    expect(start).toBeDefined()
    expect(start!.from).toBe('planned')
    expect(start!.to).toBe('running')
  })

  it('应包含 overtime 转换 (running → overtime)', () => {
    const overtime = timeboxTransitions.find(t => t.action === 'overtime')
    expect(overtime).toBeDefined()
    expect(overtime!.from).toBe('running')
    expect(overtime!.to).toBe('overtime')
  })
})

describe('T006: Timebox index.ts 插件入口', () => {
  it('timeboxPlugin.manifest 应存在', () => {
    expect(timeboxPlugin.manifest).toBeDefined()
  })

  it('timeboxPlugin.hooks 应通过 onValidate/onEvent/onActionSurfaceRequest 暴露', () => {
    expect(typeof timeboxPlugin.onValidate).toBe('function')
    expect(typeof timeboxPlugin.onEvent).toBe('function')
    expect(typeof timeboxPlugin.onActionSurfaceRequest).toBe('function')
  })

  it('manifest.domainId 应为 timebox', () => {
    expect(timeboxPlugin.manifest.domainId).toBe('timebox')
  })
})
