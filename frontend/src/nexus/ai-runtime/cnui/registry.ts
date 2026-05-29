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
