/**
 * @file registry
 * @brief CN-UI 表面注册中心
 */

import type React from 'react'
import type { CnuiSurfaceHandler } from './types'

/** 处理器加载器 */
type HandlerLoader = () => CnuiSurfaceHandler

/** 处理器模块路径 */
type HandlerModulePath = string

/** 表面注册项 */
interface SurfaceRegistration {
  /** 领域 ID */
  domainId: string
  /** 表面类型 */
  surfaceType: string
  /** 组件 */
  component: React.ComponentType<any>
  /** 处理器模块路径 */
  handlerModulePath?: HandlerModulePath
}

/** CN-UI 表面注册表 */
class CnuiSurfaceRegistry {
  /** 注册表 Map */
  private map = new Map<string, SurfaceRegistration>()

  /**
   * 注册表面
   * @param domainId - 领域 ID
   * @param surfaceType - 表面类型
   * @param reg - 注册信息
   */
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

  /**
   * 获取表面注册信息
   * @param surfaceType - 表面类型
   * @returns 注册信息或 undefined
   */
  get(surfaceType: string): SurfaceRegistration | undefined {
    return this.map.get(surfaceType)
  }

  /**
   * 获取 handler，通过动态导入模块路径避免客户端打包
   * @param surfaceType - 表面类型
   * @returns 处理器或 undefined
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
