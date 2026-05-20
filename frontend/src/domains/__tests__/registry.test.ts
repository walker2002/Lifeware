import { describe, it, expect } from 'vitest'
import { domainRegistry, findDomain, getActionByShortcut, getViewRoute, getAllDomainActions, validateShortcutUniqueness } from '../registry'

describe('domainRegistry', () => {
  it('应包含四个已注册域', () => {
    expect(domainRegistry).toHaveLength(4)
  })

  it('所有域应有唯一 id', () => {
    const ids = domainRegistry.map(d => d.manifest.domainId)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(4)
  })

  it('应包含 timebox 域', () => {
    const tb = findDomain('timebox')
    expect(tb).toBeDefined()
    expect(tb!.manifest.domainId).toBe('timebox')
  })

  it('应包含 habits 域', () => {
    const h = findDomain('habits')
    expect(h).toBeDefined()
    expect(h!.manifest.domainId).toBe('habits')
  })

  it('应包含 okrs 域', () => {
    const o = findDomain('okrs')
    expect(o).toBeDefined()
    expect(o!.manifest.domainId).toBe('okrs')
  })

  it('应包含 tasks 域', () => {
    const t = findDomain('tasks')
    expect(t).toBeDefined()
    expect(t!.manifest.domainId).toBe('tasks')
  })

  it('findDomain 对不存在的域应返回 undefined', () => {
    expect(findDomain('nonexistent')).toBeUndefined()
  })

  it('每个域插件应实现四个钩子', () => {
    for (const plugin of domainRegistry) {
      expect(typeof plugin.onValidate).toBe('function')
      expect(typeof plugin.onEvent).toBe('function')
      expect(typeof plugin.onActionSurfaceRequest).toBe('function')
      // onOutboundRequest 是可选的
    }
  })
})

describe('getActionByShortcut', () => {
  it('should return domain and action for a known shortcut', () => {
    const result = getActionByShortcut('/createHabit')
    expect(result).toEqual({ domainId: 'habits', action: 'createHabit' })
  })

  it('should return undefined for unknown shortcut', () => {
    const result = getActionByShortcut('/nonexistent')
    expect(result).toBeUndefined()
  })
})

describe('getViewRoute', () => {
  it('should return view route for known domain+action', () => {
    const result = getViewRoute('habits', 'createHabit')
    expect(result).toEqual({ component: 'domains/habits/pages/HabitFormPage', params: { mode: 'create' } })
  })

  it('should return undefined for unknown domain', () => {
    const result = getViewRoute('unknown', 'createHabit')
    expect(result).toBeUndefined()
  })

  it('should return undefined for unknown action', () => {
    const result = getViewRoute('habits', 'unknownAction')
    expect(result).toBeUndefined()
  })
})

describe('getAllDomainActions', () => {
  it('should return actions for all domains', () => {
    const actions = getAllDomainActions()
    expect(actions.length).toBeGreaterThan(0)
    const habitsDomain = actions.find(d => d.domainId === 'habits')
    expect(habitsDomain).toBeDefined()
    expect(habitsDomain!.actions.length).toBeGreaterThan(0)
  })
})

describe('validateShortcutUniqueness', () => {
  it('should not throw when all shortcuts are unique', () => {
    expect(() => validateShortcutUniqueness()).not.toThrow()
  })
})
