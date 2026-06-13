/**
 * @file CnuiRenderer
 * @brief CN-UI 渲染器组件
 * 
 * 根据 surfaceType 从注册表中获取组件并渲染 CN-UI 动作面
 */

'use client'

import type { CnuiComponentType } from '@/nexus/ai-runtime/cnui/types'
import { cnuiRegistry } from '@/nexus/ai-runtime/cnui/registry'
import '@/nexus/ai-runtime/cnui/register-client-surfaces'

/**
 * CnuiRenderer 组件属性
 */
interface CnuiRendererProps {
  /** 动作面类型 */
  surfaceType: CnuiComponentType
  /** 数据模型 */
  dataModel: Record<string, unknown>
  /** 数据变更回调 */
  onDataChange: (data: Record<string, unknown>) => void
  /** 确认回调 */
  onConfirm: (data: Record<string, unknown>) => void
  /** 取消回调 */
  onCancel: () => void
  /** 是否正在加载 */
  isLoading?: boolean
  /** 是否已完成 */
  isDone?: boolean
  /** 全屏请求回调 */
  onRequestFullscreen?: () => void
}

export function CnuiRenderer({ surfaceType, dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone, onRequestFullscreen }: CnuiRendererProps) {
  const reg = cnuiRegistry.get(surfaceType)

  if (!reg) {
    return (
      <div className="rounded border border-dashed border-error p-4 text-sm text-error">
        未知的卡片类型: {surfaceType}
      </div>
    )
  }

  const Component = reg.component
  return (
    <Component
      surfaceType={surfaceType}
      dataModel={dataModel}
      onDataChange={onDataChange}
      onConfirm={onConfirm}
      onCancel={onCancel}
      isLoading={isLoading}
      isDone={isDone}
      onRequestFullscreen={onRequestFullscreen}
    />
  )
}
