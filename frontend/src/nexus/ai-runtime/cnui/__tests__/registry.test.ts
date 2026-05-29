import { describe, it, expect, beforeEach } from 'vitest'
import { cnuiRegistry } from '../registry'
import type { CnuiSurfaceHandler } from '../types'

// Mock component
const MockComponent = () => null

// Mock handler
const mockHandler: CnuiSurfaceHandler = {
  async open(action) {
    return { content: `Mock open: ${action}`, dataSnapshot: {} }
  },
  async submit(action, fields) {
    return { success: true }
  },
}

describe('CnuiSurfaceRegistry', () => {
  beforeEach(() => {
    cnuiRegistry.clear()
  })

  describe('register', () => {
    it('应成功注册 surface', () => {
      cnuiRegistry.register('test-domain', 'test-surface', {
        component: MockComponent,
        handler: mockHandler,
      })

      const registered = cnuiRegistry.get('test-surface')
      expect(registered).toBeDefined()
      expect(registered!.domainId).toBe('test-domain')
      expect(registered!.surfaceType).toBe('test-surface')
    })

    it('应覆盖已存在的 surface 并发出警告', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      cnuiRegistry.register('domain1', 'surface', {
        component: MockComponent,
        handler: mockHandler,
      })

      cnuiRegistry.register('domain2', 'surface', {
        component: MockComponent,
        handler: mockHandler,
      })

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[CnuiRegistry] surface type "surface" already registered by domain "domain1", overwriting with "domain2"'
      )

      const registered = cnuiRegistry.get('surface')
      expect(registered!.domainId).toBe('domain2')

      consoleWarnSpy.mockRestore()
    })

    it('应允许同一 domain 注册多个 surfaces', () => {
      cnuiRegistry.register('test-domain', 'surface1', {
        component: MockComponent,
        handler: mockHandler,
      })
      cnuiRegistry.register('test-domain', 'surface2', {
        component: MockComponent,
        handler: mockHandler,
      })

      expect(cnuiRegistry.get('surface1')).toBeDefined()
      expect(cnuiRegistry.get('surface2')).toBeDefined()
      expect(cnuiRegistry.allTypes()).toHaveLength(2)
    })
  })

  describe('get', () => {
    it('应返回已注册的 surface', () => {
      cnuiRegistry.register('test-domain', 'test-surface', {
        component: MockComponent,
        handler: mockHandler,
      })

      const registered = cnuiRegistry.get('test-surface')
      expect(registered).toBeDefined()
    })

    it('对不存在的 surface 应返回 undefined', () => {
      expect(cnuiRegistry.get('nonexistent')).toBeUndefined()
    })
  })

  describe('getByDomain', () => {
    it('应返回指定 domain 的所有 surfaces', () => {
      cnuiRegistry.register('domain1', 'surface1', {
        component: MockComponent,
        handler: mockHandler,
      })
      cnuiRegistry.register('domain1', 'surface2', {
        component: MockComponent,
        handler: mockHandler,
      })
      cnuiRegistry.register('domain2', 'surface3', {
        component: MockComponent,
        handler: mockHandler,
      })

      const domain1Surfaces = cnuiRegistry.getByDomain('domain1')
      expect(domain1Surfaces).toHaveLength(2)
      expect(domain1Surfaces.map(s => s.surfaceType)).toEqual(['surface1', 'surface2'])

      const domain2Surfaces = cnuiRegistry.getByDomain('domain2')
      expect(domain2Surfaces).toHaveLength(1)
      expect(domain2Surfaces[0].surfaceType).toBe('surface3')
    })

    it('对不存在的 domain 应返回空数组', () => {
      expect(cnuiRegistry.getByDomain('nonexistent')).toEqual([])
    })
  })

  describe('allTypes', () => {
    it('应返回所有已注册的 surface types', () => {
      cnuiRegistry.register('domain1', 'surface1', {
        component: MockComponent,
        handler: mockHandler,
      })
      cnuiRegistry.register('domain2', 'surface2', {
        component: MockComponent,
        handler: mockHandler,
      })

      const types = cnuiRegistry.allTypes()
      expect(types).toHaveLength(2)
      expect(types).toContain('surface1')
      expect(types).toContain('surface2')
    })

    it('空注册表应返回空数组', () => {
      expect(cnuiRegistry.allTypes()).toEqual([])
    })
  })

  describe('findSurfaceType', () => {
    it('对单 surface domain 应返回其 surfaceType', () => {
      cnuiRegistry.register('single-domain', 'only-surface', {
        component: MockComponent,
        handler: mockHandler,
      })

      const surfaceType = cnuiRegistry.findSurfaceType('single-domain')
      expect(surfaceType).toBe('only-surface')
    })

    it('对多 surface domain 应返回 undefined', () => {
      cnuiRegistry.register('multi-domain', 'surface1', {
        component: MockComponent,
        handler: mockHandler,
      })
      cnuiRegistry.register('multi-domain', 'surface2', {
        component: MockComponent,
        handler: mockHandler,
      })

      const surfaceType = cnuiRegistry.findSurfaceType('multi-domain')
      expect(surfaceType).toBeUndefined()
    })

    it('对不存在的 domain 应返回 undefined', () => {
      expect(cnuiRegistry.findSurfaceType('nonexistent')).toBeUndefined()
    })
  })

  describe('clear', () => {
    it('应清空所有注册', () => {
      cnuiRegistry.register('domain1', 'surface1', {
        component: MockComponent,
        handler: mockHandler,
      })
      cnuiRegistry.register('domain2', 'surface2', {
        component: MockComponent,
        handler: mockHandler,
      })

      expect(cnuiRegistry.allTypes()).toHaveLength(2)

      cnuiRegistry.clear()

      expect(cnuiRegistry.allTypes()).toHaveLength(0)
    })
  })
})
