/**
 * @file archetype-picker-card
 * @brief Activity Archetype 选择器（带盒版，[023] A3.2 公共化）
 *
 * 带盒版：bg-surface-card p-5 + h3 静态标题「活动原型」，包裸版 ArchetypePicker。
 * 供 timebox Drawer 等「页面表单 sub-card」场景使用（视觉盒 + 标题由本组件提供）。
 */
'use client'

import { ArchetypePicker } from './archetype-picker'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

interface ArchetypePickerCardProps {
  /** 当前选中 archetypeId */
  value?: string
  /** 选中变更 */
  onChange?: (archetypeId: string | undefined, archetype?: ActivityArchetype) => void
}

export function ArchetypePickerCard({ value, onChange }: ArchetypePickerCardProps) {
  return (
    <div className="rounded-md bg-surface-card p-5">
      <h3 className="mb-2 text-sm font-medium text-ink">活动原型</h3>
      <ArchetypePicker value={value} onChange={onChange} />
    </div>
  )
}
