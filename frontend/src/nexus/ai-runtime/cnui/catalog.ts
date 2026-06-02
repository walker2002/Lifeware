/**
 * @file catalog
 * @brief 组件注册和查询
 */

import type { CnuiComponentType } from './types'
import { cnuiRegistry } from './registry'

/** 组件信息 */
export interface ComponentInfo {
  /** 组件类型 */
  type: CnuiComponentType
  /** Props Schema */
  propsSchema: Record<string, unknown>
  /** 是否为基础组件 */
  isBase: boolean
}

/** 组件目录接口 */
export interface ComponentCatalog {
  /**
   * 注册组件信息
   * @param info - 组件信息
   */
  register(info: ComponentInfo): void
  /**
   * 获取组件信息
   * @param type - 组件类型
   * @returns 组件信息或 undefined
   */
  get(type: CnuiComponentType): ComponentInfo | undefined
  /**
   * 列出所有组件
   * @returns 组件信息数组
   */
  list(): ComponentInfo[]
}

/**
 * 创建组件目录
 * @returns ComponentCatalog 实例
 */
export function createCatalog(): ComponentCatalog {
  const components = new Map<CnuiComponentType, ComponentInfo>()

  return {
    register(info) {
      components.set(info.type, info)
    },

    get(type) {
      return components.get(type)
    },

    list() {
      return Array.from(components.values())
    },
  }
}

/** 基础组件类型列表 */
const BASE_COMPONENTS: CnuiComponentType[] = [
  'text-input', 'select', 'time-picker', 'date-picker', 'slider',
  'toggle', 'button', 'text-display', 'list', 'card',
]

/**
 * 注册基础组件
 * @param catalog - 组件目录
 */
export function registerBaseComponents(catalog: ComponentCatalog): void {
  for (const type of BASE_COMPONENTS) {
    catalog.register({ type, propsSchema: {}, isBase: true })
  }
}

export function registerDomainComponents(catalog: ComponentCatalog): void {
  for (const type of cnuiRegistry.allTypes()) {
    catalog.register({ type, propsSchema: {}, isBase: false })
  }
}
