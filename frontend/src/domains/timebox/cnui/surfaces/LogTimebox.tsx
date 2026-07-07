/**
 * @file log-timebox
 * @brief 时间盒打卡 CNUI surface（[023] A2）
 *
 * 批量打卡：每条 ended timebox 三态（完成/未完成/跳过）。
 * 「提交打卡」逐条走 Nexus logTimebox。
 * [023.13] §4 — per-item 详细展开：每条 item 独立 detailedOpen 标志，
 *   展开时实例化 ExecutionDetailFields 共享组件，submit 时该 item 升级 detailed。
 *
 * [023.13] Fix #3 — 删除 outer notes textarea（与 ExecutionDetailFields 内层 notes
 *   双轨存导致 outer 静默丢失，handler 仅读 it.notes 但 submit 时被 detailed 路径覆盖）。
 *   notes 字段完全交给 ExecutionDetailFields owns,避免 CNUI 表单分叉（[memory [[project-domain-paradigm-tech-debt]]）。
 *
 * [023.13] Fix #2 — activityArchetypeId 由 cnui/handlers.ts open 路径传入后,LogTimebox 在
 *   detail 展开时通过 getArchetypeById 拉原型详情缓存到 Record<id, ActivityArchetype|null>,
 *   喂给 ExecutionDetailFields.defaultEnergyActual;仅在 hasArchetypeId 时 load,降级为 undefined。
 */

'use client'

import { useEffect, useState } from 'react'
import { ExecutionDetailFields, type ExecutionDetailDraft } from '../../components/execution-detail-fields'
import { getArchetypeById } from '@/app/actions/activity-archetype'
import { getDefaultEnergyActual } from '../../lib/get-default-energy-actual'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

type LogState = 'completed' | 'incomplete' | 'skipped'

interface LogItem {
  id: string
  title: string
  startTime: string
  endTime: string
  activityArchetypeId?: string
  state?: LogState
  // [023.13] Fix #3 — 移除 outer notes：完全交给 ExecutionDetailFields owns
  /** 详细字段草稿（展开时填）；同时承担 notes 字段（→ executionRecord.notes） */
  detailed?: ExecutionDetailDraft
}

interface LogTimeboxProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (d: Record<string, unknown>) => void
  onConfirm: (d: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

const STATE_BTN: { key: LogState; label: string; cls: string }[] = [
  { key: 'completed', label: '完成', cls: 'bg-success/10 text-success border-success/30' },
  { key: 'incomplete', label: '未完成', cls: 'bg-error/10 text-error border-error/30' },
  { key: 'skipped', label: '跳过', cls: 'bg-muted text-body border-hairline' },
]

export function LogTimebox({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: LogTimeboxProps) {
  const items = (dataModel.items as LogItem[]) ?? []
  const [page, setPage] = useState(0)
  // [023.13] §4 — per-item 独立详细展开标志（切换某 item 不影响其他 item）
  const [detailedOpen, setDetailedOpen] = useState<Record<string, boolean>>({})

  // [023.13] Fix #2 — archetype 池缓存:per-item(per-archetypeId)拉一次,避免 N+1
  const [archetypes, setArchetypes] = useState<Record<string, ActivityArchetype | null>>({})
  useEffect(() => {
    // 扫描所有 items 的 archetypeId,逐个 fetch(去重)
    const ids = Array.from(new Set(items.map(i => i.activityArchetypeId).filter((x): x is string => Boolean(x))))
    let cancelled = false
    void (async () => {
      for (const id of ids) {
        if (cancelled) return
        try {
          const r = await getArchetypeById(id)
          if (cancelled) return
          setArchetypes(prev => ({ ...prev, [id]: r.success ? (r.data ?? null) : null }))
        } catch {
          if (cancelled) return
          setArchetypes(prev => ({ ...prev, [id]: null }))
        }
      }
    })()
    return () => { cancelled = true }
  }, [items])

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ 打卡已提交</p>
  if (items.length === 0) return <p className="py-8 text-center text-sm text-body/70">没有待打卡的时间盒</p>

  const cur = items[page]
  const update = (patch: Partial<LogItem>) => {
    const next = items.map((it, i) => i === page ? { ...it, ...patch } : it)
    onDataChange({ ...dataModel, items: next })
  }
  const toggleDetailed = () => {
    setDetailedOpen(prev => ({ ...prev, [cur.id]: !prev[cur.id] }))
  }
  const isDetailedOpen = detailedOpen[cur.id] ?? false

  // [023.13] Fix #2 — 计算当前 item 的 energy default
  const curArchetype = cur.activityArchetypeId ? archetypes[cur.activityArchetypeId] : undefined
  const defaultEnergyActual = curArchetype ? getDefaultEnergyActual(curArchetype) : undefined

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">打卡 ({page + 1}/{items.length})</span>
        {items.length > 1 && (
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={page <= 0} onClick={() => setPage(p => p - 1)} className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40">‹</button>
            <button type="button" disabled={page >= items.length - 1} onClick={() => setPage(p => p + 1)} className="flex size-5 items-center justify-center rounded border border-hairline bg-canvas text-xs text-ink disabled:opacity-40">›</button>
          </div>
        )}
      </div>

      <div className="rounded-md border border-hairline bg-canvas p-3 space-y-2">
        <div className="text-sm font-medium text-ink">{cur.title}</div>
        <div className="text-xs text-muted">{cur.startTime} - {cur.endTime}</div>
        <div className="flex items-center gap-1.5">
          {STATE_BTN.map(s => (
            <button
              key={s.key} type="button"
              onClick={() => update({ state: s.key })}
              className={`flex-1 rounded border px-2 py-1.5 text-xs ${cur.state === s.key ? s.cls : 'border-hairline text-body'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {/* [023.13] Fix #3 — outer notes textarea 已删除,完全让 ExecutionDetailFields owns notes 字段（CNUI 表单防分叉） */}
        {/* [023.13] §4 — 详细打卡展开（per-item 独立） */}
        <button
          type="button"
          onClick={toggleDetailed}
          aria-expanded={isDetailedOpen}
          className="text-xs text-primary hover:underline"
        >
          {isDetailedOpen ? '收起详细' : '详细打卡'}
        </button>
        {isDetailedOpen && (
          <ExecutionDetailFields
            value={cur.detailed ?? {}}
            onChange={(d) => update({ detailed: d })}
            defaultEnergyActual={defaultEnergyActual}
          />
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && <button type="button" onClick={onCancel} className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>}
        <button type="button" onClick={() => onConfirm(dataModel)} disabled={isLoading} className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">提交打卡</button>
      </div>
    </>
  )
}
