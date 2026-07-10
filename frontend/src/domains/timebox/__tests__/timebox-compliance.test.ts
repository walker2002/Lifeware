import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { timeboxPlugin } from '../index'
import { createTimeboxHooks } from '../hooks'
import { timeboxTransitions } from '../transitions'
import { loadDomainManifest } from '@/domains/manifest-loader'
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

  it('lifecycle.transitions 应包含 create/log/cancel/revert（[023.12] T4 3 态收敛表）', () => {
    expect(manifestContent).toMatch(/action:\s*create/)
    expect(manifestContent).toMatch(/action:\s*log/)
    expect(manifestContent).toMatch(/action:\s*cancel/)
    expect(manifestContent).toMatch(/action:\s*revert/)
  })

  it('lifecycle.states 应包含所有 timebox 状态（[023.12] T4 收敛为 3 态）', () => {
    // 从 states 列表中提取验证
    const statesMatch = manifestContent.match(/states:\s*\[([^\]]+)\]/)
    expect(statesMatch).not.toBeNull()
    const states = statesMatch![1]
    expect(states).toContain('planned')
    expect(states).toContain('logged')
    expect(states).toContain('cancelled')
    // 旧态 running/ended/overtime 已退役（[023.12] T3 derive-display-status 读时派生）
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
  it('transitions.ts 应导出 timeboxTransitions 数组（[023.12] T4 5 条 = 1 create + 1 log + 1 cancel + 2 revert）', () => {
    expect(Array.isArray(timeboxTransitions)).toBe(true)
    expect(timeboxTransitions.length).toBe(5)
  })

  it('应包含 create 转换 (null → planned)', () => {
    const create = timeboxTransitions.find(t => t.action === 'create')
    expect(create).toBeDefined()
    expect(create!.from).toBeNull()
    expect(create!.to).toBe('planned')
    expect(create!.eventType).toBe('TimeboxCreated')
  })

  it('应包含 revert 转换 (logged → planned + cancelled → planned)', () => {
    const revertFromLogged = timeboxTransitions.find(t => t.action === 'revert' && t.from === 'logged')
    const revertFromCancelled = timeboxTransitions.find(t => t.action === 'revert' && t.from === 'cancelled')
    expect(revertFromLogged).toBeDefined()
    expect(revertFromLogged!.to).toBe('planned')
    expect(revertFromLogged!.eventType).toBe('TimeboxReverted')
    expect(revertFromCancelled).toBeDefined()
    expect(revertFromCancelled!.to).toBe('planned')
    expect(revertFromCancelled!.eventType).toBe('TimeboxReverted')
  })
})

/**
 * [bugfix /timeboxes 编辑失败] timebox/appointment 的 startTime/endTime 是完整 ISO timestamp
 * （DB timestamp 列、UI datetime-local、server action 注释「ISO」、rule-engine 用 Date.parse 校验），
 * 不是「一天内时刻 HH:MM」。field_metadata 误声明为 `type: time` 会让 field-executor 在
 * updateTimebox/updateAppointment 的 field-step 路径上按 HH_MM_REGEX 拒绝 ISO（报「要求合法
 * HH:MM，得到 2026-07-07T16:30:00.000Z」），导致只要未填打卡字段（走 log 路径）的编辑一律失败。
 * 守护：这些 timestamp 字段的 type 不得回退为 'time'。
 */
describe('[bugfix] timestamp 字段不得声明为 time（HH:MM）— field-executor 会拒 ISO', () => {
  // 直接读 YAML loader 结果（timeboxPlugin.manifest 是精简 ProcessManifest，不含 field_metadata）
  const loaded = loadDomainManifest('timebox')
  const fm = (loaded.success ? loaded.manifest.field_metadata : {}) as unknown as Record<
    string,
    Record<string, { type: string }>
  >

  it('timebox.startTime 是 ISO timestamp → type 不为 time', () => {
    expect(fm.timebox?.startTime?.type).not.toBe('time')
  })

  it('timebox.endTime 是 ISO timestamp → type 不为 time', () => {
    expect(fm.timebox?.endTime?.type).not.toBe('time')
  })

  it('appointment.startTime 是 ISO timestamp → type 不为 time', () => {
    expect(fm.appointment?.startTime?.type).not.toBe('time')
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
