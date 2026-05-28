// Component Catalog — 组件注册和查询
import type { CnuiComponentType } from './types'

export interface ComponentInfo {
  type: CnuiComponentType
  propsSchema: Record<string, unknown>
  isBase: boolean
}

export interface ComponentCatalog {
  register(info: ComponentInfo): void
  get(type: CnuiComponentType): ComponentInfo | undefined
  list(): ComponentInfo[]
}

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

const BASE_COMPONENTS: CnuiComponentType[] = [
  'text-input', 'select', 'time-picker', 'date-picker', 'slider',
  'toggle', 'button', 'text-display', 'list', 'card',
]

const DOMAIN_COMPONENTS: CnuiComponentType[] = [
  'habit-creation-card', 'timebox-list', 'energy-indicator',
  'schedule-proposal', 'review-summary', 'objective-tracker',
  'habit-action-panel', 'habit-checkin-panel',
]

export function registerBaseComponents(catalog: ComponentCatalog): void {
  for (const type of BASE_COMPONENTS) {
    catalog.register({ type, propsSchema: {}, isBase: true })
  }
}

export function registerDomainComponents(catalog: ComponentCatalog): void {
  for (const type of DOMAIN_COMPONENTS) {
    catalog.register({ type, propsSchema: {}, isBase: false })
  }
}
