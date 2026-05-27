import type { ComponentType } from 'react'

export interface FormAdapterConfig {
  component: ComponentType<FormAdapterProps>
  /** CN-UI dataModel key → Form field name 的双向映射 */
  fieldMapping: Record<string, string>
  /** 默认值（创建新对象时使用） */
  defaults: Record<string, unknown>
}

export interface FormAdapterProps {
  initial?: Record<string, unknown>
  onSubmit: (fields: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
}

class FormRegistryClass {
  private configs = new Map<string, FormAdapterConfig>()

  register(domainId: string, action: string, config: FormAdapterConfig): void {
    this.configs.set(`${domainId}:${action}`, config)
  }

  get(domainId: string, action: string): FormAdapterConfig | undefined {
    return this.configs.get(`${domainId}:${action}`)
  }

  has(domainId: string, action: string): boolean {
    return this.configs.has(`${domainId}:${action}`)
  }
}

export const FormRegistry = new FormRegistryClass()
