/**
 * @file Button
 * @brief CN-UI 按钮组件
 * 
 * 提供通用按钮功能
 */

'use client'

import { Button as ShadcnButton } from '@/components/ui/button'

/**
 * CnuiButton 组件属性
 */
interface CnuiButtonProps {
  /** 按钮标签 */
  label: string
  /** 点击回调 */
  onClick: () => void
  /** 按钮变体 */
  variant?: 'default' | 'outline' | 'destructive' | 'ghost'
  /** 是否禁用 */
  disabled?: boolean
}

export function CnuiButton({ label, onClick, variant = 'default', disabled }: CnuiButtonProps) {
  return (
    <ShadcnButton variant={variant} onClick={onClick} disabled={disabled}>
      {label}
    </ShadcnButton>
  )
}
