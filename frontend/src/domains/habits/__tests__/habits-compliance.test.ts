// Habits Domain Compliance Test — TDD 先写测试
// 验证 T007-T010 的合规性要求
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { habitsPlugin } from '../index'
import { onValidate, onEvent, onActionSurfaceRequest } from '../hooks'
import { habitTransitions } from '../transitions'

const MANIFEST_PATH = resolve(__dirname, '../manifest.yaml')

describe('T007: Habits manifest.yaml 六区块完整性', () => {
  let manifestContent: string

  beforeAll(() => {
    manifestContent = readFileSync(MANIFEST_PATH, 'utf-8')
  })

  it('应包含 intent_triggers 区块 (A)', () => {
    expect(manifestContent).toContain('intent_triggers:')
  })

  it('intent_triggers 应包含 createHabit/activateHabit/suspendHabit/archiveHabit/reactivateHabit', () => {
    expect(manifestContent).toMatch(/action:\s*createHabit/)
    expect(manifestContent).toMatch(/action:\s*activateHabit/)
    expect(manifestContent).toMatch(/action:\s*suspendHabit/)
    expect(manifestContent).toMatch(/action:\s*archiveHabit/)
    expect(manifestContent).toMatch(/action:\s*reactivateHabit/)
  })

  it('intent_triggers 应包含 view_list 和 view_templates 含 view_route', () => {
    expect(manifestContent).toMatch(/action:\s*view_list/)
    expect(manifestContent).toMatch(/action:\s*view_templates/)
    expect(manifestContent).toMatch(/view_route:/)
  })

  it('应包含 lifecycle 区块 (B)', () => {
    expect(manifestContent).toContain('lifecycle:')
  })

  it('lifecycle 应包含 habit 对象的状态定义', () => {
    expect(manifestContent).toContain('habit:')
  })

  it('lifecycle.states 应包含 draft/active/suspended/archived', () => {
    const statesMatch = manifestContent.match(/states:\s*\[([^\]]+)\]/)
    expect(statesMatch).not.toBeNull()
    const states = statesMatch![1]
    expect(states).toContain('draft')
    expect(states).toContain('active')
    expect(states).toContain('suspended')
    expect(states).toContain('archived')
  })

  it('lifecycle.transitions 应包含 5 个转换', () => {
    expect(manifestContent).toMatch(/action:\s*create/)
    expect(manifestContent).toMatch(/action:\s*activate/)
    expect(manifestContent).toMatch(/action:\s*suspend/)
    expect(manifestContent).toMatch(/action:\s*reactivate/)
    expect(manifestContent).toMatch(/action:\s*archive/)
  })

  it('应包含 field_metadata 区块 (C)', () => {
    expect(manifestContent).toContain('field_metadata:')
  })

  it('field_metadata 应包含 title/defaultTime/defaultDuration/frequencyType/daysOfWeek/trackable/minDuration', () => {
    expect(manifestContent).toContain('title:')
    expect(manifestContent).toContain('defaultTime:')
    expect(manifestContent).toContain('defaultDuration:')
    expect(manifestContent).toContain('frequencyType:')
    expect(manifestContent).toContain('daysOfWeek:')
    expect(manifestContent).toContain('trackable:')
    expect(manifestContent).toContain('minDuration:')
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
})

describe('T008: Habits hooks.ts 纯函数验证', () => {
  it('hooks.ts 不应包含数据库相关导入', () => {
    const hooksContent = readFileSync(resolve(__dirname, '../hooks.ts'), 'utf-8')
    expect(hooksContent).not.toMatch(/from.*['"]@?\.?\.?\/?(lib\/db|drizzle|repository)/)
    expect(hooksContent).not.toMatch(/import.*[Rr]epository/)
  })

  it('onValidate 应从 hooks.ts 导出', () => {
    expect(typeof onValidate).toBe('function')
  })

  it('onEvent 应从 hooks.ts 导出', () => {
    expect(typeof onEvent).toBe('function')
  })

  it('onActionSurfaceRequest 应从 hooks.ts 导出', () => {
    expect(typeof onActionSurfaceRequest).toBe('function')
  })
})

describe('T009: Habits transitions 一致性', () => {
  it('transitions.ts 应导出 habitTransitions 数组', () => {
    expect(Array.isArray(habitTransitions)).toBe(true)
    expect(habitTransitions.length).toBe(5)
  })

  it('应包含 create 转换 (null → draft)', () => {
    const create = habitTransitions.find(t => t.action === 'create')
    expect(create).toBeDefined()
    expect(create!.from).toBeNull()
    expect(create!.to).toBe('draft')
    expect(create!.eventType).toBe('HabitCreated')
  })

  it('应包含 activate 转换 (draft → active)', () => {
    const activate = habitTransitions.find(t => t.action === 'activate')
    expect(activate).toBeDefined()
    expect(activate!.from).toBe('draft')
    expect(activate!.to).toBe('active')
    expect(activate!.eventType).toBe('HabitActivated')
  })

  it('应包含 suspend 转换 (active → suspended)', () => {
    const suspend = habitTransitions.find(t => t.action === 'suspend')
    expect(suspend).toBeDefined()
    expect(suspend!.from).toBe('active')
    expect(suspend!.to).toBe('suspended')
    expect(suspend!.eventType).toBe('HabitSuspended')
  })

  it('应包含 reactivate 转换 (suspended → active)', () => {
    const reactivate = habitTransitions.find(t => t.action === 'reactivate')
    expect(reactivate).toBeDefined()
    expect(reactivate!.from).toBe('suspended')
    expect(reactivate!.to).toBe('active')
    expect(reactivate!.eventType).toBe('HabitActivated')
  })

  it('应包含 archive 转换 (suspended → archived)', () => {
    const archive = habitTransitions.find(t => t.action === 'archive')
    expect(archive).toBeDefined()
    expect(archive!.from).toBe('suspended')
    expect(archive!.to).toBe('archived')
    expect(archive!.eventType).toBe('HabitArchived')
  })
})

describe('T010: Habits index.ts 插件入口', () => {
  it('habitsPlugin.manifest 应存在', () => {
    expect(habitsPlugin.manifest).toBeDefined()
  })

  it('habitsPlugin 应暴露 onValidate/onEvent/onActionSurfaceRequest', () => {
    expect(typeof habitsPlugin.onValidate).toBe('function')
    expect(typeof habitsPlugin.onEvent).toBe('function')
    expect(typeof habitsPlugin.onActionSurfaceRequest).toBe('function')
  })

  it('manifest.domainId 应为 habits', () => {
    expect(habitsPlugin.manifest.domainId).toBe('habits')
  })
})
