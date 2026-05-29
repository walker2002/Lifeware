import type React from 'react'
import type { CnuiSurfaceHandler } from './types'

type HandlerLoader = () => CnuiSurfaceHandler
type HandlerModulePath = string

interface SurfaceRegistration {
  domainId: string
  surfaceType: string
  component: React.ComponentType<any>
  handlerModulePath?: HandlerModulePath
}

class CnuiSurfaceRegistry {
  private map = new Map<string, SurfaceRegistration>()

  register(
    domainId: string,
    surfaceType: string,
    reg: { component: React.ComponentType<any>; handlerModulePath?: HandlerModulePath },
  ): void {
    if (this.map.has(surfaceType)) {
      const existing = this.map.get(surfaceType)!
      console.warn(
        `[CnuiRegistry] surface type "${surfaceType}" already registered by ` +
        `domain "${existing.domainId}", overwriting with "${domainId}"`,
      )
    }
    this.map.set(surfaceType, { domainId, surfaceType, ...reg })
  }

  get(surfaceType: string): SurfaceRegistration | undefined {
    return this.map.get(surfaceType)
  }

  /**
   * 获取 handler，通过动态导入模块路径避免客户端打包
   */
  getHandler(surfaceType: string): CnuiSurfaceHandler | undefined {
    const reg = this.map.get(surfaceType)
    if (!reg || !reg.handlerModulePath) return undefined

    // 运行时动态加载 handler（仅在服务端执行）
    if (typeof window !== 'undefined') {
      console.warn(`[CnuiRegistry] Handler loading attempted on client side for "${surfaceType}"`)
      return undefined
    }

    try {
      const module = require(reg.handlerModulePath)
      return module.habitCnuiHandler || module.timeboxCnuiHandler
    } catch (e) {
      console.error(`[CnuiRegistry] Failed to load handler for "${surfaceType}":`, e)
      return undefined
    }
  }

  getByDomain(domainId: string): SurfaceRegistration[] {
    return [...this.map.values()].filter(r => r.domainId === domainId)
  }

  allTypes(): string[] {
    return [...this.map.keys()]
  }

  /** 确定 action 对应的 surfaceType（fallback：仅单 surface domain 可用） */
  findSurfaceType(domainId: string): string | undefined {
    const surfaces = this.getByDomain(domainId)
    if (surfaces.length !== 1) return undefined
    return surfaces[0].surfaceType
  }

  clear(): void {
    this.map.clear()
  }
}

export const cnuiRegistry = new CnuiSurfaceRegistry()
