import { describe, it, expect } from 'vitest'
import { domainRegistry, findDomain } from '../registry'

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
