/**
 * @file task-edit-zone
 * @brief A 区 — 任务信息 inline 编辑区域
 *
 * 支持字段：title、description、priority、energyRequired、tracking、
 * estimatedDuration（含快捷按钮）、dueDate。每个字段独立保存。
 */

'use client'

import { useState, useCallback } from 'react'
import { Brain, Cloud, ClipboardList, Sparkles, Flame, Pencil, Check, X } from 'lucide-react'
import type { Task } from '../../../usom/types/objects'
import { Priority, EnergyLevel } from '../../../usom/types/primitives'
import type { TrackingMode } from '../../../usom/types/primitives'
import { cn } from '@/lib/utils'
import { updateTask } from '@/app/actions/tasks'

// ─── 类型定义 ──────────────────────────────────────────────────────────

/** TaskEditZone 组件 Props */
interface TaskEditZoneProps {
  /** 当前任务对象 */
  task: Task
  /** 任务更新回调 */
  onTaskUpdate: (task: Task) => void
}

// ─── 常量映射 ──────────────────────────────────────────────────────────

/** 能量画像 → 图标映射 */
const ENERGY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  deep: Brain,
  light: Cloud,
  admin: ClipboardList,
  creative: Sparkles,
  reactive: Flame,
}

/** 优先级标签映射 */
const PRIORITY_LABELS: Record<string, string> = {
  critical: '紧急',
  high: '高',
  medium: '中',
  low: '低',
}

/** 能量等级标签映射 */
const ENERGY_LABELS: Record<string, string> = {
  high: '高能量',
  medium: '中能量',
  low: '低能量',
}

/** 追踪模式标签映射 */
const TRACKING_LABELS: Record<string, string> = {
  none: '不追踪',
  check_in: '打卡',
  log: '日志',
  review: '复盘',
}

/** 预估时长快捷选项（分钟） */
const DURATION_QUICK_PICKS = [30, 60, 90, 120]

// ─── InlineEdit 辅助组件 ───────────────────────────────────────────────

/**
 * Inline 编辑包装器
 * 点击子元素进入编辑模式，blur/Enter 保存，Escape 取消
 */
function InlineEdit({
  value,
  onSave,
  className,
  children,
  inputClassName,
  placeholder,
}: {
  value: string
  onSave: (value: string) => Promise<void>
  className?: string
  children?: React.ReactNode
  inputClassName?: string
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (draft === value) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }, [draft, value, onSave])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') { setDraft(value); setEditing(false) }
  }, [handleSave, value])

  if (!editing) {
    return (
      <span
        className={cn('cursor-pointer rounded-sm px-0.5 hover:bg-hover-overlay transition-colors', className)}
        onClick={() => { setDraft(value); setEditing(true) }}
        title="点击编辑"
      >
        {children ?? (value || <span className="text-muted-soft">{placeholder}</span>)}
      </span>
    )
  }

  return (
    <span className="relative inline-flex items-center gap-1">
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        disabled={saving}
        className={cn(
          'rounded-md border border-hairline bg-canvas px-2 py-0.5 text-sm text-ink',
          'focus:outline-none focus:ring-2 focus:ring-focus-ring',
          inputClassName,
        )}
        placeholder={placeholder}
      />
      {saving && <span className="text-xs text-muted-soft animate-pulse">…</span>}
    </span>
  )
}

/**
 * Inline 文本区域编辑
 */
function InlineTextarea({
  value,
  onSave,
  placeholder,
}: {
  value: string
  onSave: (value: string) => Promise<void>
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (draft === value) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }, [draft, value, onSave])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setDraft(value); setEditing(false) }
  }, [value])

  if (!editing) {
    return (
      <div
        className="cursor-pointer rounded-sm px-0.5 py-1 text-sm text-body hover:bg-hover-overlay transition-colors min-h-[1.5rem]"
        onClick={() => { setDraft(value); setEditing(true) }}
        title="点击编辑"
      >
        {value || <span className="text-muted-soft">{placeholder ?? '点击添加描述...'}</span>}
      </div>
    )
  }

  return (
    <div className="relative">
      <textarea
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        disabled={saving}
        rows={3}
        className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring resize-y"
        placeholder={placeholder ?? '点击添加描述...'}
      />
      {saving && <span className="absolute bottom-2 right-2 text-xs text-muted-soft animate-pulse">保存中…</span>}
    </div>
  )
}

// ─── TaskEditZone 主组件 ────────────────────────────────────────────────

/**
 * A 区 — 任务信息 inline 编辑区域
 * @param props - 组件属性
 */
