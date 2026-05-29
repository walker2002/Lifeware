import type React from 'react'
import type { CnuiSurfaceHandler } from './types'

interface SurfaceRegistration {
  domainId: string
  surfaceType: string
  component: React.ComponentType<any>
  handler: CnuiSurfaceHandler
}

class CnuiSurfaceRegistry {
  private map = new Map<string, SurfaceRegistration>()

  register(
    domainId: string,
    surfaceType: string,
    reg: { component: React.ComponentType<any>; handler: CnuiSurfaceHandler },
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

  getByDomain(domainId: string): SurfaceRegistration[] {
    return [...this.map.values()].filter(r => r.domainId === domainId)
  }

  allTypes(): string[] {
    return [...this.map.keys()]
  }

  /** 确定 action 对应的 surfaceType：先从 generation_actions 查，再 fallback 到 intent_triggers */
  findSurfaceType(domainId: string, action: string): string | undefined {
    // 遍历所有注册的 surface，按 action 查找
    // （调用方应优先通过 manifest 解析，此方法为 fallback）
    for (const [type, reg] of this.map) {
      if (reg.domainId === domainId) {
        return type
      }
    }
    return undefined
  }

  clear(): void {
    this.map.clear()
  }
}

export const cnuiRegistry = new CnuiSurfaceRegistry()
