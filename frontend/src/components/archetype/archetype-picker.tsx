/**
 * @file archetype-picker
 * @brief Activity Archetype 选择器（裸版，[023] A3.2 公共化）
 *
 * 裸版：无自带视觉盒（bg-surface-card/p-5）、无静态标题——守 UI-DESIGN-SPEC §11.10
 * CUC-01/02。消费方自带 label（CNUI surface 用 text-xs label，Card 版用 h3）。
 * readOnly 模式（详情只读）：隐藏「选择/更换」按钮 + 下拉，仅展示选中态。
 * 数据源：server action getArchetypes()（Repository server-only，不可在客户端直引）。
 */
'use client'

import { useState, useEffect, useMemo } from 'react'
import { Inbox } from 'lucide-react'
import { getArchetypes } from '@/app/actions/activity-archetype'
import { EnergyCostAccordion } from './energy-cost-accordion'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

interface ArchetypePickerProps {
  /** 当前选中 archetypeId */
  value?: string
  /** 选中变更（readOnly 时可不传） */
  onChange?: (archetypeId: string | undefined, archetype?: ActivityArchetype) => void
  /** 只读模式：隐藏按钮与下拉，仅展示选中态 */
  readOnly?: boolean
}

export function ArchetypePicker({ value, onChange, readOnly = false }: ArchetypePickerProps) {
  const [archetypes, setArchetypes] = useState<ActivityArchetype[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  // [023] M-1: 区分 "无 archetype"（空态）vs "加载失败"（error 态）。失败时给用户 retry 入口。
  const [loadError, setLoadError] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)

  // [H4 /autoplan] archetypes 只在挂载时拉一次（不再随 [value] 重拉）。
  // selected 由 archetypes + value 派生（useMemo），消除「选后闪一下未选择再回填」的抖动。
  // [023] M-1: 失败时设 error 态；点「重试」递增 nonce 触发 effect 重跑。
  useEffect(() => {
    let cancelled = false
    setLoadError(false)
    getArchetypes()
      .then(r => {
        if (cancelled) return
        if (r.success && r.data) {
          setArchetypes(r.data)
        } else {
          setArchetypes([])
        }
      })
      .catch((err) => {
        if (cancelled) return
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.warn('[ArchetypePicker] getArchetypes failed:', err)
        }
        setArchetypes([])
        setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [retryNonce])

  const selected = useMemo(
    () => archetypes.find(a => a.id === value),
    [archetypes, value],
  )

  return (
    <div>
      {selected ? (
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-ink">{selected.l2Name}</div>
            <div className="text-xs text-muted">
              {selected.l1Category} · {selected.isSystem ? '系统内置' : '自定义'}
            </div>
            <div className="mt-1.5">
              <EnergyCostAccordion value={selected.energyCost} readOnly />
            </div>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setPickerOpen(o => !o)}
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              aria-label="更换活动原型"
              className="shrink-0 text-xs text-primary"
            >
              更换
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-xs text-body">未选择（可选）</p>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setPickerOpen(o => !o)}
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              aria-label="选择活动原型"
              className="text-xs text-primary"
            >
              选择
            </button>
          )}
        </div>
      )}

      {!readOnly && pickerOpen && (
        <div
          role="listbox"
          aria-label="活动原型列表"
          className="mt-2 max-h-60 overflow-y-auto rounded-md border border-hairline bg-canvas"
        >
          {archetypes.length === 0 ? (
            loadError ? (
              // [023] M-1: 失败态 — 让用户能 retry，而非静默 "暂无活动原型"。
              <button
                type="button"
                onClick={() => setRetryNonce(n => n + 1)}
                className="flex w-full items-center gap-1.5 p-3 text-left text-xs text-primary hover:bg-hover-overlay"
              >
                加载失败，点此重试
              </button>
            ) : (
              <p className="flex items-center gap-1.5 p-3 text-xs text-body">
                <Inbox className="size-3.5 text-muted" />
                暂无活动原型，请先到「活动原型配置」创建
              </p>
            )
          ) : (
            archetypes.map(a => (
              <button
                key={a.id}
                type="button"
                role="option"
                aria-selected={a.id === value}
                onClick={() => {
                  onChange?.(a.id, a)
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
