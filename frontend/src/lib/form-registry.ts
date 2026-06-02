/**
 * @file form-registry
 * @brief 表单适配器注册中心
 * 
 * 管理各领域的表单组件，用于 CN-UI 的 action 面
 */

import type { ComponentType } from 'react'

/**
 * 表单适配器配置
 */
export interface FormAdapterConfig {
  /** 表单组件 */
  component: ComponentType<FormAdapterProps>
  /** CN-UI dataModel key → Form field name 的双向映射 */
  fieldMapping: Record<string, string>
  /** 默认值（创建新对象时使用） */
  defaults: Record<string, unknown>
}

/**
 * 表单适配器属性
 */
export interface FormAdapterProps {
  /** 初始值 */
  initial?: Record<string, unknown>
  /** 提交回调 */
  onSubmit: (fields: Record<string, unknown>) => void
  /** 取消回调 */
  onCancel?: () => void
  /** 是否加载中 */
  isLoading?: boolean
}

/**
 * 表单注册表类
 */
class FormRegistryClass {
  /** 配置存储 Map */
  private configs = new Map<string, FormAdapterConfig>()

  /**
   * 注册表单配置
   * @param domainId - 领域 ID
   * @param action - 动作名称
   * @param config - 表单配置
   */
  register(domainId: string, action: string, config: FormAdapterConfig): void {
    this.configs.set(`${domainId}:${action}`, config)
  }

  /**
   * 获取表单配置
   * @param domainId - 领域 ID
   * @param action - 动作名称
   * @returns 表单配置或 undefined
   */
  get(domainId: string, action: string): FormAdapterConfig | undefined {
    return this.configs.get(`${domainId}:${action}`)
  }

  /**
   * 检查是否有表单配置
   * @param domainId - 领域 ID
   * @param action - 动作名称
   * @returns 是否存在
   */
  has(domainId: string, action: string): boolean {
    return this.configs.has(`${domainId}:${action}`)
  }
}

/**
 * 表单注册表单例
 */
export const FormRegistry = new FormRegistryClass()