export function TaskEditZone({ task, onTaskUpdate }: TaskEditZoneProps) {
  const [savingField, setSavingField] = useState<string | null>(null)

  /** 通用字段保存 */
  const saveField = useCallback(async (field: string, value: unknown) => {
    setSavingField(field)
    try {
      const updated = await updateTask(task.id, { [field]: value })
      onTaskUpdate(updated)
    } finally {
      setSavingField(null)
    }
  }, [task.id, onTaskUpdate])

  const EnergyIcon = task.energyProfile ? ENERGY_ICONS[task.energyProfile] : null

  return (
    <div className="flex flex-col gap-5">
      {/* ── 标题行（含能量图标）── */}
      <div className="flex items-start gap-2">
        {EnergyIcon && <EnergyIcon className="size-5 mt-1 text-muted-soft shrink-0" />}
        <InlineEdit
          value={task.title}
          onSave={val => saveField('title', val)}
          className="text-2xl font-display font-semibold text-ink leading-tight"
          inputClassName="text-2xl font-display font-semibold w-full"
        />
      </div>

      {/* ── 描述 ── */}
      <div>
        <InlineTextarea
          value={task.description ?? ''}
          onSave={val => saveField('description', val)}
          placeholder="点击添加描述..."
        />
      </div>

      {/* ── 属性网格 ── */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {/* 优先级 */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-soft w-16 shrink-0">优先级</label>
          <select
            value={task.priority}
            onChange={e => saveField('priority', e.target.value)}
            disabled={savingField === 'priority'}
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {/* 能量需求 */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-soft w-16 shrink-0">能量需求</label>
          <select
            value={task.energyRequired}
            onChange={e => saveField('energyRequired', e.target.value)}
            disabled={savingField === 'energyRequired'}
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            {Object.entries(ENERGY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {/* 追踪模式 */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-soft w-16 shrink-0">追踪模式</label>
          <select
            value={task.tracking}
            onChange={e => saveField('tracking', e.target.value)}
            disabled={savingField === 'tracking'}
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            {Object.entries(TRACKING_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {/* 预估时长 */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-soft w-16 shrink-0">预估时长</label>
          <DurationEdit
            value={task.estimatedDuration}
            onSave={val => saveField('estimatedDuration', val)}
            saving={savingField === 'estimatedDuration'}
          />
        </div>

        {/* 截止日期 */}
        <div className="flex items-center gap-2 col-span-2">
          <label className="text-xs text-muted-soft w-16 shrink-0">截止日期</label>
          <input
            type="date"
            value={task.dueDate ?? ''}
            onChange={e => saveField('dueDate', e.target.value || undefined)}
            disabled={savingField === 'dueDate'}
            className="h-8 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>
      </div>

      {/* ── 占位字段 ── */}
      <div className="flex flex-col gap-1 pt-1 border-t border-hairline-soft">
        <span className="text-xs text-muted-soft">验收标准 — 即将支持</span>
        <span className="text-xs text-muted-soft">预期产出 — 即将支持</span>
      </div>
    </div>
  )
}

// ─── 预估时长子组件 ─────────────────────────────────────────────────────

/**
 * 预估时长编辑器（数字输入 + 快捷按钮）
 */
function DurationEdit({
  value,
  onSave,
  saving,
}: {
  value?: number
  onSave: (val: number | undefined) => Promise<void>
  saving: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value != null ? String(value) : '')

  const handleSave = useCallback(async (newVal?: string) => {
    const v = newVal ?? draft
    const num = v ? parseInt(v, 10) : undefined
    if (num === value || (num == null && value == null)) { setEditing(false); return }
    await onSave(num && !isNaN(num) ? num : undefined)
    setEditing(false)
  }, [draft, value, onSave])

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(value != null ? String(value) : ''); setEditing(true) }}
        disabled={saving}
        className="text-xs text-ink cursor-pointer rounded-sm px-1 hover:bg-hover-overlay transition-colors"
        title="点击编辑"
      >
        {value != null ? `预估 ${value} 分钟` : <span className="text-muted-soft">未设置</span>}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="number"
          min={1}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => handleSave()}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleSave() }
            if (e.key === 'Escape') { setEditing(false) }
          }}
          disabled={saving}
          className="h-7 w-20 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          placeholder="分钟"
        />
        <span className="text-xs text-muted-soft">分钟</span>
      </div>
      <div className="flex gap-1 flex-wrap">
        {DURATION_QUICK_PICKS.map(n => (
          <button
            key={n}
            type="button"
            onClick={() => { setDraft(String(n)); handleSave(String(n)) }}
            disabled={saving}
            className={cn(
              'rounded-md border border-hairline px-2 py-0.5 text-xs transition-colors',
              'hover:border-primary/40 hover:bg-primary/10',
              value === n && 'border-primary bg-primary/10 text-primary',
            )}
          >
            {n} 分钟
          </button>
        ))}
      </div>
    </div>
  )
}
