/**
 * @file archetype-picker
 * @brief Activity Archetype 选择器（[023] A2）
 *
 * Drawer「活动原型」sub-card 用。从 Server Action `getArchetypes()` 加载用户全部 archetype
 * （Repository 是 server-only，不可在客户端组件直引）。
 * 选中后展示名称 + L1 标签 + 只读 4 维 accordion + 「更换」链接。
 *
 * MVP 单租户：MVP_USER_ID 由 server action 内置，客户端只关心返回列表。
 */

'use client'

import { useState, useEffect } from 'react'
import { Inbox } from 'lucide-react'
import { getArchetypes } from '@/app/actions/activity-archetype'
import { EnergyCostAccordion } from './energy-cost-accordion'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

interface ArchetypePickerProps {
  /** 当前选中 archetypeId */
  value?: string
  /** 选中变更 */
  onChange: (archetypeId: string | undefined, archetype?: ActivityArchetype) => void
}

export function ArchetypePicker({ value, onChange }: ArchetypePickerProps) {
  const [archetypes, setArchetypes] = useState<ActivityArchetype[]>([])
  const [selected, setSelected] = useState<ActivityArchetype | undefined>()
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    getArchetypes()
      .then(r => {
        if (cancelled) return
        const list = r.success && r.data ? r.data : []
        setArchetypes(list)
        setSelected(list.find(a => a.id === value))
      })
      .catch(() => {
        /* 静默失败（无 archetype 不阻塞 Drawer） */
      })
    return () => {
      cancelled = true
    }
  }, [value])

  return (
    <div className="rounded-md bg-surface-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">活动原型</h3>
        <button
          type="button"
          onClick={() => setPickerOpen(o => !o)}
          className="text-xs text-primary"
        >
          {selected ? '更换' : '选择'}
        </button>
      </div>

      {selected ? (
        <div className="mt-2">
          <div className="text-base font-medium text-ink">{selected.l2Name}</div>
          <div className="text-xs text-muted">
            {selected.l1Category} · {selected.isSystem ? '系统内置' : '自定义'}
          </div>
          <div className="mt-2">
            <EnergyCostAccordion value={selected.energyCost} readOnly />
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-body">未选择（可选）</p>
      )}

      {pickerOpen && (
        <div className="mt-3 max-h-60 overflow-y-auto rounded-md border border-hairline bg-canvas">
          {archetypes.length === 0 ? (
            <p className="flex items-center gap-1.5 p-3 text-xs text-body">
              <Inbox className="size-3.5 text-muted" />
              暂无活动原型，请先到「活动原型配置」创建
            </p>
          ) : (
            archetypes.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onChange(a.id, a)
                  setSelected(a)
                  setPickerOpen(false)
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-hover-overlay"
              >
                <span className="text-sm text-ink">{a.l2Name}</span>
                <span className="text-xs text-muted">{a.l1Category}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
